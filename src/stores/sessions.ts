import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SessionSummary } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { listRecentSessions } from '@/services/sessions'

/** Recent sessions on the practice tab */
export const useSessionsStore = defineStore('sessions', () => {
  const recent = ref<SessionSummary[]>([])
  const loaded = ref(false)
  const error = ref('')
  let inFlight: Promise<void> | null = null

  function refresh(): Promise<void> {
    inFlight ??= (async () => {
      try {
        recent.value = await listRecentSessions()
        error.value = ''
      } catch (err) {
        error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
      } finally {
        loaded.value = true
        inFlight = null
      }
    })()
    return inFlight
  }

  return { recent, loaded, error, refresh }
})
