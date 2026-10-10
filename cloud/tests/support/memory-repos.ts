import type { Repos, SessionDoc, SessionPatch, SettingsDoc } from '../../src/lib/repos'

/** 和云数据库实现语义一致的内存版本，供 handler 测试使用 */
export function createMemoryRepos(): Repos & {
  sessionDocs: Map<string, SessionDoc>
  settingsDocs: Map<string, SettingsDoc>
} {
  const sessionDocs = new Map<string, SessionDoc>()
  const settingsDocs = new Map<string, SettingsDoc>()
  let seq = 0

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

  return {
    sessionDocs,
    settingsDocs,
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
        return [...sessionDocs.values()]
          .filter((d) => d._openid === openid)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit)
          .map(clone)
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
