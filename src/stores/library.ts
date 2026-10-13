import { defineStore } from 'pinia'
import { ref } from 'vue'
import { expressionKey } from '@shared/expression'
import type { Folder, FolderCounts } from '@shared/types'
import { callCloud, CloudError } from '@/services/cloud'
import {
  deleteExpression,
  explainExpression,
  saveExpression,
  type SaveExpressionInput,
} from '@/services/library'

/** Saved items: folders, per-folder counts and merge keys of saved expressions; shared by the saved page and every save entry point */
export const useLibraryStore = defineStore('library', () => {
  const folders = ref<Folder[]>([])
  const counts = ref<FolderCounts>({ expression: {}, session: {} })
  /** Merge key → expression id */
  const keys = ref<Record<string, string>>({})
  const loaded = ref(false)
  const error = ref('')
  /** Incremented whenever saved items change; list pages reload on it */
  const revision = ref(0)

  let inFlight: Promise<void> | null = null

  function refresh(): Promise<void> {
    inFlight ??= (async () => {
      try {
        const [tree, saved] = await Promise.all([
          callCloud('data', 'listFolders', {}),
          callCloud('data', 'expressionKeys', {}),
        ])
        folders.value = tree.folders
        counts.value = tree.counts
        keys.value = saved.keys
        error.value = ''
      } catch (err) {
        error.value = err instanceof CloudError ? err.message : '出了点问题，请重试'
      } finally {
        loaded.value = true
        inFlight = null
      }
    })()
    return inFlight
  }

  /** Saved items changed: tell lists to reload and refresh folder counts */
  function touch() {
    revision.value++
    void refresh()
  }

  const savedId = (text: string): string | null => keys.value[expressionKey(text)] ?? null

  async function save(input: SaveExpressionInput) {
    const res = await saveExpression(input)
    keys.value = { ...keys.value, [expressionKey(res.expression.text)]: res.expression.id }
    touch()
    // Fill-ins that need the LLM run in the background; on failure they can be retried from the card
    if (res.expression.fill === 'pending') void explainExpression(res.expression.id).catch(() => {})
    return res
  }

  async function remove(expressionId: string) {
    await deleteExpression(expressionId)
    keys.value = Object.fromEntries(
      Object.entries(keys.value).filter(([, id]) => id !== expressionId),
    )
    touch()
  }

  async function createFolder(name: string, parentId: string | null): Promise<Folder> {
    const { folder } = await callCloud('data', 'createFolder', { name, parentId })
    folders.value = [...folders.value, folder]
    touch()
    return folder
  }

  return {
    folders,
    counts,
    keys,
    loaded,
    error,
    revision,
    refresh,
    touch,
    savedId,
    save,
    remove,
    createFolder,
  }
})
