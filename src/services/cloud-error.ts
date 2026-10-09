import type { ErrorCode } from '@shared/result'

export type ClientErrorCode = ErrorCode | 'NETWORK'

export class CloudError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CloudError'
  }
}

/** 把 wx.cloud.callFunction 抛出的原始错误（errMsg 字符串）归类成用户能看懂的提示 */
export function toCloudError(err: unknown): CloudError {
  if (err instanceof CloudError) return err
  const errMsg =
    typeof err === 'object' && err !== null && 'errMsg' in err
      ? String((err as { errMsg: unknown }).errMsg)
      : String(err)

  if (/-501000|env.*(not.*exist|invalid)|cloud init/i.test(errMsg)) {
    return new CloudError('NOT_CONFIGURED', '云开发环境还没有开通')
  }
  if (/-404011|FunctionName|function.*not.*(found|exist)/i.test(errMsg)) {
    return new CloudError('NOT_CONFIGURED', '云函数还没有部署')
  }
  if (/timeout|timed out/i.test(errMsg)) {
    return new CloudError('TIMEOUT', '请求超时，请稍后再试')
  }
  return new CloudError('NETWORK', '网络连接失败，请检查网络后重试')
}
