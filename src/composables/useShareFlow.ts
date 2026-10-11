import { reactive } from 'vue'
import type { Practice } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { runPractice } from '@/services/practice'
import { createShare, sharePath } from '@/services/share'
import { useProfileStore } from '@/stores/profile'
import { toast } from '@/utils/dialog'
import { navigateTo } from '@/utils/nav'

/**
 * 分享一次练习：还没有署名时先弹出头像昵称面板，保存后继续；
 * 没评分的录音先做识别和对照得到歌词时间（不扣次数），再生成分享，打开歌词页预览，在那里发给朋友。
 * 页面里放一个 profile-sheet 绑定 sheet 的状态。
 */
export function useShareFlow(
  options: {
    isCancelled?: () => boolean
    /** 准备好歌词时间后的练习，页面据此更新，再分享时不用重新准备 */
    onPrepared?: (practice: Practice) => void
  } = {},
) {
  const store = useProfileStore()
  const state = reactive({ busy: false, preparing: false, sheet: false })
  let pending: Practice | null = null

  async function share(practice: Practice) {
    if (state.busy) return
    state.busy = true
    try {
      const profile = store.loaded ? store.profile : await store.load()
      if (!profile) {
        pending = practice
        state.sheet = true
        return
      }
      if (!practice.alignment) {
        state.preparing = true
        const prepared = await runPractice(practice.id, 'share', {
          isCancelled: options.isCancelled,
        })
        options.onPrepared?.(prepared)
      }
      const shareId = await createShare(practice.id)
      navigateTo(sharePath(shareId))
    } catch (err) {
      if (err instanceof CloudError && err.code === 'CANCELLED') return
      toast(err instanceof CloudError ? err.message : '分享失败，请重试')
    } finally {
      state.busy = false
      state.preparing = false
    }
  }

  /** 头像昵称保存后，接着分享 */
  function onProfileSaved() {
    const practice = pending
    pending = null
    if (practice) void share(practice)
  }

  return { state, share, onProfileSaved }
}
