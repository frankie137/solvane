import type { z } from 'zod'
import { AppError } from './errors'

/** 校验前端传来的参数；路由只保证是对象，字段由各 action 自己校验 */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new AppError('BAD_REQUEST', '请求参数不正确')
  }
  return result.data
}
