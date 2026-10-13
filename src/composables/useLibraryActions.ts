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
 * The saved page and folder page provide organizing actions for the list component (library-browser);
 * the page puts the sheets (library-sheets) outside the scroll-view so fixed positioning isn't affected by the scroll container.
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
  if (!actions)
    throw new Error('library-browser requires the page to call provideLibraryActions() first')
  return actions
}
