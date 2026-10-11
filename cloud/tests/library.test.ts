import { describe, expect, it } from 'vitest'
import { JOB_STALE_MS } from '@shared/constants'
import type { Version } from '@shared/types'
import { createComposeHandlers } from '../src/functions/compose/handlers'
import { createDataHandlers } from '../src/functions/data/handlers'
import { encryptSecret } from '../src/lib/crypto'
import { AppError } from '../src/lib/errors'
import { GLOBAL_SETTINGS_ID, type SessionDoc } from '../src/lib/repos'
import { createFakeLlm, EXPLAIN } from './support/fake-llm'
import { createMemoryRepos } from './support/memory-repos'
import { createMemoryStorage } from './support/memory-storage'

const ME = { openid: 'o_me' }
const OTHER = { openid: 'o_other' }
const SECRET = 'test-encryption-secret-123'

function version(vid: string, sentences: string[]): Version {
  return {
    vid,
    instruction: null,
    en: sentences.join(' '),
    sentences: sentences.map((en) => ({ en, zh: '中' })),
    alternatives: [],
    analysis: null,
    createdAt: 1,
  }
}

function sessionDoc(patch: Partial<SessionDoc>): Omit<SessionDoc, '_id'> {
  return {
    _openid: ME.openid,
    title: '标题',
    input: { mode: 'text', rawText: '原文内容' },
    polishedZh: '润色后的中文',
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
  let clock = 1_000_000
  const now = () => clock
  const data = createDataHandlers({
    repos,
    now,
    storage: createMemoryStorage(),
    newFileName: () => 'f',
    adminOpenids: () => [],
  })
  const fake = createFakeLlm()
  const compose = createComposeHandlers({
    repos,
    llm: fake.llm,
    now,
    encryptionSecret: () => SECRET,
    adminOpenids: () => [],
  })
  const addSession = (patch: Partial<SessionDoc> = {}) => repos.sessions.create(sessionDoc(patch))
  const storeLlm = () =>
    repos.settings.upsert(GLOBAL_SETTINGS_ID, {
      llm: {
        preset: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKeyCipher: encryptSecret('sk-user-key-0001', SECRET),
        apiKeyMask: 'sk-****0001',
        updatedAt: 1,
      },
      updatedAt: 1,
    })
  return {
    repos,
    data,
    compose,
    fake,
    addSession,
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

describe('文件夹', () => {
  it('最多三级，同一层不能重名，名字的问题说清楚', async () => {
    const { data } = setup()
    const { folder: a } = await data.createFolder({ name: '日常', parentId: null }, ME)
    const { folder: b } = await data.createFolder({ name: '吃饭', parentId: a.id }, ME)
    const { folder: c } = await data.createFolder({ name: '早餐', parentId: b.id }, ME)
    expect([a.depth, b.depth, c.depth]).toEqual([1, 2, 3])
    expect((await errorOf(data.createFolder({ name: 'x', parentId: c.id }, ME))).message).toContain(
      '最多 3 级',
    )
    expect(
      (await errorOf(data.createFolder({ name: '日常', parentId: null }, ME))).message,
    ).toContain('已经有叫「日常」')
    expect((await errorOf(data.createFolder({ name: '   ', parentId: null }, ME))).message).toBe(
      '文件夹名不能为空',
    )
    // 不同层可以同名
    await expect(data.createFolder({ name: '日常', parentId: a.id }, ME)).resolves.toBeTruthy()
  })

  it('移动时整棵子树一起改深度，不能超过三级、不能移进自己下面', async () => {
    const { data } = setup()
    const { folder: a } = await data.createFolder({ name: 'A', parentId: null }, ME)
    const { folder: b } = await data.createFolder({ name: 'B', parentId: a.id }, ME)
    const { folder: c } = await data.createFolder({ name: 'C', parentId: null }, ME)
    const { folder: d } = await data.createFolder({ name: 'D', parentId: c.id }, ME)

    expect(
      (await errorOf(data.moveFolder({ folderId: a.id, parentId: b.id }, ME))).message,
    ).toContain('它自己或它下面')
    // A(含 B) 移到 D 下面会变成 3、4 级
    expect(
      (await errorOf(data.moveFolder({ folderId: a.id, parentId: d.id }, ME))).message,
    ).toContain('超过 3 级')
    await data.moveFolder({ folderId: a.id, parentId: c.id }, ME)
    const { folders } = await data.listFolders({}, ME)
    const byName = Object.fromEntries(folders.map((f) => [f.name, f]))
    expect(byName.A).toMatchObject({ parentId: c.id, depth: 2 })
    expect(byName.B).toMatchObject({ parentId: a.id, depth: 3 })
  })

  it('排序必须给出同一层的全部文件夹', async () => {
    const { data } = setup()
    const ids: string[] = []
    for (const name of ['一', '二', '三']) {
      ids.push((await data.createFolder({ name, parentId: null }, ME)).folder.id)
    }
    await expect(
      data.reorderFolders({ parentId: null, ids: [ids[2]!, ids[0]!] }, ME),
    ).rejects.toThrow('刷新')
    await data.reorderFolders({ parentId: null, ids: [ids[2]!, ids[0]!, ids[1]!] }, ME)
    const { folders } = await data.listFolders({}, ME)
    expect(folders.map((f) => f.name)).toEqual(['三', '一', '二'])
  })

  it('删除时内容移到上一级：子文件夹上移一级，收藏移到上一级', async () => {
    const { data, addSession } = setup()
    const { folder: a } = await data.createFolder({ name: 'A', parentId: null }, ME)
    const { folder: b } = await data.createFolder({ name: 'B', parentId: a.id }, ME)
    const { folder: c } = await data.createFolder({ name: 'C', parentId: b.id }, ME)
    const sid = await addSession({ versions: [version('v1', ['Hi there.'])] })
    await data.organize({ tab: 'session', id: sid, folderId: b.id }, ME)

    await data.deleteFolder({ folderId: b.id, mode: 'moveUp' }, ME)
    const { folders, counts } = await data.listFolders({}, ME)
    expect(folders.find((f) => f.id === c.id)).toMatchObject({ parentId: a.id, depth: 2 })
    expect(folders.some((f) => f.id === b.id)).toBe(false)
    expect(counts.session).toEqual({ [a.id]: 1 })
  })

  it('内容移到上一级时遇到同名文件夹，改名避免重名', async () => {
    const { data } = setup()
    const { folder: a } = await data.createFolder({ name: 'A', parentId: null }, ME)
    await data.createFolder({ name: '工作', parentId: a.id }, ME)
    const { folder: b } = await data.createFolder({ name: 'B', parentId: a.id }, ME)
    await data.createFolder({ name: '工作', parentId: b.id }, ME)
    await data.deleteFolder({ folderId: b.id, mode: 'moveUp' }, ME)
    const { folders } = await data.listFolders({}, ME)
    expect(
      folders
        .filter((f) => f.parentId === a.id)
        .map((f) => f.name)
        .sort(),
    ).toEqual(['工作', '工作 2'])
  })

  it('一起删除：表达卡片删掉，对话只取消收藏', async () => {
    const { data, repos, addSession } = setup()
    const { folder: a } = await data.createFolder({ name: 'A', parentId: null }, ME)
    const { folder: b } = await data.createFolder({ name: 'B', parentId: a.id }, ME)
    const sid = await addSession({ versions: [version('v1', ["Let's catch up soon."])] })
    const { expression } = await data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    await data.organize({ tab: 'expression', id: expression.id, folderId: b.id }, ME)
    await data.organize({ tab: 'session', id: sid, folderId: a.id, tags: ['旅行'] }, ME)

    await data.deleteFolder({ folderId: a.id, mode: 'deleteAll' }, ME)
    expect(repos.expressionDocs.size).toBe(0)
    expect(repos.folderDocs.size).toBe(0)
    const session = repos.sessionDocs.get(sid)!
    expect(session).toMatchObject({ starredAt: null, folderId: null, tags: [] })
    expect(session.versions).toHaveLength(1)
  })

  it('不能操作别人的文件夹', async () => {
    const { data } = setup()
    const { folder } = await data.createFolder({ name: 'A', parentId: null }, ME)
    await expect(data.renameFolder({ folderId: folder.id, name: 'B' }, OTHER)).rejects.toThrow(
      '不存在',
    )
    await expect(data.createFolder({ name: 'x', parentId: folder.id }, OTHER)).rejects.toThrow(
      '不存在',
    )
  })
})

describe('收藏对话', () => {
  it('收藏不改更新时间；取消收藏清掉文件夹和标签', async () => {
    const { data, repos, addSession } = setup()
    const sid = await addSession({ updatedAt: 7 })
    const starred = await data.starSession({ sessionId: sid, star: true }, ME)
    expect(starred).toEqual({ starredAt: 1_000_000, folderId: null, tags: [] })
    await data.organize({ tab: 'session', id: sid, tags: ['#职场', ' 职场 ', '旅行'] }, ME)
    expect(repos.sessionDocs.get(sid)).toMatchObject({ tags: ['职场', '旅行'], updatedAt: 7 })

    await data.starSession({ sessionId: sid, star: false }, ME)
    expect(repos.sessionDocs.get(sid)).toMatchObject({ starredAt: null, folderId: null, tags: [] })
  })

  it('移动或打标签时一并收藏；标签有数量和长度限制', async () => {
    const { data, repos, addSession } = setup()
    const sid = await addSession()
    await data.organize({ tab: 'session', id: sid, tags: ['旅行'] }, ME)
    expect(repos.sessionDocs.get(sid)!.starredAt).toBe(1_000_000)
    await expect(
      data.organize({ tab: 'session', id: sid, tags: ['一二三四五六七八九十一二三'] }, ME),
    ).rejects.toThrow('最多 12 个字')
    const many = Array.from({ length: 11 }, (_, i) => `t${i}`)
    await expect(data.organize({ tab: 'session', id: sid, tags: many }, ME)).rejects.toThrow(
      '最多 10 个标签',
    )
    await expect(
      data.organize({ tab: 'session', id: sid, folderId: 'missing' }, ME),
    ).rejects.toThrow('文件夹不存在')
  })

  it('旧数据没有收藏字段时视为没收藏', async () => {
    const { data, addSession } = setup()
    const sid = await addSession({ folderId: 'stale', tags: ['x'] })
    const { session } = await data.getSession({ sessionId: sid }, ME)
    expect(session).toMatchObject({ starredAt: null, folderId: null, tags: [] })
  })
})

describe('收藏表达', () => {
  async function withSession() {
    const ctx = setup()
    const sid = await ctx.addSession({
      title: '周末',
      versions: [
        version('v1', ['I need to catch up on sleep.', 'Hit the trails with me!']),
        version('v2', ['I gotta catch up on sleep.']),
      ],
      currentVid: 'v2',
    })
    return { ...ctx, sid }
  }

  it('解析里带释义的直接就绪，并在版本里找到所在句子', async () => {
    const { data, sid } = await withSession()
    const { expression, created } = await data.saveExpression(
      {
        text: 'hit the trails',
        kind: 'phrase',
        meaning: '去徒步',
        usage: '朋友间说',
        example: "Let's hit the trails.",
        source: { sessionId: sid, vid: 'v1', sentenceIndex: -1, from: 'analysis' },
      },
      ME,
    )
    expect(created).toBe(true)
    expect(expression).toMatchObject({ fill: 'ready', meaning: '去徒步', kind: 'phrase' })
    expect(expression.sources[0]).toMatchObject({
      sentenceIndex: 1,
      sentence: 'Hit the trails with me!',
      from: 'analysis',
    })
  })

  it('同一个表达合并成一张卡片，来源累加，同一句不重复记', async () => {
    const { data, repos, sid, tick } = await withSession()
    const save = (text: string, vid: string, sentenceIndex: number) =>
      data.saveExpression(
        { text, kind: 'word', source: { sessionId: sid, vid, sentenceIndex, from: 'sentence' } },
        ME,
      )
    const first = await save('catch up', 'v1', 0)
    expect(first.expression.fill).toBe('pending')
    tick(10)
    const second = await save('Catch up!', 'v2', 0)
    expect(second.created).toBe(false)
    expect(second.expression.id).toBe(first.expression.id)
    expect(second.expression.sources).toHaveLength(2)
    expect(second.expression.savedAt).toBe(1_000_010)
    await save('catch up', 'v2', 0)
    expect(repos.expressionDocs.get(first.expression.id)!.sources).toHaveLength(2)
    expect(repos.expressionDocs.size).toBe(1)
  })

  it('先从句子收藏、后从解析收藏时用上解析的释义', async () => {
    const { data, sid } = await withSession()
    await data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    const { expression } = await data.saveExpression(
      {
        text: 'catch up',
        kind: 'phrase',
        meaning: '补上',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: -1, from: 'analysis' },
      },
      ME,
    )
    expect(expression).toMatchObject({ fill: 'ready', meaning: '补上' })
  })

  it('校验对话和版本归属', async () => {
    const { data, sid } = await withSession()
    const source = { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' as const }
    await expect(data.saveExpression({ text: 'x', kind: 'word', source }, OTHER)).rejects.toThrow(
      '对话不存在',
    )
    await expect(
      data.saveExpression({ text: 'x', kind: 'word', source: { ...source, vid: 'v9' } }, ME),
    ).rejects.toThrow('版本')
    await expect(data.saveExpression({ text: '...', kind: 'word', source }, ME)).rejects.toThrow(
      '不能为空',
    )
  })

  it('卡片详情带来源对话的标题，最近的在前；别人看不到', async () => {
    const { data, sid, tick } = await withSession()
    const { expression } = await data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    tick(5)
    await data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v2', sentenceIndex: 0, from: 'report' },
      },
      ME,
    )
    const { sources } = await data.getExpression({ expressionId: expression.id }, ME)
    expect(sources.map((s) => [s.vid, s.sessionTitle, s.from])).toEqual([
      ['v2', '周末', 'report'],
      ['v1', '周末', 'sentence'],
    ])
    await expect(data.getExpression({ expressionId: expression.id }, OTHER)).rejects.toThrow(
      '不存在',
    )
  })

  it('备注、删除和已收藏的合并键', async () => {
    const { data, sid } = await withSession()
    const { expression } = await data.saveExpression(
      {
        text: 'Catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    const updated = await data.updateExpression({ expressionId: expression.id, note: ' 常用 ' }, ME)
    expect(updated.expression.note).toBe('常用')
    await expect(data.expressionKeys({}, ME)).resolves.toEqual({
      keys: { 'catch up': expression.id },
    })
    await data.deleteExpression({ expressionId: expression.id }, ME)
    await expect(data.expressionKeys({}, ME)).resolves.toEqual({ keys: {} })
  })
})

describe('收藏列表', () => {
  it('按文件夹、标签、关键词筛选；文件夹被删掉的算未归类', async () => {
    const { data, repos, addSession } = setup()
    const { folder } = await data.createFolder({ name: '工作', parentId: null }, ME)
    const sid = await addSession({
      versions: [version('v1', ['Catch you later.', 'Hang in there.'])],
    })
    const save = async (text: string, sentenceIndex: number) =>
      (
        await data.saveExpression(
          {
            text,
            kind: 'word',
            source: { sessionId: sid, vid: 'v1', sentenceIndex, from: 'sentence' },
          },
          ME,
        )
      ).expression.id
    const a = await save('catch you later', 0)
    const b = await save('hang in there', 1)
    await data.organize({ tab: 'expression', id: a, folderId: folder.id, tags: ['告别'] }, ME)
    repos.expressionDocs.get(b)!.folderId = 'deleted-folder'

    const list = async (req: object) =>
      (await data.listFavorites({ tab: 'expression', ...req }, ME)).expressions.map((e) => e.text)
    expect(await list({ folderId: folder.id })).toEqual(['catch you later'])
    expect(await list({ folderId: null })).toEqual(['hang in there'])
    expect(await list({ tag: '告别' })).toEqual(['catch you later'])
    expect(await list({ keyword: 'HANG' })).toEqual(['hang in there'])

    const { counts } = await data.listFolders({}, ME)
    expect(counts.expression).toEqual({ [folder.id]: 1, '': 1 })
    await expect(data.listTags({ tab: 'expression' }, ME)).resolves.toEqual({
      tags: [{ name: '告别', count: 1 }],
    })
  })

  it('对话栏只列已收藏的，可按英文搜索', async () => {
    const { data, addSession } = setup()
    const a = await addSession({ title: '爬山', versions: [version('v1', ['Hit the trails.'])] })
    await addSession({ title: '没收藏' })
    await data.starSession({ sessionId: a, star: true }, ME)
    const all = await data.listFavorites({ tab: 'session' }, ME)
    expect(all.sessions.map((s) => s.title)).toEqual(['爬山'])
    const found = await data.listFavorites({ tab: 'session', keyword: 'trails' }, ME)
    expect(found.sessions).toHaveLength(1)
  })
})

describe('溯源：也出现在', () => {
  it('在其他对话里认词形变化地查找，排除来源句，同一对话的重复句只列一次', async () => {
    const { data, addSession, tick } = setup()
    const src = await addSession({
      title: '来源',
      versions: [version('v1', ["Let's catch up soon."])],
      updatedAt: 1,
    })
    tick(1)
    await addSession({
      title: '旧的',
      versions: [
        version('v1', ['We caught up over coffee.']),
        version('v2', ['We caught up over coffee.', 'Nothing here.']),
      ],
      updatedAt: 2,
    })
    await addSession({ title: '无关', versions: [version('v1', ['Hello world.'])], updatedAt: 3 })
    await addSession({
      title: '同一对话另一句',
      versions: [version('v1', ["I'm catching up on emails."])],
      updatedAt: 4,
    })
    const { expression } = await data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: src, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    const { usages } = await data.findUsages({ expressionId: expression.id }, ME)
    expect(usages.map((u) => [u.sessionTitle, u.sentence, u.vid])).toEqual([
      ['同一对话另一句', "I'm catching up on emails.", 'v1'],
      ['旧的', 'We caught up over coffee.', 'v2'],
    ])
  })
})

describe('历史', () => {
  it('按更新时间倒序分页，关键词查找中英文', async () => {
    const { data, addSession } = setup()
    for (let i = 0; i < 25; i++) {
      await addSession({
        title: `对话${i}`,
        versions: [version('v1', [i === 3 ? 'Hit the trails.' : 'Hello.'])],
        updatedAt: i,
      })
    }
    const first = await data.listHistory({}, ME)
    expect(first.items).toHaveLength(20)
    expect(first.items[0]!.title).toBe('对话24')
    expect(first.hasMore).toBe(true)
    const second = await data.listHistory({ offset: 20 }, ME)
    expect(second.items).toHaveLength(5)
    expect(second.hasMore).toBe(false)
    const found = await data.listHistory({ keyword: ' trails ' }, ME)
    expect(found.items.map((s) => s.title)).toEqual(['对话3'])
    const zh = await data.listHistory({ keyword: '润色' }, ME)
    expect(zh.items).toHaveLength(20)
  })
})

describe('compose.explainExpression', () => {
  async function pending() {
    const ctx = setup()
    await ctx.storeLlm()
    const sid = await ctx.addSession({
      versions: [version('v1', ['I need to catch up on sleep.'])],
    })
    const { expression } = await ctx.data.saveExpression(
      {
        text: 'catch up',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    return { ...ctx, expressionId: expression.id }
  }

  it('按原句补全释义，之后不再调用大模型', async () => {
    const { compose, fake, expressionId } = await pending()
    const { expression } = await compose.explainExpression({ expressionId }, ME)
    expect(expression).toMatchObject({ fill: 'ready', ...EXPLAIN })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]!.prompt).toContain('I need to catch up on sleep.')
    await compose.explainExpression({ expressionId }, ME)
    expect(fake.calls).toHaveLength(1)
  })

  it('失败时记为失败、解锁，可以重试', async () => {
    const { compose, fake, repos, expressionId } = await pending()
    fake.fail(new AppError('UPSTREAM_ERROR', '大模型服务暂时不可用'))
    await expect(compose.explainExpression({ expressionId }, ME)).rejects.toThrow('暂时不可用')
    expect(repos.expressionDocs.get(expressionId)).toMatchObject({
      fill: 'failed',
      fillStartedAt: null,
    })
    fake.fail(null)
    const { expression } = await compose.explainExpression({ expressionId }, ME)
    expect(expression.fill).toBe('ready')
  })

  it('已有补全在运行时不重复调用；超时的任务可以接管', async () => {
    const { compose, fake, repos, expressionId, tick } = await pending()
    repos.expressionDocs.get(expressionId)!.fillStartedAt = 1_000_000
    const { expression } = await compose.explainExpression({ expressionId }, ME)
    expect(expression.fill).toBe('pending')
    expect(fake.calls).toHaveLength(0)
    tick(JOB_STALE_MS + 1)
    await expect(compose.explainExpression({ expressionId }, ME)).resolves.toMatchObject({
      expression: { fill: 'ready' },
    })
  })

  it('没配大模型时报未配置', async () => {
    const ctx = setup()
    const sid = await ctx.addSession({ versions: [version('v1', ['Hi.'])] })
    const { expression } = await ctx.data.saveExpression(
      {
        text: 'hi',
        kind: 'word',
        source: { sessionId: sid, vid: 'v1', sentenceIndex: 0, from: 'sentence' },
      },
      ME,
    )
    const err = await errorOf(ctx.compose.explainExpression({ expressionId: expression.id }, ME))
    expect(err.code).toBe('NOT_CONFIGURED')
  })
})
