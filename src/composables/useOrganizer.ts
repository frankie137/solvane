import { onUnmounted, reactive } from 'vue'
import type { LibraryTab, TagCount } from '@shared/types'
import { CloudError } from '@/services/cloud'
import { listTags, organize, starSession } from '@/services/library'
import { useLibraryStore } from '@/stores/library'
import { chooseAction, confirmAction, toast } from '@/utils/dialog'

export interface OrganizeTarget {
  tab: LibraryTab
  id: string
  folderId: string | null
  tags: string[]
}

/**
 * Organize saved items: move to a folder, edit tags, and the notice after saving.
 * The page places a folder-picker, a tag-editor and a saved-toast bound to this state.
 */
export function useOrganizer(onChanged?: (target: OrganizeTarget) => void) {
  const store = useLibraryStore()
  const picker = reactive({ show: false, current: null as string | null })
  const tagger = reactive({
    show: false,
    tags: [] as string[],
    known: [] as TagCount[],
    saving: false,
  })
  const saved = reactive({ show: false, text: '', action: '' })
  let target: OrganizeTarget | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const fail = (err: unknown, fallback: string) =>
    toast(err instanceof CloudError ? err.message : fallback)

  function move(t: OrganizeTarget) {
    target = t
    picker.current = t.folderId
    picker.show = true
  }

  async function onPick(folderId: string | null) {
    const t = target
    if (!t || folderId === t.folderId) return
    try {
      await organize(t.tab, t.id, { folderId })
      t.folderId = folderId
      store.touch()
      onChanged?.(t)
      const name = store.folders.find((f) => f.id === folderId)?.name
      toast(name ? `已移到「${name}」` : '已移到未归类')
    } catch (err) {
      fail(err, '移动失败，请重试')
    }
  }

  async function editTags(t: OrganizeTarget) {
    target = t
    tagger.tags = [...t.tags]
    tagger.show = true
    try {
      tagger.known = await listTags(t.tab)
    } catch {
      // Frequent tags are only suggestions; failing to load them doesn't block editing
    }
  }

  async function onTags(tags: string[]) {
    const t = target
    if (!t || tagger.saving) return
    tagger.saving = true
    try {
      await organize(t.tab, t.id, { tags })
      t.tags = tags
      tagger.show = false
      store.touch()
      onChanged?.(t)
    } catch (err) {
      fail(err, '保存失败，请重试')
    } finally {
      tagger.saving = false
    }
  }

  /** Saved notice with a "choose folder" (选文件夹) action */
  function notifySaved(t: OrganizeTarget, text = '已收藏') {
    target = t
    saved.text = text
    saved.action = '选文件夹'
    saved.show = true
    uni.vibrateShort({ type: 'light', fail: () => {} })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      saved.show = false
    }, 3_000)
  }

  function onSavedAction() {
    saved.show = false
    if (target) move(target)
  }

  /** Unsave: an expression card is deleted (after confirmation); a session is just unsaved */
  async function unstar(t: OrganizeTarget, label = ''): Promise<boolean> {
    try {
      if (t.tab === 'expression') {
        const ok = await confirmAction({
          title: '取消收藏？',
          content: `${label ? `「${label}」` : '这张卡片'}的释义、备注和来源都会删除。`,
          confirmText: '删除卡片',
          danger: true,
        })
        if (!ok) return false
        await store.remove(t.id)
      } else {
        await starSession(t.id, false)
        store.touch()
      }
      return true
    } catch (err) {
      fail(err, '操作失败，请重试')
      return false
    }
  }

  /** Long press on an item in the saved list */
  async function itemMore(t: OrganizeTarget, label = '') {
    const index = await chooseAction(['移动到…', '编辑标签', '取消收藏'])
    if (index === 0) move(t)
    else if (index === 1) await editTags(t)
    else if (index === 2) await unstar(t, label)
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return {
    picker,
    tagger,
    saved,
    move,
    onPick,
    editTags,
    onTags,
    notifySaved,
    onSavedAction,
    unstar,
    itemMore,
  }
}
