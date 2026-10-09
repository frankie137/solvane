/** 云函数统一返回结构：前端只需判断 ok，不用猜测各种异常形态 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL'

export interface ApiError {
  code: ErrorCode
  /** 可直接展示给用户的中文说明，不得包含密钥、堆栈等内部信息 */
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

export function fail(code: ErrorCode, message: string): ApiResult<never> {
  return { ok: false, error: { code, message } }
}

export function isApiResult(value: unknown): value is ApiResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false
  const v = value as Record<string, unknown>
  if (v.ok === true) return 'data' in v
  if (v.ok === false) {
    const error = v.error as Record<string, unknown> | undefined
    return typeof error?.code === 'string' && typeof error.message === 'string'
  }
  return false
}
