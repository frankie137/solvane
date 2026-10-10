import { LIMITS } from '@shared/constants'
import type { Folder } from '@shared/types'

/** 某一层的文件夹，按顺序排好；parentId 为 null 是根目录 */
export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
}

/** 按树的顺序展开（父在前、子紧跟），用于文件夹选择列表 */
export function flattenTree(folders: Folder[]): Folder[] {
  const out: Folder[] = []
  const walk = (parentId: string | null) => {
    for (const f of childrenOf(folders, parentId)) {
      out.push(f)
      walk(f.id)
    }
  }
  walk(null)
  return out
}

/** 从根到这个文件夹的路径 */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const path: Folder[] = []
  let current = folders.find((f) => f.id === id)
  while (current && path.length <= LIMITS.folderDepth) {
    path.unshift(current)
    current = folders.find((f) => f.id === current!.parentId)
  }
  return path
}

/** 这个文件夹和它下面的所有文件夹 */
export function subtreeOf(folders: Folder[], id: string): Folder[] {
  const root = folders.find((f) => f.id === id)
  if (!root) return []
  const out = [root]
  for (let i = 0; i < out.length; i++) {
    out.push(...folders.filter((f) => f.parentId === out[i]!.id))
  }
  return out
}

/** 能否在这里新建子文件夹 */
export function canCreateIn(folder: Folder | null): boolean {
  return !folder || folder.depth < LIMITS.folderDepth
}

/** 能否把 folderId 移到 target 下面（target 为 null 表示根目录） */
export function canMoveInto(folders: Folder[], folderId: string, target: Folder | null): boolean {
  const tree = subtreeOf(folders, folderId)
  const root = tree[0]
  if (!root) return false
  if (target && tree.some((f) => f.id === target.id)) return false
  const delta = (target?.depth ?? 0) + 1 - root.depth
  return Math.max(...tree.map((f) => f.depth)) + delta <= LIMITS.folderDepth
}
