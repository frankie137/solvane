import { describe, expect, it } from 'vitest'
import { fail, isApiResult, ok } from './result'

describe('isApiResult', () => {
  it('识别成功结果', () => {
    expect(isApiResult(ok({ a: 1 }))).toBe(true)
    expect(isApiResult(ok(null))).toBe(true)
  })

  it('识别失败结果', () => {
    expect(isApiResult(fail('NOT_FOUND', '找不到'))).toBe(true)
  })

  it('拒绝不完整或无关的结构', () => {
    expect(isApiResult(undefined)).toBe(false)
    expect(isApiResult(null)).toBe(false)
    expect(isApiResult('ok')).toBe(false)
    expect(isApiResult({ ok: true })).toBe(false)
    expect(isApiResult({ ok: false })).toBe(false)
    expect(isApiResult({ ok: false, error: { code: 1, message: 'x' } })).toBe(false)
    expect(isApiResult({ ok: 'yes', data: 1 })).toBe(false)
  })
})
