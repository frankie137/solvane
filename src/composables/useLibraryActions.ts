import { inject, provide, type InjectionKey } from 'vue'
import type { Folder } from '@shared/types'
import { useFolderActions } from './useFolderActions'
import { useOrganizer } from './useOrganizer'

export interface LibraryActions {
  organizer: ReturnType<typeof useOrganizer>
  folders: ReturnType<typeof useFolderActions>
}

const KEY: InjectionKey<LibraryActions> = Symbol('library-actions')

/**
 * 收藏页和文件夹页提供整理操作：列表组件（library-browser）取用，
 * 面板（library-sheets）由页面放在 scroll-view 外面，避免固定定位受滚动容器影响。
 */
export function provideLibraryActions(
  options: { onFolderDeleted?: (folder: Folder) => void } = {},
) {
  const actions: LibraryActions = {
    organizer: useOrganizer(),
    folders: useFolderActions({ onDeleted: options.onFolderDeleted }),
  }
  provide(KEY, actions)
  return actions
}

export function useLibraryActions(): LibraryActions {
  const actions = inject(KEY)
  if (!actions) throw new Error('library-browser 需要页面先调用 provideLibraryActions()')
  return actions
}
