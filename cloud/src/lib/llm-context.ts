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
 * 生成任务需要的上下文：学习偏好 + 大模型目标。
 * 自己的设置文档只读一次；没有自己的大模型配置时才读管理员的全局默认。
 */
export function createLlmContextLoader(settings: SettingsRepo, encryptionSecret: () => string) {
  return async function loadLlmContext(openid: string): Promise<LlmContext> {
    const own = await settings.get(openid)
    const stored = own?.llm ?? (await settings.get(GLOBAL_SETTINGS_ID))?.llm
    if (!stored) {
      throw new AppError('NOT_CONFIGURED', '还没有配置大模型，请到「我的 → 大模型配置」中设置')
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
