import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LlmConfigState, UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { callCloud } from '@/services/cloud'

/** 学习偏好与大模型配置状态，"我的"页和设置页共享 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS })
  const llm = ref<LlmConfigState | null>(null)
  const loaded = ref(false)

  /** 两部分分别加载：大模型配置读取失败（如 compose 未部署）不影响学习偏好 */
  async function load() {
    const llmTask = callCloud('compose', 'getLlmConfig', {}).then(
      (state) => {
        llm.value = state
      },
      () => {},
    )
    try {
      settings.value = await callCloud('data', 'getSettings', {})
      loaded.value = true
    } finally {
      await llmTask
    }
  }

  async function update(patch: Partial<UserSettings>) {
    const previous = settings.value
    settings.value = { ...previous, ...patch }
    try {
      settings.value = await callCloud('data', 'updateSettings', patch)
    } catch (err) {
      settings.value = previous
      throw err
    }
  }

  function setLlmState(state: LlmConfigState) {
    llm.value = state
  }

  return { settings, llm, loaded, load, update, setLlmState }
})
