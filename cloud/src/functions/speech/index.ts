import { createFunction, getCloud } from '../../lib/cloud'
import { env } from '../../lib/env'
import { createWxRepos, type WxDatabase } from '../../lib/repos'
import { createWxStorage } from '../../lib/storage'
import { createSentenceRecognizer } from '../../lib/tencent/asr'
import { createSynthesizer } from '../../lib/tencent/tts'
import { createSpeechHandlers } from './handlers'

const cloud = getCloud()
const credential = () => env.tencentCredential('speech')

export const main = createFunction(
  'speech',
  createSpeechHandlers({
    repos: createWxRepos(cloud.database() as unknown as WxDatabase),
    storage: createWxStorage(cloud),
    recognize: createSentenceRecognizer(credential, 'speech'),
    synthesize: createSynthesizer(credential, 'speech'),
  }),
)
