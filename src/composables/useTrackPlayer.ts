import { onUnmounted, ref } from 'vue'
import { ensureAudioOption } from './useAudio'

/** Max wait for a seek to take effect; some devices never fire onSeeked, so read progress as usual after this */
const SEEK_SETTLE_MS = 600

/**
 * Full-track audio player (used by the lyrics player): play / pause, seek, progress and duration.
 * Progress is read every tickMs and updated only when it changes.
 */
export function useTrackPlayer(tickMs = 80) {
  const playing = ref(false)
  const positionMs = ref(0)
  const durationMs = ref(0)
  const failed = ref(false)

  let ctx: WechatMiniprogram.InnerAudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  /** Seek may not take effect when stopped or finished: remember it and seek once playback starts */
  let pendingSeek: number | null = null
  let settleUntil = 0

  function startTicker() {
    if (timer) return
    timer = setInterval(() => {
      if (!ctx || pendingSeek !== null || Date.now() < settleUntil) return
      const ms = Math.round(ctx.currentTime * 1000)
      if (ms !== positionMs.value) positionMs.value = ms
      const total = Math.round(ctx.duration * 1000)
      if (total > 0 && total !== durationMs.value) durationMs.value = total
    }, tickMs)
  }

  function stopTicker() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function load(src: string, knownDurationMs = 0) {
    destroy()
    ensureAudioOption()
    failed.value = false
    positionMs.value = 0
    durationMs.value = knownDurationMs
    const audio = wx.createInnerAudioContext()
    audio.src = src
    audio.onPlay(() => {
      playing.value = true
      if (pendingSeek !== null) {
        audio.seek(pendingSeek / 1000)
        pendingSeek = null
      }
      startTicker()
    })
    audio.onPause(() => {
      playing.value = false
      stopTicker()
    })
    audio.onStop(() => {
      playing.value = false
      stopTicker()
    })
    audio.onEnded(() => {
      playing.value = false
      stopTicker()
      positionMs.value = durationMs.value
    })
    audio.onSeeked(() => {
      settleUntil = 0
    })
    audio.onError(() => {
      playing.value = false
      failed.value = true
      stopTicker()
    })
    ctx = audio
  }

  function play() {
    if (!ctx) return
    // Pressing play after it finished starts from the beginning
    if (durationMs.value > 0 && positionMs.value >= durationMs.value) seek(0)
    else ctx.play()
  }

  function pause() {
    ctx?.pause()
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  /** Seek to a position; with autoplay false, just remember it so the next play starts there */
  function seek(ms: number, autoplay = true) {
    if (!ctx) return
    const target = Math.max(0, durationMs.value > 0 ? Math.min(ms, durationMs.value) : ms)
    positionMs.value = target
    settleUntil = Date.now() + SEEK_SETTLE_MS
    if (playing.value) {
      ctx.seek(target / 1000)
    } else {
      pendingSeek = target
      if (autoplay) ctx.play()
    }
  }

  function destroy() {
    stopTicker()
    if (ctx) {
      ctx.stop()
      ctx.destroy()
    }
    ctx = null
    playing.value = false
    pendingSeek = null
  }

  onUnmounted(destroy)

  return { playing, positionMs, durationMs, failed, load, play, pause, toggle, seek, destroy }
}
