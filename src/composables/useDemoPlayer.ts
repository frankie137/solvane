import { ref, shallowRef, watch, type Ref } from 'vue'
import type { TtsSentence } from '@shared/types'
import { CloudError, callCloud } from '@/services/cloud'
import { useSettingsStore } from '@/stores/settings'
import { useAudio } from './useAudio'

/**
 * Demo reading: plays sentence by sentence and highlights the sentence being read.
 * Each sentence is its own audio clip, so sentence highlighting always lines up; TTS word timings are inaccurate, so words are no longer highlighted.
 * Audio loads on demand (synthesized and cached on first play) and reloads after switching versions.
 */
/** Temporary URLs from the cloud expire after 2 hours; renew them early */
const TRACK_TTL_MS = 90 * 60_000

export function useDemoPlayer(sessionId: Ref<string>, vid: Ref<string | null>) {
  // On playback errors, invalidate the cache and fetch new URLs next time; nothing highlights by progress, so progress needn't be read often
  const audio = useAudio(250, {
    onError: () => {
      loadedAt = 0
    },
  })
  const settings = useSettingsStore()
  const tracks = shallowRef<TtsSentence[]>([])
  const loadedFor = ref('')
  let loadedAt = 0
  const loading = ref(false)
  const activeSentence = ref(-1)

  async function load(): Promise<boolean> {
    const { ttsVoice, ttsSpeed } = settings.settings
    const key = `${sessionId.value}:${vid.value}:${ttsVoice}:${ttsSpeed}`
    const fresh = Date.now() - loadedAt < TRACK_TTL_MS
    if (loadedFor.value === key && tracks.value.length > 0 && fresh) return true
    if (!vid.value || loading.value) return false
    loading.value = true
    try {
      const res = await callCloud('speech', 'tts', { sessionId: sessionId.value, vid: vid.value })
      tracks.value = res.sentences
      loadedFor.value = key
      loadedAt = Date.now()
      return true
    } catch (err) {
      uni.showToast({
        title: err instanceof CloudError ? err.message : '示范朗读加载失败',
        icon: 'none',
      })
      return false
    } finally {
      loading.value = false
    }
  }

  function reset() {
    activeSentence.value = -1
  }

  function playFrom(index: number, continueToEnd: boolean) {
    const track = tracks.value[index]
    if (!track) return reset()
    activeSentence.value = index
    audio.play(track.url, {
      onEnded: () => {
        if (continueToEnd && index + 1 < tracks.value.length) playFrom(index + 1, true)
        else reset()
      },
    })
  }

  async function playAll() {
    if (await load()) playFrom(0, true)
  }

  async function playSentence(index: number) {
    if (await load()) playFrom(index, false)
  }

  function stop() {
    audio.stop()
    reset()
  }

  // Stop and clear when the version changes; the next play reloads
  watch(vid, () => {
    stop()
    tracks.value = []
    loadedFor.value = ''
  })

  return {
    playing: audio.playing,
    loading,
    activeSentence,
    playAll,
    playSentence,
    stop,
  }
}
