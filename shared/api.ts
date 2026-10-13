/**
 * Cloud function API contract: each cloud function dispatches by action, and every action's input and output is registered here.
 * Both the frontend's services/cloud.ts and the cloud's cloud/src/lib/router.ts follow it.
 */
import type {
  Account,
  Expression,
  ExpressionKind,
  ExpressionOrigin,
  ExpressionSummary,
  Folder,
  FolderCounts,
  InputMode,
  LibraryTab,
  LlmConfigView,
  LlmPresetId,
  Member,
  Practice,
  PracticeSummary,
  Profile,
  Session,
  SessionSummary,
  Share,
  ShareSummary,
  SourceView,
  TagCount,
  TtsSentence,
  Usage,
  UserSettings,
} from './types'

type Empty = Record<string, never>

/** Source of a saved expression: session, version, sentence index (expressions from the analysis may pass -1 and the cloud locates the sentence) */
export interface SaveSourceInput {
  sessionId: string
  vid: string
  sentenceIndex: number
  from: ExpressionOrigin
}

/** Deleting a folder: move its contents up a level, or delete them along with it */
export type FolderDeleteMode = 'moveUp' | 'deleteAll'

/** There is a single LLM config, set by an admin and shared by everyone */
export interface LlmConfigInput {
  preset: LlmPresetId
  baseUrl: string
  model: string
  /** Omit to keep the saved key */
  apiKey?: string
}

export interface CloudApi {
  data: {
    ping: {
      req: Empty
      res: { pong: true; openid: string; serverTime: number }
    }
    getSettings: { req: Empty; res: UserSettings }
    updateSettings: { req: Partial<UserSettings>; res: UserSettings }
    getSession: { req: { sessionId: string }; res: { session: Session } }
    listSessions: { req: { limit?: number }; res: { items: SessionSummary[] } }
    setCurrentVersion: { req: { sessionId: string; vid: string }; res: { session: Session } }

    /** History: all sessions, paged by last update (newest first), searchable by keyword */
    listHistory: {
      req: { keyword?: string; offset?: number }
      res: { items: SessionSummary[]; hasMore: boolean }
    }

    // --- Folders ---
    /** All folders, plus the number of saved items directly in each */
    listFolders: { req: Empty; res: { folders: Folder[]; counts: FolderCounts } }
    createFolder: { req: { name: string; parentId: string | null }; res: { folder: Folder } }
    renameFolder: { req: { folderId: string; name: string }; res: { folder: Folder } }
    /** Move under another folder (null for the root); the whole subtree may not exceed 3 levels */
    moveFolder: { req: { folderId: string; parentId: string | null }; res: Empty }
    /** New order of sibling folders */
    reorderFolders: { req: { parentId: string | null; ids: string[] }; res: Empty }
    deleteFolder: { req: { folderId: string; mode: FolderDeleteMode }; res: Empty }

    // --- Saved items ---
    /** Saved items in one tab: by folder (null for unfiled), by tag (ignoring folders), or by keyword search */
    listFavorites: {
      req: { tab: LibraryTab; folderId?: string | null; tag?: string; keyword?: string }
      res: { expressions: ExpressionSummary[]; sessions: SessionSummary[] }
    }
    listTags: { req: { tab: LibraryTab }; res: { tags: TagCount[] } }
    /** Move and tag; also saves the session if it isn't saved yet */
    organize: {
      req: { tab: LibraryTab; id: string; folderId?: string | null; tags?: string[] }
      res: Empty
    }
    starSession: {
      req: { sessionId: string; star: boolean }
      res: { starredAt: number | null; folderId: string | null; tags: string[] }
    }

    // --- Expressions ---
    /** Save an expression; if the same expression is already saved, merge and only add the source */
    saveExpression: {
      req: {
        text: string
        kind: ExpressionKind
        meaning?: string
        usage?: string
        example?: string
        source: SaveSourceInput
      }
      res: { expression: Expression; created: boolean }
    }
    getExpression: {
      req: { expressionId: string }
      res: { expression: Expression; sources: SourceView[] }
    }
    updateExpression: {
      req: { expressionId: string; note: string }
      res: { expression: Expression }
    }
    deleteExpression: { req: { expressionId: string }; res: Empty }
    /** Merge keys of saved expressions, used to mark already-saved ones on the session page */
    expressionKeys: { req: Empty; res: { keys: Record<string, string> } }
    /** "Also appears in" (「也出现在」): find this expression in other sessions */
    findUsages: { req: { expressionId: string }; res: { usages: Usage[] } }

    // --- Sharing ---
    getProfile: { req: Empty; res: { profile: Profile | null } }
    /** avatarFileID is a freshly uploaded avatar under avatars/; omit to keep the current avatar */
    updateProfile: {
      req: { nickname: string; avatarFileID?: string }
      res: { profile: Profile }
    }
    /** Create a share for a practice (timing must be aligned first: scored, or via assess.prepareShare); one share per practice, returned as is if it already exists */
    createShare: { req: { practiceId: string }; res: { shareId: string; created: boolean } }
    /** Anyone with the share id can read it; returns only the snapshot */
    getShare: { req: { shareId: string }; res: { share: Share } }
    listShares: { req: Empty; res: { items: ShareSummary[] } }
    /** Revoke: delete the share and its copy of the recording */
    revokeShare: { req: { shareId: string }; res: Empty }

    // --- Membership ---
    /** Your own membership status; the record is created on the first call */
    getAccount: { req: Empty; res: { account: Account } }
    /** The following three are admin-only */
    listMembers: { req: Empty; res: { members: Member[] } }
    /** Grant Pro: counted from now if never granted or expired, otherwise extends the current expiry */
    grantPro: { req: { openid: string }; res: { member: Member } }
    /** End Pro immediately */
    revokePro: { req: { openid: string }; res: { member: Member } }
  }

  compose: {
    /** Create a session, saving only the original text, and return immediately; QUOTA_EXCEEDED when free uses run out */
    create: { req: { mode: InputMode; rawText: string }; res: { sessionId: string } }
    /** The following three are generation jobs: results are written to the session; if a job is already running, the current session is returned.
     *  generate uses 1 free use for the first version (refunded on failure); revise / analyze don't */
    generate: { req: { sessionId: string }; res: { session: Session } }
    revise: {
      req: { sessionId: string; baseVid: string; instruction: string }
      res: { session: Session }
    }
    analyze: { req: { sessionId: string; vid: string }; res: { session: Session } }
    /** Fill in an expression's meaning, usage and example from the sentence it was saved from; if already filling, returns the current state */
    explainExpression: { req: { expressionId: string }; res: { expression: Expression } }

    /** The following four are admin-only */
    getLlmConfig: { req: Empty; res: { config: LlmConfigView | null } }
    saveLlmConfig: { req: LlmConfigInput; res: { config: LlmConfigView | null } }
    clearLlmConfig: { req: Empty; res: { config: LlmConfigView | null } }
    testLlm: { req: LlmConfigInput; res: { latencyMs: number; reply: string } }
  }

  speech: {
    /** Transcribe a Chinese recording already uploaded to cloud storage, then delete the recording */
    recognize: { req: { fileID: string }; res: { text: string } }
    /** Demo reading of a version (synthesized per sentence, cached per voice and speed) */
    tts: { req: { sessionId: string; vid: string }; res: { sentences: TtsSentence[] } }
    /** Reference pronunciation of a word or phrase: a base64-encoded mp3 (small, not stored) */
    ttsWord: { req: { word: string }; res: { audio: string } }
  }

  assess: {
    /** Submit a recitation recording and save it as a practice record (playable right away, not scored); only the latest few are kept per session */
    start: {
      req: { sessionId: string; vid: string; fileID: string; durationMs: number }
      res: { practiceId: string }
    }
    /** Start scoring: uses 1 free use (none for Pro; refunded on failure) and runs the first stage */
    score: { req: { practiceId: string }; res: { practice: Practice } }
    /** Prepare lyric timing for sharing: transcription and alignment only, no free use deducted; runs the first stage */
    prepareShare: { req: { practiceId: string }; res: { practice: Practice } }
    /** Keep advancing (may complete several stages at once); returns the current state if the target is reached or a stage is already running */
    advance: { req: { practiceId: string }; res: { practice: Practice } }
    get: { req: { practiceId: string }; res: { practice: Practice } }
    list: { req: { sessionId: string }; res: { items: PracticeSummary[] } }
  }
}

export type FunctionName = keyof CloudApi
export type ActionName<F extends FunctionName> = keyof CloudApi[F] & string

type ActionSpec<F extends FunctionName, A extends ActionName<F>> = CloudApi[F][A] extends {
  req: unknown
  res: unknown
}
  ? CloudApi[F][A]
  : never

export type ActionReq<F extends FunctionName, A extends ActionName<F>> = ActionSpec<F, A>['req']
export type ActionRes<F extends FunctionName, A extends ActionName<F>> = ActionSpec<F, A>['res']

/** Event shape the frontend sends to a cloud function */
export interface CloudEvent<F extends FunctionName, A extends ActionName<F>> {
  action: A
  payload: ActionReq<F, A>
}
