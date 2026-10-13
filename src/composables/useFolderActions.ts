import { reactive } from 'vue'
import type { Folder } from '@shared/types'
import { callCloud, CloudError } from '@/services/cloud'
import { deleteFolder } from '@/services/library'
import { useLibraryStore } from '@/stores/library'
import { chooseAction, confirmAction, promptText, toast } from '@/utils/dialog'
import { childrenOf, subtreeOf } from '@/utils/folders'

/**
 * Folder actions: create, rename, move, delete, reorder.
 * The page places a folder-picker with moving-folder-id, bound to the mover state.
 */
export function useFolderActions(options: { onDeleted?: (folder: Folder) => void } = {}) {
  const store = useLibraryStore()
  const mover = reactive({ show: false, current: null as string | null, movingId: '' })

  const fail = (err: unknown, fallback: string) =>
    toast(err instanceof CloudError ? err.message : fallback)

  async function create(parentId: string | null) {
    const name = await promptText({ title: '新建文件夹', placeholder: '文件夹名' })
    if (!name) return
    try {
      await store.createFolder(name, parentId)
    } catch (err) {
      fail(err, '新建失败，请重试')
    }
  }

  async function rename(folder: Folder) {
    const name = await promptText({ title: '重命名', value: folder.name, placeholder: '文件夹名' })
    if (!name || name === folder.name) return
    try {
      await callCloud('data', 'renameFolder', { folderId: folder.id, name })
      store.touch()
    } catch (err) {
      fail(err, '重命名失败，请重试')
    }
  }

  function startMove(folder: Folder) {
    mover.movingId = folder.id
    mover.current = folder.parentId
    mover.show = true
  }

  async function onMovePick(parentId: string | null) {
    const folderId = mover.movingId
    if (!folderId) return
    try {
      await callCloud('data', 'moveFolder', { folderId, parentId })
      store.touch()
    } catch (err) {
      fail(err, '移动失败，请重试')
    }
  }

  async function remove(folder: Folder) {
    const index = await chooseAction(['删除文件夹，内容移到上一级', '连同里面的收藏一起删除'])
    if (index < 0) return
    const mode = index === 0 ? 'moveUp' : 'deleteAll'
    if (mode === 'deleteAll') {
      const nested = subtreeOf(store.folders, folder.id).length - 1
      const ok = await confirmAction({
        title: `删除「${folder.name}」？`,
        content: `${nested > 0 ? `它下面的 ${nested} 个文件夹也会删除。` : ''}里面的表达卡片会删除，对话只是取消收藏，仍然在历史里。`,
        confirmText: '删除',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await deleteFolder(folder.id, mode)
      store.touch()
      options.onDeleted?.(folder)
    } catch (err) {
      fail(err, '删除失败，请重试')
    }
  }

  /** Long press, or tap "…" in edit mode */
  async function more(folder: Folder) {
    const index = await chooseAction(['重命名', '移动到…', '删除'])
    if (index === 0) await rename(folder)
    else if (index === 1) startMove(folder)
    else if (index === 2) await remove(folder)
  }

  /** Move up or down one position within the same level */
  async function reorder(parentId: string | null, folderId: string, step: -1 | 1) {
    const siblings = childrenOf(store.folders, parentId)
    const i = siblings.findIndex((f) => f.id === folderId)
    const j = i + step
    if (i < 0 || j < 0 || j >= siblings.length) return
    const ids = siblings.map((f) => f.id)
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    // Reorder locally first so the UI responds immediately
    store.folders = store.folders.map((f) => {
      const order = ids.indexOf(f.id)
      return f.parentId === parentId && order >= 0 ? { ...f, order } : f
    })
    try {
      await callCloud('data', 'reorderFolders', { parentId, ids })
    } catch (err) {
      fail(err, '排序失败，请重试')
      void store.refresh()
    }
  }

  return { mover, create, rename, startMove, onMovePick, remove, more, reorder }
}
