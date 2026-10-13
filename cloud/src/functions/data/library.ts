/**
 * Saved items and history: folders, saved sessions and expressions, source tracing, history paging.
 * There aren't many saved items (a small circle of users), so listing, counts, tags and search load
 * everything and filter in the function.
 */
import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import { expressionKey, findOccurrence } from '@shared/expression'
import type {
  ExpressionSource,
  Folder,
  FolderCounts,
  SourceView,
  TagCount,
  Usage,
} from '@shared/types'
import { AppError } from '../../lib/errors'
import { requireExpression, toExpression, toExpressionSummary } from '../../lib/expressions'
import type { ExpressionDoc, FolderDoc, Repos, SessionDoc } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { favoriteFields, requireSession, sessionTitle, toSummary } from '../../lib/sessions'
import { parsePayload } from '../../lib/validate'

export interface LibraryDeps {
  repos: Repos
  now: () => number
}

type LibraryActions =
  | 'listHistory'
  | 'listFolders'
  | 'createFolder'
  | 'renameFolder'
  | 'moveFolder'
  | 'reorderFolders'
  | 'deleteFolder'
  | 'listFavorites'
  | 'listTags'
  | 'organize'
  | 'starSession'
  | 'saveExpression'
  | 'getExpression'
  | 'updateExpression'
  | 'deleteExpression'
  | 'expressionKeys'
  | 'findUsages'

/** Max folders per user */
const MAX_FOLDERS = 200
/** Max sources kept per card; the oldest are dropped beyond that */
const MAX_SOURCES = 30
/** Max sessions scanned for "Also appears in" */
const USAGE_SCAN_SESSIONS = 300
const SCAN_PAGE = 100

const id = z.string().min(1).max(64)
const tabSchema = z.enum(['expression', 'session'])
const folderIdSchema = id.nullable()
/** Folder names are checked in the function so the error can say exactly what's wrong */
const folderName = z
  .string()
  .max(200)
  .transform((raw) => {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name) throw new AppError('BAD_REQUEST', '文件夹名不能为空')
    if (name.length > LIMITS.folderNameMax) {
      throw new AppError('BAD_REQUEST', `文件夹名最多 ${LIMITS.folderNameMax} 个字`)
    }
    return name
  })
const keywordSchema = z
  .string()
  .trim()
  .max(50)
  .transform((s) => s || undefined)

/** Tags: strip # and extra spaces, dedupe; error if a tag is too long or there are too many */
function normalizeTags(raw: string[]): string[] {
  const tags: string[] = []
  for (const t of raw) {
    const tag = t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
    if (!tag) continue
    if (tag.length > LIMITS.tagMax) {
      throw new AppError('BAD_REQUEST', `标签最多 ${LIMITS.tagMax} 个字`)
    }
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (tags.length > LIMITS.tagsPerItem) {
    throw new AppError('BAD_REQUEST', `每个收藏最多 ${LIMITS.tagsPerItem} 个标签`)
  }
  return tags
}

/** Text field: trim surrounding whitespace, truncate if too long */
const clip = (max: number) =>
  z
    .string()
    .trim()
    .transform((s) => s.slice(0, max))

function toFolder(doc: FolderDoc): Folder {
  return {
    id: doc._id,
    name: doc.name,
    parentId: doc.parentId,
    depth: doc.depth,
    order: doc.order,
    createdAt: doc.createdAt,
  }
}

/** A folder and all folders beneath it */
function subtree(folders: FolderDoc[], rootId: string): FolderDoc[] {
  const out: FolderDoc[] = []
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const doc = folders.find((f) => f._id === current)
    if (!doc) continue
    out.push(doc)
    for (const child of folders) if (child.parentId === current) queue.push(child._id)
  }
  return out
}

/** Append a number when the name is taken: Work -> Work 2 -> Work 3 */
function freeName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`
    const candidate = name.slice(0, LIMITS.folderNameMax - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
}

const contains = (keyword: string, ...texts: string[]) => {
  const k = keyword.toLowerCase()
  return texts.some((t) => t.toLowerCase().includes(k))
}

export function createLibraryHandlers(deps: LibraryDeps): Pick<Handlers<'data'>, LibraryActions> {
  const { sessions, folders, expressions } = deps.repos

  async function requireFolder(openid: string, folderId: string) {
    const all = await folders.list(openid)
    const folder = all.find((f) => f._id === folderId)
    if (!folder) throw new AppError('NOT_FOUND', '文件夹不存在或已被删除')
    return { all, folder }
  }

  /** The target folder must exist; null means unfiled */
  async function checkTarget(openid: string, folderId: string | null | undefined) {
    if (folderId) await requireFolder(openid, folderId)
  }

  function assertUniqueName(
    all: FolderDoc[],
    parentId: string | null,
    name: string,
    self?: string,
  ) {
    if (all.some((f) => f.parentId === parentId && f.name === name && f._id !== self)) {
      throw new AppError('BAD_REQUEST', `这一层已经有叫「${name}」的文件夹了`)
    }
  }

  const nextOrder = (all: FolderDoc[], parentId: string | null) =>
    Math.max(-1, ...all.filter((f) => f.parentId === parentId).map((f) => f.order)) + 1

  /** Treat a saved item as unfiled when its folder was deleted but it still points there */
  function inFolder(itemFolder: string | null, folderId: string | null, existing: Set<string>) {
    const effective = itemFolder && existing.has(itemFolder) ? itemFolder : null
    return effective === folderId
  }

  function countTags(items: { tags: string[] }[]): TagCount[] {
    const counts = new Map<string, number>()
    for (const item of items) for (const t of item.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  /**
   * The source sentence: use the given index if valid, otherwise the first sentence in this version
   * containing the expression
   */
  function locateSentence(doc: SessionDoc, vid: string, index: number, text: string) {
    const version = doc.versions.find((v) => v.vid === vid)
    if (!version) throw new AppError('BAD_REQUEST', '找不到这个版本')
    let sentenceIndex = index >= 0 && index < version.sentences.length ? index : -1
    if (sentenceIndex < 0) {
      sentenceIndex = version.sentences.findIndex((s) => findOccurrence(s.en, text) !== null)
    }
    return { sentenceIndex, sentence: version.sentences[sentenceIndex]?.en ?? '' }
  }

  const sameSource = (a: ExpressionSource, b: ExpressionSource) =>
    a.sessionId === b.sessionId && a.vid === b.vid && a.sentenceIndex === b.sentenceIndex

  return {
    async listHistory(payload, ctx) {
      const { keyword, offset } = parsePayload(
        z.object({
          keyword: keywordSchema.optional(),
          offset: z.number().int().min(0).max(10_000).optional(),
        }),
        payload,
      )
      const limit = LIMITS.historyPage
      // Fetch one extra to tell whether there's another page
      const docs = await sessions.listPage(ctx.openid, {
        offset: offset ?? 0,
        limit: limit + 1,
        keyword,
      })
      return { items: docs.slice(0, limit).map(toSummary), hasMore: docs.length > limit }
    },

    // --- Folders -------------------------------------------------------------

    async listFolders(_payload, ctx) {
      const [all, exprs, starred] = await Promise.all([
        folders.list(ctx.openid),
        expressions.listMeta(ctx.openid),
        sessions.listStarredMeta(ctx.openid),
      ])
      const existing = new Set(all.map((f) => f._id))
      const count = (items: { folderId: string | null }[]) => {
        const out: Record<string, number> = {}
        for (const item of items) {
          const key = item.folderId && existing.has(item.folderId) ? item.folderId : ''
          out[key] = (out[key] ?? 0) + 1
        }
        return out
      }
      const counts: FolderCounts = {
        expression: count(exprs),
        session: count(starred.map((s) => favoriteFields(s))),
      }
      return { folders: all.map(toFolder), counts }
    },

    async createFolder(payload, ctx) {
      const { name, parentId } = parsePayload(
        z.object({ name: folderName, parentId: folderIdSchema }),
        payload,
      )
      const all = await folders.list(ctx.openid)
      if (all.length >= MAX_FOLDERS) {
        throw new AppError('BAD_REQUEST', `最多建 ${MAX_FOLDERS} 个文件夹`)
      }
      let depth = 1
      if (parentId) {
        const parent = all.find((f) => f._id === parentId)
        if (!parent) throw new AppError('NOT_FOUND', '上一级文件夹不存在或已被删除')
        if (parent.depth >= LIMITS.folderDepth) {
          throw new AppError('BAD_REQUEST', `文件夹最多 ${LIMITS.folderDepth} 级`)
        }
        depth = parent.depth + 1
      }
      assertUniqueName(all, parentId, name)
      const doc: Omit<FolderDoc, '_id'> = {
        _openid: ctx.openid,
        name,
        parentId,
        depth,
        order: nextOrder(all, parentId),
        createdAt: deps.now(),
      }
      const folderId = await folders.create(doc)
      return { folder: toFolder({ ...doc, _id: folderId }) }
    },

    async renameFolder(payload, ctx) {
      const { folderId, name } = parsePayload(z.object({ folderId: id, name: folderName }), payload)
      const { all, folder } = await requireFolder(ctx.openid, folderId)
      assertUniqueName(all, folder.parentId, name, folderId)
      await folders.update(folderId, ctx.openid, { name })
      return { folder: toFolder({ ...folder, name }) }
    },

    async moveFolder(payload, ctx) {
      const { folderId, parentId } = parsePayload(
        z.object({ folderId: id, parentId: folderIdSchema }),
        payload,
      )
      const { all, folder } = await requireFolder(ctx.openid, folderId)
      if (folder.parentId === parentId) return {}
      const tree = subtree(all, folderId)
      let parentDepth = 0
      if (parentId) {
        if (tree.some((f) => f._id === parentId)) {
          throw new AppError('BAD_REQUEST', '不能移到它自己或它下面的文件夹里')
        }
        const parent = all.find((f) => f._id === parentId)
        if (!parent) throw new AppError('NOT_FOUND', '目标文件夹不存在或已被删除')
        parentDepth = parent.depth
      }
      const delta = parentDepth + 1 - folder.depth
      const deepest = Math.max(...tree.map((f) => f.depth))
      if (deepest + delta > LIMITS.folderDepth) {
        throw new AppError('BAD_REQUEST', `移过去会超过 ${LIMITS.folderDepth} 级`)
      }
      assertUniqueName(all, parentId, folder.name, folderId)
      await folders.update(folderId, ctx.openid, {
        parentId,
        depth: folder.depth + delta,
        order: nextOrder(all, parentId),
      })
      if (delta !== 0) {
        for (const f of tree) {
          if (f._id !== folderId)
            await folders.update(f._id, ctx.openid, { depth: f.depth + delta })
        }
      }
      return {}
    },

    async reorderFolders(payload, ctx) {
      const { parentId, ids } = parsePayload(
        z.object({ parentId: folderIdSchema, ids: z.array(id).max(MAX_FOLDERS) }),
        payload,
      )
      const all = await folders.list(ctx.openid)
      const siblings = all.filter((f) => f.parentId === parentId)
      const same =
        ids.length === siblings.length &&
        new Set(ids).size === ids.length &&
        siblings.every((f) => ids.includes(f._id))
      if (!same) throw new AppError('BAD_REQUEST', '文件夹有变化，请刷新后再排序')
      for (const [order, folderId] of ids.entries()) {
        const doc = siblings.find((f) => f._id === folderId)!
        if (doc.order !== order) await folders.update(folderId, ctx.openid, { order })
      }
      return {}
    },

    async deleteFolder(payload, ctx) {
      const { folderId, mode } = parsePayload(
        z.object({ folderId: id, mode: z.enum(['moveUp', 'deleteAll']) }),
        payload,
      )
      const { all, folder } = await requireFolder(ctx.openid, folderId)
      if (mode === 'moveUp') {
        // Move subfolders and saved items up one level. The whole subtree moves up a level,
        // so depth can only decrease
        const parentId = folder.parentId
        let order = nextOrder(all, parentId)
        // If the parent level already has a folder with the same name, rename the moved one to
        // "Name 2" so names stay unique per level
        const taken = new Set(
          all.filter((f) => f.parentId === parentId && f._id !== folderId).map((f) => f.name),
        )
        for (const f of subtree(all, folderId)) {
          if (f._id === folderId) continue
          const isChild = f.parentId === folderId
          const name = isChild ? freeName(taken, f.name) : f.name
          if (isChild) taken.add(name)
          await folders.update(f._id, ctx.openid, {
            depth: f.depth - 1,
            ...(isChild ? { parentId, order: order++ } : {}),
            ...(name !== f.name ? { name } : {}),
          })
        }
        await expressions.updateInFolders(ctx.openid, [folderId], { folderId: parentId })
        await sessions.updateInFolders(ctx.openid, [folderId], { folderId: parentId })
        await folders.remove([folderId], ctx.openid)
        return {}
      }
      // Delete all: expression cards are deleted; sessions are only unsaved and stay in history
      const ids = subtree(all, folderId).map((f) => f._id)
      await expressions.removeInFolders(ctx.openid, ids)
      await sessions.updateInFolders(ctx.openid, ids, { starredAt: null, folderId: null, tags: [] })
      await folders.remove(ids, ctx.openid)
      return {}
    },

    // --- Saved items ---------------------------------------------------------

    async listFavorites(payload, ctx) {
      const { tab, folderId, tag, keyword } = parsePayload(
        z.object({
          tab: tabSchema,
          folderId: folderIdSchema.optional(),
          tag: z.string().trim().max(LIMITS.tagMax).optional(),
          keyword: keywordSchema.optional(),
        }),
        payload,
      )
      const existing = new Set((await folders.list(ctx.openid)).map((f) => f._id))
      // Keyword first, then tag (ignoring folders), otherwise by folder
      const pick = (item: { folderId: string | null; tags: string[] }, texts: string[]) => {
        if (keyword) return contains(keyword, ...texts)
        if (tag) return item.tags.includes(tag)
        return inFolder(item.folderId, folderId ?? null, existing)
      }

      if (tab === 'expression') {
        const all = await expressions.listAll(ctx.openid)
        const items = all.filter((e) => pick(e, [e.text, e.meaning, e.note]))
        return { expressions: items.map(toExpressionSummary), sessions: [] }
      }
      const starred = await sessions.listStarred(ctx.openid)
      const items = starred.filter((s) =>
        pick(favoriteFields(s), [
          sessionTitle(s),
          s.input.rawText,
          s.polishedZh,
          ...s.versions.map((v) => v.en),
        ]),
      )
      return { expressions: [], sessions: items.map(toSummary) }
    },

    async listTags(payload, ctx) {
      const { tab } = parsePayload(z.object({ tab: tabSchema }), payload)
      if (tab === 'expression') return { tags: countTags(await expressions.listMeta(ctx.openid)) }
      const starred = await sessions.listStarredMeta(ctx.openid)
      return { tags: countTags(starred.map((s) => favoriteFields(s))) }
    },

    async organize(payload, ctx) {
      const input = parsePayload(
        z.object({
          tab: tabSchema,
          id,
          folderId: folderIdSchema.optional(),
          tags: z.array(z.string().max(50)).max(50).optional(),
        }),
        payload,
      )
      await checkTarget(ctx.openid, input.folderId)
      const tags = input.tags ? normalizeTags(input.tags) : undefined
      const patch = {
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(tags ? { tags } : {}),
      }
      if (input.tab === 'expression') {
        await requireExpression(expressions, input.id, ctx.openid)
        await expressions.update(input.id, ctx.openid, { ...patch, updatedAt: deps.now() })
        return {}
      }
      const doc = await requireSession(sessions, input.id, ctx.openid)
      const fields = favoriteFields(doc)
      // A session that isn't saved yet gets saved when it's moved or tagged
      await sessions.update(input.id, ctx.openid, {
        ...(fields.starredAt === null ? { folderId: null, tags: [] } : {}),
        ...patch,
        starredAt: fields.starredAt ?? deps.now(),
      })
      return {}
    },

    async starSession(payload, ctx) {
      const { sessionId, star } = parsePayload(
        z.object({ sessionId: id, star: z.boolean() }),
        payload,
      )
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      const fields = favoriteFields(doc)
      // Unsaving also clears folder and tags; saving again keeps the existing folder and tags
      const next = star
        ? { ...fields, starredAt: fields.starredAt ?? deps.now() }
        : { starredAt: null, folderId: null, tags: [] }
      // Saving isn't a content update; leave updatedAt alone
      await sessions.update(sessionId, ctx.openid, next)
      return next
    },

    // --- Expressions ---------------------------------------------------------

    async saveExpression(payload, ctx) {
      const input = parsePayload(
        z.object({
          text: z.string().trim().min(1).max(LIMITS.expressionMax),
          kind: z.enum(['phrase', 'slang', 'word']),
          meaning: clip(200).optional(),
          usage: clip(200).optional(),
          example: clip(200).optional(),
          source: z.object({
            sessionId: id,
            vid: id,
            sentenceIndex: z.number().int().min(-1).max(100),
            from: z.enum(['analysis', 'sentence', 'report']),
          }),
        }),
        payload,
      )
      const key = expressionKey(input.text)
      if (!key) throw new AppError('BAD_REQUEST', '要收藏的内容不能为空')
      const session = await requireSession(sessions, input.source.sessionId, ctx.openid)
      const now = deps.now()
      const source: ExpressionSource = {
        sessionId: input.source.sessionId,
        vid: input.source.vid,
        ...locateSentence(session, input.source.vid, input.source.sentenceIndex, input.text),
        from: input.source.from,
        savedAt: now,
      }
      // Saved from the analysis with a meaning: ready right away; saved from a sentence or the
      // report: wait for the LLM to fill it in
      const provided = input.meaning
        ? { meaning: input.meaning, usage: input.usage ?? '', example: input.example ?? '' }
        : null

      const existing = await expressions.findByKey(ctx.openid, key)
      if (existing) {
        const sources = existing.sources.some((s) => sameSource(s, source))
          ? existing.sources
          : [...existing.sources, source].slice(-MAX_SOURCES)
        const patch = {
          sources,
          savedAt: now,
          updatedAt: now,
          ...(existing.fill !== 'ready' && provided
            ? { ...provided, fill: 'ready' as const, fillStartedAt: null }
            : {}),
        }
        await expressions.update(existing._id, ctx.openid, patch)
        return { expression: toExpression({ ...existing, ...patch }), created: false }
      }

      const doc: Omit<ExpressionDoc, '_id'> = {
        _openid: ctx.openid,
        text: input.text.replace(/\s+/g, ' '),
        key,
        kind: input.kind,
        meaning: provided?.meaning ?? '',
        usage: provided?.usage ?? '',
        example: provided?.example ?? '',
        note: '',
        fill: provided ? 'ready' : 'pending',
        fillStartedAt: null,
        folderId: null,
        tags: [],
        sources: [source],
        createdAt: now,
        savedAt: now,
        updatedAt: now,
      }
      const expressionId = await expressions.create(doc)
      return { expression: toExpression({ ...doc, _id: expressionId }), created: true }
    },

    async getExpression(payload, ctx) {
      const { expressionId } = parsePayload(z.object({ expressionId: id }), payload)
      const doc = await requireExpression(expressions, expressionId, ctx.openid)
      const ids = [...new Set(doc.sources.map((s) => s.sessionId))]
      const found = await sessions.listTitles(ctx.openid, ids)
      const titles = new Map(found.map((d) => [d._id, sessionTitle(d)]))
      // Most recently saved sources first
      const sources: SourceView[] = [...doc.sources]
        .reverse()
        .map((s) => ({ ...s, sessionTitle: titles.get(s.sessionId) ?? null }))
      return { expression: toExpression(doc), sources }
    },

    async updateExpression(payload, ctx) {
      const { expressionId, note } = parsePayload(
        z.object({ expressionId: id, note: z.string().trim().max(LIMITS.noteMax) }),
        payload,
      )
      const doc = await requireExpression(expressions, expressionId, ctx.openid)
      await expressions.update(expressionId, ctx.openid, { note, updatedAt: deps.now() })
      return { expression: toExpression({ ...doc, note }) }
    },

    async deleteExpression(payload, ctx) {
      const { expressionId } = parsePayload(z.object({ expressionId: id }), payload)
      await requireExpression(expressions, expressionId, ctx.openid)
      await expressions.remove(expressionId, ctx.openid)
      return {}
    },

    async expressionKeys(_payload, ctx) {
      const all = await expressions.listMeta(ctx.openid)
      return { keys: Object.fromEntries(all.map((e) => [e.key, e._id])) }
    },

    async findUsages(payload, ctx) {
      const { expressionId } = parsePayload(z.object({ expressionId: id }), payload)
      const doc = await requireExpression(expressions, expressionId, ctx.openid)
      // Skip sentences already under "Saved from"; list a sentence repeated within a session
      // (common across versions) only once
      const seen = new Set(doc.sources.map((s) => `${s.sessionId}\n${s.sentence}`))
      const usages: Usage[] = []
      for (let offset = 0; offset < USAGE_SCAN_SESSIONS; offset += SCAN_PAGE) {
        const page = await sessions.listPage(ctx.openid, { offset, limit: SCAN_PAGE })
        for (const s of page) {
          // Newer versions first
          for (const v of [...s.versions].reverse()) {
            for (const [i, sentence] of v.sentences.entries()) {
              const k = `${s._id}\n${sentence.en}`
              if (seen.has(k) || !findOccurrence(sentence.en, doc.text)) continue
              seen.add(k)
              usages.push({
                sessionId: s._id,
                sessionTitle: sessionTitle(s),
                vid: v.vid,
                sentenceIndex: i,
                sentence: sentence.en,
                updatedAt: s.updatedAt,
              })
              if (usages.length >= LIMITS.usagesMax) return { usages }
            }
          }
        }
        if (page.length < SCAN_PAGE) break
      }
      return { usages }
    },
  }
}
