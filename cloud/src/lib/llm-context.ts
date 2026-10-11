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
 * 生成任务需要的上下文：自己的学习偏好 + 管理员统一设置的大模型。
 * 成员不能填自己的配置（M6 起），没配置时按身份给出不同的提示。
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
