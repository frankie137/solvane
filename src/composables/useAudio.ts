import { onUnmounted, ref } from 'vue'

export interface PlayOptions {
  /** Start playback here (ms) */
  startMs?: number
  /** Stop here (ms); plays to the end if omitted */
  endMs?: number
  /** Called when playback finishes naturally (including reaching endMs); not called when interrupted */
  onEnded?: () => void
}

let audioOptionSet = false
/** Max wait for a seek to finish; some devices never fire onSeeked, so read progress as usual after this */
const SEEK_SETTLE_MS = 600

/** Demos must be audible even in silent mode; only needs setting once */
export function ensureAudioOption() {
  if (audioOptionSet) return
  audioOptionSet = true
  wx.setInnerAudioOption({ obeyMuteSwitch: false, fail: () => {} })
}

/**
 * Single audio player: supports clip playback; progress is read every tickMs and updated only when it changes.
 * Playing new audio interrupts whatever is playing.
 */
export function useAudio(tickMs = 60, options: { onError?: () => void } = {}) {
  const playing = ref(false)
  const positionMs = ref(0)

  let ctx: WechatMiniprogram.InnerAudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let endAt: number | null = null
  let onEnded: (() => void) | undefined
  /** Position to seek to when replaying the same audio (s): seek may not take effect while stopped, so seek once playback starts */
  let pendingSeek: number | null = null
  /** currentTime keeps the old value until a seek completes; skip progress reads meanwhile so endMs is not falsely detected */
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
      // Most likely an expired temporary URL: let the caller invalidate its cache and use a new URL next time
      options.onError?.()
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
