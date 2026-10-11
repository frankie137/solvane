import { z } from 'zod'
import { JOB_STALE_MS, LIMITS } from '@shared/constants'
import type { Practice, PracticeStage, PracticeSummary } from '@shared/types'
import { createAccounts } from '../../lib/account'
import { pcmDurationMs, pcmToWav, slicePcm, wavToPcm } from '../../lib/audio'
import { mapLimit } from '../../lib/concurrency'
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
  practiceGoal,
  reachedStage,
  type Segment,
} from '../../lib/practice'
import type { PracticeDoc, PracticePatch, Repos } from '../../lib/repos'
import type { Handlers, RequestContext } from '../../lib/router'
import { requireSession } from '../../lib/sessions'
import type { RecognizeOptions, RecognizeResult } from '../../lib/tencent/asr'
import { streamDurationMs, type SoeRequest, type SoeResult } from '../../lib/tencent/soe'
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
  adminOpenids(): string[]
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
/** 同时评测的句子数（腾讯云默认并发上限 50 路） */
const SOE_CONCURRENCY = 6
/** 一句发送完以后，等待评测结果的余量 */
const SOE_RESULT_MS = 10_000

/** 一步的结果：要写入的字段，以及写入成功后才能删除的文件 */
interface StageResult {
  patch: PracticePatch
  cleanup?: string[]
}

export function createAssessHandlers(deps: AssessDeps): Handlers<'assess'> {
  const { practices, sessions } = deps.repos
  const accounts = createAccounts({
    accounts: deps.repos.accounts,
    adminOpenids: deps.adminOpenids,
    now: deps.now,
  })

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
      scoreRequested: doc.scoreRequested ?? true,
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

  /** 录音存成 WAV（回放和评测都用它） */
  const wavPath = (openid: string, practiceId: string) => `recordings/${openid}/${practiceId}.wav`

  async function transcribe(doc: PracticeDoc, ctx: RequestContext): Promise<StageResult> {
    // M6 起提交时就转成了 WAV；之前提交、还没评测的练习仍是 PCM
    const fileID = doc.wavFileID ?? doc.pcmFileID
    if (!fileID) throw new AppError('INTERNAL', '找不到录音，请重新背一遍')
    const raw = await deps.storage.download(fileID)
    const pcm = doc.wavFileID ? wavToPcm(raw) : raw
    if (pcm.length > MAX_AUDIO_BYTES) {
      throw new AppError('BAD_REQUEST', '录音太长了，请控制在 60 秒以内')
    }
    const { text, words } = await deps.recognize(pcm, { engine: '16k_en', words: true })
    if (!text.trim() || words.length === 0) {
      throw new AppError('BAD_REQUEST', '没有听清，请靠近一点再背一遍')
    }
    const transcript = { text: text.trim(), words }
    if (doc.wavFileID) return { patch: { transcript } }
    const wavFileID = await deps.storage.upload(wavPath(ctx.openid, doc._id), pcmToWav(pcm))
    return {
      patch: { wavFileID, pcmFileID: null, durationMs: pcmDurationMs(pcm), transcript },
      // 原始 PCM 等结果写入成功后再删，否则写入失败时重试就找不到录音了
      cleanup: [fileID],
    }
  }

  async function align(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<StageResult> {
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
      patch: {
        alignment: {
          sentences: mapSentenceTimings(result.sentences, words, count),
          diffs: result.diffs.filter((d) => d.sentenceIndex < count),
          content: result.content,
          expression: result.expression,
        },
      },
    }
  }

  async function score(doc: PracticeDoc, deadline: number): Promise<StageResult> {
    if (!doc.wavFileID || !doc.alignment) {
      throw new AppError('INTERNAL', '评测数据不完整，请重新背一遍')
    }
    const segments = planSegments(doc.alignment.sentences, doc.durationMs)
    if (segments.length === 0) return { patch: { pronunciation: mergeResults([]) } }
    const pcm = wavToPcm(await deps.storage.download(doc.wavFileID))

    const outcomes = await mapLimit(segments, SOE_CONCURRENCY, async (segment: Segment) => {
      const audio = slicePcm(pcm, segment.startMs, segment.endMs)
      // 按实时率发送，一句多长就要发多久；剩余时间不够评完这一句就不开始，记为没能评测
      const needed = streamDurationMs(audio) + SOE_RESULT_MS
      const remaining = deadline - deps.now()
      if (remaining < needed) return { segment, error: new AppError('TIMEOUT', '时间不够') }
      try {
        const result = await deps.evaluate(audio, {
          refText: segment.refText,
          mode: segment.mode,
          timeoutMs: Math.min(needed, remaining),
        })
        return { segment, result }
      } catch (err) {
        return {
          segment,
          error: err instanceof AppError ? err : new AppError('UPSTREAM_ERROR', '口语评测失败'),
        }
      }
    })

    const succeeded: { segment: Segment; result: SoeResult }[] = []
    const failed: { segment: Segment; error: AppError }[] = []
    for (const o of outcomes) {
      if (o.result) succeeded.push({ segment: o.segment, result: o.result })
      else if (o.error) failed.push({ segment: o.segment, error: o.error })
    }
    // 配置类问题直接报错；全部失败也报错；个别句子失败时用其余句子的结果，并标出没能评测的句子
    const config = failed.find((f) => f.error.code === 'NOT_CONFIGURED')
    if (config) throw config.error
    if (succeeded.length === 0) throw failed[0]!.error
    for (const f of failed) {
      console.error(`[assess.score] 第 ${f.segment.sentenceIndex} 句没能评测：${f.error.message}`)
    }
    return {
      patch: {
        pronunciation: mergeResults(
          succeeded,
          failed.map((f) => f.segment.sentenceIndex),
        ),
      },
    }
  }

  async function report(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<StageResult> {
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
    return { patch: { report: { scores, ...feedback } } }
  }

  async function runStage(
    doc: PracticeDoc,
    ctx: RequestContext,
    deadline: number,
  ): Promise<StageResult> {
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
        return { patch: {} }
    }
  }

  /**
   * 推进评测，直到这条练习的目标（见 practiceGoal）。
   * 时间够就连着往下做，减少前端来回调用的次数；已有步骤在运行时直接返回当前状态，由前端再来推进。
   */
  async function drive(practiceId: string, ctx: RequestContext): Promise<{ practice: Practice }> {
    const doc = await requirePractice(practiceId, ctx.openid)
    if (reachedStage(doc.stage, practiceGoal(doc))) return { practice: await toPractice(doc) }

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
    const goal = practiceGoal(current)
    try {
      // 第一步总是执行
      let first = true
      while (!reachedStage(current.stage, goal) && current.stage !== 'done') {
        const stage = current.stage
        if (!first && deadline - deps.now() < MIN_BUDGET[stage]) break
        first = false
        const { patch, cleanup } = await runStage(current, ctx, deadline)
        const next = NEXT[stage]
        const written = await practices.updateIfJob(practiceId, ctx.openid, startedAt, {
          ...patch,
          stage: next,
          job: reachedStage(next, goal) ? null : { stage: next, startedAt },
          lastError: null,
          updatedAt: deps.now(),
        })
        // 锁已被接管（本次运行超时后有人重新发起），停止并以数据库为准
        if (!written) break
        for (const fileID of cleanup ?? []) {
          await deps.storage.remove(fileID).catch(() => {})
        }
        current = { ...current, ...patch, stage: next } as PracticeDoc
      }
      if (!reachedStage(current.stage, goal)) {
        await practices.updateIfJob(practiceId, ctx.openid, startedAt, { job: null })
      }
    } catch (err) {
      const appErr =
        err instanceof AppError ? err : new AppError('INTERNAL', '评测失败，请稍后再试')
      if (!(err instanceof AppError)) {
        console.error(`[assess.${current.stage}]`, err instanceof Error ? err.stack : String(err))
      }
      // 评分失败不扣次数：撤回评分请求并退回占用的次数，用户再点评分时重新占用
      const latest = await practices.get(practiceId, ctx.openid).catch(() => null)
      const scoring = latest?.scoreRequested === true
      const written = await practices.updateIfJob(practiceId, ctx.openid, startedAt, {
        job: null,
        lastError: {
          stage: current.stage,
          code: appErr.code,
          message: appErr.message,
          at: deps.now(),
        },
        ...(scoring ? { scoreRequested: false, freeCharged: false } : {}),
      })
      if (written && scoring && latest?.freeCharged) {
        await accounts.refund(ctx.openid).catch((e: unknown) => {
          console.error('[assess.refund]', e instanceof Error ? e.message : String(e))
        })
      }
      throw appErr
    }
    return { practice: await toPractice(await requirePractice(practiceId, ctx.openid)) }
  }

  const practiceIdSchema = z.object({ practiceId: z.string().min(1) })

  return {
    async start(payload, ctx) {
      const { sessionId, vid, fileID } = parsePayload(
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
      // 上次提交等不到返回、其实已经建好：重新提交同一个文件时直接返回，不重复建
      const existing = await practices.findBySource(ctx.openid, fileID)
      if (existing) return { practiceId: existing._id }
      const pcm = await deps.storage.download(fileID)
      if (pcm.length > MAX_AUDIO_BYTES) {
        throw new AppError('BAD_REQUEST', '录音太长了，请控制在 60 秒以内')
      }
      const now = deps.now()
      const practiceId = await practices.create({
        _openid: ctx.openid,
        sessionId,
        vid,
        stage: 'transcribe',
        scoreRequested: false,
        timingRequested: false,
        freeCharged: false,
        sourceFileID: fileID,
        job: null,
        lastError: null,
        pcmFileID: fileID,
        wavFileID: null,
        durationMs: pcmDurationMs(pcm),
        transcript: null,
        alignment: null,
        pronunciation: null,
        report: null,
        createdAt: now,
        updatedAt: now,
      })
      // 马上转成 WAV，提交完就能回放；转换失败时撤掉这条记录，原始录音留着可以重新提交
      let wavFileID: string | null = null
      try {
        wavFileID = await deps.storage.upload(wavPath(ctx.openid, practiceId), pcmToWav(pcm))
        await practices.update(practiceId, ctx.openid, { wavFileID, pcmFileID: null })
      } catch (err) {
        await practices.remove(practiceId, ctx.openid).catch(() => {})
        if (wavFileID) await deps.storage.remove(wavFileID).catch(() => {})
        throw err
      }
      await deps.storage.remove(fileID).catch(() => {})

      // 每个对话只保留最近几次练习，更早的连同录音一起删除
      const all = await practices.listBySession(ctx.openid, sessionId, 20)
      // 还在评测中的先不动，下次再清理
      const running = (d: PracticeDoc) => !!d.job && d.job.startedAt >= now - JOB_STALE_MS
      for (const old of all.slice(LIMITS.practicesPerSession)) {
        if (running(old)) continue
        await removeFiles(old)
        await practices.remove(old._id, ctx.openid)
      }
      return { practiceId }
    },

    async score(payload, ctx) {
      const { practiceId } = parsePayload(practiceIdSchema, payload)
      const doc = await requirePractice(practiceId, ctx.openid)
      // 已经要求过评分（或 M6 之前的练习）：不再占用次数，接着推进
      if (doc.scoreRequested === false) {
        const charged = await accounts.consume(ctx.openid)
        let marked = false
        try {
          marked = await practices.requestScore(practiceId, ctx.openid, charged)
        } finally {
          // 同一条录音并发点了两次评分：只算一次
          if (!marked && charged) await accounts.refund(ctx.openid)
        }
      }
      return drive(practiceId, ctx)
    },

    async prepareShare(payload, ctx) {
      const { practiceId } = parsePayload(practiceIdSchema, payload)
      const doc = await requirePractice(practiceId, ctx.openid)
      if (!doc.timingRequested) {
        await practices.update(practiceId, ctx.openid, { timingRequested: true })
      }
      return drive(practiceId, ctx)
    },

    async advance(payload, ctx) {
      const { practiceId } = parsePayload(practiceIdSchema, payload)
      return drive(practiceId, ctx)
    },

    async get(payload, ctx) {
      const { practiceId } = parsePayload(practiceIdSchema, payload)
      return { practice: await toPractice(await requirePractice(practiceId, ctx.openid)) }
    },

    async list(payload, ctx) {
      const { sessionId } = parsePayload(z.object({ sessionId: z.string().min(1) }), payload)
      const docs = await practices.listBySession(ctx.openid, sessionId, LIMITS.practicesPerSession)
      const items: PracticeSummary[] = docs.map((d) => ({
        id: d._id,
        vid: d.vid,
        stage: d.stage,
        scoreRequested: d.scoreRequested ?? true,
        failed: !!d.lastError && !d.job,
        overall: d.report?.scores.overall ?? null,
        durationMs: d.durationMs,
        createdAt: d.createdAt,
      }))
      return { items }
    },
  }
}
