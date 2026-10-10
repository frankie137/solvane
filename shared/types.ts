/** 前后端共用的业务数据类型 */

import type { ErrorCode } from './result'

export type EnglishLevel = 'junior' | 'senior' | 'cet4' | 'cet6' | 'ielts' | 'toefl'
export type Accent = 'us' | 'uk'
export type TtsVoice = 'female' | 'male'
export type TtsSpeed = 'normal' | 'slow'

export interface UserSettings {
  level: EnglishLevel
  accent: Accent
  /** 示范朗读的音色和语速 */
  ttsVoice: TtsVoice
  ttsSpeed: TtsSpeed
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

// ---------------------------------------------------------------------------
// 示范朗读

/** 一个词在音频里的位置；index 为这个词在句子文本里的字符范围 */
export interface TimedText {
  text: string
  beginMs: number
  endMs: number
  beginIndex: number
  endIndex: number
}

export interface TtsSentence {
  index: number
  /** 临时播放链接 */
  url: string
  words: TimedText[]
}

// ---------------------------------------------------------------------------
// 背诵练习

export type PracticeStage = 'transcribe' | 'align' | 'score' | 'report' | 'done'

export interface PracticeJob {
  stage: PracticeStage
  startedAt: number
}

export interface PracticeError {
  stage: PracticeStage
  code: ErrorCode
  message: string
  at: number
}

/** 识别出的一个词和它在录音里的时间（毫秒） */
export interface SpokenWord {
  word: string
  startMs: number
  endMs: number
}

export type DiffKind = 'mispronounced' | 'paraphrase' | 'missing' | 'extra' | 'grammar'

export interface PracticeDiff {
  kind: DiffKind
  /** 原文第几句（从 0 开始） */
  sentenceIndex: number
  /** 原文里的说法 */
  target: string
  /** 实际说的 */
  said: string
  note: string
}

export interface AlignedSentence {
  index: number
  /** 还原出的"想说的那句话"，没背出来时为空 */
  intended: string
  startMs: number
  endMs: number
}

export interface PhoneScore {
  /** 标准音素 */
  refPhone: string
  /** 实际发出的音素 */
  phone: string
  accuracy: number
}

export type WordMatch = 'ok' | 'extra' | 'missing' | 'wrong' | 'other'

export interface ScoredWord {
  word: string
  sentenceIndex: number
  startMs: number
  endMs: number
  /** 0～100；无法评测时为 -1 */
  accuracy: number
  match: WordMatch
  phones: PhoneScore[]
}

export interface PracticeScores {
  overall: number
  pronunciation: number
  fluency: number
  content: number
  expression: number
}

export interface PronunciationTip {
  word: string
  issue: string
  howTo: string
}

export interface Practice {
  id: string
  sessionId: string
  vid: string
  stage: PracticeStage
  job: PracticeJob | null
  lastError: PracticeError | null
  durationMs: number
  /** 录音的临时播放链接 */
  audioUrl: string | null
  transcript: { text: string; words: SpokenWord[] } | null
  alignment: {
    sentences: AlignedSentence[]
    diffs: PracticeDiff[]
    content: number
    expression: number
  } | null
  pronunciation: {
    accuracy: number
    fluency: number
    completeness: number
    words: ScoredWord[]
    /** 背了但没能评测的句子（评测服务出错或时间不够），报告里要和"没背出来"区分 */
    unscored: number[]
  } | null
  report: {
    scores: PracticeScores
    summary: string
    pronunciationTips: PronunciationTip[]
    recitationTips: string[]
  } | null
  createdAt: number
  updatedAt: number
}

export interface PracticeSummary {
  id: string
  vid: string
  stage: PracticeStage
  failed: boolean
  overall: number | null
  durationMs: number
  createdAt: number
}
