import type { Accent, EnglishLevel, LlmPresetId, UserSettings } from './types'

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

export const DEFAULT_SETTINGS: UserSettings = { level: 'cet6', accent: 'us' }

export interface LlmPreset {
  id: LlmPresetId
  name: string
  baseUrl: string
  /** 预填的模型名；为空时需要使用者填写 */
  defaultModel: string
  modelHint: string
}

/** 预设只负责填好接口地址；模型名各家更新频繁，以服务商控制台为准 */
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

/** 录音与输入的限制 */
export const LIMITS = {
  recordMaxMs: 60_000,
  recordMinMs: 1_000,
  rawTextMax: 600,
  instructionMax: 120,
  recentSessions: 10,
} as const

/** 生成任务超过这个时长仍未结束，视为中断，允许重新发起 */
export const JOB_STALE_MS = 70_000

/** 快捷修改要求 */
export const QUICK_INSTRUCTIONS = ['更随意一点', '更正式一点', '更简短', '加点地道俚语']
