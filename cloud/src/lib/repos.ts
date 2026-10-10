import type {
  Accent,
  EnglishLevel,
  InputMode,
  Job,
  JobError,
  LlmPresetId,
  Version,
} from '@shared/types'

/** 数据库里的对话文档 */
export interface SessionDoc {
  _id: string
  _openid: string
  title: string
  input: { mode: InputMode; rawText: string }
  polishedZh: string
  versions: Version[]
  currentVid: string | null
  job: Job | null
  lastError: JobError | null
  /** M3 收藏用 */
  folderId: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type SessionPatch = Partial<Omit<SessionDoc, '_id' | '_openid' | 'createdAt'>>

/** 加密后保存的大模型配置 */
export interface LlmStored {
  preset: LlmPresetId
  baseUrl: string
  model: string
  apiKeyCipher: string
  apiKeyMask: string
  updatedAt: number
}

/** _id 为用户 openid；管理员的全局默认配置 _id 为 GLOBAL_SETTINGS_ID */
export interface SettingsDoc {
  _id: string
  level?: EnglishLevel
  accent?: Accent
  llm?: LlmStored | null
  updatedAt: number
}

export const GLOBAL_SETTINGS_ID = '__global__'

export interface SessionRepo {
  create(doc: Omit<SessionDoc, '_id'>): Promise<string>
  get(id: string, openid: string): Promise<SessionDoc | null>
  /** 没有任务、或已有任务早于 staleBefore 开始（视为中断）时加锁成功 */
  acquireJob(id: string, openid: string, job: Job, staleBefore: number): Promise<boolean>
  /** 只有锁仍属于 startedAt 这次任务时才写入；返回是否写入成功 */
  updateIfJob(id: string, openid: string, startedAt: number, patch: SessionPatch): Promise<boolean>
  update(id: string, openid: string, patch: SessionPatch): Promise<boolean>
  listRecent(openid: string, limit: number): Promise<SessionDoc[]>
}

export interface SettingsRepo {
  get(id: string): Promise<SettingsDoc | null>
  /** 合并更新；文档不存在时创建 */
  upsert(id: string, patch: Partial<Omit<SettingsDoc, '_id'>>): Promise<void>
}

export interface Repos {
  sessions: SessionRepo
  settings: SettingsRepo
}

// ---------------------------------------------------------------------------
// 云数据库实现。只声明用到的接口，返回值统一按 Promise 处理。

interface WxUpdateResult {
  stats: { updated: number }
}

interface WxQuery {
  where(condition: object): WxQuery
  orderBy(field: string, order: 'asc' | 'desc'): WxQuery
  limit(n: number): WxQuery
  get(): Promise<{ data: unknown[] }>
  update(options: { data: object }): Promise<WxUpdateResult>
}

interface WxCollection extends WxQuery {
  add(options: { data: object }): Promise<{ _id: string }>
  doc(id: string): {
    update(options: { data: object }): Promise<WxUpdateResult>
    set(options: { data: object }): Promise<unknown>
  }
}

interface WxCommand {
  set(value: unknown): unknown
  eq(value: unknown): unknown
  lt(value: number): unknown
  and(conditions: object[]): object
  or(conditions: object[]): object
}

export interface WxDatabase {
  command: WxCommand
  collection(name: string): WxCollection
  createCollection(name: string): Promise<unknown>
}

const SESSIONS = 'sessions'
const SETTINGS = 'settings'

function isCollectionMissing(err: unknown): boolean {
  const e = err as { errCode?: number; errMsg?: string; message?: string }
  return (
    e?.errCode === -502005 ||
    /DATABASE_COLLECTION_NOT_EXIST|collection not exist/i.test(
      `${e?.errMsg ?? ''}${e?.message ?? ''}`,
    )
  )
}

/** 首次使用时集合可能还不存在：自动创建后重试一次 */
async function withCollection<T>(db: WxDatabase, name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isCollectionMissing(err)) throw err
    await db.createCollection(name).catch(() => {})
    return run()
  }
}

/**
 * 云数据库的 update 会对嵌套对象做局部合并，这里把对象和数组值包成 _.set()，
 * 保证字段被整体替换，和内存实现的语义一致。
 */
function toUpdateData(_: WxCommand, patch: object): object {
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    data[key] = value !== null && typeof value === 'object' ? _.set(value) : value
  }
  return data
}

export function createWxRepos(db: WxDatabase): Repos {
  const _ = db.command
  const sessions = () => db.collection(SESSIONS)
  const settings = () => db.collection(SETTINGS)

  const sessionRepo: SessionRepo = {
    create: (doc) =>
      withCollection(db, SESSIONS, async () => (await sessions().add({ data: doc }))._id),

    get: (id, openid) =>
      withCollection(db, SESSIONS, async () => {
        const { data } = await sessions().where({ _id: id, _openid: openid }).limit(1).get()
        return (data[0] as SessionDoc | undefined) ?? null
      }),

    acquireJob: (id, openid, job, staleBefore) =>
      withCollection(db, SESSIONS, async () => {
        const res = await sessions()
          .where(
            _.and([
              { _id: id, _openid: openid },
              _.or([{ job: _.eq(null) }, { 'job.startedAt': _.lt(staleBefore) }]),
            ]),
          )
          .update({ data: { job: _.set(job) } })
        return res.stats.updated === 1
      }),

    updateIfJob: (id, openid, startedAt, patch) =>
      withCollection(db, SESSIONS, async () => {
        const res = await sessions()
          .where({ _id: id, _openid: openid, 'job.startedAt': startedAt })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    update: (id, openid, patch) =>
      withCollection(db, SESSIONS, async () => {
        const res = await sessions()
          .where({ _id: id, _openid: openid })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    listRecent: (openid, limit) =>
      withCollection(db, SESSIONS, async () => {
        const { data } = await sessions()
          .where({ _openid: openid })
          .orderBy('updatedAt', 'desc')
          .limit(limit)
          .get()
        return data as SessionDoc[]
      }),
  }

  const settingsRepo: SettingsRepo = {
    get: (id) =>
      withCollection(db, SETTINGS, async () => {
        const { data } = await settings().where({ _id: id }).limit(1).get()
        return (data[0] as SettingsDoc | undefined) ?? null
      }),

    upsert: (id, patch) =>
      withCollection(db, SETTINGS, async () => {
        const res = await settings()
          .where({ _id: id })
          .update({ data: toUpdateData(_, patch) })
        if (res.stats.updated === 0) {
          const existing = await settings().where({ _id: id }).limit(1).get()
          // 内容没变时 updated 也是 0，只有文档确实不存在才新建
          if (existing.data.length === 0) {
            await settings()
              .doc(id)
              .set({ data: { ...patch } })
          }
        }
      }),
  }

  return { sessions: sessionRepo, settings: settingsRepo }
}
