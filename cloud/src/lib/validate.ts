import type { z } from 'zod'
import { AppError } from './errors'

/**
 * Validates the payload from the frontend; the router only ensures it's an object, and each
 * action validates its own fields
 */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new AppError('BAD_REQUEST', '请求参数不正确')
  }
  return result.data
}
