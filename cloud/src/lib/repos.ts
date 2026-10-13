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
  ShareSentence,
  TimedText,
  TtsSpeed,
  TtsVoice,
  Version,
} from '@shared/types'

/** Session document in the database */
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
  /** Saving: when it was saved (null if not saved; missing in older data), folder, tags */
  starredAt?: number | null
  folderId: string | null
  tags: string[]
  /**
   * Demo reading cache (server only, never sent to the frontend):
   * version ID → voice and speed → per sentence
   */
  tts?: Record<string, TtsCache>
  /**
   * Generating the first version consumed a free use (refunded and cleared if generation fails);
   * sessions from before M6 lack this field
   */
  freeCharged?: boolean
  createdAt: number
  updatedAt: number
}

/** Practice record in the database */
export interface PracticeDoc {
  _id: string
  _openid: string
  sessionId: string
  vid: string
  stage: PracticeStage
  /** Whether to score; practices from before M6 lack this field and were all scored */
  scoreRequested?: boolean
  /** Lyric timings needed for sharing: process only up to alignment */
  timingRequested?: boolean
  /** This scoring consumed a free use (refunded and cleared if scoring fails) */
  freeCharged?: boolean
  /** Original recording uploaded on submit; used to find the existing record on resubmission */
  sourceFileID?: string
  job: PracticeJob | null
  lastError: PracticeError | null
  /** Raw PCM recording, deleted after conversion to WAV (converted on submit since M6) */
  pcmFileID: string | null
  /** Converted WAV, used for playback and assessment */
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
  /** Merge key; see expressionKey in shared/expression.ts */
  key: string
  kind: ExpressionKind
  meaning: string
  usage: string
  example: string
  note: string
  fill: ExpressionFill
  /** Start time of the fill job, used as a lock; null when no job is running */
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

/** LLM config, stored encrypted */
export interface LlmStored {
  preset: LlmPresetId
  baseUrl: string
  model: string
  apiKeyCipher: string
  apiKeyMask: string
  updatedAt: number
}

/** _id is the user's openid; the admin's global default config has _id GLOBAL_SETTINGS_ID */
export interface SettingsDoc {
  _id: string
  level?: EnglishLevel
  accent?: Accent
  ttsVoice?: TtsVoice
  ttsSpeed?: TtsSpeed
  llm?: LlmStored | null
  /** Byline shown when sharing */
  profile?: ProfileStored | null
  updatedAt: number
}

export interface ProfileStored {
  nickname: string
  avatarFileID: string | null
}

/** Share snapshot: fixed at share time, unaffected by later changes to the session or practice */
export interface ShareDoc {
  _id: string
  _openid: string
  sessionId: string
  practiceId: string
  title: string
  /** First English sentence, shown in lists (lists don't fetch sentences) */
  preview: string
  sentences: ShareSentence[]
  /** Copy of the recording, deleted when the share is withdrawn */
  audioFileID: string
  durationMs: number
  author: ProfileStored
  createdAt: number
}

/** Membership record: _id is the user's openid; created on first use */
export interface AccountDoc {
  _id: string
  /** Free uses consumed (new sessions and scoring combined) */
  freeUsed: number
  /** Expiry of the latest grant; null if never granted */
  proUntil: number | null
  /** Admin grant and revoke history */
  grants: ProGrant[]
  createdAt: number
  updatedAt: number
}

export interface ProGrant {
  action: 'grant' | 'revoke'
  /** Expiry after the change */
  until: number
  /** Admin who made the change */
  by: string
  at: number
}

/** Cached demo reading for one sentence: cloud storage file + per-word timings */
export interface TtsCachedSentence {
  fileID: string
  words: TimedText[]
}

/** Demo reading cache on a version, keyed by "voice-speed" */
export type TtsCache = Record<string, TtsCachedSentence[]>

export const GLOBAL_SETTINGS_ID = '__global__'

export interface SessionRepo {
  create(doc: Omit<SessionDoc, '_id'>): Promise<string>
  get(id: string, openid: string): Promise<SessionDoc | null>
  /** Locks if there's no job or it started before staleBefore (treated as interrupted) */
  acquireJob(id: string, openid: string, job: Job, staleBefore: number): Promise<boolean>
  /** Writes only if the lock still belongs to the startedAt job; returns whether it wrote */
  updateIfJob(id: string, openid: string, startedAt: number, patch: SessionPatch): Promise<boolean>
  update(id: string, openid: string, patch: SessionPatch): Promise<boolean>
  listRecent(openid: string, limit: number): Promise<SessionDoc[]>
  /**
   * Paginated by update time, newest first; with a keyword, searches the title, original text,
   * polished Chinese, and the English of every version
   */
  listPage(
    openid: string,
    options: { offset: number; limit: number; keyword?: string },
  ): Promise<SessionDoc[]>
  /** Saved sessions */
  listStarred(openid: string): Promise<SessionDoc[]>
  /** Save fields of saved sessions (for counts and tags; content not fetched) */
  listStarredMeta(openid: string): Promise<SessionMeta[]>
  /** Titles of these sessions (for showing sources; content not fetched) */
  listTitles(openid: string, ids: string[]): Promise<SessionTitle[]>
  /** Updates all saved sessions in these folders (used when deleting folders) */
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
  /** All expressions, latest saved first (saves are few, so filtering happens in the function) */
  listAll(openid: string): Promise<ExpressionDoc[]>
  /** Merge keys, folders and tags of all expressions (for counts, tags and saved markers) */
  listMeta(openid: string): Promise<ExpressionMeta[]>
  update(id: string, openid: string, patch: ExpressionPatch): Promise<boolean>
  remove(id: string, openid: string): Promise<void>
  updateInFolders(openid: string, folderIds: string[], patch: ExpressionPatch): Promise<void>
  removeInFolders(openid: string, folderIds: string[]): Promise<void>
  /** Fill lock: locks if not ready yet and there's no job or it started before staleBefore */
  acquireFill(id: string, openid: string, startedAt: number, staleBefore: number): Promise<boolean>
  /** Writes only if the lock still belongs to the startedAt job */
  updateIfFill(
    id: string,
    openid: string,
    startedAt: number,
    patch: ExpressionPatch,
  ): Promise<boolean>
}

export interface SettingsRepo {
  get(id: string): Promise<SettingsDoc | null>
  /** Merge update; creates the document if missing */
  upsert(id: string, patch: Partial<Omit<SettingsDoc, '_id'>>): Promise<void>
  /** Byline profiles of these users (for the membership admin page) */
  listProfiles(ids: string[]): Promise<Pick<SettingsDoc, '_id' | 'profile'>[]>
  /** Clears members' own LLM configs (only the global one is used since M6); safe to rerun */
  clearMemberLlm(): Promise<void>
}

export interface PracticeRepo {
  create(doc: Omit<PracticeDoc, '_id'>): Promise<string>
  get(id: string, openid: string): Promise<PracticeDoc | null>
  update(id: string, openid: string, patch: PracticePatch): Promise<boolean>
  /** Practice created from this uploaded file (deduplicates resubmissions) */
  findBySource(openid: string, fileID: string): Promise<PracticeDoc | null>
  /**
   * Marks for scoring if not requested yet; returns whether it did (of concurrent requests for the
   * same recording, only one succeeds)
   */
  requestScore(id: string, openid: string, freeCharged: boolean): Promise<boolean>
  acquireJob(id: string, openid: string, job: PracticeJob, staleBefore: number): Promise<boolean>
  updateIfJob(id: string, openid: string, startedAt: number, patch: PracticePatch): Promise<boolean>
  /** Practices of a session, newest first */
  listBySession(openid: string, sessionId: string, limit: number): Promise<PracticeDoc[]>
  remove(id: string, openid: string): Promise<void>
}

export interface ShareRepo {
  /**
   * Creates with the given id; if the id exists, doesn't overwrite and returns false (concurrent
   * shares of the same practice keep only one)
   */
  create(id: string, doc: Omit<ShareDoc, '_id'>): Promise<boolean>
  /** Anyone with the id can read it; callers may only return snapshot fields */
  get(id: string): Promise<ShareDoc | null>
  findByPractice(openid: string, practiceId: string): Promise<ShareDoc | null>
  listByOwner(openid: string, limit: number): Promise<ShareDoc[]>
  remove(id: string, openid: string): Promise<void>
}

export interface AccountRepo {
  get(id: string): Promise<AccountDoc | null>
  /** Creates the record; doesn't overwrite an existing one (concurrent creation keeps only one) */
  create(doc: AccountDoc): Promise<void>
  /** Increments the used count if below limit; returns whether a use was consumed */
  consume(id: string, limit: number, now: number): Promise<boolean>
  /** Refunds one use (decrements if the used count is above 0) */
  refund(id: string, now: number): Promise<void>
  /**
   * If the expiry is still `expected`, sets it to grant.until and appends the grant; returns
   * whether it wrote (of concurrent changes, only one succeeds)
   */
  setProUntil(id: string, expected: number | null, grant: ProGrant): Promise<boolean>
  /** All records, in creation order */
  list(limit: number): Promise<AccountDoc[]>
}

export interface Repos {
  accounts: AccountRepo
  sessions: SessionRepo
  settings: SettingsRepo
  practices: PracticeRepo
  folders: FolderRepo
  expressions: ExpressionRepo
  shares: ShareRepo
}

// ---------------------------------------------------------------------------
// CloudBase database implementation. Declares only the APIs in use; all return values are
// treated as Promises.

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
  gt(value: number): unknown
  inc(value: number): unknown
  push(values: unknown[]): unknown
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
const SHARES = 'shares'
const ACCOUNTS = 'accounts'

/** Cloud functions fetch at most 100 records per query; more are paginated */
const PAGE = 100
/** The demo reading cache is server-only and is left out when reading lists */
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

/** Keywords match literally: escape regex special characters */
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

function isDuplicateKey(err: unknown): boolean {
  const e = err as { errCode?: number; errMsg?: string; message?: string }
  return e?.errCode === -502001 || /duplicate/i.test(`${e?.errMsg ?? ''}${e?.message ?? ''}`)
}

/** The collection may not exist on first use: create it and retry once */
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
 * CloudBase database update partially merges nested objects, so object and array values are
 * wrapped in _.set() to replace the field as a whole, matching the in-memory implementation.
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
          // updated is also 0 when nothing changed: create only if the document is really missing
          if (existing.data.length === 0) {
            await settings()
              .doc(id)
              .set({ data: { ...patch } })
          }
        }
      }),

    listProfiles: (ids) =>
      withCollection(db, SETTINGS, async () => {
        if (ids.length === 0) return []
        const { data } = await settings()
          .where({ _id: _.in(ids) })
          .limit(ids.length)
          .field({ profile: true })
          .get()
        return data as Pick<SettingsDoc, '_id' | 'profile'>[]
      }),

    clearMemberLlm: () =>
      withCollection(db, SETTINGS, async () => {
        await settings()
          .where({ _id: _.neq(GLOBAL_SETTINGS_ID), llm: _.neq(null) })
          .update({ data: { llm: null } })
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

    update: (id, openid, patch) =>
      withCollection(db, PRACTICES, async () => {
        const res = await practices()
          .where({ _id: id, _openid: openid })
          .update({ data: toUpdateData(_, patch) })
        return res.stats.updated === 1
      }),

    findBySource: (openid, fileID) =>
      withCollection(db, PRACTICES, async () => {
        const { data } = await practices()
          .where({ _openid: openid, sourceFileID: fileID })
          .limit(1)
          .get()
        return (data[0] as PracticeDoc | undefined) ?? null
      }),

    requestScore: (id, openid, freeCharged) =>
      withCollection(db, PRACTICES, async () => {
        const res = await practices()
          .where({ _id: id, _openid: openid, scoreRequested: false })
          .update({ data: { scoreRequested: true, freeCharged } })
        return res.stats.updated === 1
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

  const shares = () => db.collection(SHARES)
  const shareRepo: ShareRepo = {
    create: (id, doc) =>
      withCollection(db, SHARES, async () => {
        try {
          await shares().add({ data: { ...doc, _id: id } })
          return true
        } catch (err) {
          if (isDuplicateKey(err)) return false
          throw err
        }
      }),

    get: (id) =>
      withCollection(db, SHARES, async () => {
        const { data } = await shares().where({ _id: id }).limit(1).get()
        return (data[0] as ShareDoc | undefined) ?? null
      }),

    findByPractice: (openid, practiceId) =>
      withCollection(db, SHARES, async () => {
        const { data } = await shares().where({ _openid: openid, practiceId }).limit(1).get()
        return (data[0] as ShareDoc | undefined) ?? null
      }),

    listByOwner: (openid, limit) =>
      withCollection(db, SHARES, async () => {
        const { data } = await shares()
          .where({ _openid: openid })
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .field({ sentences: false })
          .get()
        return data as ShareDoc[]
      }),

    remove: (id, openid) =>
      withCollection(db, SHARES, async () => {
        await shares().where({ _id: id, _openid: openid }).remove()
      }),
  }

  const accounts = () => db.collection(ACCOUNTS)
  const accountRepo: AccountRepo = {
    get: (id) =>
      withCollection(db, ACCOUNTS, async () => {
        const { data } = await accounts().where({ _id: id }).limit(1).get()
        return (data[0] as AccountDoc | undefined) ?? null
      }),

    create: (doc) =>
      withCollection(db, ACCOUNTS, async () => {
        try {
          await accounts().add({ data: { ...doc } })
        } catch (err) {
          if (!isDuplicateKey(err)) throw err
        }
      }),

    consume: (id, limit, now) =>
      withCollection(db, ACCOUNTS, async () => {
        const res = await accounts()
          .where({ _id: id, freeUsed: _.lt(limit) })
          .update({ data: { freeUsed: _.inc(1), updatedAt: now } })
        return res.stats.updated === 1
      }),

    refund: (id, now) =>
      withCollection(db, ACCOUNTS, async () => {
        await accounts()
          .where({ _id: id, freeUsed: _.gt(0) })
          .update({ data: { freeUsed: _.inc(-1), updatedAt: now } })
      }),

    setProUntil: (id, expected, grant) =>
      withCollection(db, ACCOUNTS, async () => {
        const res = await accounts()
          .where({ _id: id, proUntil: _.eq(expected) })
          .update({ data: { proUntil: grant.until, grants: _.push([grant]), updatedAt: grant.at } })
        return res.stats.updated === 1
      }),

    list: (limit) =>
      withCollection(
        db,
        ACCOUNTS,
        async () =>
          (await fetchAll(() => accounts().orderBy('createdAt', 'asc'), limit)) as AccountDoc[],
      ),
  }

  return {
    accounts: accountRepo,
    sessions: sessionRepo,
    settings: settingsRepo,
    practices: practiceRepo,
    folders: folderRepo,
    expressions: expressionRepo,
    shares: shareRepo,
  }
}
