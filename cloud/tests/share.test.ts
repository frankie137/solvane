import { describe, expect, it } from 'vitest'
import type { ScoredWord } from '@shared/types'
import { createDataHandlers } from '../src/functions/data/handlers'
import type { PracticeDoc } from '../src/lib/repos'
import { buildShareSentences, mapWordTimings, wordsFromTranscript } from '../src/lib/share'
import { createMemoryRepos } from './support/memory-repos'
import { createMemoryStorage } from './support/memory-storage'

const word = (w: string, startMs: number, patch: Partial<ScoredWord> = {}): ScoredWord => ({
  word: w,
  sentenceIndex: 0,
  startMs,
  endMs: startMs + 200,
  accuracy: 90,
  match: 'ok',
  phones: [],
  ...patch,
})

describe('mapWordTimings', () => {
  it('maps words onto the original sentence in order, taking character positions from the original', () => {
    const sentence = "I'm at work, right now."
    const timed = mapWordTimings(sentence, [
      word("i'm", 100),
      word('at', 300),
      word('work', 500),
      word('right', 700),
      word('now', 900),
    ])
    expect(timed.map((t) => [t.text, t.beginMs, t.beginIndex])).toEqual([
      ["I'm", 100, 0],
      ['at', 300, 4],
      ['work', 500, 7],
      ['right', 700, 13],
      ['now', 900, 19],
    ])
  })

  it('skips missing, extra and paraphrased words without affecting later ones', () => {
    const timed = mapWordTimings('Catch you later today.', [
      word('catch', 100),
      word('ya', 300, { match: 'wrong' }),
      word('um', 400, { match: 'extra' }),
      word('you', 0, { match: 'missing', endMs: 0 }),
      word('later', 500),
      word('today', 700),
    ])
    expect(timed.map((t) => t.text)).toEqual(['Catch', 'later', 'today'])
  })

  it('sorts out-of-order timings first', () => {
    const timed = mapWordTimings('see you', [word('you', 500), word('see', 100)])
    expect(timed.map((t) => t.text)).toEqual(['see', 'you'])
  })
})

describe('buildShareSentences', () => {
  it('sentences not recited get no timings', () => {
    const out = buildShareSentences(
      [
        { en: 'Hi there.', zh: '你好。' },
        { en: 'See you.', zh: '再见。' },
      ],
      [
        { index: 0, intended: 'Hi there.', startMs: 100, endMs: 900 },
        { index: 1, intended: '', startMs: 0, endMs: 0 },
      ],
      [word('hi', 100), word('there', 400), word('see', 1200, { sentenceIndex: 1 })],
    )
    expect(out[0]).toMatchObject({ startMs: 100, endMs: 900 })
    expect(out[0]!.words.map((w) => w.text)).toEqual(['Hi', 'there'])
    expect(out[1]).toEqual({ en: 'See you.', zh: '再见。', startMs: -1, endMs: -1, words: [] })
  })
})

describe('wordsFromTranscript', () => {
  it('splits recognized words by sentence time range and drops noise between sentences', () => {
    const spoken = [
      { word: 'Hi', startMs: 100, endMs: 300 },
      { word: 'there', startMs: 400, endMs: 900 },
      { word: 'um', startMs: 1000, endMs: 1100 },
      { word: 'see', startMs: 1200, endMs: 1400 },
      { word: 'you', startMs: 1500, endMs: 1800 },
    ]
    const words = wordsFromTranscript(spoken, [
      { index: 0, intended: 'Hi there.', startMs: 100, endMs: 900 },
      { index: 1, intended: 'See you.', startMs: 1200, endMs: 1800 },
      { index: 2, intended: '', startMs: 0, endMs: 0 },
    ])
    expect(words.map((w) => [w.word, w.sentenceIndex])).toEqual([
      ['Hi', 0],
      ['there', 0],
      ['see', 1],
      ['you', 1],
    ])
    const out = buildShareSentences(
      [
        { en: 'Hi there.', zh: '你好。' },
        { en: 'See you.', zh: '再见。' },
      ],
      [
        { index: 0, intended: 'Hi there.', startMs: 100, endMs: 900 },
        { index: 1, intended: 'See you.', startMs: 1200, endMs: 1800 },
      ],
      words,
    )
    expect(out[1]!.words.map((w) => [w.text, w.beginMs])).toEqual([
      ['See', 1200],
      ['you', 1500],
    ])
  })
})

// ---------------------------------------------------------------------------
// handlers

const ME = { openid: 'o_me' }
const FRIEND = { openid: 'o_friend' }
const WAV = 'cloud://env.x/recordings/o_me/p.wav'
const AVATAR = 'cloud://env.x/avatars/a1.jpg'

function setup() {
  const repos = createMemoryRepos()
  const storage = createMemoryStorage()
  let n = 0
  const data = createDataHandlers({
    repos,
    storage,
    now: () => 9_000,
    newFileName: () => `copy${++n}`,
    adminOpenids: () => [],
  })
  return { repos, storage, data }
}

async function donePractice(ctx: ReturnType<typeof setup>, patch: Partial<PracticeDoc> = {}) {
  const sessionId = await ctx.repos.sessions.create({
    _openid: ME.openid,
    title: '周末',
    input: { mode: 'text', rawText: '原文' },
    polishedZh: '',
    versions: [
      {
        vid: 'v1',
        instruction: null,
        en: 'Hi there.',
        sentences: [{ en: 'Hi there.', zh: '你好。' }],
        alternatives: [],
        analysis: null,
        createdAt: 1,
      },
    ],
    currentVid: 'v1',
    job: null,
    lastError: null,
    folderId: null,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  })
  ctx.storage.files.set(WAV, Buffer.from('wav-bytes'))
  const practiceId = await ctx.repos.practices.create({
    _openid: ME.openid,
    sessionId,
    vid: 'v1',
    stage: 'done',
    job: null,
    lastError: null,
    pcmFileID: null,
    wavFileID: WAV,
    durationMs: 1200,
    transcript: { text: 'hi there', words: [] },
    alignment: {
      sentences: [{ index: 0, intended: 'Hi there.', startMs: 100, endMs: 900 }],
      diffs: [],
      content: 100,
      expression: 100,
    },
    pronunciation: {
      accuracy: 90,
      fluency: 0.9,
      completeness: 1,
      words: [word('hi', 100), word('there', 400)],
      unscored: [],
    },
    report: null,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  })
  return { sessionId, practiceId }
}

describe('profile', () => {
  it('nickname is required and length-limited; avatars must be under avatars/', async () => {
    const { data } = setup()
    await expect(data.getProfile({}, ME)).resolves.toEqual({ profile: null })
    await expect(data.updateProfile({ nickname: '  ' }, ME)).rejects.toThrow('昵称不能为空')
    await expect(data.updateProfile({ nickname: '一'.repeat(21) }, ME)).rejects.toThrow('最多 20')
    await expect(
      data.updateProfile({ nickname: '小明', avatarFileID: 'cloud://env.x/recordings/x.wav' }, ME),
    ).rejects.toThrow('头像文件不正确')
    const { profile } = await data.updateProfile({ nickname: ' 小明 ', avatarFileID: AVATAR }, ME)
    expect(profile).toEqual({ nickname: '小明', avatarUrl: `https://tmp/${AVATAR}` })
    // Changing only the nickname keeps the avatar
    const next = await data.updateProfile({ nickname: '明明' }, ME)
    expect(next.profile.avatarUrl).toBe(`https://tmp/${AVATAR}`)
  })
})

describe('sharing', () => {
  it('cannot share without an author profile', async () => {
    const ctx = setup()
    const { practiceId } = await donePractice(ctx)
    await expect(ctx.data.createShare({ practiceId }, ME)).rejects.toThrow('头像和昵称')
  })

  it('copies the recording into a snapshot, one per practice; friends can read it but see no other fields', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明', avatarFileID: AVATAR }, ME)
    const { practiceId } = await donePractice(ctx)
    const first = await ctx.data.createShare({ practiceId }, ME)
    expect(first.created).toBe(true)
    expect(ctx.storage.files.get('cloud://env.x/shares/copy1.wav')?.toString()).toBe('wav-bytes')
    const again = await ctx.data.createShare({ practiceId }, ME)
    expect(again).toEqual({ shareId: first.shareId, created: false })
    expect(ctx.repos.shareDocs.size).toBe(1)

    const { share } = await ctx.data.getShare({ shareId: first.shareId }, FRIEND)
    expect(share).toMatchObject({
      title: '周末',
      audioUrl: 'https://tmp/cloud://env.x/shares/copy1.wav',
      durationMs: 1200,
      author: { nickname: '小明', avatarUrl: `https://tmp/${AVATAR}` },
      mine: false,
    })
    expect(share.sentences[0]!.words.map((w) => w.text)).toEqual(['Hi', 'there'])
    expect(Object.keys(share).sort()).toEqual(
      ['audioUrl', 'author', 'createdAt', 'durationMs', 'id', 'mine', 'sentences', 'title'].sort(),
    )
    const mine = await ctx.data.getShare({ shareId: first.shareId }, ME)
    expect(mine.share.mine).toBe(true)
  })

  it('two concurrent shares leave a single share and delete the extra recording copy', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    const { practiceId } = await donePractice(ctx)
    const [a, b] = await Promise.all([
      ctx.data.createShare({ practiceId }, ME),
      ctx.data.createShare({ practiceId }, ME),
    ])
    expect(a.shareId).toBe(b.shareId)
    expect([a.created, b.created].sort()).toEqual([false, true])
    expect(ctx.repos.shareDocs.size).toBe(1)
    expect(ctx.storage.removed).toHaveLength(1)
  })

  it('does not report revoked when the recording is temporarily unavailable', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    const { practiceId } = await donePractice(ctx)
    const { shareId } = await ctx.data.createShare({ practiceId }, ME)
    ctx.storage.files.delete('cloud://env.x/shares/copy1.wav')
    await expect(ctx.data.getShare({ shareId }, FRIEND)).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    })
  })

  it('a share stays playable after the practice is cleaned up', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    const { practiceId } = await donePractice(ctx)
    const { shareId } = await ctx.data.createShare({ practiceId }, ME)
    ctx.storage.files.delete(WAV)
    await ctx.repos.practices.remove(practiceId, ME.openid)
    await expect(ctx.data.getShare({ shareId }, FRIEND)).resolves.toBeTruthy()
  })

  it('unscored recordings use per-word timings from recognition', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    const { practiceId } = await donePractice(ctx, {
      stage: 'score',
      scoreRequested: false,
      timingRequested: true,
      transcript: {
        text: 'hi there',
        words: [
          { word: 'hi', startMs: 100, endMs: 300 },
          { word: 'there', startMs: 400, endMs: 900 },
        ],
      },
      pronunciation: null,
    })
    const { shareId } = await ctx.data.createShare({ practiceId }, ME)
    const { share } = await ctx.data.getShare({ shareId }, FRIEND)
    expect(share.sentences[0]!.words.map((w) => [w.text, w.beginMs])).toEqual([
      ['Hi', 100],
      ['there', 400],
    ])
  })

  it("cannot share before lyric timings are ready, nor someone else's practice", async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    await ctx.data.updateProfile({ nickname: '好友' }, FRIEND)
    const { practiceId } = await donePractice(ctx, {
      stage: 'transcribe',
      scoreRequested: false,
      transcript: null,
      alignment: null,
      pronunciation: null,
    })
    await expect(ctx.data.createShare({ practiceId }, ME)).rejects.toThrow('歌词还没准备好')
    await expect(ctx.data.createShare({ practiceId }, FRIEND)).rejects.toThrow('不存在')
  })

  it('my shares are newest first; revoking invalidates the link and deletes the copy; others cannot revoke', async () => {
    const ctx = setup()
    await ctx.data.updateProfile({ nickname: '小明' }, ME)
    const { practiceId } = await donePractice(ctx)
    const { shareId } = await ctx.data.createShare({ practiceId }, ME)
    await expect(ctx.data.listShares({}, ME)).resolves.toEqual({
      items: [
        { id: shareId, title: '周末', preview: 'Hi there.', durationMs: 1200, createdAt: 9_000 },
      ],
    })
    await expect(ctx.data.revokeShare({ shareId }, FRIEND)).rejects.toThrow('不存在')
    await ctx.data.revokeShare({ shareId }, ME)
    expect(ctx.storage.removed).toEqual(['cloud://env.x/shares/copy1.wav'])
    await expect(ctx.data.getShare({ shareId }, FRIEND)).rejects.toThrow('已撤回')
  })
})
