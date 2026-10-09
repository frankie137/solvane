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
      'cloud.callFunction:fail -404011 cloud function execution error | FunctionName parameter could not be found',
      'NOT_CONFIGURED',
      '云函数还没有部署',
    ],
    ['cloud.callFunction:fail request:fail timeout', 'TIMEOUT', '请求超时，请稍后再试'],
    ['request:fail', 'NETWORK', '网络连接失败，请检查网络后重试'],
  ])('%s → %s', (errMsg, code, message) => {
    const e = toCloudError({ errMsg })
    expect(e).toBeInstanceOf(CloudError)
    expect(e.code).toBe(code)
    expect(e.message).toBe(message)
  })

  it('已经是 CloudError 时原样返回', () => {
    const original = new CloudError('FORBIDDEN', '没有权限')
    expect(toCloudError(original)).toBe(original)
  })

  it('非对象错误也能处理', () => {
    expect(toCloudError('boom').code).toBe('NETWORK')
    expect(toCloudError(undefined).code).toBe('NETWORK')
  })
})
