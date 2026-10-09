import type { ErrorCode } from '@shared/result'

/** 业务可预期的错误：message 会原样返回给前端，必须是对用户友好的中文 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
