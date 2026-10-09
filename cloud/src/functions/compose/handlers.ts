import { z } from 'zod'
import type { LlmConfigInput } from '@shared/api'
import { DEFAULT_SETTINGS, JOB_STALE_MS, LIMITS } from '@shared/constants'
import type {
  JobKind,
  LlmConfigState,
  LlmConfigView,
  LlmScope,
  Session,
  UserSettings,
} from '@shared/types'
import { decryptSecret, encryptSecret, maskSecret } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import type { ChatMessage, LlmTarget } from '../../lib/llm/client'
import type { ChatJsonOptions } from '../../lib/llm/json'
import { analysisSchema, draftSchema, revisionSchema } from '../../lib/llm/schemas'
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
  buildGenerateMessages,
  buildReviseMessages,
} from '../../prompts/compose'

export interface LlmService {
  chatJson<S extends z.ZodType>(
    target: LlmTarget,
    messages: ChatMessage[],
    schema: S,
    options: Pick<ChatJsonOptions, 'deadline' | 'maxTokens' | 'temperature'>,
  ): Promise<z.infer<S>>
  /** 测试连接：返回模型的回复 */
  ping(target: LlmTarget): Promise<string>
}

export interface ComposeDeps {
  repos: Repos
  llm: LlmService
  now: () => number
  encryptionSecret: () => string
  adminOpenids: () => string[]
}

/** 云函数超时设为 60 秒，留 5 秒给读写数据库 */
const JOB_BUDGET_MS = 55_000
const MAX_VERSIONS = 20

const presetSchema = z.enum(['deepseek', 'qwen', 'moonshot', 'zhipu', 'doubao', 'custom'])
const scopeSchema = z.enum(['own', 'global'])

const llmInputSchema = z.object({
  scope: scopeSchema,
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
  const { sessions, settings } = deps.repos

  const isAdmin = (openid: string) => deps.adminOpenids().includes(openid)
  const settingsId = (scope: LlmScope, openid: string) =>
    scope === 'global' ? GLOBAL_SETTINGS_ID : openid

  function assertScopeAllowed(scope: LlmScope, openid: string) {
    if (scope === 'global' && !isAdmin(openid)) {
      throw new AppError('FORBIDDEN', '只有管理员可以设置全局默认配置')
    }
  }

  async function loadUserSettings(openid: string): Promise<UserSettings> {
    const doc = await settings.get(openid)
    return {
      level: doc?.level ?? DEFAULT_SETTINGS.level,
      accent: doc?.accent ?? DEFAULT_SETTINGS.accent,
    }
  }

  /** 自己的配置优先，其次管理员的全局默认 */
  async function resolveTarget(openid: string): Promise<LlmTarget> {
    const own = (await settings.get(openid))?.llm
    const stored = own ?? (await settings.get(GLOBAL_SETTINGS_ID))?.llm
    if (!stored) {
      throw new AppError('NOT_CONFIGURED', '还没有配置大模型，请到「我的 → 大模型配置」中设置')
    }
    return {
      baseUrl: stored.baseUrl,
      model: stored.model,
      apiKey: decryptSecret(stored.apiKeyCipher, deps.encryptionSecret()),
    }
  }

  async function configState(openid: string): Promise<LlmConfigState> {
    const [own, global] = await Promise.all([
      settings.get(openid),
      settings.get(GLOBAL_SETTINGS_ID),
    ])
    const ownView = toView(own?.llm)
    const globalView = toView(global?.llm)
    return {
      own: ownView,
      global: globalView,
      effective: ownView ? 'own' : globalView ? 'global' : 'none',
      isAdmin: isAdmin(openid),
    }
  }

  /** 校验输入并得到可用的目标；没填 Key 时沿用该范围已保存的 Key */
  async function targetFromInput(
    input: LlmConfigInput,
    openid: string,
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
      const saved = (await settings.get(settingsId(input.scope, openid)))?.llm
      if (!saved) throw new AppError('BAD_REQUEST', '请填写 API Key')
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
   * 运行一个生成任务：加锁 → 执行 → 写入结果并解锁。
   * 已有任务在运行时不重复执行，直接返回当前对话，由前端轮询结果。
   */
  async function runJob(
    ctx: RequestContext,
    sessionId: string,
    kind: JobKind,
    vid: string | null,
    work: (doc: SessionDoc, deadline: number) => Promise<SessionPatch>,
  ): Promise<{ session: Session }> {
    const startedAt = deps.now()
    const acquired = await sessions.acquireJob(
      sessionId,
      ctx.openid,
      { kind, vid, startedAt },
      startedAt - JOB_STALE_MS,
    )
    if (!acquired) {
      return { session: toSession(await requireSession(sessions, sessionId, ctx.openid)) }
    }

    try {
      const fresh = await requireSession(sessions, sessionId, ctx.openid)
      const patch = await work(fresh, startedAt + JOB_BUDGET_MS)
      await sessions.updateIfJob(sessionId, ctx.openid, startedAt, {
        ...patch,
        job: null,
        lastError: null,
        updatedAt: deps.now(),
      })
    } catch (err) {
      const appErr =
        err instanceof AppError ? err : new AppError('INTERNAL', '生成失败，请稍后重试')
      if (!(err instanceof AppError)) {
        console.error(`[compose.${kind}]`, err instanceof Error ? err.stack : String(err))
      }
      await sessions.updateIfJob(sessionId, ctx.openid, startedAt, {
        job: null,
        lastError: { kind, vid, code: appErr.code, message: appErr.message, at: deps.now() },
        updatedAt: deps.now(),
      })
      throw appErr
    }
    // 锁若已被接管（任务超时后别人重新发起），结果不会写入；这里都以数据库为准
    return { session: toSession(await requireSession(sessions, sessionId, ctx.openid)) }
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

      return runJob(ctx, sessionId, 'generate', null, async (fresh, deadline) => {
        if (fresh.versions.length > 0) return {}
        const [target, userSettings] = await Promise.all([
          resolveTarget(ctx.openid),
          loadUserSettings(ctx.openid),
        ])
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
      })
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
        const [target, userSettings] = await Promise.all([
          resolveTarget(ctx.openid),
          loadUserSettings(ctx.openid),
        ])
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
        const [llmTarget, userSettings] = await Promise.all([
          resolveTarget(ctx.openid),
          loadUserSettings(ctx.openid),
        ])
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

    async getLlmConfig(_payload, ctx) {
      return configState(ctx.openid)
    },

    async saveLlmConfig(payload, ctx) {
      const input = parsePayload(llmInputSchema, payload)
      assertScopeAllowed(input.scope, ctx.openid)
      const { stored } = await targetFromInput(input, ctx.openid)
      await settings.upsert(settingsId(input.scope, ctx.openid), {
        llm: stored,
        updatedAt: deps.now(),
      })
      return configState(ctx.openid)
    },

    async clearLlmConfig(payload, ctx) {
      const { scope } = parsePayload(z.object({ scope: scopeSchema }), payload)
      assertScopeAllowed(scope, ctx.openid)
      await settings.upsert(settingsId(scope, ctx.openid), { llm: null, updatedAt: deps.now() })
      return configState(ctx.openid)
    },

    async testLlm(payload, ctx) {
      const input = parsePayload(llmInputSchema, payload)
      assertScopeAllowed(input.scope, ctx.openid)
      const { target } = await targetFromInput(input, ctx.openid)
      const start = deps.now()
      const reply = await deps.llm.ping(target)
      return { latencyMs: deps.now() - start, reply: reply.trim().slice(0, 20) }
    },
  }
}
