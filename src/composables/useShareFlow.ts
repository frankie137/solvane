import { reactive } from 'vue'
import { CloudError } from '@/services/cloud'
import { createShare, sharePath } from '@/services/share'
import { useProfileStore } from '@/stores/profile'
import { toast } from '@/utils/dialog'

/**
 * 分享一次练习：还没有署名时先弹出头像昵称面板，保存后继续；
 * 生成分享后打开歌词页预览，在那里发给朋友。页面里放一个 profile-sheet 绑定 sheet 的状态。
 */
export function useShareFlow() {
  const store = useProfileStore()
  const state = reactive({ busy: false, sheet: false })
  let pending: string | null = null

  async function share(practiceId: string) {
    if (state.busy) return
    state.busy = true
    try {
      const profile = store.loaded ? store.profile : await store.load()
      if (!profile) {
        pending = practiceId
        state.sheet = true
        return
      }
      const shareId = await createShare(practiceId)
      uni.navigateTo({ url: sharePath(shareId) })
    } catch (err) {
      toast(err instanceof CloudError ? err.message : '分享失败，请重试')
    } finally {
      state.busy = false
    }
  }

  /** 头像昵称保存后，接着分享 */
  function onProfileSaved() {
    const practiceId = pending
    pending = null
    if (practiceId) void share(practiceId)
  }

  return { state, share, onProfileSaved }
}
