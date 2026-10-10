/** 前后端共用的业务数据类型 */

import type { ErrorCode } from './result'

export type EnglishLevel = 'junior' | 'senior' | 'cet4' | 'cet6' | 'ielts' | 'toefl'
export type Accent = 'us' | 'uk'

export interface UserSettings {
  level: EnglishLevel
  accent: Accent
}

/** 一句英文和它的中文 */
export interface SentencePair {
  en: string
  zh: string
}

/** 另一种说法，label 描述语气，如"更随意""更礼貌" */
export interface Alternative {
  label: string
  en: string
}

export interface KeyPhrase {
  phrase: string
  meaning: string
  usage: string
  example: string
}

export interface SlangItem {
  phrase: string
  meaning: string
  /** 语体：俚语 / 口语 / 中性 / 正式 */
  register: string
  /** 常用地区：美国 / 英国 / 通用 */
  region: string
}

export interface CultureNote {
  topic: string
  note: string
}

export interface ChinglishPair {
  literal: string
  natural: string
  why: string
}

export interface Analysis {
  keyPhrases: KeyPhrase[]
  slang: SlangItem[]
  culture: CultureNote[]
  chinglish: ChinglishPair[]
}

export interface Version {
  vid: string
  /** 本次修改要求；第一版为 null */
  instruction: string | null
  en: string
  sentences: SentencePair[]
  alternatives: Alternative[]
  /** 解析单独生成，可能稍后才有 */
  analysis: Analysis | null
  createdAt: number
}

export type JobKind = 'generate' | 'revise' | 'analyze'

/** 正在运行的生成任务；同一对话同时只有一个 */
export interface Job {
  kind: JobKind
  /** analyze 针对的版本；generate / revise 为 null */
  vid: string | null
  startedAt: number
}

export interface JobError {
  kind: JobKind
  vid: string | null
  /** 与云函数返回的错误码一致，前端据此决定是否引导去配置 */
  code: ErrorCode
  message: string
  at: number
}

export type InputMode = 'voice' | 'text'

export interface Session {
  id: string
  title: string
  input: { mode: InputMode; rawText: string }
  polishedZh: string
  versions: Version[]
  currentVid: string | null
  job: Job | null
  lastError: JobError | null
  createdAt: number
  updatedAt: number
}

export interface SessionSummary {
  id: string
  title: string
  /** 列表里展示的一句话：优先英文，没有英文时用原文 */
  preview: string
  versionCount: number
  /** pending：已新建，还没开始生成 */
  state: 'ready' | 'running' | 'pending' | 'failed'
  updatedAt: number
}

export type LlmScope = 'own' | 'global'

/** 前端能看到的大模型配置（不含明文 Key） */
export interface LlmConfigView {
  preset: LlmPresetId
  baseUrl: string
  model: string
  apiKeyMask: string
  updatedAt: number
}

export interface LlmConfigState {
  own: LlmConfigView | null
  /** 管理员设置的全局默认 */
  global: LlmConfigView | null
  /** 实际生效的是哪一份 */
  effective: LlmScope | 'none'
  isAdmin: boolean
}

export type LlmPresetId = 'deepseek' | 'qwen' | 'moonshot' | 'zhipu' | 'doubao' | 'custom'
