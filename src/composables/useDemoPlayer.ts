import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { SentencePair, TtsSentence } from '@shared/types'
import { CloudError, callCloud } from '@/services/cloud'
import { useSettingsStore } from '@/stores/settings'
import { activeTokenIndex, tokenize } from '@/utils/recite'
import { useAudio } from './useAudio'

/**
 * 示范朗读：按句播放，读到哪个词高亮哪个词。
 * 音频按需加载（第一次播放时合成并缓存），换版本后重新加载。
 */
/** 云端给的临时链接 2 小时过期，提前换新 */
const TRACK_TTL_MS = 90 * 60_000

export function useDemoPlayer(
  sessionId: Ref<string>,
  vid: Ref<string | null>,
  sentences: Ref<SentencePair[]>,
) {
  // 播放出错时作废缓存，下次重新获取链接
  const audio = useAudio(60, {
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
  const activeToken = ref(-1)

  const tokens = computed(() => sentences.value.map((s) => tokenize(s.en)))

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
    activeToken.value = -1
  }

  function playFrom(index: number, continueToEnd: boolean) {
    const track = tracks.value[index]
    if (!track) return reset()
    activeSentence.value = index
    activeToken.value = -1
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

  // 只在高亮的词真正变化时更新
  watch(audio.positionMs, (ms) => {
    const i = activeSentence.value
    const track = tracks.value[i]
    const t = tokens.value[i]
    if (!track || !t) return
    const next = activeTokenIndex(t, track.words, ms)
    if (next !== activeToken.value) activeToken.value = next
  })

  // 换版本时停止并清空，下一次播放重新加载
  watch(vid, () => {
    stop()
    tracks.value = []
    loadedFor.value = ''
  })

  return {
    playing: audio.playing,
    loading,
    activeSentence,
    activeToken,
    playAll,
    playSentence,
    stop,
  }
}
