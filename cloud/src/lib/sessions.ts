import type { Alternative, Session, SessionSummary, SentencePair, Version } from '@shared/types'
import { AppError } from './errors'
import type { SessionDoc, SessionRepo } from './repos'

export function toSession(doc: SessionDoc): Session {
  return {
    id: doc._id,
    title: doc.title,
    input: doc.input,
    polishedZh: doc.polishedZh,
    versions: doc.versions,
    currentVid: doc.currentVid,
    job: doc.job,
    lastError: doc.lastError,
    ...favoriteFields(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/** 旧数据没有 starredAt；没收藏时文件夹和标签一律视为空 */
export function favoriteFields(doc: Pick<SessionDoc, 'starredAt' | 'folderId' | 'tags'>): {
  starredAt: number | null
  folderId: string | null
  tags: string[]
} {
  const starredAt = doc.starredAt ?? null
  return {
    starredAt,
    folderId: starredAt === null ? null : (doc.folderId ?? null),
    tags: starredAt === null ? [] : (doc.tags ?? []),
  }
}

export function toSummary(doc: SessionDoc): SessionSummary {
  const current = doc.versions.find((v) => v.vid === doc.currentVid) ?? doc.versions.at(-1)
  return {
    id: doc._id,
    title: doc.title || doc.input.rawText.slice(0, 12),
    preview: current?.sentences[0]?.en ?? doc.input.rawText,
    versionCount: doc.versions.length,
    state: summaryState(doc),
    ...favoriteFields(doc),
    updatedAt: doc.updatedAt,
  }
}

function summaryState(doc: SessionDoc): SessionSummary['state'] {
  if (doc.job) return 'running'
  if (doc.versions.length > 0) return 'ready'
  // 还没有任何版本：生成失败过，或者新建后还没开始生成
  return doc.lastError ? 'failed' : 'pending'
}

export async function requireSession(
  repo: SessionRepo,
  id: string,
  openid: string,
): Promise<SessionDoc> {
  const doc = await repo.get(id, openid)
  if (!doc) throw new AppError('NOT_FOUND', '对话不存在或已被删除')
  return doc
}

/** 版本号按顺序递增：v1、v2…… */
export function makeVersion(
  existing: Version[],
  sentences: SentencePair[],
  alternatives: Alternative[],
  instruction: string | null,
  now: number,
): Version {
  return {
    vid: `v${existing.length + 1}`,
    instruction,
    en: sentences.map((s) => s.en).join(' '),
    sentences,
    alternatives,
    analysis: null,
    createdAt: now,
  }
}
