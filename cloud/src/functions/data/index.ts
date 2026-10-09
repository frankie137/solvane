import { createFunction } from '../../lib/cloud'
import { handlers } from './handlers'

export const main = createFunction('data', handlers)
