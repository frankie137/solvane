import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Profile } from '@shared/types'
import { getProfile, saveProfile } from '@/services/share'

const PROFILE_TTL_MS = 90 * 60_000

/** 分享时的署名（头像、昵称）；「我的」页和分享入口共享 */
export const useProfileStore = defineStore('profile', () => {
  const profile = ref<Profile | null>(null)
  const loaded = ref(false)
  /** 头像是临时链接（2 小时过期），记下取到的时间，快过期时重新取 */
  let loadedAt = 0

  async function load(): Promise<Profile | null> {
    profile.value = await getProfile()
    loaded.value = true
    loadedAt = Date.now()
    return profile.value
  }

  /** 超过 90 分钟就重新取，换新的头像链接；失败时保留原来的 */
  async function refreshIfStale(): Promise<void> {
    if (!loaded.value || Date.now() - loadedAt < PROFILE_TTL_MS) return
    await load().catch(() => {})
  }

  async function save(nickname: string, avatarPath?: string): Promise<Profile> {
    profile.value = await saveProfile(nickname, avatarPath)
    loaded.value = true
    return profile.value
  }

  return { profile, loaded, load, refreshIfStale, save }
})
