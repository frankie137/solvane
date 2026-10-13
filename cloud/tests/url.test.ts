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
    ['not a URL', 'not a url'],
    ['http scheme', 'http://api.deepseek.com/v1'],
    ['IPv4', 'https://10.0.0.1/v1'],
    ['IPv6', 'https://[::1]/v1'],
    ['localhost', 'https://localhost/v1'],
    ['hostname without a dot', 'https://intranet/v1'],
    ['internal suffix', 'https://llm.internal/v1'],
    ['credentials', 'https://user:pass@api.deepseek.com/v1'],
    ['query string', 'https://api.deepseek.com/v1?x=1'],
  ])('rejects %s', (_name, input) => {
    expect(() => normalizeBaseUrl(input)).toThrow()
  })
})
