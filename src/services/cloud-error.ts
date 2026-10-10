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

/** 超时或断网：请求可能已经到达云端、任务可能仍在运行，值得去查一下结果 */
export function mayStillRun(err: unknown): err is CloudError {
  return err instanceof CloudError && (err.code === 'TIMEOUT' || err.code === 'NETWORK')
}

/**
 * 把 wx.cloud.callFunction 抛出的原始错误（errMsg 字符串）归类成用户能看懂的提示。
 * 注意顺序：超时也会带着 -404011（云函数执行错误），所以先判断超时；
 * -404011 本身只代表"函数执行出错"，只有找不到函数名时才是"没有部署"。
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
  // 所有 errMsg 都以 cloud.callFunction:fail 开头，正则不能宽松匹配 function / not exist
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
