import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LlmConfigView, UserSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { callCloud } from '@/services/cloud'

/** Learning preferences and LLM config, shared by the Me tab and the settings page */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)
  /** Global LLM config: only admins can fetch it; undefined means not fetched yet */
  const llm = ref<LlmConfigView | null | undefined>(undefined)

  async function load() {
    settings.value = await callCloud('data', 'getSettings', {})
    loaded.value = true
  }

  /** The Me tab shows the config status to admins; stays "—" on failure */
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
