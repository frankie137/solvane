import { createFunction, getCloud } from '../../lib/cloud'
import { env } from '../../lib/env'
import { createLlmContextLoader } from '../../lib/llm-context'
import { chatJson } from '../../lib/llm/json'
import { createWxRepos, type WxDatabase } from '../../lib/repos'
import { createWxStorage } from '../../lib/storage'
import { createSentenceRecognizer } from '../../lib/tencent/asr'
import { evaluatePronunciation } from '../../lib/tencent/soe'
import { createAssessHandlers } from './handlers'

const cloud = getCloud()
const repos = createWxRepos(cloud.database() as unknown as WxDatabase)
const credential = () => env.tencentCredential('assess')

export const main = createFunction(
  'assess',
  createAssessHandlers({
    repos,
    storage: createWxStorage(cloud),
    recognize: createSentenceRecognizer(credential, 'assess'),
    evaluate: (audio, req) =>
      evaluatePronunciation({ ...credential(), appId: env.soeAppId() }, audio, req),
    llm: {
      chatJson: (target, messages, schema, options) => chatJson(target, messages, schema, options),
    },
    loadLlmContext: createLlmContextLoader(repos.settings, env.assessEncryptionSecret, (openid) =>
      env.adminOpenids().includes(openid),
    ),
    adminOpenids: env.adminOpenids,
    now: Date.now,
  }),
)
