import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Profile } from '@shared/types'
import { getProfile, saveProfile } from '@/services/share'

const PROFILE_TTL_MS = 90 * 60_000

/** Byline for shares (avatar, nickname); shared by the Me tab and share entry points */
export const useProfileStore = defineStore('profile', () => {
  const profile = ref<Profile | null>(null)
  const loaded = ref(false)
  /** The avatar is a temporary URL (expires in 2 hours); record when it was fetched and refetch before it expires */
  let loadedAt = 0

  async function load(): Promise<Profile | null> {
    profile.value = await getProfile()
    loaded.value = true
    loadedAt = Date.now()
    return profile.value
  }

  /** Refetch after 90 minutes to renew the avatar URL; keep the old one on failure */
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
