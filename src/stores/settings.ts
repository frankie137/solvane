import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LlmConfigView, UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { callCloud } from '@/services/cloud'

/** 学习偏好与大模型配置，"我的"页和设置页共享 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)
  /** 全局大模型配置：只有管理员能取；undefined 表示还没取到 */
  const llm = ref<LlmConfigView | null | undefined>(undefined)

  async function load() {
    settings.value = await callCloud('data', 'getSettings', {})
    loaded.value = true
  }

  /** 管理员的「我的」页显示配置状态；失败时保持"—" */
  async function loadLlm() {
    llm.value = (await callCloud('compose', 'getLlmConfig', {})).config
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

  function setLlm(config: LlmConfigView | null) {
    llm.value = config
  }

  return { settings, llm, loaded, load, loadLlm, update, setLlm }
})
