import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Profile } from '@shared/types'
import { getProfile, saveProfile } from '@/services/share'

/** 分享时的署名（头像、昵称）；「我的」页和分享入口共享 */
export const useProfileStore = defineStore('profile', () => {
  const profile = ref<Profile | null>(null)
  const loaded = ref(false)

  async function load(): Promise<Profile | null> {
    profile.value = await getProfile()
    loaded.value = true
    return profile.value
  }

  async function save(nickname: string, avatarPath?: string): Promise<Profile> {
    profile.value = await saveProfile(nickname, avatarPath)
    loaded.value = true
    return profile.value
  }

  return { profile, loaded, load, save }
})
