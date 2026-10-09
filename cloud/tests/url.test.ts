import { describe, expect, it } from 'vitest'
import { normalizeBaseUrl } from '../src/lib/url'

describe('normalizeBaseUrl', () => {
  it.each([
    ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1'],
    ['https://api.deepseek.com/v1/', 'https://api.deepseek.com/v1'],
    ['  https://open.bigmodel.cn/api/paas/v4//  ', 'https://open.bigmodel.cn/api/paas/v4'],
    ['https://api.moonshot.cn', 'https://api.moonshot.cn'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected)
  })

  it.each([
    ['不是网址', 'not a url'],
    ['http 协议', 'http://api.deepseek.com/v1'],
    ['IPv4', 'https://10.0.0.1/v1'],
    ['IPv6', 'https://[::1]/v1'],
    ['localhost', 'https://localhost/v1'],
    ['没有点的主机名', 'https://intranet/v1'],
    ['内网后缀', 'https://llm.internal/v1'],
    ['带账号', 'https://user:pass@api.deepseek.com/v1'],
    ['带查询参数', 'https://api.deepseek.com/v1?x=1'],
  ])('拒绝%s', (_name, input) => {
    expect(() => normalizeBaseUrl(input)).toThrow()
  })
})
