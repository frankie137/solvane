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
const ADMIN = { openid: 'o_admin' }
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
    adminOpenids: () => [ADMIN.openid],
    now: () => clock,
    ...over,
  }
  const handlers = createAssessHandlers(deps)
  const tick = (ms: number) => {
    clock += ms
  }
  return { handlers, deps, repos, files, removed, llmCalls, tick }
}

async function addSession(repos: ReturnType<typeof createMemoryRepos>, openid = ME.openid) {
  const doc: Omit<SessionDoc, '_id'> = {
    _openid: openid,
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
  it('validates the recording path and version', async () => {
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

  it('converts to WAV right away for playback, without recognizing or scoring', async () => {
    const { handlers, practiceId, removed, files, deps, repos } = await started()
    const { practice } = await handlers.get({ practiceId }, ME)
    expect(practice).toMatchObject({ stage: 'transcribe', scoreRequested: false, job: null })
    expect(practice.durationMs).toBe(3000)
    expect(practice.audioUrl).toBe(`https://tmp/cloud://env.x/recordings/o_me/${practiceId}.wav`)
    const wav = files.get(`cloud://env.x/recordings/o_me/${practiceId}.wav`)!
    expect(wav.equals(pcmToWav(Buffer.alloc(32 * 3000)))).toBe(true)
    expect(removed).toEqual([PCM_FILE])
    expect(repos.practiceDocs.get(practiceId)!.pcmFileID).toBeNull()

    // Advancing does nothing when scoring hasn't been requested
    await handlers.advance({ practiceId }, ME)
    expect(deps.recognize).not.toHaveBeenCalled()
    expect(repos.accountDocs.size).toBe(0)
  })

  it('removes the record when conversion fails, keeping the raw recording for resubmission', async () => {
    const { handlers, repos, deps } = setup()
    const sessionId = await addSession(repos)
    vi.mocked(deps.storage.upload).mockRejectedValueOnce(new Error('upload failed'))
    await expect(
      handlers.start({ sessionId, vid: 'v1', fileID: PCM_FILE, durationMs: 3000 }, ME),
    ).rejects.toThrow('upload failed')
    expect(repos.practiceDocs.size).toBe(0)
    const { practiceId } = await handlers.start(
      { sessionId, vid: 'v1', fileID: PCM_FILE, durationMs: 3000 },
      ME,
    )
    expect(repos.practiceDocs.get(practiceId)!.wavFileID).toBeTruthy()
  })

  it('returns the existing record when the same file is resubmitted', async () => {
    const { handlers, practiceId, sessionId, repos } = await started()
    const again = await handlers.start(
      { sessionId, vid: 'v1', fileID: PCM_FILE, durationMs: 3000 },
      ME,
    )
    expect(again.practiceId).toBe(practiceId)
    expect(repos.practiceDocs.size).toBe(1)
  })

  it('keeps only the latest 3 per session, deleting older ones with their recordings', async () => {
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
    expect(removed).toContain(`cloud://env.x/recordings/o_me/${ids[0]}.wav`)
  })

  it('skips practices still being assessed when cleaning up old ones', async () => {
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

describe('assess.score', () => {
  it('runs every step in one call when time allows', async () => {
    const { handlers, practiceId, llmCalls, deps } = await started()
    const { practice } = await handlers.score({ practiceId }, ME)

    expect(practice.stage).toBe('done')
    expect(practice.scoreRequested).toBe(true)
    expect(practice.job).toBeNull()
    expect(llmCalls).toEqual(['align', 'report'])
    expect(deps.recognize).toHaveBeenCalledWith(expect.any(Buffer), {
      engine: '16k_en',
      words: true,
    })

    // A paraphrased sentence is assessed against the intended text and has its own time range
    expect(deps.evaluate).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ refText: 'Catch you later.', mode: 'sentence' }),
    )
    expect(practice.alignment!.sentences[1]).toMatchObject({
      intended: 'Catch you later.',
      startMs: 1300,
      endMs: 2400,
    })

    // Pronunciation is weighted by word count: (80×3 + 60×3) / 6 = 70
    expect(practice.report!.scores).toEqual({
      overall: Math.round(70 * 0.4 + 90 * 0.2 + 90 * 0.25 + 95 * 0.15),
      pronunciation: 70,
      fluency: 90,
      content: 90,
      expression: 95,
    })
    expect(practice.report!.summary).toBe('整体很流畅')
    // Word times are mapped onto the whole recording: the second slice starts at the midpoint of
    // the pause between the sentences (between 1200 and 1300)
    const catchWord = practice.pronunciation!.words.find((w) => w.word === 'Catch')!
    expect(catchWord.startMs).toBe(1250)
  })

  it('stops midway when out of time; the next call resumes from that step', async () => {
    let clock = 0
    const { handlers, practiceId, repos } = await started({
      now: () => clock,
      recognize: vi.fn(async () => {
        clock += 30_000 // Recognition uses up most of the time
        return {
          text: 'see you',
          words: [
            { word: 'see', startMs: 0, endMs: 100 },
            { word: 'you', startMs: 100, endMs: 200 },
          ],
        }
      }),
    })
    const first = await handlers.score({ practiceId }, ME)
    expect(first.practice.stage).toBe('align')
    expect(first.practice.job).toBeNull()
    expect(repos.practiceDocs.get(practiceId)!.job).toBeNull()
  })

  it('fails and records the error when nothing is recognized, keeping the recording and refunding the use', async () => {
    const { handlers, practiceId, repos, removed } = await started({
      recognize: vi.fn(async () => ({ text: '', words: [] })),
    })
    await expect(handlers.score({ practiceId }, ME)).rejects.toThrow('没有听清')
    const doc = repos.practiceDocs.get(practiceId)!
    expect(doc.stage).toBe('transcribe')
    expect(doc.job).toBeNull()
    expect(doc.lastError).toMatchObject({ stage: 'transcribe', code: 'BAD_REQUEST' })
    expect(doc).toMatchObject({ scoreRequested: false, freeCharged: false })
    expect(removed).not.toContain(doc.wavFileID)
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(0)
  })

  it('uses the remaining sentences when some fail assessment', async () => {
    const { handlers, practiceId } = await started({
      evaluate: vi.fn(async (_a, req) => {
        if (req.refText.startsWith('Catch'))
          throw new AppError('UPSTREAM_ERROR', '口语评测失败（5000）')
        return soe(80, ["I'm", 'going', 'hiking'])
      }),
    })
    const { practice } = await handlers.score({ practiceId }, ME)
    expect(practice.stage).toBe('done')
    expect(practice.pronunciation!.accuracy).toBe(80)
    // Sentences not assessed are marked separately, so the report won't show them as not recited
    expect(practice.pronunciation!.unscored).toEqual([1])
  })

  it('does not start a sentence without time to finish it, and marks it as not assessed', async () => {
    let clock = 0
    const { handlers, practiceId, deps, repos } = await started({
      now: () => clock,
      evaluate: vi.fn(async () => {
        clock += 45_000 // Sentence 1 uses most of the time; not enough is left for sentence 2
        return soe(80, ["I'm", 'going', 'hiking'])
      }),
    })
    await handlers.score({ practiceId }, ME)
    expect(deps.evaluate).toHaveBeenCalledTimes(1)
    const [, req] = (deps.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect((req as { timeoutMs: number }).timeoutMs).toBeLessThan(55_000)
    expect(repos.practiceDocs.get(practiceId)!.pronunciation!.unscored).toEqual([1])
  })

  it('fails right away when pronunciation assessment is not configured, stopping at the score step', async () => {
    const { handlers, practiceId, repos } = await started({
      evaluate: vi.fn(async () => {
        throw new AppError('NOT_CONFIGURED', '口语评测鉴权失败')
      }),
    })
    await expect(handlers.score({ practiceId }, ME)).rejects.toThrow('鉴权')
    expect(repos.practiceDocs.get(practiceId)).toMatchObject({
      stage: 'score',
      scoreRequested: false,
      lastError: { stage: 'score', code: 'NOT_CONFIGURED' },
    })
  })

  it('scores pronunciation 0 without calling assessment when no sentence was recited', async () => {
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
    const { practice } = await handlers.score({ practiceId }, ME)
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(practice.report!.scores.pronunciation).toBe(0)
  })

  it('does not rerun a step that is already running', async () => {
    const { handlers, practiceId, repos, deps } = await started()
    await repos.practices.acquireJob(
      practiceId,
      ME.openid,
      { stage: 'transcribe', startedAt: 1_000_000 },
      0,
    )
    const { practice } = await handlers.score({ practiceId }, ME)
    expect(practice.job).toMatchObject({ stage: 'transcribe' })
    expect(deps.recognize).not.toHaveBeenCalled()
  })

  it("cannot act on someone else's practice", async () => {
    const { handlers, practiceId } = await started()
    await expect(handlers.score({ practiceId }, { openid: 'o_other' })).rejects.toThrow('不存在')
    await expect(handlers.advance({ practiceId }, { openid: 'o_other' })).rejects.toThrow('不存在')
  })
})

describe('scoring uses free uses', () => {
  const used = (repos: ReturnType<typeof createMemoryRepos>, openid = ME.openid) =>
    repos.accountDocs.get(openid)?.freeUsed ?? 0

  it('scoring uses one; requesting again for the same recording does not charge again', async () => {
    const { handlers, practiceId, repos } = await started()
    await handlers.score({ practiceId }, ME)
    await handlers.score({ practiceId }, ME)
    expect(used(repos)).toBe(1)
    expect(repos.practiceDocs.get(practiceId)!.freeCharged).toBe(true)
  })

  it('does not score once free uses run out', async () => {
    const { handlers, practiceId, repos, deps } = await started()
    await repos.accounts.create({
      _id: ME.openid,
      freeUsed: 5,
      proUntil: null,
      grants: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(handlers.score({ practiceId }, ME)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
    expect(deps.recognize).not.toHaveBeenCalled()
    expect(repos.practiceDocs.get(practiceId)!.scoreRequested).toBe(false)
  })

  it('does not charge Pro users or admins', async () => {
    const { handlers, practiceId, repos } = await started()
    await repos.accounts.create({
      _id: ME.openid,
      freeUsed: 5,
      proUntil: 2_000_000,
      grants: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const { practice } = await handlers.score({ practiceId }, ME)
    expect(practice.stage).toBe('done')
    expect(used(repos)).toBe(5)
    expect(repos.practiceDocs.get(practiceId)!.freeCharged).toBe(false)

    const admin = setup()
    const sessionId = await addSession(admin.repos, ADMIN.openid)
    const recorded = await admin.handlers.start(
      { sessionId, vid: 'v1', fileID: PCM_FILE, durationMs: 3000 },
      ADMIN,
    )
    await admin.handlers.score(recorded, ADMIN)
    expect(used(admin.repos, ADMIN.openid)).toBe(0)
  })

  it('scoring again after a refunded failure charges only once in total', async () => {
    let fail = true
    const { handlers, practiceId, repos } = await started({
      evaluate: vi.fn(async () => {
        if (fail) throw new AppError('UPSTREAM_ERROR', '口语评测失败')
        return soe(80, ["I'm", 'going', 'hiking'])
      }),
    })
    await expect(handlers.score({ practiceId }, ME)).rejects.toThrow('口语评测失败')
    expect(used(repos)).toBe(0)
    fail = false
    const { practice } = await handlers.score({ practiceId }, ME)
    expect(practice.stage).toBe('done')
    expect(used(repos)).toBe(1)
  })
})

describe('assess.prepareShare', () => {
  it('only transcribes and aligns without charging; scoring later continues from the score step', async () => {
    const { handlers, practiceId, repos, deps, llmCalls } = await started()
    const { practice } = await handlers.prepareShare({ practiceId }, ME)
    expect(practice.stage).toBe('score')
    expect(practice.job).toBeNull()
    expect(practice.scoreRequested).toBe(false)
    expect(practice.alignment!.sentences).toHaveLength(2)
    expect(deps.evaluate).not.toHaveBeenCalled()
    expect(llmCalls).toEqual(['align'])
    expect(repos.accountDocs.size).toBe(0)

    // Advancing again does not go on to assessment
    await handlers.advance({ practiceId }, ME)
    expect(deps.evaluate).not.toHaveBeenCalled()

    const scored = await handlers.score({ practiceId }, ME)
    expect(scored.practice.stage).toBe('done')
    expect(deps.recognize).toHaveBeenCalledTimes(1)
    expect(llmCalls).toEqual(['align', 'report'])
  })

  it('a failed preparation does not affect the scoring flag', async () => {
    const { handlers, practiceId, repos } = await started({
      recognize: vi.fn(async () => ({ text: '', words: [] })),
    })
    await expect(handlers.prepareShare({ practiceId }, ME)).rejects.toThrow('没有听清')
    expect(repos.practiceDocs.get(practiceId)).toMatchObject({
      scoreRequested: false,
      lastError: { code: 'BAD_REQUEST' },
    })
  })
})

describe('pre-M6 practices', () => {
  it('treats unflagged practices as scoring requested without charging; converts raw PCM to WAV on recognition', async () => {
    const { handlers, repos, removed } = setup()
    const sessionId = await addSession(repos)
    const practiceId = await repos.practices.create({
      _openid: ME.openid,
      sessionId,
      vid: 'v1',
      stage: 'transcribe',
      job: null,
      lastError: null,
      pcmFileID: PCM_FILE,
      wavFileID: null,
      durationMs: 3000,
      transcript: null,
      alignment: null,
      pronunciation: null,
      report: null,
      createdAt: 1,
      updatedAt: 1,
    })
    const { practice } = await handlers.advance({ practiceId }, ME)
    expect(practice).toMatchObject({ stage: 'done', scoreRequested: true })
    expect(practice.audioUrl).toBe(`https://tmp/cloud://env.x/recordings/o_me/${practiceId}.wav`)
    expect(removed).toContain(PCM_FILE)
    expect(repos.accountDocs.size).toBe(0)
  })
})

describe('assess.list', () => {
  it('lists recent practices with scores', async () => {
    const { handlers, practiceId, sessionId } = await started()
    expect((await handlers.list({ sessionId }, ME)).items[0]).toMatchObject({
      scoreRequested: false,
      overall: null,
    })
    await handlers.score({ practiceId }, ME)
    const { items } = await handlers.list({ sessionId }, ME)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: practiceId,
      stage: 'done',
      scoreRequested: true,
      failed: false,
    })
    expect(items[0]!.overall).toBeGreaterThan(0)
  })
})

describe('WAV playback and assessment slices', () => {
  it('takes PCM slices from the WAV for assessment', async () => {
    const { handlers, practiceId, deps } = await started()
    await handlers.score({ practiceId }, ME)
    const firstSlice = (deps.evaluate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Buffer
    // First sentence is 100-1200 ms: the start extends to the beginning of the recording, the end
    // to the midpoint of the pause before the next sentence
    expect(firstSlice.length).toBe((1250 - 0) * 32)
  })
})

void reportSchema
