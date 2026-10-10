import type {
  ExpressionDoc,
  FolderDoc,
  PracticeDoc,
  PracticePatch,
  Repos,
  SessionDoc,
  SessionPatch,
  SettingsDoc,
} from '../../src/lib/repos'

/** 和云数据库实现语义一致的内存版本，供 handler 测试使用 */
export function createMemoryRepos(): Repos & {
  sessionDocs: Map<string, SessionDoc>
  settingsDocs: Map<string, SettingsDoc>
  practiceDocs: Map<string, PracticeDoc>
  folderDocs: Map<string, FolderDoc>
  expressionDocs: Map<string, ExpressionDoc>
} {
  const sessionDocs = new Map<string, SessionDoc>()
  const settingsDocs = new Map<string, SettingsDoc>()
  const practiceDocs = new Map<string, PracticeDoc>()
  const folderDocs = new Map<string, FolderDoc>()
  const expressionDocs = new Map<string, ExpressionDoc>()
  let seq = 0

  /** 和云数据库一样不返回示范朗读缓存 */
  const withoutTts = (doc: SessionDoc): SessionDoc => {
    const { tts: _tts, ...rest } = clone(doc)
    return rest as SessionDoc
  }
  const patchDoc = <T extends object>(doc: T, patch: object) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (doc as unknown as Record<string, unknown>)[k] = clone(v)
    }
  }
  const mine = <T extends { _openid: string }>(map: Map<string, T>, openid: string) =>
    [...map.values()].filter((d) => d._openid === openid)

  const clone = <T>(v: T): T => structuredClone(v)
  const own = (id: string, openid: string) => {
    const doc = sessionDocs.get(id)
    return doc && doc._openid === openid ? doc : null
  }
  const apply = (doc: SessionDoc, patch: SessionPatch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (doc as unknown as Record<string, unknown>)[k] = clone(v)
    }
  }

  const ownPractice = (id: string, openid: string) => {
    const doc = practiceDocs.get(id)
    return doc && doc._openid === openid ? doc : null
  }
  const applyPractice = (doc: PracticeDoc, patch: PracticePatch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (doc as unknown as Record<string, unknown>)[k] = clone(v)
    }
  }

  return {
    sessionDocs,
    settingsDocs,
    practiceDocs,
    folderDocs,
    expressionDocs,
    folders: {
      async list(openid) {
        return mine(folderDocs, openid)
          .sort((a, b) => a.order - b.order)
          .map(clone)
      },
      async create(doc) {
        const _id = `f${++seq}`
        folderDocs.set(_id, clone({ ...doc, _id }))
        return _id
      },
      async update(id, openid, patch) {
        const doc = folderDocs.get(id)
        if (!doc || doc._openid !== openid) return false
        patchDoc(doc, patch)
        return true
      },
      async remove(ids, openid) {
        for (const id of ids) if (folderDocs.get(id)?._openid === openid) folderDocs.delete(id)
      },
    },
    expressions: {
      async create(doc) {
        const _id = `e${++seq}`
        expressionDocs.set(_id, clone({ ...doc, _id }))
        return _id
      },
      async get(id, openid) {
        const doc = expressionDocs.get(id)
        return doc && doc._openid === openid ? clone(doc) : null
      },
      async findByKey(openid, key) {
        const doc = mine(expressionDocs, openid).find((d) => d.key === key)
        return doc ? clone(doc) : null
      },
      async listAll(openid) {
        return mine(expressionDocs, openid)
          .sort((a, b) => b.savedAt - a.savedAt)
          .map(clone)
      },
      async update(id, openid, patch) {
        const doc = expressionDocs.get(id)
        if (!doc || doc._openid !== openid) return false
        patchDoc(doc, patch)
        return true
      },
      async remove(id, openid) {
        if (expressionDocs.get(id)?._openid === openid) expressionDocs.delete(id)
      },
      async updateInFolders(openid, folderIds, patch) {
        for (const doc of mine(expressionDocs, openid)) {
          if (doc.folderId && folderIds.includes(doc.folderId)) patchDoc(doc, patch)
        }
      },
      async removeInFolders(openid, folderIds) {
        for (const doc of mine(expressionDocs, openid)) {
          if (doc.folderId && folderIds.includes(doc.folderId)) expressionDocs.delete(doc._id)
        }
      },
      async acquireFill(id, openid, startedAt, staleBefore) {
        const doc = expressionDocs.get(id)
        if (!doc || doc._openid !== openid || doc.fill === 'ready') return false
        if (doc.fillStartedAt !== null && doc.fillStartedAt >= staleBefore) return false
        doc.fillStartedAt = startedAt
        return true
      },
      async updateIfFill(id, openid, startedAt, patch) {
        const doc = expressionDocs.get(id)
        if (!doc || doc._openid !== openid || doc.fillStartedAt !== startedAt) return false
        patchDoc(doc, patch)
        return true
      },
    },
    practices: {
      async create(doc) {
        const _id = `p${++seq}`
        practiceDocs.set(_id, clone({ ...doc, _id }))
        return _id
      },
      async get(id, openid) {
        const doc = ownPractice(id, openid)
        return doc ? clone(doc) : null
      },
      async acquireJob(id, openid, job, staleBefore) {
        const doc = ownPractice(id, openid)
        if (!doc) return false
        if (doc.job && doc.job.startedAt >= staleBefore) return false
        doc.job = clone(job)
        return true
      },
      async updateIfJob(id, openid, startedAt, patch) {
        const doc = ownPractice(id, openid)
        if (!doc || doc.job?.startedAt !== startedAt) return false
        applyPractice(doc, patch)
        return true
      },
      async listBySession(openid, sessionId, limit) {
        return [...practiceDocs.values()]
          .filter((d) => d._openid === openid && d.sessionId === sessionId)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
          .map(clone)
      },
      async remove(id, openid) {
        if (ownPractice(id, openid)) practiceDocs.delete(id)
      },
    },
    sessions: {
      async create(doc) {
        const _id = `s${++seq}`
        sessionDocs.set(_id, clone({ ...doc, _id }))
        return _id
      },
      async get(id, openid) {
        const doc = own(id, openid)
        return doc ? clone(doc) : null
      },
      async acquireJob(id, openid, job, staleBefore) {
        const doc = own(id, openid)
        if (!doc) return false
        if (doc.job && doc.job.startedAt >= staleBefore) return false
        doc.job = clone(job)
        return true
      },
      async updateIfJob(id, openid, startedAt, patch) {
        const doc = own(id, openid)
        if (!doc || doc.job?.startedAt !== startedAt) return false
        apply(doc, patch)
        return true
      },
      async update(id, openid, patch) {
        const doc = own(id, openid)
        if (!doc) return false
        apply(doc, patch)
        return true
      },
      async listRecent(openid, limit) {
        return mine(sessionDocs, openid)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit)
          .map(withoutTts)
      },
      async listPage(openid, { offset, limit, keyword }) {
        const k = keyword?.toLowerCase()
        const hit = (d: SessionDoc) =>
          !k ||
          [d.title, d.input.rawText, d.polishedZh, ...d.versions.map((v) => v.en)].some((t) =>
            t.toLowerCase().includes(k),
          )
        return mine(sessionDocs, openid)
          .filter(hit)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(offset, offset + limit)
          .map(withoutTts)
      },
      async listStarred(openid) {
        return mine(sessionDocs, openid)
          .filter((d) => d.starredAt !== null && d.starredAt !== undefined)
          .sort((a, b) => (b.starredAt ?? 0) - (a.starredAt ?? 0))
          .map(withoutTts)
      },
      async updateInFolders(openid, folderIds, patch) {
        for (const doc of mine(sessionDocs, openid)) {
          if (doc.folderId && folderIds.includes(doc.folderId)) apply(doc, patch)
        }
      },
    },
    settings: {
      async get(id) {
        const doc = settingsDocs.get(id)
        return doc ? clone(doc) : null
      },
      async upsert(id, patch) {
        const doc = settingsDocs.get(id) ?? { _id: id, updatedAt: 0 }
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) (doc as unknown as Record<string, unknown>)[k] = clone(v)
        }
        settingsDocs.set(id, doc)
      },
    },
  }
}
