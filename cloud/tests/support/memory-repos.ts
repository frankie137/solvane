import {
  GLOBAL_SETTINGS_ID,
  type AccountDoc,
  type ExpressionDoc,
  type FolderDoc,
  type PracticeDoc,
  type PracticePatch,
  type ShareDoc,
  type Repos,
  type SessionDoc,
  type SessionPatch,
  type SettingsDoc,
} from '../../src/lib/repos'

/** 和云数据库实现语义一致的内存版本，供 handler 测试使用 */
export function createMemoryRepos(): Repos & {
  accountDocs: Map<string, AccountDoc>
  sessionDocs: Map<string, SessionDoc>
  settingsDocs: Map<string, SettingsDoc>
  practiceDocs: Map<string, PracticeDoc>
  folderDocs: Map<string, FolderDoc>
  expressionDocs: Map<string, ExpressionDoc>
  shareDocs: Map<string, ShareDoc>
} {
  const accountDocs = new Map<string, AccountDoc>()
  const sessionDocs = new Map<string, SessionDoc>()
  const settingsDocs = new Map<string, SettingsDoc>()
  const practiceDocs = new Map<string, PracticeDoc>()
  const folderDocs = new Map<string, FolderDoc>()
  const expressionDocs = new Map<string, ExpressionDoc>()
  const shareDocs = new Map<string, ShareDoc>()
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
    accountDocs,
    accounts: {
      async get(id) {
        const doc = accountDocs.get(id)
        return doc ? clone(doc) : null
      },
      async create(doc) {
        if (!accountDocs.has(doc._id)) accountDocs.set(doc._id, clone(doc))
      },
      async consume(id, limit, now) {
        const doc = accountDocs.get(id)
        if (!doc || doc.freeUsed >= limit) return false
        doc.freeUsed += 1
        doc.updatedAt = now
        return true
      },
      async refund(id, now) {
        const doc = accountDocs.get(id)
        if (!doc || doc.freeUsed <= 0) return
        doc.freeUsed -= 1
        doc.updatedAt = now
      },
      async setProUntil(id, expected, grant) {
        const doc = accountDocs.get(id)
        if (!doc || doc.proUntil !== expected) return false
        doc.proUntil = grant.until
        doc.grants.push(clone(grant))
        doc.updatedAt = grant.at
        return true
      },
      async list(limit) {
        return [...accountDocs.values()]
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, limit)
          .map(clone)
      },
    },
    sessionDocs,
    settingsDocs,
    practiceDocs,
    folderDocs,
    expressionDocs,
    shareDocs,
    shares: {
      async create(id, doc) {
        if (shareDocs.has(id)) return false
        shareDocs.set(id, clone({ ...doc, _id: id }))
        return true
      },
      async get(id) {
        const doc = shareDocs.get(id)
        return doc ? clone(doc) : null
      },
      async findByPractice(openid, practiceId) {
        const doc = mine(shareDocs, openid).find((d) => d.practiceId === practiceId)
        return doc ? clone(doc) : null
      },
      async listByOwner(openid, limit) {
        return mine(shareDocs, openid)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
          .map(clone)
      },
      async remove(id, openid) {
        if (shareDocs.get(id)?._openid === openid) shareDocs.delete(id)
      },
    },
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
      async listMeta(openid) {
        return mine(expressionDocs, openid).map((d) => ({
          _id: d._id,
          key: d.key,
          folderId: d.folderId,
          tags: clone(d.tags),
        }))
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
      async update(id, openid, patch) {
        const doc = ownPractice(id, openid)
        if (!doc) return false
        applyPractice(doc, patch)
        return true
      },
      async findBySource(openid, fileID) {
        const doc = [...practiceDocs.values()].find(
          (d) => d._openid === openid && d.sourceFileID === fileID,
        )
        return doc ? clone(doc) : null
      },
      async requestScore(id, openid, freeCharged) {
        const doc = ownPractice(id, openid)
        if (!doc || doc.scoreRequested !== false) return false
        doc.scoreRequested = true
        doc.freeCharged = freeCharged
        return true
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
      async listStarredMeta(openid) {
        return mine(sessionDocs, openid)
          .filter((d) => d.starredAt !== null && d.starredAt !== undefined)
          .map((d) => ({
            _id: d._id,
            starredAt: d.starredAt,
            folderId: d.folderId,
            tags: clone(d.tags),
          }))
      },
      async listTitles(openid, ids) {
        return mine(sessionDocs, openid)
          .filter((d) => ids.includes(d._id))
          .map((d) => ({ _id: d._id, title: d.title, input: clone(d.input) }))
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
      async listProfiles(ids) {
        return ids
          .map((id) => settingsDocs.get(id))
          .filter((d): d is SettingsDoc => !!d)
          .map((d) => ({ _id: d._id, profile: clone(d.profile) }))
      },
      async clearMemberLlm() {
        for (const doc of settingsDocs.values()) {
          if (doc._id !== GLOBAL_SETTINGS_ID && doc.llm) doc.llm = null
        }
      },
    },
  }
}
