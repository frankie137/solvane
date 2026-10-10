import { createFunction, getCloud } from '../../lib/cloud'
import { env } from '../../lib/env'
import { chat } from '../../lib/llm/client'
import { chatJson } from '../../lib/llm/json'
import { createWxRepos, type WxDatabase } from '../../lib/repos'
import { PING_MESSAGES } from '../../prompts/compose'
import { createComposeHandlers } from './handlers'

const db = getCloud().database() as unknown as WxDatabase

export const main = createFunction(
  'compose',
  createComposeHandlers({
    repos: createWxRepos(db),
    llm: {
      chatJson: (target, messages, schema, options) => chatJson(target, messages, schema, options),
      ping: (target) => chat(target, PING_MESSAGES, { timeoutMs: 15_000, maxTokens: 10 }),
    },
    now: Date.now,
    encryptionSecret: env.encryptionSecret,
    adminOpenids: env.adminOpenids,
  }),
)
