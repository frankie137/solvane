import { describe, expect, it } from 'vitest'
import { CloudError, toCloudError } from './cloud-error'

describe('toCloudError', () => {
  it.each([
    [
      'cloud.callFunction:fail -501000 | errMsg: env not exists',
      'NOT_CONFIGURED',
      '云开发环境还没有开通',
    ],
    [
      'cloud.callFunction:fail -404011 cloud function execution error | errMsg: FunctionName parameter could not be found',
      'NOT_CONFIGURED',
      '云函数还没有部署',
    ],
    [
      'cloud.callFunction:fail Error: errCode: -404011 cloud function execution error | errMsg: Invoking task timed out after 3 seconds',
      'TIMEOUT',
      '请求超时，请稍后再试',
    ],
    [
      'cloud.callFunction:fail Error: errCode: -404011 cloud function execution error | errMsg: TypeError: x is not a function',
      'UPSTREAM_ERROR',
      '云函数执行出错，请稍后再试',
    ],
    ['cloud.callFunction:fail request:fail timeout', 'TIMEOUT', '请求超时，请稍后再试'],
    ['cloud.callFunction:fail request:fail', 'NETWORK', '网络连接失败，请检查网络后重试'],
    [
      'cloud.callFunction:fail -502005 database collection not exists',
      'INTERNAL',
      '云服务暂时不可用，请稍后再试',
    ],
  ])('%s → %s', (errMsg, code, message) => {
    const e = toCloudError({ errMsg })
    expect(e).toBeInstanceOf(CloudError)
    expect(e.code).toBe(code)
    expect(e.message).toBe(message)
  })

  it('returns a CloudError unchanged', () => {
    const original = new CloudError('FORBIDDEN', '没有权限')
    expect(toCloudError(original)).toBe(original)
  })

  it('handles non-object errors', () => {
    expect(toCloudError('boom').code).toBe('INTERNAL')
    expect(toCloudError(undefined).code).toBe('INTERNAL')
  })
})
