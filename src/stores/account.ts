import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Account } from '@shared/types'
import { callCloud } from '@/services/cloud'

/** 自己的会员状态：「我的」页、新建对话、评分、Pro 面板共享 */
export const useAccountStore = defineStore('account', () => {
  const account = ref<Account | null>(null)

  async function load(): Promise<Account> {
    account.value = (await callCloud('data', 'getAccount', {})).account
    return account.value
  }

  /** 新建对话、评分以后次数变了：后台刷新，失败时保留原来的 */
  function refresh() {
    void load().catch(() => {})
  }

  return { account, load, refresh }
})
