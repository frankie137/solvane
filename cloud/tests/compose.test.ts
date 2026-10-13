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
  it('stores only the raw text and returns the id', async () => {
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

  it('rejects empty and overlong content', async () => {
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

  it('tells the user to contact the admin when no LLM is configured, and records the error', async () => {
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.code).toBe('NOT_CONFIGURED')
    expect(err.message).toContain('管理员还没有配置')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ kind: 'generate', code: 'NOT_CONFIGURED' })
  })

  it('generates the first version: title, polished Chinese, sentence-by-sentence pairs', async () => {
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
    // Uses the decrypted key, and the raw text appears in the prompt
    expect(ctx.fake.calls[0]!.target.apiKey).toBe('sk-user-key-0001')
    expect(ctx.fake.calls[0]!.prompt).toContain('周末想去爬山')
  })

  it("ignores configs members saved earlier and uses only the admin's global config", async () => {
    await ctx.storeLlm(ME.openid, 'sk-own-key-0001')
    await ctx.storeLlm(GLOBAL_SETTINGS_ID, 'sk-global-key-9999')
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls[0]!.target.apiKey).toBe('sk-global-key-9999')
  })

  it('returns right away if already generated, without calling the LLM again', async () => {
    await ctx.storeLlm()
    await ctx.handlers.generate({ sessionId }, ME)
    await ctx.handlers.generate({ sessionId }, ME)
    expect(ctx.fake.calls.filter((c) => c.kind === 'draft')).toHaveLength(1)
  })

  it('does not rerun while a job is running and returns the current state', async () => {
    await ctx.storeLlm()
    const running = { kind: 'generate' as const, vid: null, startedAt: 1_000_000 }
    await ctx.repos.sessions.update(sessionId, ME.openid, { job: running })
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.job).toEqual(running)
    expect(ctx.fake.calls).toHaveLength(0)
  })

  it('can be restarted after a job times out', async () => {
    await ctx.storeLlm()
    await ctx.repos.sessions.update(sessionId, ME.openid, {
      job: { kind: 'generate', vid: null, startedAt: 1_000_000 },
    })
    ctx.tick(JOB_STALE_MS + 1)
    const { session } = await ctx.handlers.generate({ sessionId }, ME)
    expect(session.versions).toHaveLength(1)
    expect(session.job).toBeNull()
  })

  it('releases the lock, records the error and throws when the LLM fails', async () => {
    await ctx.storeLlm()
    ctx.fake.fail(new AppError('UPSTREAM_ERROR', '大模型 API Key 无效或没有权限'))
    const err = await errorOf(ctx.handlers.generate({ sessionId }, ME))
    expect(err.message).toContain('API Key')
    const doc = ctx.repos.sessionDocs.get(sessionId)!
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ code: 'UPSTREAM_ERROR', message: err.message })
  })

  it('does not leak internal details on unexpected errors', async () => {
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

  it("cannot act on someone else's session", async () => {
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

  it('generates a new version as requested and makes it current', async () => {
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

  it('rejects an empty or overlong revision request, or a missing version', async () => {
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

  it('generates the analysis for the given version; repeat calls do not request it again', async () => {
    const { handlers, sessionId, fake } = await generated()
    const { session } = await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(session.versions[0]!.analysis?.keyPhrases[0]?.phrase).toBe('hit the trails')
    await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(fake.calls.filter((c) => c.kind === 'analysis')).toHaveLength(1)
  })

  it("filling in an analysis does not change the session's updatedAt, but revising does", async () => {
    const { handlers, sessionId, repos, tick } = await generated()
    const afterGenerate = repos.sessionDocs.get(sessionId)!.updatedAt
    tick(5_000)
    await handlers.analyze({ sessionId, vid: 'v1' }, ME)
    expect(repos.sessionDocs.get(sessionId)!.updatedAt).toBe(afterGenerate)
    tick(5_000)
    await handlers.revise({ sessionId, baseVid: 'v1', instruction: '更随意' }, ME)
    expect(repos.sessionDocs.get(sessionId)!.updatedAt).toBeGreaterThan(afterGenerate)
  })

  it('analysis does not overwrite other versions', async () => {
    const { handlers, sessionId } = await generated()
    await handlers.revise({ sessionId, baseVid: 'v1', instruction: '更随意' }, ME)
    const { session } = await handlers.analyze({ sessionId, vid: 'v2' }, ME)
    expect(session.versions[0]!.analysis).toBeNull()
    expect(session.versions[1]!.analysis).not.toBeNull()
  })
})

describe('LLM config', () => {
  const input = {
    preset: 'deepseek' as const,
    baseUrl: 'https://api.deepseek.com/v1/',
    model: 'deepseek-chat',
    apiKey: 'sk-abcdefghij1234',
  }

  it('only admins can view and set it', async () => {
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

  it('saves it as the global config, encrypts the key and returns only a masked value', async () => {
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

  it('reuses the saved key when none is given', async () => {
    const { handlers, repos } = setup()
    await handlers.saveLlmConfig(input, ADMIN)
    const cipher = repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm!.apiKeyCipher
    await handlers.saveLlmConfig({ ...input, apiKey: undefined, model: 'deepseek-reasoner' }, ADMIN)
    const stored = repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm!
    expect(stored.model).toBe('deepseek-reasoner')
    expect(stored.apiKeyCipher).toBe(cipher)
  })

  it('cannot reuse the old key when the provider host changes', async () => {
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

  it('requires a key when nothing has been saved yet', async () => {
    const { handlers } = setup()
    await expect(handlers.saveLlmConfig({ ...input, apiKey: '' }, ADMIN)).rejects.toThrow('API Key')
  })

  it('rejects unsafe API URLs', async () => {
    const { handlers } = setup()
    await expect(
      handlers.saveLlmConfig({ ...input, baseUrl: 'http://10.0.0.1/v1' }, ADMIN),
    ).rejects.toThrow('https')
  })

  it('has no config after clearing', async () => {
    const { handlers } = setup()
    await handlers.saveLlmConfig(input, ADMIN)
    expect((await handlers.clearLlmConfig({}, ADMIN)).config).toBeNull()
    expect((await handlers.getLlmConfig({}, ADMIN)).config).toBeNull()
  })

  it('clears configs members saved earlier when an admin opens the config', async () => {
    const { handlers, repos, storeLlm } = setup()
    await storeLlm(ME.openid)
    await storeLlm(GLOBAL_SETTINGS_ID)
    const { config } = await handlers.getLlmConfig({}, ADMIN)
    expect(config).not.toBeNull()
    expect(repos.settingsDocs.get(ME.openid)!.llm).toBeNull()
    expect(repos.settingsDocs.get(GLOBAL_SETTINGS_ID)!.llm).not.toBeNull()
  })

  it('still reads the config when clearing member configs fails', async () => {
    const { handlers, repos, storeLlm } = setup()
    await storeLlm(GLOBAL_SETTINGS_ID)
    repos.settings.clearMemberLlm = async () => {
      throw new Error('db down')
    }
    const original = console.error
    console.error = () => {}
    const { config } = await handlers
      .getLlmConfig({}, ADMIN)
      .finally(() => (console.error = original))
    expect(config).not.toBeNull()
  })

  it('tests the connection with the entered key without saving it', async () => {
    const { handlers, fake, repos } = setup()
    const res = await handlers.testLlm(input, ADMIN)
    expect(res.reply).toBe('OK')
    expect(fake.calls[0]).toMatchObject({ kind: 'ping', target: { apiKey: 'sk-abcdefghij1234' } })
    expect(repos.settingsDocs.get(GLOBAL_SETTINGS_ID)).toBeUndefined()
  })
})

describe('free uses', () => {
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

  it('generating the first version uses one; revise and analyze do not', async () => {
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

  it('cannot create a session once free uses run out', async () => {
    const ctx = setup()
    await ctx.repos.accounts.create(account(5))
    const err = await errorOf(ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME))
    expect(err.code).toBe('QUOTA_EXCEEDED')
    expect(ctx.repos.sessionDocs.size).toBe(0)
  })

  it('uses run out after creating: generate fails and records it without calling the LLM', async () => {
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

  it('refunds a failed generation; a successful retry charges only once', async () => {
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

  it('retrying after an interrupted job does not charge again', async () => {
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

  it('does not charge Pro users or admins', async () => {
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

  it('falls back to free uses after Pro expires', async () => {
    const ctx = setup()
    await ctx.repos.accounts.create(account(5, 1_000_000 - 1))
    const err = await errorOf(ctx.handlers.create({ mode: 'text', rawText: '周末' }, ME))
    expect(err.code).toBe('QUOTA_EXCEEDED')
  })
})
