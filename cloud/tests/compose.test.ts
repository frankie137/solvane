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
  const storeLlm = (id = GLOBAL_SETTINGS_ID, apiKey = 'sk-user-key-0001') =>
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

  it('没有配置大模型时提示联系管理员，并记录错误', async () => {
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.code).toBe('NOT_CONFIGURED')
    expect(err.message).toContain('管理员还没有配置')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ kind: 'generate', code: 'NOT_CONFIGURED' })
  })

  it('生成第一版：标题、整理后的中文、逐句对照', async () => {
    await ctx.storeLlm()
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

  it('成员以前存的配置不再使用，只用管理员的全局配置', async () => {
    await ctx.storeLlm(ME.openid, 'sk-own-key-0001')
    await ctx.storeLlm(GLOBAL_SETTINGS_ID, 'sk-global-key-9999')
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls[0]!.target.apiKey).toBe('sk-global-key-9999')
  })

  it('已经生成过时直接返回，不重复调用大模型', async () => {
    await ctx.storeLlm()
    await ctx.handlers.generate({ sessionId }, ME)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls.filter((c) => c.kind === 'draft')).toHaveLength(1)
  })

  it('已有任务在运行时不重复执行，返回当前状态', async () => {
    await ctx.storeLlm()
    const running = { kind: 'generate' as const, vid: null, startedAt: 1_000_000 }
    await ctx.repos.sessions.update(sessionId, ME.openid, { job: running })
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.job).toEqual(running)
    expect(ctx.fake.calls).toHaveLength(0)
  })

  it('任务超时中断后可以重新发起', async () => {
    await ctx.storeLlm()
    await ctx.repos.sessions.update(sessionId, ME.openid, {
      job: { kind: 'generate', vid: null, startedAt: 1_000_000 },
    })
    ctx.tick(JOB_STALE_MS + 1)
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.versions).toHaveLength(1)
    expect(session.job).toBeNull()
  })

  it('大模型出错时释放锁、记录错误并抛出', async () => {
    await ctx.storeLlm()
    ctx.fake.fail(new AppError('UPSTREAM_ERROR', '大模型 API Key 无效或没有权限'))
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.message).toContain('API Key')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ code: 'UPSTREAM_ERROR', message: err.message })
  })

  it('未预期的异常不把内部信息透出', async () => {
    await ctx.storeLlm()
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
    await ctx.storeLlm()
    expect((await errorOf(ctx.handlers.generate({ sessionId }, OTHER))).code).toBe('NOT_FOUND')
  })
})

describe('compose.revise / analyze', () => {
  async function generated() {
    const ctx = setup()
    await ctx.storeLlm()
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

  it('补解析不改变对话的更新时间，修改会更新', async () => {
    const { handlers, sessionId, repos, tick } = await generated()
    const afterGenerate = repos.sessionDocs.get(sessionId)!.updatedAt
    tick(5_000)
    await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(repos.sessionDocs.get(sessionId)!.updatedAt).toBe(afterGenerate)
    tick(5_000)
    await handlers.revise({ sessionId, baseVid: 'v1', instruction: '更随意' }, ME)
    expect(repos.sessionDocs.get(sessionId)!.updatedAt).toBeGreaterThan(afterGenerate)
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
    preset: 'deepseek' as const,
    baseUrl: 'https://api.deepseek.com/v1/',
    model: 'deepseek-chat',
    apiKey: 'sk-abcdefghij1234',
  }

  it('只有管理员能查看和设置', async () => {
    const { handlers } = setup()
    for (const call of [
      handlers.getLlmConfig({}, ME),
      handlers.saveLlmConfig(input, ME),
      handlers.clearLlmConfig({}, ME),
      handlers.testLlm(input, ME),
    ]) {
      expect((await errorOf(call)).code).toBe('FORBIDDEN')
    }
  })

  it('保存为全局配置，加密 Key，只返回打码值', async () => {
    const { handlers, repos } = setup()
    const { config } = await handlers.saveLlmConfig(input, ADMIN)
    expect(config).toMatchObject({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyMask: 'sk-****1234',
    })
    expect(JSON.stringify(config)).not.toContain('sk-abcdefghij1234')
    const stored = repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm!
    expect(stored.apiKeyCipher).not.toContain('sk-abcdefghij1234')
    expect(repos.settingsDocs.get(ADMIN.openid)).toBeUndefined()
  })

  it('不填 Key 时沿用已保存的 Key', async () => {
    const { handlers, repos } = setup()
    await handlers.saveLlmConfig(input, ADMIN)
    const cipher = repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm!.apiKeyCipher
    await handlers.saveLlmConfig({ ...input, apiKey: undefined, model: 'deepseek-reasoner' }, ADMIN)
    const stored = repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm!
    expect(stored.model).toBe('deepseek-reasoner')
    expect(stored.apiKeyCipher).toBe(cipher)
  })

  it('换了服务商地址时不能沿用旧 Key', async () => {
    const { handlers, fake } = setup()
    await handlers.saveLlmConfig(input, ADMIN)
    const moved = {
      ...input,
      preset: 'moonshot' as const,
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: undefined,
    }
    await expect(handlers.testLlm(moved, ADMIN)).rejects.toThrow('重新填写 API Key')
    await expect(handlers.saveLlmConfig(moved, ADMIN)).rejects.toThrow('重新填写 API Key')
    expect(fake.calls.filter((c) => c.kind === 'ping')).toHaveLength(0)
  })

  it('从没保存过时必须填 Key', async () => {
    const { handlers } = setup()
    await expect(handlers.saveLlmConfig({ ...input, apiKey: '' }, ADMIN)).rejects.toThrow('API Key')
  })

  it('拒绝不安全的接口地址', async () => {
    const { handlers } = setup()
    await expect(
      handlers.saveLlmConfig({ ...input, baseUrl: 'http://10.0.0.1/v1' }, ADMIN),
    ).rejects.toThrow('https')
  })

  it('清除后没有配置', async () => {
    const { handlers } = setup()
    await handlers.saveLlmConfig(input, ADMIN)
    expect((await handlers.clearLlmConfig({}, ADMIN)).config).toBeNull()
    expect((await handlers.getLlmConfig({}, ADMIN)).config).toBeNull()
  })

  it('管理员打开配置时清掉成员以前存的配置', async () => {
    const { handlers, repos, storeLlm } = setup()
    await storeLlm(ME.openid)
    await storeLlm(GLOBAL_SETTINGS_ID)
    const { config } = await handlers.getLlmConfig({}, ADMIN)
    expect(config).not.toBeNull()
    expect(repos.settingsDocs.get(ME.openid)!.llm).toBeNull()
    expect(repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm).not.toBeNull()
  })

  it('测试连接用填写的 Key，不保存', async () => {
    const { handlers, fake, repos } = setup()
    const res = await handlers.testLlm(input, ADMIN)
    expect(res.reply).toBe('OK')
    expect(fake.calls[0]).toMatchObject({ kind: 'ping', target: { apiKey: 'sk-abcdefghij1234' } })
    expect(repos.settingsDocs.get(GLOBAL_SETTINGS_ID)).toBeUndefined()
  })
})

describe('免费次数', () => {
  const used = (repos: ReturnType<typeof createMemoryRepos>, openid = ME.openid) =>
    repos.accountDocs.get(openid)?.freeUsed ?? 0
  const account = (freeUsed: number, proUntil: number | null = null) => ({
    _id: ME.openid,
    freeUsed,
    proUntil,
    grants: [],
    createdAt: 1,
    updatedAt: 1,
  })

  it('生成第一版扣一次，修改和解析不扣', async () => {
    const ctx = setup()
    await ctx.storeLlm()
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME)
    expect(used(ctx.repos)).toBe(0)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(used(ctx.repos)).toBe(1)
    await ctx.handlers.generate({ sessionId }, ME)
    await ctx.handlers.revise({ sessionId, baseVid: 'v1', instruction: '更随意' }, ME)
    await ctx.handlers.analyze({ sessionId, vid: 'v2' }, ME)
    expect(used(ctx.repos)).toBe(1)
  })

  it('次数用完时不能新建对话', async () => {
    const ctx = setup()
    await ctx.repos.accounts.create(account(5))
    const err = await errorOf(ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME))
    expect(err.code).toBe('QUOTA_EXCEEDED')
    expect(ctx.repos.sessionDocs.size).toBe(0)
  })

  it('新建后次数被用完：生成时报错并记录，不调用大模型', async () => {
    const ctx = setup()
    await ctx.storeLlm()
    await ctx.repos.accounts.create(account(4))
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME)
    await ctx.repos.accounts.consume(ME.openid, 5, 1)
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.code).toBe('QUOTA_EXCEEDED')
    expect(ctx.fake.calls).toHaveLength(0)
    expect(ctx.repos.sessionDocs.get(sessionId)!.lastError).toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
  })

  it('生成失败退回次数，重试成功后只扣一次', async () => {
    const ctx = setup()
    await ctx.storeLlm()
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME)
    ctx.fake.fail(new AppError('UPSTREAM_ERROR', '服务商出错'))
    await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(used(ctx.repos)).toBe(0)
    expect(ctx.repos.sessionDocs.get(sessionId)!.freeCharged).toBe(false)
    ctx.fake.fail(null)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(used(ctx.repos)).toBe(1)
  })

  it('任务中断后重试不重复扣', async () => {
    const ctx = setup()
    await ctx.storeLlm()
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME)
    await ctx.repos.accounts.consume(ME.openid, 5, 1)
    await ctx.repos.sessions.update(sessionId, ME.openid, {
      freeCharged: true,
      job: { kind: 'generate', vid: null, startedAt: 1_000_000 },
    })
    ctx.tick(JOB_STALE_MS + 1)
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.versions).toHaveLength(1)
    expect(used(ctx.repos)).toBe(1)
  })

  it('Pro 和管理员不扣次数', async () => {
    const ctx = setup()
    await ctx.storeLlm()
    await ctx.repos.accounts.create(account(5, 1_000_000 + 1000))
    const { sessionId } = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(used(ctx.repos)).toBe(5)

    const admin = await ctx.handlers.create({ mode: 'text', rawText: '周末' }, ADMIN)
    await ctx.handlers.generate(admin, ADMIN)
    expect(used(ctx.repos, ADMIN.openid)).toBe(0)
  })

  it('Pro 到期后回到免费次数', async () => {
    const ctx = setup()
    await ctx.repos.accounts.create(account(5, 1_000_000 - 1))
    const err = await errorOf(ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME))
    expect(err.code).toBe('QUOTA_EXCEEDED')
  })
})
