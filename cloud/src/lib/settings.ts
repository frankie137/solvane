import { DEFAULT_SETTINGS } from '@shared/constants'
import type { UserSettings } from '@shared/types'
import type { SettingsDoc } from './repos'

/** 从设置文档得到完整的学习偏好，缺的字段用默认值补上 */
export function toUserSettings(doc: SettingsDoc | null | undefined): UserSettings {
  return {
    level: doc?.level ?? DEFAULT_SETTINGS.level,
    accent: doc?.accent ?? DEFAULT_SETTINGS.accent,
    ttsVoice: doc?.ttsVoice ?? DEFAULT_SETTINGS.ttsVoice,
    ttsSpeed: doc?.ttsSpeed ?? DEFAULT_SETTINGS.ttsSpeed,
  }
}
