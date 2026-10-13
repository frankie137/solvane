/** Uniform cloud function result: the frontend only checks ok instead of guessing at error shapes */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_CONFIGURED'
  /** Free uses exhausted; the frontend shows the Pro intro */
  | 'QUOTA_EXCEEDED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL'

export interface ApiError {
  code: ErrorCode
  /** Chinese message shown directly to the user; must not contain secrets, stack traces or other internals */
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
