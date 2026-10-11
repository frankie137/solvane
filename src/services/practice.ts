import type { Practice, PracticeSummary } from '@shared/types'
import { JOB_STALE_MS } from '@shared/constants'
import type { RecordingResult } from '@/composables/useRecorder'
import { pollUntil } from '@/utils/poll'
import { callCloud, CloudError, uploadFile } from './cloud'
import { mayStillRun } from './cloud-error'

export async function startPractice(
  sessionId: string,
  vid: string,
  recording: RecordingResult,
): Promise<string> {
  const cloudPath = `recite-input/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pcm`
  const fileID = await uploadFile(recording.tempFilePath, cloudPath)
  try {
    const { practiceId } = await callCloud('assess', 'start', {
      sessionId,
      vid,
      fileID,
      durationMs: Math.round(recording.durationMs),
    })
    return practiceId
  } catch (err) {
    // 明确被拒绝时练习没有创建，录音没人引用了，顺手删掉；超时或断网时练习可能已经建好，不能删
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

/** 防止异常情况下无限循环：正常最多四步 */
const MAX_ROUNDS = 10

/** score：评分（扣次数），推进到出报告；share：只为分享准备歌词时间（识别和对照），不扣次数 */
export type PracticeGoal = 'score' | 'share'

const ACTION = { score: 'score', share: 'prepareShare' } as const

/** 分享需要的歌词时间来自对照这一步 */
export const reachedGoal = (p: Practice, goal: PracticeGoal) =>
  goal === 'score' ? p.stage === 'done' : p.alignment !== null

export interface RunOptions {
  onUpdate?: (practice: Practice) => void
  isCancelled?: () => boolean
}

/**
 * 推进评测直到目标：每次调用云函数执行一到多步；
 * 等不到返回或已有步骤在运行时，轮询练习状态直到这一步结束。
 * 每轮都调用目标对应的接口：云端对同一条录音只扣一次，请求没送达时也能重新发起。
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

/** 单词的标准发音：云端返回 base64 mp3，写成本地临时文件播放 */
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
