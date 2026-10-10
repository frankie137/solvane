/**
 * 云函数接口约定：每个云函数按 action 分发，这里登记所有 action 的入参和出参。
 * 前端 services/cloud.ts 与云端 cloud/src/lib/router.ts 都以此为准。
 */
import type {
  Expression,
  ExpressionKind,
  ExpressionOrigin,
  ExpressionSummary,
  Folder,
  FolderCounts,
  InputMode,
  LibraryTab,
  LlmConfigState,
  LlmPresetId,
  LlmScope,
  Practice,
  PracticeSummary,
  Session,
  SessionSummary,
  SourceView,
  TagCount,
  TtsSentence,
  Usage,
  UserSettings,
} from './types'

type Empty = Record<string, never>

/** 收藏表达时的来源：对话、版本、第几句（解析里的表达可传 -1，由云端定位） */
export interface SaveSourceInput {
  sessionId: string
  vid: string
  sentenceIndex: number
  from: ExpressionOrigin
}

/** 删除文件夹：内容移到上一级，或连同里面的收藏一起删除 */
export type FolderDeleteMode = 'moveUp' | 'deleteAll'

export interface LlmConfigInput {
  scope: LlmScope
  preset: LlmPresetId
  baseUrl: string
  model: string
  /** 不填表示沿用已保存的 Key */
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

    /** 历史：全部对话按更新时间倒序分页，可按关键词搜索 */
    listHistory: {
      req: { keyword?: string; offset?: number }
      res: { items: SessionSummary[]; hasMore: boolean }
    }

    // --- 文件夹 ---
    /** 全部文件夹，以及每个文件夹里直接放着的收藏数 */
    listFolders: { req: Empty; res: { folders: Folder[]; counts: FolderCounts } }
    createFolder: { req: { name: string; parentId: string | null }; res: { folder: Folder } }
    renameFolder: { req: { folderId: string; name: string }; res: { folder: Folder } }
    /** 移动到另一个文件夹下（null 为根目录），整棵子树不能超过 3 级 */
    moveFolder: { req: { folderId: string; parentId: string | null }; res: Empty }
    /** 同一级文件夹的新顺序 */
    reorderFolders: { req: { parentId: string | null; ids: string[] }; res: Empty }
    deleteFolder: { req: { folderId: string; mode: FolderDeleteMode }; res: Empty }

    // --- 收藏 ---
    /** 某一栏的收藏：按文件夹（null 为未归类）或按标签（忽略文件夹），或按关键词搜索 */
    listFavorites: {
      req: { tab: LibraryTab; folderId?: string | null; tag?: string; keyword?: string }
      res: { expressions: ExpressionSummary[]; sessions: SessionSummary[] }
    }
    listTags: { req: { tab: LibraryTab }; res: { tags: TagCount[] } }
    /** 移动、打标签；对话还没收藏时一并收藏 */
    organize: {
      req: { tab: LibraryTab; id: string; folderId?: string | null; tags?: string[] }
      res: Empty
    }
    starSession: {
      req: { sessionId: string; star: boolean }
      res: { starredAt: number | null; folderId: string | null; tags: string[] }
    }

    // --- 表达 ---
    /** 收藏一个表达；已有同一个表达时合并，只累加来源 */
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
    /** 已收藏表达的合并键，用于在对话页标出哪些已经收藏过 */
    expressionKeys: { req: Empty; res: { keys: Record<string, string> } }
    /** 「也出现在」：在其他对话里找这个表达 */
    findUsages: { req: { expressionId: string }; res: { usages: Usage[] } }
  }

  compose: {
    /** 新建对话，只保存原文，立即返回 */
    create: { req: { mode: InputMode; rawText: string }; res: { sessionId: string } }
    /** 以下三个是生成任务：结果写入对话；若已有任务在运行，直接返回当前对话 */
    generate: { req: { sessionId: string }; res: { session: Session } }
    revise: {
      req: { sessionId: string; baseVid: string; instruction: string }
      res: { session: Session }
    }
    analyze: { req: { sessionId: string; vid: string }; res: { session: Session } }
    /** 按收藏时的原句语境补全表达的释义、用法和例句；已在补全时直接返回当前状态 */
    explainExpression: { req: { expressionId: string }; res: { expression: Expression } }

    getLlmConfig: { req: Empty; res: LlmConfigState }
    saveLlmConfig: { req: LlmConfigInput; res: LlmConfigState }
    clearLlmConfig: { req: { scope: LlmScope }; res: LlmConfigState }
    testLlm: { req: LlmConfigInput; res: { latencyMs: number; reply: string } }
  }

  speech: {
    /** 识别一段已上传到云存储的中文录音，识别后删除录音 */
    recognize: { req: { fileID: string }; res: { text: string } }
    /** 某个版本的示范朗读（按句合成，按音色和语速缓存） */
    tts: { req: { sessionId: string; vid: string }; res: { sentences: TtsSentence[] } }
    /** 单词或短语的标准发音：base64 编码的 mp3（很小，不落盘） */
    ttsWord: { req: { word: string }; res: { audio: string } }
  }

  assess: {
    /** 提交一段背诵录音，创建练习；同一对话只保留最近几次 */
    start: {
      req: { sessionId: string; vid: string; fileID: string; durationMs: number }
      res: { practiceId: string }
    }
    /** 推进评测流程（可能一次完成多步）；已有步骤在运行时直接返回当前状态 */
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

/** 前端发给云函数的 event 结构 */
export interface CloudEvent<F extends FunctionName, A extends ActionName<F>> {
  action: A
  payload: ActionReq<F, A>
}
