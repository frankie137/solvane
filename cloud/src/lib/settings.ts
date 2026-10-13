import { DEFAULT_SETTINGS } from '@shared/constants'
import type { UserSettings } from '@shared/types'
import type { SettingsDoc } from './repos'

/** Full learning preferences from the settings document, with defaults for missing fields */
export function toUserSettings(doc: SettingsDoc | null | undefined): UserSettings {
  return {
    level: doc?.level ?? DEFAULT_SETTINGS.level,
    accent: doc?.accent ?? DEFAULT_SETTINGS.accent,
    ttsVoice: doc?.ttsVoice ?? DEFAULT_SETTINGS.ttsVoice,
    ttsSpeed: doc?.ttsSpeed ?? DEFAULT_SETTINGS.ttsSpeed,
  }
}
