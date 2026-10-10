import { createFunction, getCloud } from '../../lib/cloud'
import { createWxRepos, type WxDatabase } from '../../lib/repos'
import { createDataHandlers } from './handlers'

const db = getCloud().database() as unknown as WxDatabase

export const main = createFunction(
  'data',
  createDataHandlers({ repos: createWxRepos(db), now: Date.now }),
)
