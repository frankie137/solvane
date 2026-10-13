import { z } from 'zod'
import type { LlmConfigInput } from '@shared/api'
import { JOB_STALE_MS, LIMITS } from '@shared/constants'
import type { JobKind, LlmConfigView, Session } from '@shared/types'
import { createAccounts } from '../../lib/account'
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { requireExpression, toExpression } from '../../lib/expressions'
import { createLlmContextLoader } from '../../lib/llm-context'
import type { LlmTarget } from '../../lib/llm/client'
import type { LlmService } from '../../lib/llm/service'
import { analysisSchema, draftSchema, explainSchema, revisionSchema } from '../../lib/llm/schemas'
import {
  GLOBAL_SETTINGS_ID,
  type LlmStored,
  type Repos,
  type SessionDoc,
  type SessionPatch,
} from '../../lib/repos'
import type { Handlers, RequestContext } from '../../lib/router'
import { makeVersion, requireSession, toSession } from '../../lib/sessions'
import { normalizeBaseUrl } from '../../lib/url'
import { parsePayload } from '../../lib/validate'
import {
  buildAnalyzeMessages,
  buildExplainMessages,
  buildGenerateMessages,
  buildReviseMessages,
} from '../../prompts/compose'

export type { LlmService } from '../../lib/llm/service'

export interface ComposeDeps {
  repos: Repos
  llm: LlmService
  now: () => number
  encryptionSecret: () => string
  adminOpenids: () => string[]
}

/** The cloud function timeout is 60 s; leave 5 s for database reads and writes */
const JOB_BUDGET_MS = 55_000
const MAX_VERSIONS = 20
/** Explanations only use the two most recently saved sentences as context */
const EXPLAIN_CONTEXT_SENTENCES = 2

const presetSchema = z.enum(['deepseek', 'qwen', 'moonshot', 'zhipu', 'doubao', 'custom'])

const llmInputSchema = z.object({
  preset: presetSchema,
  baseUrl: z.string().min(1).max(300),
  model: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().max(300).optional(),
})

function toView(stored: LlmStored | null | undefined): LlmConfigView | null {
  if (!stored) return null
  return {
    preset: stored.preset,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKeyMask: stored.apiKeyMask,
    updatedAt: stored.updatedAt,
  }
}

export function createComposeHandlers(deps: ComposeDeps): Handlers<'compose'> {
  const { sessions, settings, expressions } = deps.repos
  const accounts = createAccounts({
    accounts: deps.repos.accounts,
    adminOpenids: deps.adminOpenids,
    now: deps.now,
  })

  function assertAdmin(openid: string) {
    if (!accounts.isAdmin(openid)) throw new AppError('FORBIDDEN', '只有管理员可以设置大模型')
  }

  const loadJobContext = createLlmContextLoader(settings, deps.encryptionSecret, accounts.isAdmin)

  /**
   * Since M6, members can't use their own config: when an admin opens the config, also clear what
   * members saved earlier (including encrypted keys).
   * Done once per function instance; a failed cleanup doesn't block reading the config and is
   * retried next time.
   */
  let memberLlmCleared = false
  async function clearMemberLlmOnce() {
    if (memberLlmCleared) return
    try {
      await settings.clearMemberLlm()
      memberLlmCleared = true
    } catch (err) {
      console.error('[compose.clearMemberLlm]', err instanceof Error ? err.message : String(err))
    }
  }

  async function configView(): Promise<{ config: LlmConfigView | null }> {
    return { config: toView((await settings.get(GLOBAL_SETTINGS_ID))?.llm) }
  }

  /** Validate the input and build a usable target; if no key is given, reuse the saved one */
  async function targetFromInput(
    input: LlmConfigInput,
  ): Promise<{ target: LlmTarget; stored: LlmStored }> {
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const secret = deps.encryptionSecret()
    let apiKey = input.apiKey ?? ''
    let cipher: string
    let mask: string
    if (apiKey) {
      cipher = encryptSecret(apiKey, secret)
      mask = maskSecret(apiKey)
    } else {
      const saved = (await settings.get(GLOBAL_SETTINGS_ID))?.llm
      if (!saved) throw new AppError('BAD_REQUEST', '请填写 API Key')
      // Don't reuse the old key for another provider host, or one provider's key goes to another
      if (new URL(saved.baseUrl).host !== new URL(baseUrl).host) {
        throw new AppError('BAD_REQUEST', '更换了服务商地址，请重新填写 API Key')
      }
      apiKey = decryptSecret(saved.apiKeyCipher, secret)
      cipher = saved.apiKeyCipher
      mask = saved.apiKeyMask
    }
    return {
      target: { baseUrl, model: input.model, apiKey },
      stored: {
        preset: input.preset,
        baseUrl,
        model: input.model,
        apiKeyCipher: cipher,
        apiKeyMask: mask,
        updatedAt: deps.now(),
      },
    }
  }

  /**
   * Run a generation job: lock -> run -> write the result and unlock.
   * If a job is already running, don't run it again; return the current session and let the
   * frontend poll for the result.
   * charge: generating the first version uses one free use and records it on the session (not again
   * if an interrupted earlier job already did); refunded on failure.
   */
  async function runJob(
    ctx: RequestContext,
    sessionId: string,
    kind: JobKind,
    vid: string | null,
    work: (doc: SessionDoc, deadline: number) => Promise<SessionPatch>,
    charge = false,
  ): Promise<{ session: Session }> {
    const startedAt = deps.now()
    const acquired = await sessions.acquireJob(
      sessionId,
      ctx.openid,
      { kind, vid, startedAt },
      startedAt - JOB_STALE_MS,
    )
    const current = async () => ({
      session: toSession(await requireSession(sessions, sessionId, ctx.openid)),
    })
    if (!acquired) return current()

    /** Whether the session has a free use charged (by this run or an earlier interrupted job) */
    let charged = false
    try {
      const fresh = await requireSession(sessions, sessionId, ctx.openid)
      if (charge && fresh.versions.length === 0) {
        charged = !!fresh.freeCharged
        if (!charged && (await accounts.consume(ctx.openid))) {
          try {
            charged = await sessions.updateIfJob(sessionId, ctx.openid, startedAt, {
              freeCharged: true,
            })
          } finally {
            if (!charged) await accounts.refund(ctx.openid)
          }
          // The lock was taken over: leave it to the job that took over
          if (!charged) return current()
        }
      }
      const patch = await work(fresh, startedAt + JOB_BUDGET_MS)
      await sessions.updateIfJob(sessionId, ctx.openid, startedAt, {
        ...patch,
        job: null,
        lastError: null,
        // Only generate and revise count as content updates; filling in an analysis doesn't change
        // the "recent sessions" order
        ...(kind === 'analyze' ? {} : { updatedAt: deps.now() }),
      })
    } catch (err) {
      const appErr =
        err instanceof AppError ? err : new AppError('INTERNAL', '生成失败，请稍后再试')
      if (!(err instanceof AppError)) {
        console.error(`[compose.${kind}]`, err instanceof Error ? err.stack : String(err))
      }
      const written = await sessions.updateIfJob(sessionId, ctx.openid, startedAt, {
        job: null,
        lastError: { kind, vid, code: appErr.code, message: appErr.message, at: deps.now() },
        ...(charged ? { freeCharged: false } : {}),
      })
      // A failure doesn't use up a free use; if the lock was taken over, the new job decides
      if (charged && written) {
        await accounts.refund(ctx.openid).catch((e: unknown) => {
          console.error('[compose.refund]', e instanceof Error ? e.message : String(e))
        })
      }
      throw appErr
    }
    // If the lock was taken over (someone restarted after the job timed out), the result isn't
    // written; either way, defer to the database
    return current()
  }

  return {
    async create(payload, ctx) {
      const { mode, rawText } = parsePayload(
        z.object({ mode: z.enum(['voice', 'text']), rawText: z.string().trim() }),
        payload,
      )
      if (!rawText) throw new AppError('BAD_REQUEST', '内容不能为空')
      if (rawText.length > LIMITS.rawTextMax) {
        throw new AppError('BAD_REQUEST', `内容太长了，请控制在 ${LIMITS.rawTextMax} 字以内`)
      }
      // Don't create an empty session once free uses run out; the use is actually charged when the
      // first version is generated
      await accounts.assertAvailable(ctx.openid)
      const now = deps.now()
      const sessionId = await sessions.create({
        _openid: ctx.openid,
        title: '',
        input: { mode, rawText },
        polishedZh: '',
        versions: [],
        currentVid: null,
        job: null,
        lastError: null,
        folderId: null,
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
      return { sessionId }
    },

    async generate(payload, ctx) {
      const { sessionId } = parsePayload(z.object({ sessionId: z.string().min(1) }), payload)
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      if (doc.versions.length > 0) return { session: toSession(doc) }

      return runJob(
        ctx,
        sessionId,
        'generate',
        null,
        async (fresh, deadline) => {
          if (fresh.versions.length > 0) return {}
          const { target, userSettings } = await loadJobContext(ctx.openid)
          const draft = await deps.llm.chatJson(
            target,
            buildGenerateMessages(fresh.input.rawText, userSettings),
            draftSchema,
            { deadline, maxTokens: 1500 },
          )
          const version = makeVersion([], draft.sentences, draft.alternatives, null, deps.now())
          return {
            title: draft.title,
            polishedZh: draft.polishedZh,
            versions: [version],
            currentVid: version.vid,
          }
        },
        true,
      )
    },

    async revise(payload, ctx) {
      const { sessionId, baseVid, instruction } = parsePayload(
        z.object({
          sessionId: z.string().min(1),
          baseVid: z.string().min(1),
          instruction: z.string().trim(),
        }),
        payload,
      )
      if (!instruction) throw new AppError('BAD_REQUEST', '请说说想怎么改')
      if (instruction.length > LIMITS.instructionMax) {
        throw new AppError('BAD_REQUEST', `修改要求请控制在 ${LIMITS.instructionMax} 字以内`)
      }
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      if (!doc.versions.some((v) => v.vid === baseVid)) {
        throw new AppError('BAD_REQUEST', '找不到要修改的版本')
      }
      if (doc.versions.length >= MAX_VERSIONS) {
        throw new AppError('BAD_REQUEST', `最多保留 ${MAX_VERSIONS} 个版本，可以新建一个对话继续`)
      }

      return runJob(ctx, sessionId, 'revise', null, async (fresh, deadline) => {
        const base = fresh.versions.find((v) => v.vid === baseVid)
        if (!base) throw new AppError('BAD_REQUEST', '找不到要修改的版本')
        const { target, userSettings } = await loadJobContext(ctx.openid)
        const revision = await deps.llm.chatJson(
          target,
          buildReviseMessages(fresh.polishedZh, base, instruction, userSettings),
          revisionSchema,
          { deadline, maxTokens: 1200 },
        )
        const version = makeVersion(
          fresh.versions,
          revision.sentences,
          revision.alternatives,
          instruction,
          deps.now(),
        )
        return { versions: [...fresh.versions, version], currentVid: version.vid }
      })
    },

    async analyze(payload, ctx) {
      const { sessionId, vid } = parsePayload(
        z.object({ sessionId: z.string().min(1), vid: z.string().min(1) }),
        payload,
      )
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      const version = doc.versions.find((v) => v.vid === vid)
      if (!version) throw new AppError('BAD_REQUEST', '找不到这个版本')
      if (version.analysis) return { session: toSession(doc) }

      return runJob(ctx, sessionId, 'analyze', vid, async (fresh, deadline) => {
        const target = fresh.versions.find((v) => v.vid === vid)
        if (!target) throw new AppError('BAD_REQUEST', '找不到这个版本')
        if (target.analysis) return {}
        const { target: llmTarget, userSettings } = await loadJobContext(ctx.openid)
        const analysis = await deps.llm.chatJson(
          llmTarget,
          buildAnalyzeMessages(fresh.polishedZh, target, userSettings),
          analysisSchema,
          { deadline, maxTokens: 1800, temperature: 0.5 },
        )
        return {
          versions: fresh.versions.map((v) => (v.vid === vid ? { ...v, analysis } : v)),
        }
      })
    },

    async explainExpression(payload, ctx) {
      const { expressionId } = parsePayload(
        z.object({ expressionId: z.string().min(1).max(64) }),
        payload,
      )
      const doc = await requireExpression(expressions, expressionId, ctx.openid)
      if (doc.fill === 'ready') return { expression: toExpression(doc) }

      const startedAt = deps.now()
      const acquired = await expressions.acquireFill(
        expressionId,
        ctx.openid,
        startedAt,
        startedAt - JOB_STALE_MS,
      )
      // A fill is already running: return the current state and let the frontend poll
      if (!acquired) return { expression: toExpression(doc) }

      try {
        const { target, userSettings } = await loadJobContext(ctx.openid)
        const context = [...new Set(doc.sources.map((s) => s.sentence).filter(Boolean))]
          .slice(-EXPLAIN_CONTEXT_SENTENCES)
          .reverse()
        const result = await deps.llm.chatJson(
          target,
          buildExplainMessages(doc.text, context, userSettings),
          explainSchema,
          { deadline: startedAt + JOB_BUDGET_MS, maxTokens: 400, temperature: 0.3 },
        )
        await expressions.updateIfFill(expressionId, ctx.openid, startedAt, {
          ...result,
          fill: 'ready',
          fillStartedAt: null,
          updatedAt: deps.now(),
        })
      } catch (err) {
        const appErr =
          err instanceof AppError ? err : new AppError('INTERNAL', '释义生成失败，请稍后再试')
        if (!(err instanceof AppError)) {
          console.error(
            '[compose.explainExpression]',
            err instanceof Error ? err.stack : String(err),
          )
        }
        await expressions.updateIfFill(expressionId, ctx.openid, startedAt, {
          fill: 'failed',
          fillStartedAt: null,
        })
        throw appErr
      }
      return {
        expression: toExpression(await requireExpression(expressions, expressionId, ctx.openid)),
      }
    },

    async getLlmConfig(_payload, ctx) {
      assertAdmin(ctx.openid)
      await clearMemberLlmOnce()
      return configView()
    },

    async saveLlmConfig(payload, ctx) {
      assertAdmin(ctx.openid)
      const input = parsePayload(llmInputSchema, payload)
      const { stored } = await targetFromInput(input)
      await settings.upsert(GLOBAL_SETTINGS_ID, { llm: stored, updatedAt: deps.now() })
      return configView()
    },

    async clearLlmConfig(_payload, ctx) {
      assertAdmin(ctx.openid)
      await settings.upsert(GLOBAL_SETTINGS_ID, { llm: null, updatedAt: deps.now() })
      return configView()
    },

    async testLlm(payload, ctx) {
      assertAdmin(ctx.openid)
      const input = parsePayload(llmInputSchema, payload)
      const { target } = await targetFromInput(input)
      const start = deps.now()
      const reply = await deps.llm.ping(target)
      return { latencyMs: deps.now() - start, reply: reply.trim().slice(0, 20) }
    },
  }
}
