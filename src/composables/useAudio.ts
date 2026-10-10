import { onUnmounted, ref } from 'vue'

export interface PlayOptions {
  /** 从这里开始播放（毫秒） */
  startMs?: number
  /** 播到这里停止（毫秒）；不填播到结尾 */
  endMs?: number
  /** 自然播完（包括到达 endMs）时调用；被打断时不调用 */
  onEnded?: () => void
}

let audioOptionSet = false

/** 静音模式下也要能听示范；只需设置一次 */
function ensureAudioOption() {
  if (audioOptionSet) return
  audioOptionSet = true
  wx.setInnerAudioOption({ obeyMuteSwitch: false, fail: () => {} })
}

/**
 * 单个音频播放器：支持片段播放，播放进度按 tickMs 读取，只在变化时更新。
 * 播放新的音频会打断正在播放的。
 */
export function useAudio(tickMs = 60) {
  const playing = ref(false)
  const positionMs = ref(0)

  let ctx: WechatMiniprogram.InnerAudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let endAt: number | null = null
  let onEnded: (() => void) | undefined

  function clearTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function finish(natural: boolean) {
    clearTimer()
    playing.value = false
    endAt = null
    const callback = onEnded
    onEnded = undefined
    if (natural) callback?.()
  }

  function getContext(): WechatMiniprogram.InnerAudioContext {
    if (ctx) return ctx
    ensureAudioOption()
    ctx = wx.createInnerAudioContext()
    ctx.onEnded(() => {
      if (playing.value) finish(true)
    })
    ctx.onError(() => {
      if (!playing.value) return
      finish(false)
      uni.showToast({ title: '播放失败，请重试', icon: 'none' })
    })
    return ctx
  }

  function play(src: string, options: PlayOptions = {}) {
    const audio = getContext()
    if (playing.value) {
      audio.stop()
      finish(false)
    }
    const startSec = (options.startMs ?? 0) / 1000
    endAt = options.endMs ?? null
    onEnded = options.onEnded
    positionMs.value = options.startMs ?? 0
    if (audio.src === src) {
      audio.seek(startSec)
    } else {
      audio.src = src
      audio.startTime = startSec
    }
    audio.play()
    playing.value = true

    clearTimer()
    timer = setInterval(() => {
      const ms = Math.round(audio.currentTime * 1000)
      if (ms !== positionMs.value) positionMs.value = ms
      if (endAt !== null && ms >= endAt) {
        audio.stop()
        finish(true)
      }
    }, tickMs)
  }

  function stop() {
    if (!playing.value) return
    ctx?.stop()
    finish(false)
  }

  onUnmounted(() => {
    stop()
    ctx?.destroy()
    ctx = null
  })

  return { playing, positionMs, play, stop }
}
