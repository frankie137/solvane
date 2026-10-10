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
  /** 收藏状态：收藏时间（没收藏为 null）、所在文件夹（未归类为 null）、标签 */
  starredAt: number | null
  folderId: string | null
  tags: string[]
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
  starredAt: number | null
  folderId: string | null
  tags: string[]
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

// ---------------------------------------------------------------------------
// 收藏（M3）

/** 收藏页的两栏 */
export type LibraryTab = 'expression' | 'session'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** 1～3 级 */
  depth: number
  /** 同级之间的顺序，小的在前 */
  order: number
  createdAt: number
}

/** 每个文件夹里直接放着的收藏数；键为文件夹 id，未归类的键为空字符串 */
export type FolderCounts = Record<LibraryTab, Record<string, number>>

/** phrase：解析里的关键表达；slang：俚语与习语；word：从句子或报告里收藏的词和短语 */
export type ExpressionKind = 'phrase' | 'slang' | 'word'

/** 从哪里收藏的：解析、英文句子、评分报告 */
export type ExpressionOrigin = 'analysis' | 'sentence' | 'report'

export interface ExpressionSource {
  sessionId: string
  vid: string
  /** 在那个版本里是第几句；解析里的表达找不到所在句子时为 -1 */
  sentenceIndex: number
  /** 收藏时那句英文的原文（对话之后修改也不影响） */
  sentence: string
  from: ExpressionOrigin
  savedAt: number
}

/** 释义的补全状态：从解析收藏的直接就绪，从句子或报告收藏的由大模型补全 */
export type ExpressionFill = 'ready' | 'pending' | 'failed'

export interface Expression {
  id: string
  text: string
  kind: ExpressionKind
  meaning: string
  usage: string
  example: string
  /** 自己写的备注 */
  note: string
  fill: ExpressionFill
  folderId: string | null
  tags: string[]
  sources: ExpressionSource[]
  createdAt: number
  /** 最近一次收藏的时间，列表按它倒序 */
  savedAt: number
}

export interface ExpressionSummary {
  id: string
  text: string
  kind: ExpressionKind
  meaning: string
  fill: ExpressionFill
  folderId: string | null
  tags: string[]
  sourceCount: number
  savedAt: number
}

/** 来源或用处所在对话的标题；对话不存在时为 null */
export interface SourceView extends ExpressionSource {
  sessionTitle: string | null
}

/** 「也出现在」：其他对话里用到这个表达的句子 */
export interface Usage {
  sessionId: string
  sessionTitle: string
  vid: string
  sentenceIndex: number
  sentence: string
  updatedAt: number
}

export interface TagCount {
  name: string
  count: number
}

// ---------------------------------------------------------------------------
// 分享（M4）

/** 分享和歌词页上显示的署名；头像为临时链接 */
export interface Profile {
  nickname: string
  avatarUrl: string | null
}

export interface ShareSentence {
  en: string
  zh: string
  /** 这一句在录音里的起止时间；没背出来的句子为 -1 */
  startMs: number
  endMs: number
  /** 逐词时间，字符位置对应 en；没有单词时间时为空 */
  words: TimedText[]
}

export interface Share {
  id: string
  title: string
  sentences: ShareSentence[]
  /** 录音的临时播放链接 */
  audioUrl: string
  durationMs: number
  author: Profile
  createdAt: number
  /** 是不是自己分享的（决定显示「发给朋友」还是「我也来练」） */
  mine: boolean
}

export interface ShareSummary {
  id: string
  title: string
  /** 第一句英文 */
  preview: string
  durationMs: number
  createdAt: number
}

