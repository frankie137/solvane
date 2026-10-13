/** Domain data types shared by the frontend and the cloud */

import type { ErrorCode } from './result'

export type EnglishLevel = 'junior' | 'senior' | 'cet4' | 'cet6' | 'ielts' | 'toefl'
export type Accent = 'us' | 'uk'
export type TtsVoice = 'female' | 'male'
export type TtsSpeed = 'normal' | 'slow'

export interface UserSettings {
  level: EnglishLevel
  accent: Accent
  /** Voice and speed for demo reading */
  ttsVoice: TtsVoice
  ttsSpeed: TtsSpeed
}

/** An English sentence and its Chinese */
export interface SentencePair {
  en: string
  zh: string
}

/** An alternative wording; label describes the tone, e.g. "更随意" (more casual), "更礼貌" (more polite) */
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
  /** Register: 俚语 / 口语 / 中性 / 正式 (slang / colloquial / neutral / formal) */
  register: string
  /** Where it is used: 美国 / 英国 / 通用 (US / UK / both) */
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
  /** Revision instruction for this version; null for the first version */
  instruction: string | null
  en: string
  sentences: SentencePair[]
  alternatives: Alternative[]
  /** The analysis is generated separately and may arrive later */
  analysis: Analysis | null
  createdAt: number
}

export type JobKind = 'generate' | 'revise' | 'analyze'

/** The running generation job; at most one per session at a time */
export interface Job {
  kind: JobKind
  /** Version targeted by analyze; null for generate / revise */
  vid: string | null
  startedAt: number
}

export interface JobError {
  kind: JobKind
  vid: string | null
  /** Same as the error code returned by the cloud function; the frontend uses it to decide whether to point to configuration */
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
  /** Saved state: saved time (null if not saved), folder (null if unfiled), tags */
  starredAt: number | null
  folderId: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface SessionSummary {
  id: string
  title: string
  /** One-line preview shown in lists: English if available, otherwise the original text */
  preview: string
  versionCount: number
  /** pending: created, generation not started yet */
  state: 'ready' | 'running' | 'pending' | 'failed'
  starredAt: number | null
  folderId: string | null
  tags: string[]
  updatedAt: number
}

/** LLM config as seen by the frontend (no plaintext key); visible to admins only, shared by everyone */
export interface LlmConfigView {
  preset: LlmPresetId
  baseUrl: string
  model: string
  apiKeyMask: string
  updatedAt: number
}

export type LlmPresetId = 'deepseek' | 'qwen' | 'moonshot' | 'zhipu' | 'doubao' | 'custom'

// ---------------------------------------------------------------------------
// Demo reading

/** A word's position in the audio; the index fields are its character range in the sentence text */
export interface TimedText {
  text: string
  beginMs: number
  endMs: number
  beginIndex: number
  endIndex: number
}

export interface TtsSentence {
  index: number
  /** Temporary playback URL */
  url: string
  words: TimedText[]
}

// ---------------------------------------------------------------------------
// Recitation practice

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

/** A recognized word and its time in the recording (ms) */
export interface SpokenWord {
  word: string
  startMs: number
  endMs: number
}

export type DiffKind = 'mispronounced' | 'paraphrase' | 'missing' | 'extra' | 'grammar'

export interface PracticeDiff {
  kind: DiffKind
  /** Sentence index in the original (0-based) */
  sentenceIndex: number
  /** Wording in the original */
  target: string
  /** What was actually said */
  said: string
  note: string
}

export interface AlignedSentence {
  index: number
  /** The reconstructed "sentence they meant to say"; empty if not recited */
  intended: string
  startMs: number
  endMs: number
}

export interface PhoneScore {
  /** Reference phoneme */
  refPhone: string
  /** Phoneme actually produced */
  phone: string
  accuracy: number
}

export type WordMatch = 'ok' | 'extra' | 'missing' | 'wrong' | 'other'

export interface ScoredWord {
  word: string
  sentenceIndex: number
  startMs: number
  endMs: number
  /** 0-100; -1 when it couldn't be assessed */
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
  /** Next assessment stage to run; stays at transcribe after recording until scoring starts */
  stage: PracticeStage
  /** Whether to score (scoring uses a free use); unscored recordings can still be played back and shared */
  scoreRequested: boolean
  job: PracticeJob | null
  lastError: PracticeError | null
  durationMs: number
  /** Temporary playback URL of the recording */
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
    /** Sentences recited but not assessed (assessment service error or out of time); the report must tell them apart from "not recited" */
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
  scoreRequested: boolean
  failed: boolean
  overall: number | null
  durationMs: number
  createdAt: number
}

// ---------------------------------------------------------------------------
// Saved items (M3)

/** The two tabs of the library page */
export type LibraryTab = 'expression' | 'session'

export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** Level 1-3 */
  depth: number
  /** Order among siblings, smallest first */
  order: number
  createdAt: number
}

/** Number of saved items directly in each folder; keyed by folder id, with an empty string for unfiled */
export type FolderCounts = Record<LibraryTab, Record<string, number>>

/** phrase: key expression from the analysis; slang: slang and idioms; word: word or phrase saved from a sentence or report */
export type ExpressionKind = 'phrase' | 'slang' | 'word'

/** Where it was saved from: analysis, English sentence, scoring report */
export type ExpressionOrigin = 'analysis' | 'sentence' | 'report'

export interface ExpressionSource {
  sessionId: string
  vid: string
  /** Sentence index in that version; -1 when an analysis expression's sentence can't be found */
  sentenceIndex: number
  /** The English sentence as it was when saved (unaffected by later revisions of the session) */
  sentence: string
  from: ExpressionOrigin
  savedAt: number
}

/** Fill state of the definition: ready right away when saved from the analysis, filled in by the LLM when saved from a sentence or report */
export type ExpressionFill = 'ready' | 'pending' | 'failed'

export interface Expression {
  id: string
  text: string
  kind: ExpressionKind
  meaning: string
  usage: string
  example: string
  /** The user's own note */
  note: string
  fill: ExpressionFill
  folderId: string | null
  tags: string[]
  sources: ExpressionSource[]
  createdAt: number
  /** Time of the latest save; lists sort by it, newest first */
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

/** Title of the session the source or usage belongs to; null if the session no longer exists */
export interface SourceView extends ExpressionSource {
  sessionTitle: string | null
}

/** "Also appears in" (「也出现在」): sentences in other sessions that use this expression */
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
// Sharing (M4)

/** Byline shown on shares and the lyrics player; the avatar is a temporary URL */
export interface Profile {
  nickname: string
  avatarUrl: string | null
}

export interface ShareSentence {
  en: string
  zh: string
  /** Start and end time of this sentence in the recording; -1 for sentences not recited */
  startMs: number
  endMs: number
  /** Per-word timing, with character positions in en; empty when there is no word timing */
  words: TimedText[]
}

export interface Share {
  id: string
  title: string
  sentences: ShareSentence[]
  /** Temporary playback URL of the recording */
  audioUrl: string
  durationMs: number
  author: Profile
  createdAt: number
  /** Whether it is your own share: decides between showing "Send to a friend" (「发给朋友」) and "Let me try" (「我也来练」) */
  mine: boolean
}

export interface ShareSummary {
  id: string
  title: string
  /** First English sentence */
  preview: string
  durationMs: number
  createdAt: number
}

// ---------------------------------------------------------------------------
// Membership (M6)

/** Your own membership status */
export interface Account {
  /** User ID (OpenID): sent to an admin to get Pro */
  openid: string
  /** Admins always count as Pro */
  isAdmin: boolean
  /** Whether currently Pro: an admin, or granted and not yet expired */
  pro: boolean
  /** Expiry of the latest grant; null if never granted (kept after it expires) */
  proUntil: number | null
  /** Free uses used and remaining */
  freeUsed: number
  freeLeft: number
}

/** A member on the membership management page */
export interface Member extends Account {
  /** Nickname and avatar from the share byline; null if never set */
  nickname: string | null
  avatarUrl: string | null
  /** Time of first use */
  createdAt: number
}
