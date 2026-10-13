import type { ErrorCode } from '@shared/result'

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'CANCELLED'

export class CloudError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CloudError'
  }
}

/** Timeout or network loss: the request may have reached the cloud and the job may still be running, so it's worth checking for a result */
export function mayStillRun(err: unknown): err is CloudError {
  return err instanceof CloudError && (err.code === 'TIMEOUT' || err.code === 'NETWORK')
}

/**
 * Classify raw errors thrown by wx.cloud.callFunction (errMsg strings) into messages users can understand.
 * Order matters: timeouts also carry -404011 (cloud function execution error), so check for timeouts first;
 * -404011 by itself only means "function execution failed"; it means "not deployed" only when the function name can't be found.
 */
export function toCloudError(err: unknown): CloudError {
  if (err instanceof CloudError) return err
  const errMsg =
    typeof err === 'object' && err !== null && 'errMsg' in err
      ? String((err as { errMsg: unknown }).errMsg)
      : String(err)

  if (/timed? ?out/i.test(errMsg)) {
    return new CloudError('TIMEOUT', '请求超时，请稍后再试')
  }
  // Every errMsg starts with cloud.callFunction:fail, so regexes must not loosely match function / not exist
  if (/-501000|env not exists?|invalid env/i.test(errMsg)) {
    return new CloudError('NOT_CONFIGURED', '云开发环境还没有开通')
  }
  if (/FunctionName parameter could not be found|function not found/i.test(errMsg)) {
    return new CloudError('NOT_CONFIGURED', '云函数还没有部署')
  }
  if (/-404011/.test(errMsg)) {
    return new CloudError('UPSTREAM_ERROR', '云函数执行出错，请稍后再试')
  }
  if (/request:fail|network/i.test(errMsg)) {
    return new CloudError('NETWORK', '网络连接失败，请检查网络后重试')
  }
  return new CloudError('INTERNAL', '云服务暂时不可用，请稍后再试')
}
