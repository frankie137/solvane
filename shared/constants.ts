import type { Accent, EnglishLevel, LlmPresetId, TtsSpeed, TtsVoice, UserSettings } from './types'

export const LEVELS: { id: EnglishLevel; name: string; hint: string }[] = [
  { id: 'junior', name: '初中', hint: '常用 1500 词左右，以短句为主' },
  { id: 'senior', name: '高中', hint: '常用 3500 词左右，可用简单的复合句' },
  { id: 'cet4', name: '四级', hint: '约 4500 词，日常话题表达自如' },
  { id: 'cet6', name: '六级', hint: '约 6000 词，可用较丰富的短语和习语' },
  { id: 'ielts', name: '雅思', hint: '约 7000 词，表达地道多样' },
  { id: 'toefl', name: '托福', hint: '约 8000 词，用词精准、句式灵活' },
]

export const ACCENTS: { id: Accent; name: string }[] = [
  { id: 'us', name: '美式' },
  { id: 'uk', name: '英式' },
]

export const DEFAULT_SETTINGS: UserSettings = {
  level: 'cet6',
  accent: 'us',
  ttsVoice: 'female',
  ttsSpeed: 'normal',
}

/** Demo reading: Tencent Cloud large-model voices (US accent only) */
export const TTS_VOICES: { id: TtsVoice; name: string; voiceType: number }[] = [
  { id: 'female', name: '女声 WeWinny', voiceType: 501009 },
  { id: 'male', name: '男声 WeJames', voiceType: 501008 },
]

/** Speed: the Tencent Cloud Speed parameter; -1 is 0.8x, 0 is normal */
export const TTS_SPEEDS: { id: TtsSpeed; name: string; speed: number }[] = [
  { id: 'normal', name: '正常', speed: 0 },
  { id: 'slow', name: '慢速 0.8×', speed: -1 },
]

export interface LlmPreset {
  id: LlmPresetId
  name: string
  baseUrl: string
  /** Prefilled model name; when empty, the admin enters one */
  defaultModel: string
  modelHint: string
}

/** Presets only fill in the API URL; model names change often, so the provider's console is authoritative */
export const LLM_PRESETS: LlmPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelHint: '如 deepseek-chat',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    modelHint: '如 qwen-plus',
  },
  {
    id: 'moonshot',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: '',
    modelHint: '填写 Kimi 控制台中的模型名',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: '',
    modelHint: '填写智谱控制台中的模型名',
  },
  {
    id: 'doubao',
    name: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '',
    modelHint: '填写模型 ID 或推理接入点 ID',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    defaultModel: '',
    modelHint: '填写服务商提供的模型名',
  },
]

/** Recording and input limits */
export const LIMITS = {
  recordMaxMs: 60_000,
  recordMinMs: 1_000,
  rawTextMax: 600,
  instructionMax: 120,
  recentSessions: 10,
  /** Recitation recordings are at most 60 seconds (the per-request limit of English ASR) */
  reciteMaxMs: 60_000,
  /** Practice records kept per session */
  practicesPerSession: 3,
  /** Max folder depth and name length */
  folderDepth: 3,
  folderNameMax: 20,
  /** Max tags per saved item and max tag length */
  tagsPerItem: 10,
  tagMax: 12,
  /** Max length of a saved expression and of its note */
  expressionMax: 80,
  noteMax: 300,
  /** Max items listed under "Also appears in" (「也出现在」) */
  usagesMax: 20,
  /** Items per page on the history page */
  historyPage: 20,
  /** Max nickname length */
  nicknameMax: 20,
  /** Max items listed in My Shares (「我的分享」) */
  sharesMax: 50,
} as const

/** Membership: free uses (new sessions and scoring combined, never reset), days per grant, and the displayed price */
export const PRO = {
  freeTrials: 5,
  grantDays: 30,
  price: '9.9 元/月',
} as const

/** Scoring weights: pronunciation 40%, fluency 20%, content recall 25%, expression accuracy 15% */
export const SCORE_WEIGHTS = {
  pronunciation: 0.4,
  fluency: 0.2,
  content: 0.25,
  expression: 0.15,
} as const

/** A generation job still unfinished after this long is treated as interrupted and may be restarted */
export const JOB_STALE_MS = 70_000

/** Quick revision instructions */
export const QUICK_INSTRUCTIONS = ['更随意一点', '更正式一点', '更简短', '加点地道俚语']
