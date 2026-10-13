import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Account } from '@shared/types'
import { callCloud } from '@/services/cloud'

/** The user's own membership status, shared by the Me tab, new sessions, scoring and the Pro sheet */
export const useAccountStore = defineStore('account', () => {
  const account = ref<Account | null>(null)

  async function load(): Promise<Account> {
    account.value = (await callCloud('data', 'getAccount', {})).account
    return account.value
  }

  /** Uses change after a new session or scoring: refresh in the background, keeping the old value on failure */
  function refresh() {
    void load().catch(() => {})
  }

  return { account, load, refresh }
})
