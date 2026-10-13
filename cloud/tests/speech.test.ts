import { describe, expect, it, vi } from 'vitest'
import type { Version } from '@shared/types'
import { createSpeechHandlers, type SpeechDeps } from '../src/functions/speech/handlers'
import type { SessionDoc } from '../src/lib/repos'
import { toTencentError } from '../src/lib/tencent/errors'
import { createMemoryRepos } from './support/memory-repos'

const ME = { openid: 'o_me' }
const FILE = 'cloud://env-1.xxx/voice-input/a.pcm'

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

function setup(opts: { audio?: Buffer; recognized?: string | Error } = {}) {
  const repos = createMemoryRepos()
  const removed: string[] = []
  const uploaded: string[] = []
  const deps: SpeechDeps = {
    repos,
    storage: {
      download: vi.fn(async () => opts.audio ?? Buffer.alloc(1000)),
      upload: vi.fn(async (path: string) => {
        uploaded.push(path)
        return `cloud://env/${path}`
      }),
      remove: vi.fn(async (id: string) => {
        removed.push(id)
      }),
      tempUrls: vi.fn(async (ids: string[]) => ids.map((id) => `https://tmp/${id}`)),
    },
    recognize: vi.fn(async () => {
      if (opts.recognized instanceof Error) throw opts.recognized
      return { text: opts.recognized ?? '', words: [] }
    }),
    synthesize: vi.fn(async ({ text }) => ({
      audio: Buffer.from(`mp3:${text}`),
      words: [{ text: 'Hi', beginMs: 0, endMs: 200, beginIndex: 0, endIndex: 1 }],
    })),
  }
  return { handlers: createSpeechHandlers(deps), deps, repos, removed, uploaded }
}

async function addSession(repos: ReturnType<typeof createMemoryRepos>, versions: Version[]) {
  const doc: Omit<SessionDoc, '_id'> = {
    _openid: ME.openid,
    title: 't',
    input: { mode: 'text', rawText: 'x' },
    polishedZh: '',
    versions,
    currentVid: versions[0]?.vid ?? null,
    job: null,
    lastError: null,
    folderId: null,
    tags: [],
    createdAt: 1,
    updatedAt: 7,
  }
  return repos.sessions.create(doc)
}

describe('speech.recognize', () => {
  it('returns the recognized text and deletes the recording', async () => {
    const { handlers, removed, deps } = setup({ recognized: '  周末想去爬山  ' })
    await expect(handlers.recognize({ fileID: FILE }, ME)).resolves.toEqual({
      text: '周末想去爬山',
    })
    expect(removed).toEqual([FILE])
    expect(deps.recognize).toHaveBeenCalledWith(expect.any(Buffer), { engine: '16k_zh' })
  })

  it('asks the user to try again when nothing is recognized, and still deletes the recording', async () => {
    const { handlers, removed } = setup({ recognized: '' })
    await expect(handlers.recognize({ fileID: FILE }, ME)).rejects.toThrow('没有听清')
    expect(removed).toEqual([FILE])
  })

  it('rejects an oversized recording without calling recognition', async () => {
    const { handlers, deps, removed } = setup({ audio: Buffer.alloc(2_200_000), recognized: 'x' })
    await expect(handlers.recognize({ fileID: FILE }, ME)).rejects.toThrow('60 秒')
    expect(deps.recognize).not.toHaveBeenCalled()
    expect(removed).toEqual([FILE])
  })

  it.each([
    ['a non-cloud-storage URL', 'https://evil.example/voice-input/a.pcm'],
    ['a file in another directory', 'cloud://env-1.xxx/recordings/o_other/a.mp3'],
    ['path traversal', 'cloud://env-1.xxx/voice-input/../shares/a.pcm'],
    ['a non-PCM file', 'cloud://env-1.xxx/voice-input/a.mp3'],
  ])('rejects %s without reading or deleting it', async (_name, fileID) => {
    const { handlers, deps, removed } = setup({ recognized: 'x' })
    await expect(handlers.recognize({ fileID }, ME)).rejects.toThrow()
    expect(deps.storage.download).not.toHaveBeenCalled()
    expect(removed).toEqual([])
  })
})

describe('speech.tts', () => {
  it('synthesizes per sentence, uploads and caches; the second call uses the cache', async () => {
    const { handlers, repos, deps, uploaded } = setup()
    const sessionId = await addSession(repos, [version('v1', ['Hi there.', 'How are you?'])])

    const first = await handlers.tts({ sessionId, vid: 'v1' }, ME)
    expect(first.sentences.map((s) => s.index)).toEqual([0, 1])
    expect(first.sentences[0]!.url).toMatch(/^https:\/\/tmp\//)
    expect(first.sentences[0]!.words[0]).toMatchObject({ text: 'Hi', endMs: 200 })
    expect(uploaded).toEqual([
      `tts/o_me/${sessionId}/v1/female-normal/0.mp3`,
      `tts/o_me/${sessionId}/v1/female-normal/1.mp3`,
    ])
    expect(deps.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi there.', voiceType: 501009, speed: 0 }),
    )
    // Caching doesn't change the session's updatedAt
    expect(repos.sessionDocs.get(sessionId)!.updatedAt).toBe(7)

    await handlers.tts({ sessionId, vid: 'v1' }, ME)
    expect(deps.synthesize).toHaveBeenCalledTimes(2)
  })

  it('resynthesizes when voice or speed changes, keeping the existing cache', async () => {
    const { handlers, repos, deps } = setup()
    const sessionId = await addSession(repos, [version('v1', ['Hi.'])])
    await handlers.tts({ sessionId, vid: 'v1' }, ME)
    await repos.settings.upsert(ME.openid, { ttsVoice: 'male', ttsSpeed: 'slow', updatedAt: 1 })
    await handlers.tts({ sessionId, vid: 'v1' }, ME)
    expect(deps.synthesize).toHaveBeenLastCalledWith(
      expect.objectContaining({ voiceType: 501008, speed: -1 }),
    )
    const cache = repos.sessionDocs.get(sessionId)!.tts!.v1!
    expect(Object.keys(cache).sort()).toEqual(['female-normal', 'male-slow'])
  })

  it("rejects a missing version or someone else's session", async () => {
    const { handlers, repos } = setup()
    const sessionId = await addSession(repos, [version('v1', ['Hi.'])])
    await expect(handlers.tts({ sessionId, vid: 'v9' }, ME)).rejects.toThrow('找不到')
    await expect(handlers.tts({ sessionId, vid: 'v1' }, { openid: 'o_other' })).rejects.toThrow(
      '不存在',
    )
  })
})

describe('speech.ttsWord', () => {
  it('returns base64 audio at normal speed', async () => {
    const { handlers, deps } = setup()
    const { audio } = await handlers.ttsWord({ word: "don't" }, ME)
    expect(Buffer.from(audio, 'base64').toString()).toBe("mp3:don't")
    expect(deps.synthesize).toHaveBeenCalledWith(expect.objectContaining({ speed: 0 }))
  })

  it('also reads saved phrases, collapsing extra whitespace', async () => {
    const { handlers } = setup()
    const { audio } = await handlers.ttsWord({ word: '  catch   up ' }, ME)
    expect(Buffer.from(audio, 'base64').toString()).toBe('mp3:catch up')
  })

  it.each(['', '123', 'a'.repeat(61), '<script>', 'hi!'])('rejects %j', async (word) => {
    const { handlers } = setup()
    await expect(handlers.ttsWord({ word }, ME)).rejects.toThrow()
  })
})

describe('toTencentError', () => {
  it.each([
    ['AuthFailure.SecretIdNotFound', 'NOT_CONFIGURED', 'speech 云函数的 TENCENT_SECRET_ID'],
    ['UnauthorizedOperation.CamNoAuth', 'NOT_CONFIGURED', '语音识别权限'],
    ['FailedOperation.ServiceIsolate', 'NOT_CONFIGURED', '欠费'],
    ['UnsupportedOperation.AppIdNotRegistered', 'NOT_CONFIGURED', '未开通'],
    ['FailedOperation.ErrorRecognize', 'UPSTREAM_ERROR', '识别失败'],
  ])('%s → %s', (code, expected, text) => {
    const err = toTencentError({ code, message: 'x' }, '语音识别', 'speech')
    expect(err.code).toBe(expected)
    expect(err.message).toContain(text)
  })
})
