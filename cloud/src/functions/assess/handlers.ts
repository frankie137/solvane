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

/** Recitation recording uploaded by the frontend */
const RECITE_FILE = /^cloud:\/\/[^/]+\/recite-input\/[\w-]+\.pcm$/
/** 60 s of 16 kHz mono PCM is about 1.92 MB; leave some headroom */
const MAX_AUDIO_BYTES = 2_100_000
/** The cloud function times out at 60 s; leave 5 s for database reads and writes */
const BUDGET_MS = 55_000
/** Minimum time left to start a step; otherwise leave it for the next call */
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
/** Sentences assessed concurrently (Tencent Cloud's default concurrency limit is 50 streams) */
const SOE_CONCURRENCY = 6
/** Time allowed for the assessment result after a sentence has been sent */
const SOE_RESULT_MS = 10_000

/** Result of a step: fields to write, and files that can only be deleted once the write succeeds */
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
        console.error(
          '[assess] Failed to delete recording',
          err instanceof Error ? err.message : err,
        )
      })
    }
  }

  // --- Four steps, each returning the fields to write ------------------------

  /** The recording is stored as WAV (used for both playback and assessment) */
  const wavPath = (openid: string, practiceId: string) => `recordings/${openid}/${practiceId}.wav`

  async function transcribe(doc: PracticeDoc, ctx: RequestContext): Promise<StageResult> {
    // Since M6, submit converts to WAV; older practices not yet assessed are still PCM
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
      // Delete the raw PCM only after the result is written, or a retry after a failed write can't
      // find the recording
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
      // Audio is sent in real time, so sending takes as long as the sentence; if there isn't time
      // to finish it, don't start and mark it as not assessed
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
    // Config errors fail outright, as does every sentence failing; if only some fail, use the rest
    // and mark the ones not assessed
    const config = failed.find((f) => f.error.code === 'NOT_CONFIGURED')
    if (config) throw config.error
    if (succeeded.length === 0) throw failed[0]!.error
    for (const f of failed) {
      console.error(
        `[assess.score] Sentence ${f.segment.sentenceIndex} not assessed: ${f.error.message}`,
      )
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
   * Advance the assessment until this practice reaches its goal (see practiceGoal).
   * Keep going while time allows to cut frontend round trips; if a step is already running, return
   * the current state and let the frontend advance it again.
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
      // The first step always runs
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
        // The lock was taken over (someone restarted after this run timed out); stop and defer to
        // the database
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
      // Failed scoring doesn't use up a free use: withdraw the scoring request and refund the use;
      // it's charged again when the user requests scoring again
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
      // The last submit never returned but the record was created: resubmitting the same file
      // returns it instead of creating another
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
      // Convert to WAV right away so it can be played back after submit; if that fails, remove the
      // record and keep the raw recording for resubmission
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

      // Keep only the latest few practices per session; delete older ones with their recordings
      const all = await practices.listBySession(ctx.openid, sessionId, 20)
      // Leave ones still being assessed; clean them up next time
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
      // Scoring already requested (or a pre-M6 practice): don't charge again, just keep advancing
      if (doc.scoreRequested === false) {
        const charged = await accounts.consume(ctx.openid)
        let marked = false
        try {
          marked = await practices.requestScore(practiceId, ctx.openid, charged)
        } finally {
          // Scoring requested twice concurrently for the same recording: charge only once
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
