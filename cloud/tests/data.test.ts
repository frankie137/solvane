import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { Version } from '@shared/types'
import { createDataHandlers } from '../src/functions/data/handlers'
import type { SessionDoc } from '../src/lib/repos'
import { createMemoryRepos } from './support/memory-repos'
import { createMemoryStorage } from './support/memory-storage'

const ME = { openid: 'o_me' }

function version(vid: string, en: string): Version {
  return {
    vid,
    instruction: null,
    en,
    sentences: [{ en, zh: '中' }],
    alternatives: [],
    analysis: null,
    createdAt: 1,
  }
}

function sessionDoc(patch: Partial<SessionDoc>): Omit<SessionDoc, '_id'> {
  return {
    _openid: ME.openid,
    title: '',
    input: { mode: 'text', rawText: '原文内容' },
    polishedZh: '',
    versions: [],
    currentVid: null,
    job: null,
    lastError: null,
    folderId: null,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}

function setup() {
  const repos = createMemoryRepos()
  return {
    repos,
    handlers: createDataHandlers({
      repos,
      now: () => 5_000,
      storage: createMemoryStorage(),
      newFileName: () => 'f',
      adminOpenids: () => [],
    }),
  }
}

describe('设置', () => {
  it('没有设置时返回默认值', async () => {
    const { handlers } = setup()
    await expect(handlers.getSettings({}, ME)).resolves.toEqual(DEFAULT_SETTINGS)
  })

  it('部分更新，其余保持', async () => {
    const { handlers } = setup()
    await handlers.updateSettings({ level: 'ielts' }, ME)
    await expect(handlers.updateSettings({ accent: 'uk' }, ME)).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      level: 'ielts',
      accent: 'uk',
    })
  })

  it('保存示范朗读的音色和语速', async () => {
    const { handlers } = setup()
    await expect(
      handlers.updateSettings({ ttsVoice: 'male', ttsSpeed: 'slow' }, ME),
    ).resolves.toMatchObject({
      ttsVoice: 'male',
      ttsSpeed: 'slow',
    })
  })

  it('拒绝非法取值', async () => {
    const { handlers } = setup()
    await expect(
      handlers.updateSettings({ level: 'expert' } as unknown as { level: 'cet4' }, ME),
    ).rejects.toThrow('参数')
  })
})

describe('对话读取', () => {
  it('最近对话按更新时间倒序，只含自己的', async () => {
    const { handlers, repos } = setup()
    await repos.sessions.create(sessionDoc({ title: '旧', updatedAt: 1 }))
    await repos.sessions.create(sessionDoc({ title: '新', updatedAt: 3 }))
    await repos.sessions.create(sessionDoc({ title: '别人的', _openid: 'o_other', updatedAt: 9 }))
    const { items } = await handlers.listSessions({}, ME)
    expect(items.map((i) => i.title)).toEqual(['新', '旧'])
  })

  it('摘要的状态和预览', async () => {
    const { handlers, repos } = setup()
    await repos.sessions.create(
      sessionDoc({ updatedAt: 4, versions: [version('v1', 'Hello there.')], currentVid: 'v1' }),
    )
    await repos.sessions.create(
      sessionDoc({ updatedAt: 3, job: { kind: 'generate', vid: null, startedAt: 1 } }),
    )
    await repos.sessions.create(
      sessionDoc({
        updatedAt: 2,
        lastError: { kind: 'generate', vid: null, code: 'UPSTREAM_ERROR', message: 'x', at: 1 },
      }),
    )
    await repos.sessions.create(sessionDoc({ updatedAt: 1 }))
    const { items } = await handlers.listSessions({}, ME)
    expect(items.map((i) => i.state)).toEqual(['ready', 'running', 'failed', 'pending'])
    expect(items[0]!.preview).toBe('Hello there.')
    expect(items[3]!.preview).toBe('原文内容')
    expect(items[3]!.title).toBe('原文内容')
  })

  it('读取别人的对话返回 NOT_FOUND', async () => {
    const { handlers, repos } = setup()
    const id = await repos.sessions.create(sessionDoc({ _openid: 'o_other' }))
    await expect(handlers.getSession({ sessionId: id }, ME)).rejects.toThrow('不存在')
  })

  it('切换版本不改变更新时间', async () => {
    const { handlers, repos } = setup()
    const id = await repos.sessions.create(
      sessionDoc({
        versions: [version('v1', 'a'), version('v2', 'b')],
        currentVid: 'v2',
        updatedAt: 7,
      }),
    )
    const { session } = await handlers.setCurrentVersion({ sessionId: id, vid: 'v1' }, ME)
    expect(session.currentVid).toBe('v1')
    expect(repos.sessionDocs.get(id)).toMatchObject({ currentVid: 'v1', updatedAt: 7 })
    await expect(handlers.setCurrentVersion({ sessionId: id, vid: 'v3' }, ME)).rejects.toThrow(
      '找不到',
    )
  })
})
