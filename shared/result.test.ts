import { describe, expect, it } from 'vitest'
import { fail, isApiResult, ok } from './result'

describe('isApiResult', () => {
  it('recognizes success results', () => {
    expect(isApiResult(ok({ a: 1 }))).toBe(true)
    expect(isApiResult(ok(null))).toBe(true)
  })

  it('recognizes failure results', () => {
    expect(isApiResult(fail('NOT_FOUND', '找不到'))).toBe(true)
  })

  it('rejects incomplete or unrelated shapes', () => {
    expect(isApiResult(undefined)).toBe(false)
    expect(isApiResult(null)).toBe(false)
    expect(isApiResult('ok')).toBe(false)
    expect(isApiResult({ ok: true })).toBe(false)
    expect(isApiResult({ ok: false })).toBe(false)
    expect(isApiResult({ ok: false, error: { code: 1, message: 'x' } })).toBe(false)
    expect(isApiResult({ ok: 'yes', data: 1 })).toBe(false)
  })
})
