import { z } from 'zod'
import { JOB_STALE_MS, LIMITS } from '@shared/constants'
import type { Practice, PracticeStage, PracticeSummary } from '@shared/types'
import { pcmDurationMs, pcmToWav, slicePcm, wavToPcm } from '../../lib/audio'
import { AppError } from '../../lib/errors'
import type { LlmContext } from '../../lib/llm-context'
import { alignSchema, reportSchema } from '../../lib/llm/schemas'
import type { LlmService } from '../../lib/llm/service'
import {
  computeScores,
  mapSentenceTimings,
  mergeResults,
  pickWeakWords,
  planSegments,
  type Segment,
} from '../../lib/practice'
import type { PracticeDoc, PracticePatch, Repos } from '../../lib/repos'
import type { Handlers, RequestContext } from '../../lib/router'
import { requireSession } from '../../lib/sessions'
import type { RecognizeOptions, RecognizeResult } from '../../lib/tencent/asr'
import type { SoeResult, SoeRequest } from '../../lib/tencent/soe'
import { parsePayload } from '../../lib/validate'
import { buildAlignMessages, buildReportMessages } from '../../prompts/assess'
import type { SpeechStorage } from '../speech/handlers'

export interface AssessDeps {
  repos: Repos
  storage: SpeechStorage
  recognize(audio: Buffer, options: RecognizeOptions): Promise<RecognizeResult>
  evaluate(audio: Buffer, req: SoeRequest & { timeoutMs: number }): Promise<SoeResult>
  llm: Pick<LlmService, 'chatJson'>
  loadLlmContext(openid: string): Promise<LlmContext>
  now(): number
}

/** 前端上传的背诵录音 */
const RECITE_FILE = /^cloud:\/\/[^/]+\/recite-input\/[\w-]+\.pcm$/
/** 60 秒 16kHz 单声道 PCM 约 1.92 MB，留一点余量 */
const MAX_AUDIO_BYTES = 2_100_000
/** 云函数超时 60 秒，留 5 秒读写数据库 */
const BUDGET_MS = 55_000
/** 开始某一步之前至少要剩这么多时间，否则留给下一次调用 */
const MIN_BUDGET: Record<Exclude<PracticeStage, 'done'>, number> = {
  transcribe: 20_000,
  align: 35_000,
  score: 30_000,
  report: 35_000,
}
const NEXT: Record<Exclude<PracticeStage, 'done'>, PracticeStage> = {
  transcribe: 'align',
  align: 'score',
  score: 'report',
  report: 'done',
}
/** 同时评测的句子数 */
const SOE_CONCURRENCY = 3

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i] as T)
      }
    }),
  )
  return results
}

export function createAssessHandlers(deps: AssessDeps): Handlers<'assess'> {
  const { practices, sessions } = deps.repos

  async function requirePractice(id: string, openid: string): Promise<PracticeDoc> {
    const doc = await practices.get(id, openid)
    if (!doc) throw new AppError('NOT_FOUND', '练习记录不存在或已被删除')
    return doc
  }

  async function toPractice(doc: PracticeDoc): Promise<Practice> {
    const [audioUrl] = doc.wavFileID ? await deps.storage.tempUrls([doc.wavFileID]) : [null]
    return {
      id: doc._id,
      sessionId: doc.sessionId,
      vid: doc.vid,
      stage: doc.stage,
      job: doc.job,
      lastError: doc.lastError,
      durationMs: doc.durationMs,
      audioUrl: audioUrl || null,
      transcript: doc.transcript,
      alignment: doc.alignment,
      pronunciation: doc.pronunciation,
      report: doc.report,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
  }

  async function removeFiles(doc: PracticeDoc) {
    for (const fileID of [doc.pcmFileID, doc.wavFileID]) {
      if (!fileID) continue
      await deps.storage.remove(fileID).catch((err: unknown) => {
        console.error('[assess] 删除录音失败', err instanceof Error ? err.message : err)
      })
    }
  }

  // --- 四个步骤，每步返回要写入的字段 ---------------------------------------

  async function transcribe(doc: PracticeDoc, ctx: RequestContext): Promise<PracticePatch> {
    if (!doc.pcmFileID) throw new AppError('INTERNAL', '找不到录音，请重新背一遍')
    const pcm = await deps.storage.download(doc.pcmFileID)
    if (pcm.length > MAX_AUDIO_BYTES) {
      throw new AppError('BAD_REQUEST', '录音太长了，请控制在 60 秒以内')
    }
    const { text, words } = await deps.recognize(pcm, { engine: '16k_en', words: true })
    if (!text.trim() || words.length === 0) {
      throw new AppError('BAD_REQUEST', '没有听清，请靠近一点再背一遍')
    }
    const wavFileID = await deps.storage.upload(
      `recordings/${ctx.openid}/${doc._id}.wav`,
      pcmToWav(pcm),
    )
    // 原始 PCM 已经转存成 WAV，不再需要
    await deps.storage.remove(doc.pcmFileID).catch(() => {})
    return {
      wavFileID,
      pcmFileID: null,
      durationMs: pcmDurationMs(pcm),
      transcript: { text: text.trim(), words },
    }
  }

  async function align(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<PracticePatch> {
    const session = await requireSession(sessions, doc.sessionId, ctx.openid)
    const version = session.versions.find((v) => v.vid === doc.vid)
    if (!version) throw new AppError('NOT_FOUND', '背诵的版本已不存在')
    const words = doc.transcript?.words ?? []
    const { target } = await deps.loadLlmContext(ctx.openid)
    const result = await deps.llm.chatJson(
      target,
      buildAlignMessages(
        version.sentences.map((s) => s.en),
        words,
      ),
      alignSchema,
      { deadline, maxTokens: 1500, temperature: 0.2 },
    )
    const count = version.sentences.length
    return {
      alignment: {
        sentences: mapSentenceTimings(result.sentences, words, count),
        diffs: result.diffs.filter((d) => d.sentenceIndex < count),
        content: result.content,
        expression: result.expression,
      },
    }
  }

  async function score(doc: PracticeDoc, deadline: number): Promise<PracticePatch> {
    if (!doc.wavFileID || !doc.alignment)
      throw new AppError('INTERNAL', '评测数据不完整，请重新背一遍')
    const segments = planSegments(doc.alignment.sentences, doc.durationMs)
    if (segments.length === 0) {
      return { pronunciation: mergeResults([]) }
    }
    const pcm = wavToPcm(await deps.storage.download(doc.wavFileID))
    const timeoutMs = Math.max(5_000, Math.min(25_000, deadline - deps.now() - 3_000))

    const outcomes = await mapLimit(segments, SOE_CONCURRENCY, async (segment: Segment) => {
      try {
        const result = await deps.evaluate(slicePcm(pcm, segment.startMs, segment.endMs), {
          refText: segment.refText,
          mode: segment.mode,
          timeoutMs,
        })
        return { segment, result }
      } catch (err) {
        return {
          segment,
          error: err instanceof AppError ? err : new AppError('UPSTREAM_ERROR', '口语评测失败'),
        }
      }
    })
    const succeeded = outcomes.filter(
      (o): o is { segment: Segment; result: SoeResult } => 'result' in o,
    )
    const failed = outcomes.find((o) => 'error' in o) as { error: AppError } | undefined
    // 配置类问题直接报错；个别句子偶发失败时，用其余句子的结果
    if (failed && (failed.error.code === 'NOT_CONFIGURED' || succeeded.length === 0))
      throw failed.error
    return { pronunciation: mergeResults(succeeded) }
  }

  async function report(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<PracticePatch> {
    if (!doc.alignment || !doc.pronunciation) {
      throw new AppError('INTERNAL', '评测数据不完整，请重新背一遍')
    }
    const scores = computeScores(doc.alignment, doc.pronunciation)
    const { target, userSettings } = await deps.loadLlmContext(ctx.openid)
    const { overall: _overall, ...parts } = scores
    const feedback = await deps.llm.chatJson(
      target,
      buildReportMessages({
        scores: parts,
        diffs: doc.alignment.diffs,
        weakWords: pickWeakWords(doc.pronunciation.words),
        settings: userSettings,
      }),
      reportSchema,
      { deadline, maxTokens: 1000, temperature: 0.5 },
    )
    return { report: { scores, ...feedback } }
  }

  async function runStage(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<PracticePatch> {
    switch (doc.stage) {
      case 'transcribe':
        return transcribe(doc, ctx)
      case 'align':
        return align(doc, ctx, deadline)
      case 'score':
        return score(doc, deadline)
      case 'report':
        return report(doc, ctx, deadline)
      default:
        return {}
    }
  }

  return {
    async start(payload, ctx) {
      const { sessionId, vid, fileID, durationMs } = parsePayload(
        z.object({
          sessionId: z.string().min(1),
          vid: z.string().min(1),
          fileID: z.string().max(500).regex(RECITE_FILE),
          durationMs: z
            .number()
            .int()
            .min(0)
            .max(LIMITS.reciteMaxMs + 2_000),
        }),
        payload,
      )
      const session = await requireSession(sessions, sessionId, ctx.openid)
      if (!session.versions.some((v) => v.vid === vid)) {
        throw new AppError('BAD_REQUEST', '找不到要背诵的版本')
      }
      const now = deps.now()
      const practiceId = await practices.create({
        _openid: ctx.openid,
        sessionId,
        vid,
        stage: 'transcribe',
        job: null,
        lastError: null,
        pcmFileID: fileID,
        wavFileID: null,
        durationMs,
        transcript: null,
        alignment: null,
        pronunciation: null,
        report: null,
        createdAt: now,
        updatedAt: now,
      })

      // 每个对话只保留最近几次练习，更早的连同录音一起删除
      const all = await practices.listBySession(ctx.openid, sessionId, 20)
      for (const old of all.slice(LIMITS.practicesPerSession)) {
        await removeFiles(old)
        await practices.remove(old._id, ctx.openid)
      }
      return { practiceId }
    },

    async advance(payload, ctx) {
      const { practiceId } = parsePayload(z.object({ practiceId: z.string().min(1) }), payload)
      const doc = await requirePractice(practiceId, ctx.openid)
      if (doc.stage === 'done') return { practice: await toPractice(doc) }

      const startedAt = deps.now()
      const acquired = await practices.acquireJob(
        practiceId,
        ctx.openid,
        { stage: doc.stage, startedAt },
        startedAt - JOB_STALE_MS,
      )
      if (!acquired)
        return { practice: await toPractice(await requirePractice(practiceId, ctx.openid)) }

      const deadline = startedAt + BUDGET_MS
      let current = await requirePractice(practiceId, ctx.openid)
      try {
        // 时间够就连着往下做，减少前端来回调用的次数；第一步总是执行
        let first = true
        while (current.stage !== 'done') {
          const stage = current.stage
          if (!first && deadline - deps.now() < MIN_BUDGET[stage]) break
          first = false
          const patch = await runStage(current, ctx, deadline)
          const next = NEXT[stage]
          const written = await practices.updateIfJob(practiceId, ctx.openid, startedAt, {
            ...patch,
            stage: next,
            job: next === 'done' ? null : { stage: next, startedAt },
            lastError: null,
            updatedAt: deps.now(),
          })
          // 锁已被接管（本次运行超时后有人重新发起），停止并以数据库为准
          if (!written) break
          current = { ...current, ...patch, stage: next } as PracticeDoc
        }
        if (current.stage !== 'done') {
          await practices.updateIfJob(practiceId, ctx.openid, startedAt, { job: null })
        }
      } catch (err) {
        const appErr =
          err instanceof AppError ? err : new AppError('INTERNAL', '评测失败，请稍后重试')
        if (!(err instanceof AppError)) {
          console.error(`[assess.${current.stage}]`, err instanceof Error ? err.stack : String(err))
        }
        await practices.updateIfJob(practiceId, ctx.openid, startedAt, {
          job: null,
          lastError: {
            stage: current.stage,
            code: appErr.code,
            message: appErr.message,
            at: deps.now(),
          },
        })
        throw appErr
      }
      return { practice: await toPractice(await requirePractice(practiceId, ctx.openid)) }
    },

    async get(payload, ctx) {
      const { practiceId } = parsePayload(z.object({ practiceId: z.string().min(1) }), payload)
      return { practice: await toPractice(await requirePractice(practiceId, ctx.openid)) }
    },

    async list(payload, ctx) {
      const { sessionId } = parsePayload(z.object({ sessionId: z.string().min(1) }), payload)
      const docs = await practices.listBySession(ctx.openid, sessionId, LIMITS.practicesPerSession)
      const items: PracticeSummary[] = docs.map((d) => ({
        id: d._id,
        vid: d.vid,
        stage: d.stage,
        failed: !!d.lastError && !d.job,
        overall: d.report?.scores.overall ?? null,
        durationMs: d.durationMs,
        createdAt: d.createdAt,
      }))
      return { items }
    },
  }
}
