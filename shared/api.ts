/**
 * 云函数接口约定：每个云函数按 action 分发，这里登记所有 action 的入参和出参。
 * 前端 services/cloud.ts 与云端 cloud/src/lib/router.ts 都以此为准。
 */
import type {
  InputMode,
  LlmConfigState,
  LlmPresetId,
  LlmScope,
  Practice,
  PracticeSummary,
  Session,
  SessionSummary,
  TtsSentence,
  UserSettings,
} from './types'

type Empty = Record<string, never>

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
    /** 单个单词的标准发音：base64 编码的 mp3（很小，不落盘） */
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
