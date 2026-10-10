import { onUnmounted, ref } from 'vue'
import { ensureAudioOption } from './useAudio'

/** 跳转后等待生效的最长时间；个别机型不触发 onSeeked，到时间后照常读进度 */
const SEEK_SETTLE_MS = 600

/**
 * 整段音频的播放器（歌词页用）：播放 / 暂停、跳转、进度和时长。
 * 进度按 tickMs 读取，只在变化时更新。
 */
export function useTrackPlayer(tickMs = 80) {
  const playing = ref(false)
  const positionMs = ref(0)
  const durationMs = ref(0)
  const failed = ref(false)

  let ctx: WechatMiniprogram.InnerAudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  /** 停止或播完时 seek 不一定生效：记下来，开始播放后再跳 */
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
    // 播完以后再点播放，从头开始
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

  /** 跳到某个位置；autoplay 为 false 时只记下位置，下次播放从这里开始 */
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
