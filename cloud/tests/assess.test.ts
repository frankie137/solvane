import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { Version } from '@shared/types'
import { createAssessHandlers, type AssessDeps } from '../src/functions/assess/handlers'
import { pcmToWav } from '../src/lib/audio'
import { AppError } from '../src/lib/errors'
import { alignSchema, reportSchema } from '../src/lib/llm/schemas'
import type { SessionDoc } from '../src/lib/repos'
import type { SoeResult } from '../src/lib/tencent/soe'
import { createMemoryRepos } from './support/memory-repos'

const ME = { openid: 'o_me' }
const PCM_FILE = 'cloud://env.x/recite-input/r1.pcm'

const VERSION: Version = {
  vid: 'v1',
  instruction: null,
  en: "I'm going hiking. See you.",
  sentences: [
    { en: "I'm going hiking.", zh: '我要去徒步。' },
    { en: 'See you.', zh: '回头见。' },
  ],
  alternatives: [],
  analysis: null,
  createdAt: 1,
}

const ALIGN = {
  sentences: [
    { index: 0, intended: "I'm going hiking.", wordRange: [0, 2] },
    { index: 1, intended: 'Catch you later.', wordRange: [3, 5] },
  ],
  diffs: [
    {
      kind: 'paraphrase',
      sentenceIndex: 1,
      target: 'See you.',
      said: 'Catch you later.',
      note: '换了说法',
    },
  ],
  content: 90,
  expression: 95,
}

const REPORT = {
  summary: '整体很流畅',
  pronunciationTips: [{ word: 'hiking', issue: '/h/ 偏弱', howTo: '先送气' }],
  recitationTips: ['可以试试原文的 See you.'],
}

function soe(accuracy: number, words: string[]): SoeResult {
  return {
    accuracy,
    fluency: 0.9,
    completeness: 1,
    words: words.map((w, i) => ({
      word: w,
      refWord: w,
      startMs: i * 200,
      endMs: i * 200 + 150,
      accuracy,
      match: 'ok',
      phones: [{ refPhone: 'h', phone: 'h', accuracy }],
    })),
  }
}

function setup(over: Partial<AssessDeps> = {}) {
  const repos = createMemoryRepos()
  let clock = 1_000_000
  const files = new Map<string, Buffer>([[PCM_FILE, Buffer.alloc(32 * 3000)]])
  const removed: string[] = []
  const llmCalls: string[] = []
  const deps: AssessDeps = {
    repos,
    storage: {
      download: vi.fn(async (id: string) => {
        const f = files.get(id)
        if (!f) throw new Error(`no file ${id}`)
        return f
      }),
      upload: vi.fn(async (path: string, data: Buffer) => {
        const id = `cloud://env.x/${path}`
        files.set(id, data)
        return id
      }),
      remove: vi.fn(async (id: string) => {
        removed.push(id)
        files.delete(id)
      }),
      tempUrls: vi.fn(async (ids: string[]) => ids.map((id) => `https://tmp/${id}`)),
    },
    recognize: vi.fn(async () => ({
      text: "I'm going hiking catch you later",
      words: ["I'm", 'going', 'hiking', 'catch', 'you', 'later'].map((word, i) => ({
        word,
        startMs: 100 + i * 400,
        endMs: 400 + i * 400,
      })),
    })),
    evaluate: vi.fn(async (_audio, req) =>
      req.refText.startsWith("I'm")
        ? soe(80, ["I'm", 'going', 'hiking'])
        : soe(60, ['Catch', 'you', 'later']),
    ),
    llm: {
      chatJson: vi.fn(async <S extends z.ZodType>(_t: unknown, _m: unknown, schema: S) => {
        const kind = schema === (alignSchema as z.ZodType) ? 'align' : 'report'
        llmCalls.push(kind)
        return schema.parse(kind === 'align' ? ALIGN : REPORT) as z.infer<S>
      }),
    },
    loadLlmContext: vi.fn(async () => ({
      target: { baseUrl: 'https://x', model: 'm', apiKey: 'k' },
      userSettings: {
        level: 'cet6' as const,
        accent: 'us' as const,
        ttsVoice: 'female' as const,
        ttsSpeed: 'normal' as const,
      },
    })),
    now: () => clock,
    ...over,
  }
  const handlers = createAssessHandlers(deps)
  const tick = (ms: number) => {
    clock += ms
  }
  return { handlers, deps, repos, files, removed, llmCalls, tick }
}

async function addSession(repos: ReturnType<typeof createMemoryRepos>) {
  const doc: Omit<SessionDoc, '_id'> = {
    _openid: ME.openid,
    title: 't',
    input: { mode: 'text', rawText: 'x' },
    polishedZh: '',
    versions: [VERSION],
    currentVid: 'v1',
    job: null,
    lastError: null,
    folderId: null,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  }
  return repos.sessions.create(doc)
}

async function started(over: Partial<AssessDeps> = {}) {
  const ctx = setup(over)
  const sessionId = await addSession(ctx.repos)
  const { practiceId } = await ctx.handlers.start(
    { sessionId, vid: 'v1', fileID: PCM_FILE, durationMs: 3000 },
    ME,
  )
  return { ...ctx, sessionId, practiceId }
}

describe('assess.start', () => {
  it('校验录音路径和版本', async () => {
    const { handlers, repos } = setup()
    const sessionId = await addSession(repos)
    await expect(
      handlers.start(
        { sessionId, vid: 'v1', fileID: 'cloud://env.x/voice-input/a.pcm', durationMs: 1 },
        ME,
      ),
    ).rejects.toThrow()
    await expect(
      handlers.start({ sessionId, vid: 'v9', fileID: PCM_FILE, durationMs: 1 }, ME),
    ).rejects.toThrow('版本')
  })

  it('每个对话只保留最近 3 次，旧的连同录音删除', async () => {
    const { handlers, repos, removed, files, tick } = setup()
    const sessionId = await addSession(repos)
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const fileID = `cloud://env.x/recite-input/r${i}.pcm`
      files.set(fileID, Buffer.alloc(32))
      ids.push(
        (await handlers.start({ sessionId, vid: 'v1', fileID, durationMs: 1 }, ME)).practiceId,
      )
      tick(1000)
    }
    expect([...repos.practiceDocs.keys()].sort()).toEqual(ids.slice(1).sort())
    expect(removed).toEqual(['cloud://env.x/recite-input/r0.pcm'])
  })

  it('清理旧练习时跳过还在评测中的', async () => {
    const { handlers, repos, files, tick } = setup()
    const sessionId = await addSession(repos)
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const fileID = `cloud://env.x/recite-input/r${i}.pcm`
      files.set(fileID, Buffer.alloc(32))
      const { practiceId } = await handlers.start(
        { sessionId, vid: 'v1', fileID, durationMs: 1 },
        ME,
      )
      ids.push(practiceId)
      if (i === 0) {
        const doc = repos.practiceDocs.get(practiceId)!
        repos.practiceDocs.set(practiceId, {
          ...doc,
          job: { stage: 'score', startedAt: 1_000_000 },
        })
      }
      tick(1000)
    }
    expect(repos.practiceDocs.has(ids[0]!)).toBe(true)
  })
})

describe('assess.advance', () => {
  it('一次调用时间够时走完全部步骤', async () => {
    const { handlers, practiceId, removed, llmCalls, deps } = await started()
    const { practice } = await handlers.advance({ practiceId }, ME)

    expect(practice.stage).toBe('done')
    expect(practice.job).toBeNull()
    expect(practice.audioUrl).toBe(`https://tmp/cloud://env.x/recordings/o_me/${practiceId}.wav`)
    // 原始 PCM 转存成 WAV 后删除
    expect(removed).toContain(PCM_FILE)
    expect(llmCalls).toEqual(['align', 'report'])
    expect(deps.recognize).toHaveBeenCalledWith(expect.any(Buffer), {
      engine: '16k_en',
      words: true,
    })

    // 换了说法的句子以还原文本为参考评测，且有自己的时间范围
    expect(deps.evaluate).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ refText: 'Catch you later.', mode: 'sentence' }),
    )
    expect(practice.alignment!.sentences[1]).toMatchObject({
      intended: 'Catch you later.',
      startMs: 1300,
      endMs: 2400,
    })

    // 发音按词数加权：(80×3 + 60×3) / 6 = 70
    expect(practice.report!.scores).toEqual({
      overall: Math.round(70 * 0.4 + 90 * 0.2 + 90 * 0.25 + 95 * 0.15),
      pronunciation: 70,
      fluency: 90,
      content: 90,
      expression: 95,
    })
    expect(practice.report!.summary).toBe('整体很流畅')
    // 单词时间换算到整段录音上：第二句切片从两句之间停顿的中点开始（1200 和 1300 之间）
    const catchWord = practice.pronunciation!.words.find((w) => w.word === 'Catch')!
    expect(catchWord.startMs).toBe(1250)
  })

  it('时间不够时停在中间，下次调用从这一步继续', async () => {
    let clock = 0
    const { handlers, practiceId, repos } = await started({
      now: () => clock,
      recognize: vi.fn(async () => {
        clock += 30_000 // 识别用掉了大半时间
        return {
          text: 'see you',
          words: [
            { word: 'see', startMs: 0, endMs: 100 },
            { word: 'you', startMs: 100, endMs: 200 },
          ],
        }
      }),
    })
    const first = await handlers.advance({ practiceId }, ME)
    expect(first.practice.stage).toBe('align')
    expect(first.practice.job).toBeNull()
    expect(repos.practiceDocs.get(practiceId)!.job).toBeNull()
  })

  it('没识别出内容时报错并记录，录音保留以便重试', async () => {
    const { handlers, practiceId, repos, removed } = await started({
      recognize: vi.fn(async () => ({ text: '', words: [] })),
    })
    await expect(handlers.advance({ practiceId }, ME)).rejects.toThrow('没有听清')
    const doc = repos.practiceDocs.get(practiceId)!
    expect(doc.stage).toBe('transcribe')
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ stage: 'transcribe', code: 'BAD_REQUEST' })
    expect(removed).not.toContain(PCM_FILE)
  })

  it('个别句子评测失败时用其余句子的结果', async () => {
    const { handlers, practiceId } = await started({
      evaluate: vi.fn(async (_a, req) => {
        if (req.refText.startsWith('Catch'))
          throw new AppError('UPSTREAM_ERROR', '口语评测失败（5000）')
        return soe(80, ["I'm", 'going', 'hiking'])
      }),
    })
    const { practice } = await handlers.advance({ practiceId }, ME)
    expect(practice.stage).toBe('done')
    expect(practice.pronunciation!.accuracy).toBe(80)
    // 没能评测的句子单独标出，报告里不会显示成没背出来
    expect(practice.pronunciation!.unscored).toEqual([1])
  })

  it('剩余时间不够评完一句时不再开始，记为没能评测', async () => {
    let clock = 0
    const { handlers, practiceId, deps, repos } = await started({
      now: () => clock,
      evaluate: vi.fn(async () => {
        clock += 45_000 // 第一句用掉了大半时间，第二句开始前已经不够
        return soe(80, ["I'm", 'going', 'hiking'])
      }),
    })
    await handlers.advance({ practiceId }, ME)
    expect(deps.evaluate).toHaveBeenCalledTimes(1)
    const [, req] = (deps.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect((req as { timeoutMs: number }).timeoutMs).toBeLessThan(55_000)
    expect(repos.practiceDocs.get(practiceId)!.pronunciation!.unscored).toEqual([1])
  })

  it('口语评测未配置时直接报错，停在评测这一步', async () => {
    const { handlers, practiceId, repos } = await started({
      evaluate: vi.fn(async () => {
        throw new AppError('NOT_CONFIGURED', '口语评测鉴权失败')
      }),
    })
    await expect(handlers.advance({ practiceId }, ME)).rejects.toThrow('鉴权')
    expect(repos.practiceDocs.get(practiceId)).toMatchObject({
      stage: 'score',
      lastError: { stage: 'score', code: 'NOT_CONFIGURED' },
    })
  })

  it('一句都没背出来时发音分为 0，不调用评测', async () => {
    const { handlers, practiceId, deps } = await started({
      llm: {
        chatJson: vi.fn(
          async <S extends z.ZodType>(_t: unknown, _m: unknown, schema: S) =>
            schema.parse(
              schema === (alignSchema as z.ZodType)
                ? { sentences: [], diffs: [], content: 0, expression: 0 }
                : REPORT,
            ) as z.infer<S>,
        ),
      },
    })
    const { practice } = await handlers.advance({ practiceId }, ME)
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(practice.report!.scores.pronunciation).toBe(0)
  })

  it('已有步骤在运行时不重复执行', async () => {
    const { handlers, practiceId, repos, deps } = await started()
    await repos.practices.acquireJob(
      practiceId,
      ME.openid,
      { stage: 'transcribe', startedAt: 1_000_000 },
      0,
    )
    const { practice } = await handlers.advance({ practiceId }, ME)
    expect(practice.job).toMatchObject({ stage: 'transcribe' })
    expect(deps.recognize).not.toHaveBeenCalled()
  })

  it('不能操作别人的练习', async () => {
    const { handlers, practiceId } = await started()
    await expect(handlers.advance({ practiceId }, { openid: 'o_other' })).rejects.toThrow('不存在')
  })
})

describe('assess.list', () => {
  it('列出最近的练习和分数', async () => {
    const { handlers, practiceId, sessionId } = await started()
    await handlers.advance({ practiceId }, ME)
    const { items } = await handlers.list({ sessionId }, ME)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: practiceId, stage: 'done', failed: false })
    expect(items[0]!.overall).toBeGreaterThan(0)
  })
})

describe('WAV 回放与评测切片', () => {
  it('评测时从 WAV 里取 PCM 切片', async () => {
    const { handlers, practiceId, files, deps } = await started()
    await handlers.advance({ practiceId }, ME)
    const wav = files.get(`cloud://env.x/recordings/o_me/${practiceId}.wav`)!
    expect(wav.equals(pcmToWav(Buffer.alloc(32 * 3000)))).toBe(true)
    const firstSlice = (deps.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Buffer
    // 第一句 100～1200ms：开头延伸到录音起点，结尾到和下一句之间停顿的中点
    expect(firstSlice.length).toBe((1250 - 0) * 32)
  })
})

void reportSchema
