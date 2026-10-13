import { reactive } from 'vue'
import type { Practice } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { runPractice } from '@/services/practice'
import { createShare, sharePath } from '@/services/share'
import { useProfileStore } from '@/stores/profile'
import { toast } from '@/utils/dialog'
import { navigateTo } from '@/utils/nav'

/**
 * Share a practice: if there's no byline yet, open the avatar and nickname sheet first and continue after saving;
 * for an unscored recording, run recognition and alignment first to get lyric timings (doesn't use a free use), then create the share and open the lyrics player to preview it and send it to friends.
 * The page places a profile-sheet bound to the sheet state.
 */
export function useShareFlow(
  options: {
    isCancelled?: () => boolean
    /** The practice once lyric timings are ready; the page updates from it so sharing again needn't prepare them again */
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

  /** Continue sharing after the avatar and nickname are saved */
  function onProfileSaved() {
    const practice = pending
    pending = null
    if (practice) void share(practice)
  }

  return { state, share, onProfileSaved }
}
