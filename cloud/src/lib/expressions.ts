import type { Expression, ExpressionSummary } from '@shared/types'
import { AppError } from './errors'
import type { ExpressionDoc, ExpressionRepo } from './repos'

export function toExpression(doc: ExpressionDoc): Expression {
  return {
    id: doc._id,
    text: doc.text,
    kind: doc.kind,
    meaning: doc.meaning,
    usage: doc.usage,
    example: doc.example,
    note: doc.note,
    fill: doc.fill,
    folderId: doc.folderId,
    tags: doc.tags,
    sources: doc.sources,
    createdAt: doc.createdAt,
    savedAt: doc.savedAt,
  }
}

export function toExpressionSummary(doc: ExpressionDoc): ExpressionSummary {
  return {
    id: doc._id,
    text: doc.text,
    kind: doc.kind,
    meaning: doc.meaning,
    fill: doc.fill,
    folderId: doc.folderId,
    tags: doc.tags,
    sourceCount: doc.sources.length,
    savedAt: doc.savedAt,
  }
}

export async function requireExpression(
  repo: ExpressionRepo,
  id: string,
  openid: string,
): Promise<ExpressionDoc> {
  const doc = await repo.get(id, openid)
  if (!doc) throw new AppError('NOT_FOUND', '这个收藏不存在或已被删除')
  return doc
}
