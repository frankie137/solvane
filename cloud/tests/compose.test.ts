import { beforeEach, describe, expect, it } from 'vitest'
import { JOB_STALE_MS } from '@shared/constants'
import { createComposeHandlers } from '../src/functions/compose/handlers'
import { encryptSecret } from '../src/lib/crypto'
import { AppError } from '../src/lib/errors'
import { GLOBAL_SETTINGS_ID } from '../src/lib/repos'
import type { RequestContext } from '../src/lib/router'
import { createFakeLlm, DRAFT } from './support/fake-llm'
import { createMemoryRepos } from './support/memory-repos'

const SECRET = 'test-encryption-secret-123'
const ME: RequestContext = { openid: 'o_me' }
const OTHER: RequestContext = { openid: 'o_other' }
const ADMIN: RequestContext = { openid: 'o_admin' }

function setup() {
  const repos = createMemoryRepos()
  const fake = createFakeLlm()
  let clock = 1_000_000
  const handlers = createComposeHandlers({
    repos,
    llm: fake.llm,
    now: () => clock,
    encryptionSecret: () => SECRET,
    adminOpenids: () => [ADMIN.openid],
  })
  const storeLlm = (id: string, apiKey = 'sk-user-key-0001') =>
    repos.settings.upsert(id, {
      llm: {
        preset: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKeyCipher: encryptSecret(apiKey, SECRET),
        apiKeyMask: 'sk-****0001',
        updatedAt: 1,
      },
      updatedAt: 1,
    })
  return {
    repos,
    fake,
    handlers,
    storeLlm,
    tick: (ms: number) => {
      clock += ms
    },
  }
}

async function errorOf(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  return err as AppError
}

describe('compose.create', () => {
  it('只保存原文，返回 id', async () => {
    const { handlers, repos } = setup()
    const { sessionId } = await handlers.create(
      { mode: 'voice', rawText: '  周末 想去 爬山  ' },
      ME,
    )
    const doc = repos.sessionDocs.get(sessionId)!
    expect(doc._openid).toBe(ME.openid)
    expect(doc.input).toEqual({ mode: 'voice', rawText: '周末 想去 爬山' })
    expect(doc.versions).toEqual([])
    expect(doc.job).toBeNull()
  })

  it('拒绝空内容和超长内容', async () => {
    const { handlers } = setup()
    expect((await errorOf(handlers.create({ mode: 'text', rawText: '   ' }, ME))).code).toBe(
      'BAD_REQUEST',
    )
    const long = await errorOf(handlers.create({ mode: 'text', rawText: '字'.repeat(601) }, ME))
    expect(long.message).toContain('600')
  })
})

describe('compose.generate', () => {
  let ctx: ReturnType<typeof setup>
  let sessionId: string
  beforeEach(async () => {
    ctx = setup()
    sessionId = (await ctx.handlers.create({ mode: 'text', rawText: '周末想去爬山' }, ME)).sessionId
  })

  it('没有配置大模型时提示去配置，并记录错误', async () => {
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.code).toBe('NOT_CONFIGURED')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ kind: 'generate', code: 'NOT_CONFIGURED' })
  })

  it('生成第一版：标题、整理后的中文、逐句对照', async () => {
    await ctx.storeLlm(ME.openid)
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.title).toBe(DRAFT.title)
    expect(session.polishedZh).toBe(DRAFT.polishedZh)
    expect(session.versions).toHaveLength(1)
    expect(session.versions[0]).toMatchObject({ vid: 'v1', instruction: null, analysis: null })
    expect(session.versions[0]!.en).toBe(DRAFT.sentences.map((s) => s.en).join(' '))
    expect(session.currentVid).toBe('v1')
    expect(session.job).toBeNull()
    expect(session.lastError).toBeNull()
    // 用的是解密后的 Key，原文出现在提示词里
    expect(ctx.fake.calls[0]!.target.apiKey).toBe('sk-user-key-0001')
    expect(ctx.fake.calls[0]!.prompt).toContain('周末想去爬山')
  })

  it('自己没有配置时使用管理员的全局默认', async () => {
    await ctx.storeLlm(GLOBAL_SETTINGS_ID, 'sk-global-key-9999')
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls[0]!.target.apiKey).toBe('sk-global-key-9999')
  })

  it('已经生成过时直接返回，不重复调用大模型', async () => {
    await ctx.storeLlm(ME.openid)
    await ctx.handlers.generate({ sessionId }, ME)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls.filter((c) => c.kind === 'draft')).toHaveLength(1)
  })

  it('已有任务在运行时不重复执行，返回当前状态', async () => {
    await ctx.storeLlm(ME.openid)
    const running = { kind: 'generate' as const, vid: null, startedAt: 1_000_000 }
    await ctx.repos.sessions.update(sessionId, ME.openid, { job: running })
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.job).toEqual(running)
    expect(ctx.fake.calls).toHaveLength(0)
  })

  it('任务超时中断后可以重新发起', async () => {
    await ctx.storeLlm(ME.openid)
    await ctx.repos.sessions.update(sessionId, ME.openid, {
      job: { kind: 'generate', vid: null, startedAt: 1_000_000 },
    })
    ctx.tick(JOB_STALE_MS + 1)
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.versions).toHaveLength(1)
    expect(session.job).toBeNull()
  })

  it('大模型出错时释放锁、记录错误并抛出', async () => {
    await ctx.storeLlm(ME.openid)
    ctx.fake.fail(new AppError('UPSTREAM_ERROR', '大模型 API Key 无效或没有权限'))
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.message).toContain('API Key')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ code: 'UPSTREAM_ERROR', message: err.message })
  })

  it('未预期的异常不把内部信息透出', async () => {
    await ctx.storeLlm(ME.openid)
    ctx.fake.fail(new Error('db password=123'))
    const original = console.error
    console.error = () => {}
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME)).finally(() => {
      console.error = original
    })
    expect(err.code).toBe('INTERNAL')
    expect(err.message).not.toContain('password')
  })

  it('不能操作别人的对话', async () => {
    await ctx.storeLlm(OTHER.openid)
    expect((await errorOf(ctx.handlers.generate({ sessionId }, OTHER))).code).toBe('NOT_FOUND')
  })
})

describe('compose.revise / analyze', () => {
  async function generated() {
    const ctx = setup()
    await ctx.storeLlm(ME.openid)
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末想去爬山' }, ME)
    await ctx.handlers.generate({ sessionId }, ME)
    return { ...ctx, sessionId }
  }

  it('按要求生成新版本并设为当前版本', async () => {
    const { handlers, sessionId, fake } = await generated()
    const { session } = await handlers.revise(
      { sessionId, baseVid: 'v1', instruction: '更随意一点' },
      ME,
    )
    expect(session.versions.map((v) => v.vid)).toEqual(['v1', 'v2'])
    expect(session.versions[1]).toMatchObject({
      instruction: '更随意一点',
      en: 'Gonna go hiking this weekend.',
    })
    expect(session.currentVid).toBe('v2')
    expect(fake.calls.at(-1)!.prompt).toContain('更随意一点')
  })

  it('修改要求为空、过长或版本不存在时拒绝', async () => {
    const { handlers, sessionId } = await generated()
    await expect(
      handlers.revise({ sessionId, baseVid: 'v1', instruction: ' ' }, ME),
    ).rejects.toThrow('想怎么改')
    await expect(
      handlers.revise({ sessionId, baseVid: 'v1', instruction: '改'.repeat(121) }, ME),
    ).rejects.toThrow('120')
    await expect(
      handlers.revise({ sessionId, baseVid: 'v9', instruction: '更正式' }, ME),
    ).rejects.toThrow('找不到')
  })

  it('为指定版本生成解析，重复调用不再请求', async () => {
    const { handlers, sessionId, fake } = await generated()
    const { session } = await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(session.versions[0]!.analysis?.keyPhrases[0]?.phrase).toBe('hit the trails')
    await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(fake.calls.filter((c) => c.kind === 'analysis')).toHaveLength(1)
  })

  it('解析不会覆盖其他版本', async () => {
    const { handlers, sessionId } = await generated()
    await handlers.revise({ sessionId, baseVid: 'v1', instruction: '更随意' }, ME)
    const { session } = await handlers.analyze({ sessionId, vid: 'v2' }, ME)
    expect(session.versions[0]!.analysis).toBeNull()
    expect(session.versions[1]!.analysis).not.toBeNull()
  })
})

describe('大模型配置', () => {
  const input = {
    scope: 'own' as const,
    preset: 'deepseek' as const,
    baseUrl: 'https://api.deepseek.com/v1/',
    model: 'deepseek-chat',
    apiKey: 'sk-abcdefghij1234',
  }

  it('保存时加密 Key，只返回打码值', async () => {
    const { handlers, repos } = setup()
    const state = await handlers.saveLlmConfig(input, ME)
    expect(state.effective).toBe('own')
    expect(state.own).toMatchObject({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyMask: 'sk-****1234',
    })
    expect(JSON.stringify(state)).not.toContain('sk-abcdefghij1234')
    const stored = repos.settingsDocs.get(ME.openid)!.llm!
    expect(stored.apiKeyCipher).not.toContain('sk-abcdefghij1234')
  })

  it('不填 Key 时沿用已保存的 Key', async () => {
    const { handlers, repos } = setup()
    await handlers.saveLlmConfig(input, ME)
    const cipher = repos.settingsDocs.get(ME.openid)!.llm!.apiKeyCipher
    await handlers.saveLlmConfig({ ...input, apiKey: undefined, model: 'deepseek-reasoner' }, ME)
    const stored = repos.settingsDocs.get(ME.openid)!.llm!
    expect(stored.model).toBe('deepseek-reasoner')
    expect(stored.apiKeyCipher).toBe(cipher)
  })

  it('从没保存过时必须填 Key', async () => {
    const { handlers } = setup()
    await expect(handlers.saveLlmConfig({ ...input, apiKey: '' }, ME)).rejects.toThrow('API Key')
  })

  it('拒绝不安全的接口地址', async () => {
    const { handlers } = setup()
    await expect(
      handlers.saveLlmConfig({ ...input, baseUrl: 'http://10.0.0.1/v1' }, ME),
    ).rejects.toThrow('https')
  })

  it('只有管理员能设置全局默认，成员能看到并使用', async () => {
    const { handlers } = setup()
    const denied = await errorOf(handlers.saveLlmConfig({ ...input, scope: 'global' }, ME))
    expect(denied.code).toBe('FORBIDDEN')
    const adminState = await handlers.saveLlmConfig({ ...input, scope: 'global' }, ADMIN)
    expect(adminState.isAdmin).toBe(true)
    const memberState = await handlers.getLlmConfig({}, ME)
    expect(memberState).toMatchObject({ effective: 'global', isAdmin: false, own: null })
  })

  it('清除自己的配置后回落到全局默认', async () => {
    const { handlers } = setup()
    await handlers.saveLlmConfig({ ...input, scope: 'global' }, ADMIN)
    await handlers.saveLlmConfig(input, ME)
    const state = await handlers.clearLlmConfig({ scope: 'own' }, ME)
    expect(state.effective).toBe('global')
    expect(state.own).toBeNull()
  })

  it('测试连接用填写的 Key，不保存', async () => {
    const { handlers, fake, repos } = setup()
    const res = await handlers.testLlm(input, ME)
    expect(res.reply).toBe('OK')
    expect(fake.calls[0]).toMatchObject({ kind: 'ping', target: { apiKey: 'sk-abcdefghij1234' } })
    expect(repos.settingsDocs.get(ME.openid)).toBeUndefined()
  })
})
