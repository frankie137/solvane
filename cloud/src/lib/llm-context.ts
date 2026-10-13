import type { UserSettings } from '@shared/types'
import { decryptSecret } from './crypto'
import { AppError } from './errors'
import type { LlmTarget } from './llm/client'
import { GLOBAL_SETTINGS_ID, type SettingsRepo } from './repos'
import { toUserSettings } from './settings'

export interface LlmContext {
  target: LlmTarget
  userSettings: UserSettings
}

/**
 * Context for generation jobs: the user's own learning preferences + the LLM set up by the admin.
 * Members can't set their own config (since M6); when it's missing, the message depends on role.
 */
export function createLlmContextLoader(
  settings: SettingsRepo,
  encryptionSecret: () => string,
  isAdmin: (openid: string) => boolean,
) {
  return async function loadLlmContext(openid: string): Promise<LlmContext> {
    const [own, global] = await Promise.all([
      settings.get(openid),
      settings.get(GLOBAL_SETTINGS_ID),
    ])
    const stored = global?.llm
    if (!stored) {
      throw new AppError(
        'NOT_CONFIGURED',
        isAdmin(openid)
          ? '还没有配置大模型，请到「我的 → 大模型配置」中设置'
          : '管理员还没有配置大模型，请联系管理员',
      )
    }
    return {
      target: {
        baseUrl: stored.baseUrl,
        model: stored.model,
        apiKey: decryptSecret(stored.apiKeyCipher, encryptionSecret()),
      },
      userSettings: toUserSettings(own),
    }
  }
}
