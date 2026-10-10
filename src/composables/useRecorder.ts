import { onUnmounted, ref, shallowRef } from 'vue'
import { LIMITS } from '@shared/constants'
import { pcmLevel } from '@/utils/audio'

export interface RecordingResult {
  tempFilePath: string
  durationMs: number
}

/** 波形条数量 */
export const WAVE_BARS = 28
/** 界面刷新间隔：音量帧每秒约 16 帧，界面只按这个频率更新，避免频繁 setData */
const UI_TICK_MS = 80

interface RecorderListener {
  onStart(): void
  onFrame(frame: ArrayBuffer): void
  onStop(res: { tempFilePath: string; duration: number }): void
  onError(errMsg: string): void
}

// 录音管理器是全局唯一的，事件只注册一次，再转发给当前的录音会话
let manager: WechatMiniprogram.RecorderManager | null = null
let listener: RecorderListener | null = null

function getManager(): WechatMiniprogram.RecorderManager {
  if (!manager) {
    manager = wx.getRecorderManager()
    manager.onStart(() => listener?.onStart())
    manager.onFrameRecorded((res) => listener?.onFrame(res.frameBuffer))
    manager.onStop((res) => {
      const current = listener
      listener = null
      current?.onStop(res)
    })
    manager.onError((res) => {
      const current = listener
      listener = null
      current?.onError(res.errMsg)
    })
    // 来电等系统打断：直接停止
    manager.onInterruptionBegin(() => manager?.stop())
  }
  return manager
}

type Permission = 'granted' | 'just-granted' | 'denied'

async function ensurePermission(): Promise<Permission> {
  const { authSetting } = await wx.getSetting({})
  const auth = authSetting['scope.record']
  if (auth === true) return 'granted'
  if (auth === false) return 'denied'
  try {
    await wx.authorize({ scope: 'scope.record' })
    return 'just-granted'
  } catch {
    return 'denied'
  }
}

function guideToSettings() {
  uni.showModal({
    title: '需要麦克风权限',
    content: '说中文需要用到麦克风。请在设置中允许使用麦克风，也可以改用打字输入。',
    confirmText: '去设置',
    success: (res) => {
      if (res.confirm) uni.openSetting({})
    },
  })
}

/**
 * 点按开始、点「完成」或「取消」结束的录音逻辑：权限、实时音量、时长、取消、过短判断。
 * 录音格式为 16kHz 单声道 PCM，便于计算音量，也符合语音识别的要求。
 */
export function useRecorder(
  onFinish: (result: RecordingResult) => void,
  options: { maxMs?: number } = {},
) {
  const maxMs = options.maxMs ?? LIMITS.recordMaxMs
  const recording = ref(false)
  const elapsedMs = ref(0)
  const levels = shallowRef<number[]>(new Array(WAVE_BARS).fill(0))

  let recent: number[] = []
  let startedAt = 0
  let ticker: ReturnType<typeof setInterval> | null = null
  let starting = false
  /** 录音还没真正开始就点了完成或取消：开始后立即停止并丢弃 */
  let stopRequested = false
  let cancelled = false

  function stopTicker() {
    if (ticker) clearInterval(ticker)
    ticker = null
  }

  function reset() {
    stopTicker()
    recording.value = false
    starting = false
  }

  async function start(): Promise<void> {
    if (recording.value || starting) return
    starting = true
    stopRequested = false
    cancelled = false

    const permission = await ensurePermission().catch((): Permission => 'denied')
    if (permission !== 'granted') {
      starting = false
      if (permission === 'denied') guideToSettings()
      // 刚弹窗授权完，等对方准备好再开始，不直接开录
      else uni.showToast({ title: '已开启麦克风，请再点一次开始说话', icon: 'none' })
      return
    }
    if (stopRequested) {
      starting = false
      return
    }

    recent = []
    levels.value = new Array(WAVE_BARS).fill(0)
    elapsedMs.value = 0
    listener = {
      onStart() {
        starting = false
        recording.value = true
        startedAt = Date.now()
        uni.vibrateShort({ type: 'medium', fail: () => {} })
        ticker = setInterval(() => {
          elapsedMs.value = Date.now() - startedAt
          levels.value = [...new Array(WAVE_BARS - recent.length).fill(0), ...recent]
        }, UI_TICK_MS)
        if (stopRequested) getManager().stop()
      },
      onFrame(frame) {
        recent.push(pcmLevel(frame))
        if (recent.length > WAVE_BARS) recent.shift()
      },
      onStop(res) {
        const durationMs = res.duration || Date.now() - startedAt
        reset()
        if (cancelled || stopRequested) return
        if (durationMs < LIMITS.recordMinMs) {
          uni.showToast({ title: '说话时间太短', icon: 'none' })
          return
        }
        onFinish({ tempFilePath: res.tempFilePath, durationMs })
      },
      onError(errMsg) {
        reset()
        if (/auth|permission|scope/i.test(errMsg)) guideToSettings()
        else uni.showToast({ title: '录音失败，请重试', icon: 'none' })
      },
    }
    try {
      getManager().start({
        duration: maxMs,
        sampleRate: 16000,
        numberOfChannels: 1,
        format: 'PCM',
        frameSize: 2,
      })
    } catch {
      // 同步抛错时 onStart / onError 都不会触发，这里自己复位，否则按钮会一直无响应
      listener = null
      reset()
      uni.showToast({ title: '录音启动失败，可以改用打字输入', icon: 'none' })
    }
  }

  /** 结束录音：cancel 为 true 表示取消，录音直接丢弃 */
  function stop(cancel: boolean) {
    cancelled = cancel
    if (recording.value) {
      getManager().stop()
    } else if (starting) {
      stopRequested = true
    }
  }

  onUnmounted(() => {
    if (recording.value || starting) stop(true)
  })

  return { recording, elapsedMs, levels, start, stop }
}
