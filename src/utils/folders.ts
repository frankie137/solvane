import { LIMITS } from '@shared/constants'
import type { Folder } from '@shared/types'

/** Folders at one level, in order; a null parentId means the root */
export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)
}

/** Flatten in tree order (parent first, children right after), for the folder picker list */
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

/** Path from the root to this folder */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const path: Folder[] = []
  let current = folders.find((f) => f.id === id)
  while (current && path.length <= LIMITS.folderDepth) {
    path.unshift(current)
    current = folders.find((f) => f.id === current!.parentId)
  }
  return path
}

/** This folder and every folder below it */
export function subtreeOf(folders: Folder[], id: string): Folder[] {
  const root = folders.find((f) => f.id === id)
  if (!root) return []
  const out = [root]
  for (let i = 0; i < out.length; i++) {
    out.push(...folders.filter((f) => f.parentId === out[i]!.id))
  }
  return out
}

/** Whether a subfolder can be created here */
export function canCreateIn(folder: Folder | null): boolean {
  return !folder || folder.depth < LIMITS.folderDepth
}

/** Whether folderId can move under target (a null target means the root) */
export function canMoveInto(folders: Folder[], folderId: string, target: Folder | null): boolean {
  const tree = subtreeOf(folders, folderId)
  const root = tree[0]
  if (!root) return false
  if (target && tree.some((f) => f.id === target.id)) return false
  const delta = (target?.depth ?? 0) + 1 - root.depth
  return Math.max(...tree.map((f) => f.depth)) + delta <= LIMITS.folderDepth
}
