import type {
  Accent,
  EnglishLevel,
  ExpressionFill,
  ExpressionKind,
  ExpressionSource,
  InputMode,
  Job,
  JobError,
  LlmPresetId,
  Practice,
  PracticeError,
  PracticeJob,
  PracticeStage,
  TimedText,
  TtsSpeed,
  TtsVoice,
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
  /** 收藏：收藏时间（没收藏为 null，旧数据没有这个字段）、文件夹、标签 */
  starredAt?: number | null
  folderId: string | null
  tags: string[]
  /** 示范朗读缓存（只在服务端使用，不发给前端）：版本号 → 音色语速 → 每句 */
  tts?: Record<string, TtsCache>
  createdAt: number
  updatedAt: number
}

/** 数据库里的练习记录 */
export interface PracticeDoc {
  _id: string
  _openid: string
  sessionId: string
  vid: string
  stage: PracticeStage
  job: PracticeJob | null
  lastError: PracticeError | null
  /** 原始 PCM 录音，评测完成后删除 */
  pcmFileID: string | null
  /** 转换后的 WAV，用于回放 */
  wavFileID: string | null
  durationMs: number
  transcript: Practice['transcript']
  alignment: Practice['alignment']
  pronunciation: Practice['pronunciation']
  report: Practice['report']
  createdAt: number
  updatedAt: number
}

export interface FolderDoc {
  _id: string
  _openid: string
  name: string
  parentId: string | null
  depth: number
  order: number
  createdAt: number
}

export interface ExpressionDoc {
  _id: string
  _openid: string
  text: string
  /** 合并键，见 shared/expression.ts 的 expressionKey */
  key: string
  kind: ExpressionKind
  meaning: string
  usage: string
  example: string
  note: string
  fill: ExpressionFill
  /** 补全任务的开始时间，用作锁；没有任务时为 null */
  fillStartedAt: number | null
  folderId: string | null
  tags: string[]
  sources: ExpressionSource[]
  createdAt: number
  savedAt: number
  updatedAt: number
}

export type SessionMeta = Pick<SessionDoc, '_id' | 'starredAt' | 'folderId' | 'tags'>
export type SessionTitle = Pick<SessionDoc, '_id' | 'title' | 'input'>
export type ExpressionMeta = Pick<ExpressionDoc, '_id' | 'key' | 'folderId' | 'tags'>

export type FolderPatch = Partial<Omit<FolderDoc, '_id' | '_openid' | 'createdAt'>>
export type ExpressionPatch = Partial<Omit<ExpressionDoc, '_id' | '_openid' | 'createdAt'>>

export type PracticePatch = Partial<
  Omit<PracticeDoc, '_id' | '_openid' | 'sessionId' | 'createdAt'>
>

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
  ttsVoice?: TtsVoice
  ttsSpeed?: TtsSpeed
  llm?: LlmStored | null
  updatedAt: number
}

/** 一句示范朗读的缓存：云存储文件 + 逐词时间 */
export interface TtsCachedSentence {
  fileID: string
  words: TimedText[]
}

/** 版本上的示范朗读缓存，键为「音色-语速」 */
export type TtsCache = Record<string, TtsCachedSentence[]>

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
  /** 按更新时间倒序分页；有关键词时在标题、原文、润色中文和所有版本的英文里查找 */
  listPage(
    openid: string,
    options: { offset: number; limit: number; keyword?: string },
  ): Promise<SessionDoc[]>
  /** 已收藏的对话 */
  listStarred(openid: string): Promise<SessionDoc[]>
  /** 已收藏对话的收藏字段（计数、标签用，不取内容） */
  listStarredMeta(openid: string): Promise<SessionMeta[]>
  /** 这些对话的标题（溯源显示用，不取内容） */
  listTitles(openid: string, ids: string[]): Promise<SessionTitle[]>
  /** 把这些文件夹里的已收藏对话一起改掉（删除文件夹时用） */
  updateInFolders(openid: string, folderIds: string[], patch: SessionPatch): Promise<void>
}

export interface FolderRepo {
  list(openid: string): Promise<FolderDoc[]>
  create(doc: Omit<FolderDoc, '_id'>): Promise<string>
  update(id: string, openid: string, patch: FolderPatch): Promise<boolean>
  remove(ids: string[], openid: string): Promise<void>
}

export interface ExpressionRepo {
  create(doc: Omit<ExpressionDoc, '_id'>): Promise<string>
  get(id: string, openid: string): Promise<ExpressionDoc | null>
  findByKey(openid: string, key: string): Promise<ExpressionDoc | null>
  /** 全部表达，按最近收藏时间倒序（收藏量不大，筛选在函数里做） */
  listAll(openid: string): Promise<ExpressionDoc[]>
  /** 全部表达的合并键、文件夹和标签（计数、标签、已收藏标记用） */
  listMeta(openid: string): Promise<ExpressionMeta[]>
  update(id: string, openid: string, patch: ExpressionPatch): Promise<boolean>
  remove(id: string, openid: string): Promise<void>
  updateInFolders(openid: string, folderIds: string[], patch: ExpressionPatch): Promise<void>
  removeInFolders(openid: string, folderIds: string[]): Promise<void>
  /** 补全锁：还没就绪、且没有任务或任务早于 staleBefore 开始时加锁成功 */
  acquireFill(id: string, openid: string, startedAt: number, staleBefore: number): Promise<boolean>
  /** 只有锁仍属于 startedAt 这次任务时才写入 */
  updateIfFill(
    id: string,
    openid: string,
    startedAt: number,
    patch: ExpressionPatch,
  ): Promise<boolean>
}

export interface SettingsRepo {
  get(id: string): Promise<SettingsDoc | null>
  /** 合并更新；文档不存在时创建 */
  upsert(id: string, patch: Partial<Omit<SettingsDoc, '_id'>>): Promise<void>
}

export interface PracticeRepo {
  create(doc: Omit<PracticeDoc, '_id'>): Promise<string>
  get(id: string, openid: string): Promise<PracticeDoc | null>
  acquireJob(id: string, openid: string, job: PracticeJob, staleBefore: number): Promise<boolean>
  updateIfJob(id: string, openid: string, startedAt: number, patch: PracticePatch): Promise<boolean>
  /** 某个对话的练习，按创建时间倒序 */
  listBySession(openid: string, sessionId: string, limit: number): Promise<PracticeDoc[]>
  remove(id: string, openid: string): Promise<void>
}

export interface Repos {
  sessions: SessionRepo
  settings: SettingsRepo
  practices: PracticeRepo
  folders: FolderRepo
  expressions: ExpressionRepo
}

// ---------------------------------------------------------------------------
// 云数据库实现。只声明用到的接口，返回值统一按 Promise 处理。

interface WxUpdateResult {
  stats: { updated: number }
}

interface WxQuery {
  where(condition: object): WxQuery
  orderBy(field: string, order: 'asc' | 'desc'): WxQuery
  skip(n: number): WxQuery
  limit(n: number): WxQuery
  field(projection: Record<string, boolean>): WxQuery
  get(): Promise<{ data: unknown[] }>
  update(options: { data: object }): Promise<WxUpdateResult>
  remove(): Promise<unknown>
}

interface WxCollection extends WxQuery {
  add(options: { data: object }): Promise<{ _id: string }>
  doc(id: string): {
    update(options: { data: object }): Promise<WxUpdateResult>
    set(options: { data: object }): Promise<unknown>
  }
}

interface WxRemovable {
  remove(): Promise<unknown>
}

interface WxCommand {
  set(value: unknown): unknown
  eq(value: unknown): unknown
  neq(value: unknown): unknown
  lt(value: number): unknown
  in(values: unknown[]): unknown
  and(conditions: object[]): object
  or(conditions: object[]): object
}

export interface WxDatabase {
  command: WxCommand
  collection(name: string): WxCollection
  createCollection(name: string): Promise<unknown>
  RegExp(options: { regexp: string; options: string }): unknown
}

const SESSIONS = 'sessions'
const SETTINGS = 'settings'
const PRACTICES = 'practices'
const FOLDERS = 'folders'
const EXPRESSIONS = 'expressions'

/** 云函数端一次最多取 100 条，更多的分页取 */
const PAGE = 100
/** 示范朗读缓存只在服务端用，读列表时不取 */
const WITHOUT_TTS = { tts: false }

async function fetchAll(query: () => WxQuery, cap: number): Promise<unknown[]> {
  const out: unknown[] = []
  while (out.length < cap) {
    const { data } = await query()
      .skip(out.length)
      .limit(Math.min(PAGE, cap - out.length))
      .get()
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

/** 关键词按字面查找：正则里的特殊字符转义 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
          .field(WITHOUT_TTS)
          .get()
        return data as SessionDoc[]
      }),

    listPage: (openid, { offset, limit, keyword }) =>
      withCollection(db, SESSIONS, async () => {
        let condition: object = { _openid: openid }
        if (keyword) {
          const re = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
          condition = _.and([
            { _openid: openid },
            _.or([
              { title: re },
              { 'input.rawText': re },
              { polishedZh: re },
              { 'versions.en': re },
            ]),
          ])
        }
        const { data } = await sessions()
          .where(condition)
          .orderBy('updatedAt', 'desc')
          .skip(offset)
          .limit(limit)
          .field(WITHOUT_TTS)
          .get()
        return data as SessionDoc[]
      }),

    listStarred: (openid) =>
      withCollection(
        db,
        SESSIONS,
        async () =>
          (await fetchAll(
            () =>
              sessions()
                .where({ _openid: openid, starredAt: _.neq(null) })
                .orderBy('starredAt', 'desc')
                .field(WITHOUT_TTS),
            500,
          )) as SessionDoc[],
      ),

    listStarredMeta: (openid) =>
      withCollection(
        db,
        SESSIONS,
        async () =>
          (await fetchAll(
            () =>
              sessions()
                .where({ _openid: openid, starredAt: _.neq(null) })
                .field({ starredAt: true, folderId: true, tags: true }),
            1000,
          )) as SessionMeta[],
      ),

    listTitles: (openid, ids) =>
      withCollection(db, SESSIONS, async () => {
        if (ids.length === 0) return []
        const { data } = await sessions()
          .where({ _openid: openid, _id: _.in(ids) })
          .limit(ids.length)
          .field({ title: true, input: true })
          .get()
        return data as SessionTitle[]
      }),

    updateInFolders: (openid, folderIds, patch) =>
      withCollection(db, SESSIONS, async () => {
        if (folderIds.length === 0) return
        await sessions()
          .where({ _openid: openid, folderId: _.in(folderIds) })
          .update({ data: toUpdateData(_, patch) })
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

  const practices = () => db.collection(PRACTICES)
  const practiceRepo: PracticeRepo = {
    create: (doc) =>
      withCollection(db, PRACTICES, async () => (await practices().add({ data: doc }))._id),

    get: (id, openid) =>
      withCollection(db, PRACTICES, async () => {
        const { data } = await practices().where({ _id: id, _openid: openid }).limit(1).get()
        return (data[0] as PracticeDoc | undefined) ?? null
      }),

    acquireJob: (id, openid, job, staleBefore) =>
      withCollection(db, PRACTICES, async () => {
        const res = await practices()
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
      withCollection(db, PRACTICES, async () => {
        const res = await practices()
          .where({ _id: id, _openid: openid, 'job.startedAt': startedAt })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    listBySession: (openid, sessionId, limit) =>
      withCollection(db, PRACTICES, async () => {
        const { data } = await practices()
          .where({ _openid: openid, sessionId })
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get()
        return data as PracticeDoc[]
      }),

    remove: (id, openid) =>
      withCollection(db, PRACTICES, async () => {
        await (practices().where({ _id: id, _openid: openid }) as unknown as WxRemovable).remove()
      }),
  }

  const folders = () => db.collection(FOLDERS)
  const folderRepo: FolderRepo = {
    list: (openid) =>
      withCollection(
        db,
        FOLDERS,
        async () =>
          (await fetchAll(
            () => folders().where({ _openid: openid }).orderBy('order', 'asc'),
            500,
          )) as FolderDoc[],
      ),

    create: (doc) =>
      withCollection(db, FOLDERS, async () => (await folders().add({ data: doc }))._id),

    update: (id, openid, patch) =>
      withCollection(db, FOLDERS, async () => {
        const res = await folders()
          .where({ _id: id, _openid: openid })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    remove: (ids, openid) =>
      withCollection(db, FOLDERS, async () => {
        if (ids.length === 0) return
        await folders()
          .where({ _openid: openid, _id: _.in(ids) })
          .remove()
      }),
  }

  const expressions = () => db.collection(EXPRESSIONS)
  const expressionRepo: ExpressionRepo = {
    create: (doc) =>
      withCollection(db, EXPRESSIONS, async () => (await expressions().add({ data: doc }))._id),

    get: (id, openid) =>
      withCollection(db, EXPRESSIONS, async () => {
        const { data } = await expressions().where({ _id: id, _openid: openid }).limit(1).get()
        return (data[0] as ExpressionDoc | undefined) ?? null
      }),

    findByKey: (openid, key) =>
      withCollection(db, EXPRESSIONS, async () => {
        const { data } = await expressions().where({ _openid: openid, key }).limit(1).get()
        return (data[0] as ExpressionDoc | undefined) ?? null
      }),

    listAll: (openid) =>
      withCollection(
        db,
        EXPRESSIONS,
        async () =>
          (await fetchAll(
            () => expressions().where({ _openid: openid }).orderBy('savedAt', 'desc'),
            1000,
          )) as ExpressionDoc[],
      ),

    listMeta: (openid) =>
      withCollection(
        db,
        EXPRESSIONS,
        async () =>
          (await fetchAll(
            () =>
              expressions()
                .where({ _openid: openid })
                .field({ key: true, folderId: true, tags: true }),
            1000,
          )) as ExpressionMeta[],
      ),

    update: (id, openid, patch) =>
      withCollection(db, EXPRESSIONS, async () => {
        const res = await expressions()
          .where({ _id: id, _openid: openid })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    remove: (id, openid) =>
      withCollection(db, EXPRESSIONS, async () => {
        await expressions().where({ _id: id, _openid: openid }).remove()
      }),

    updateInFolders: (openid, folderIds, patch) =>
      withCollection(db, EXPRESSIONS, async () => {
        if (folderIds.length === 0) return
        await expressions()
          .where({ _openid: openid, folderId: _.in(folderIds) })
          .update({ data: toUpdateData(_, patch) })
      }),

    removeInFolders: (openid, folderIds) =>
      withCollection(db, EXPRESSIONS, async () => {
        if (folderIds.length === 0) return
        await expressions()
          .where({ _openid: openid, folderId: _.in(folderIds) })
          .remove()
      }),

    acquireFill: (id, openid, startedAt, staleBefore) =>
      withCollection(db, EXPRESSIONS, async () => {
        const res = await expressions()
          .where(
            _.and([
              { _id: id, _openid: openid, fill: _.neq('ready') },
              _.or([{ fillStartedAt: _.eq(null) }, { fillStartedAt: _.lt(staleBefore) }]),
            ]),
          )
          .update({ data: { fillStartedAt: startedAt } })
        return res.stats.updated === 1
      }),

    updateIfFill: (id, openid, startedAt, patch) =>
      withCollection(db, EXPRESSIONS, async () => {
        const res = await expressions()
          .where({ _id: id, _openid: openid, fillStartedAt: startedAt })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),
  }

  return {
    sessions: sessionRepo,
    settings: settingsRepo,
    practices: practiceRepo,
    folders: folderRepo,
    expressions: expressionRepo,
  }
}
