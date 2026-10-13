import type { Practice, PracticeSummary } from '@shared/types'
import { JOB_STALE_MS } from '@shared/constants'
import type { RecordingResult } from '@/composables/useRecorder'
import { pollUntil } from '@/utils/poll'
import { callCloud, CloudError, uploadFile } from './cloud'
import { mayStillRun } from './cloud-error'

/** Upload a recitation recording and return its fileID */
export async function uploadRecitation(recording: RecordingResult): Promise<string> {
  const cloudPath = `recite-input/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pcm`
  return uploadFile(recording.tempFilePath, cloudPath)
}

/**
 * Create a practice record from an uploaded recording. On timeout or network loss the record may already exist: keep the file
 * and resubmit with the same fileID; the cloud recognizes it and returns the record without creating a duplicate.
 */
export async function startPractice(
  sessionId: string,
  vid: string,
  fileID: string,
  recording: RecordingResult,
): Promise<string> {
  try {
    const { practiceId } = await callCloud('assess', 'start', {
      sessionId,
      vid,
      fileID,
      durationMs: Math.round(recording.durationMs),
    })
    return practiceId
  } catch (err) {
    // On an explicit rejection no practice was created and nothing references the recording, so delete it; on timeout or network loss the practice may already exist, so keep it
    if (!mayStillRun(err)) {
      wx.cloud.deleteFile({ fileList: [fileID], fail: () => {} })
    }
    throw err
  }
}

export async function getPractice(practiceId: string): Promise<Practice> {
  return (await callCloud('assess', 'get', { practiceId })).practice
}

export async function listPractices(sessionId: string): Promise<PracticeSummary[]> {
  return (await callCloud('assess', 'list', { sessionId })).items
}

/** Guards against infinite loops in abnormal cases: normally at most four steps */
const MAX_ROUNDS = 10

/** score: scoring (uses a free use), advancing until the report is ready; share: only prepares lyric timings for sharing (recognition and alignment), doesn't use a free use */
export type PracticeGoal = 'score' | 'share'

const ACTION = { score: 'score', share: 'prepareShare' } as const

/** The lyric timings needed for sharing come from the alignment step */
export const reachedGoal = (p: Practice, goal: PracticeGoal) =>
  goal === 'score' ? p.stage === 'done' : p.alignment !== null

export interface RunOptions {
  onUpdate?: (practice: Practice) => void
  isCancelled?: () => boolean
}

/**
 * Advance the assessment up to the target: each cloud function call runs one or more steps;
 * if the call doesn't return in time or a step is already running, poll the practice status until that step ends.
 * Call the target's action every round: the cloud deducts only once per recording, and a request that never arrived gets sent again.
 */
export async function runPractice(
  practiceId: string,
  goal: PracticeGoal,
  options: RunOptions = {},
): Promise<Practice> {
  const cancelled = () => options.isCancelled?.() === true
  const waitIdle = async () => {
    const {
      value,
      timedOut,
      cancelled: stopped,
    } = await pollUntil(
      () => getPractice(practiceId),
      (p) => p.job === null,
      { intervalMs: 2_000, timeoutMs: JOB_STALE_MS, isCancelled: options.isCancelled },
    )
    if (stopped) throw new CloudError('CANCELLED', '已取消')
    if (timedOut || !value) throw new CloudError('TIMEOUT', '评测时间太长了，请稍后回来看看')
    return value
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (cancelled()) throw new CloudError('CANCELLED', '已取消')
    let practice: Practice
    try {
      practice = (await callCloud('assess', ACTION[goal], { practiceId })).practice
    } catch (err) {
      if (!mayStillRun(err)) throw err
      practice = await waitIdle()
    }
    if (practice.job) practice = await waitIdle()
    options.onUpdate?.(practice)

    if (reachedGoal(practice, goal)) return practice
    if (practice.lastError)
      throw new CloudError(practice.lastError.code, practice.lastError.message)
  }
  throw new CloudError('INTERNAL', '评测没有完成，请重试')
}

const wordAudioCache = new Map<string, string>()

/** Reference pronunciation of a word: the cloud returns a base64 mp3, written to a local temp file for playback */
export async function wordAudioPath(word: string): Promise<string> {
  const key = word.toLowerCase()
  const hit = wordAudioCache.get(key)
  if (hit) return hit
  const { audio } = await callCloud('speech', 'ttsWord', { word })
  const filePath = `${wx.env.USER_DATA_PATH}/word-${key.replace(/[^a-z-]/g, '')}-${Date.now()}.mp3`
  await new Promise<void>((resolve, reject) =>
    wx.getFileSystemManager().writeFile({
      filePath,
      data: audio,
      encoding: 'base64',
      success: () => resolve(),
      fail: (err) => reject(new CloudError('INTERNAL', `保存发音失败：${err.errMsg}`)),
    }),
  )
  wordAudioCache.set(key, filePath)
  return filePath
}
