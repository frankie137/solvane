import type { ErrorCode } from '@shared/result'

/**
 * Expected business error: the message is returned to the frontend as is, so it must be
 * user-friendly Chinese
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
