import { onUnmounted, ref, shallowRef } from 'vue'
import { LIMITS } from '@shared/constants'
import { pcmLevel } from '@/utils/audio'

export interface RecordingResult {
  tempFilePath: string
  durationMs: number
}

/** Number of waveform bars */
export const WAVE_BARS = 28
/**
 * UI refresh interval: volume frames arrive about 16 times a second; the UI updates only at this rate to avoid frequent setData.
 * The waveform bar transition duration --sv-dur-tick (tokens.scss) must match it.
 */
const UI_TICK_MS = 80

interface RecorderListener {
  onStart(): void
  onFrame(frame: ArrayBuffer): void
  onStop(res: { tempFilePath: string; duration: number }): void
  onError(errMsg: string): void
  /** Recording paused by a system interruption such as an incoming call, or by going to the background */
  onInterrupt(): void
}

// The recorder manager is a global singleton: register events once and forward them to the current recording
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
    // System interruption (e.g. incoming call) or going to the background: recording pauses while the timer keeps running, so cancel this recording
    manager.onInterruptionBegin(() => listener?.onInterrupt())
    manager.onPause(() => listener?.onInterrupt())
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
 * Recording logic for tap to start, then tap "Done" or "Cancel" to finish: permission, live volume, duration, cancel and too-short checks.
 * Records 16kHz mono PCM, which makes volume easy to compute and meets speech recognition (ASR) requirements.
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
  /** Done or Cancel was tapped before recording actually started: stop and discard as soon as it starts */
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
      // Permission was just granted in the dialog; wait until the user is ready instead of recording right away
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
      onInterrupt() {
        // Not actually started yet: the on-start handler stops and discards it, without a notice
        if (!recording.value) {
          stopRequested = true
          return
        }
        cancelled = true
        getManager().stop()
        uni.showToast({ title: '录音被打断了，请重新开始', icon: 'none' })
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
      // A synchronous throw fires neither onStart nor onError, so reset here or the button stays unresponsive
      listener = null
      reset()
      uni.showToast({ title: '录音启动失败，可以改用打字输入', icon: 'none' })
    }
  }

  /** Finish recording: cancel = true cancels it and discards the recording */
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
