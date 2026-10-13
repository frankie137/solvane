import type { FolderDeleteMode, SaveSourceInput } from '@shared/api'
import { JOB_STALE_MS } from '@shared/constants'
import type {
  Expression,
  ExpressionKind,
  ExpressionSummary,
  LibraryTab,
  SessionSummary,
  SourceView,
  TagCount,
  Usage,
} from '@shared/types'
import { pollUntil } from '@/utils/poll'
import { callCloud, CloudError } from './cloud'
import { mayStillRun } from './cloud-error'

export interface FavoriteQuery {
  folderId?: string | null
  tag?: string
  keyword?: string
}

export async function listFavorites(
  tab: LibraryTab,
  query: FavoriteQuery,
): Promise<{ expressions: ExpressionSummary[]; sessions: SessionSummary[] }> {
  return callCloud('data', 'listFavorites', { tab, ...query })
}

export async function listTags(tab: LibraryTab): Promise<TagCount[]> {
  return (await callCloud('data', 'listTags', { tab })).tags
}

export async function organize(
  tab: LibraryTab,
  id: string,
  patch: { folderId?: string | null; tags?: string[] },
): Promise<void> {
  await callCloud('data', 'organize', { tab, id, ...patch })
}

export function starSession(sessionId: string, star: boolean) {
  return callCloud('data', 'starSession', { sessionId, star })
}

export interface SaveExpressionInput {
  text: string
  kind: ExpressionKind
  meaning?: string
  usage?: string
  example?: string
  source: SaveSourceInput
}

export function saveExpression(input: SaveExpressionInput) {
  return callCloud('data', 'saveExpression', input)
}

export async function getExpression(
  expressionId: string,
): Promise<{ expression: Expression; sources: SourceView[] }> {
  return callCloud('data', 'getExpression', { expressionId })
}

export async function updateNote(expressionId: string, note: string): Promise<Expression> {
  return (await callCloud('data', 'updateExpression', { expressionId, note })).expression
}

export async function deleteExpression(expressionId: string): Promise<void> {
  await callCloud('data', 'deleteExpression', { expressionId })
}

export async function findUsages(expressionId: string): Promise<Usage[]> {
  return (await callCloud('data', 'findUsages', { expressionId })).usages
}

export async function deleteFolder(folderId: string, mode: FolderDeleteMode): Promise<void> {
  await callCloud('data', 'deleteFolder', { folderId, mode })
}

/**
 * Fill in an expression's definition in the cloud; if the call doesn't return in time or another request is already filling it, poll until there's a result.
 * Returns the latest expression; if filling fails, fill is failed and nothing is thrown (except for errors such as no LLM configured).
 */
export async function explainExpression(
  expressionId: string,
  isCancelled?: () => boolean,
): Promise<Expression> {
  let expression: Expression | null = null
  try {
    expression = (await callCloud('compose', 'explainExpression', { expressionId })).expression
  } catch (err) {
    if (!mayStillRun(err)) throw err
  }
  if (expression && expression.fill !== 'pending') return expression

  const { value, timedOut, cancelled } = await pollUntil(
    async () => (await getExpression(expressionId)).expression,
    (e) => e.fill !== 'pending',
    { intervalMs: 2_000, timeoutMs: JOB_STALE_MS, isCancelled },
  )
  if (cancelled) throw new CloudError('CANCELLED', '已取消')
  if (timedOut || !value) throw new CloudError('TIMEOUT', '释义生成时间太长了，请稍后再看')
  return value
}
