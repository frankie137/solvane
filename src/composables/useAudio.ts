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
/** 等待跳转完成的最长时间；个别机型不触发 onSeeked，到时间后照常读进度 */
const SEEK_SETTLE_MS = 600

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
  /** 重播同一个音频时要跳到的位置（秒）：停止状态下 seek 不一定生效，等开始播放后再跳 */
  let pendingSeek: number | null = null
  /** 跳转完成前 currentTime 还是旧值，这段时间不读进度，避免误判已到 endMs */
  let settleUntil = 0

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
    ctx.onPlay(() => {
      if (pendingSeek === null || !ctx) return
      ctx.seek(pendingSeek)
      pendingSeek = null
    })
    ctx.onSeeked(() => {
      settleUntil = 0
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
      pendingSeek = startSec
      settleUntil = Date.now() + SEEK_SETTLE_MS
    } else {
      pendingSeek = null
      settleUntil = 0
      audio.src = src
      audio.startTime = startSec
    }
    audio.play()
    playing.value = true

    clearTimer()
    timer = setInterval(() => {
      if (pendingSeek !== null || Date.now() < settleUntil) return
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
