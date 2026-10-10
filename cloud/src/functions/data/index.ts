import { randomUUID } from 'node:crypto'
import { createFunction, getCloud } from '../../lib/cloud'
import { createWxRepos, type WxDatabase } from '../../lib/repos'
import { createWxStorage } from '../../lib/storage'
import { createDataHandlers } from './handlers'

const cloud = getCloud()
const db = cloud.database() as unknown as WxDatabase

export const main = createFunction(
  'data',
  createDataHandlers({
    repos: createWxRepos(db),
    storage: createWxStorage(cloud),
    now: Date.now,
    newFileName: () => randomUUID(),
  }),
)
