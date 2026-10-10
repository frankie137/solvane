import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, maskSecret } from '../src/lib/crypto'
import { AppError } from '../src/lib/errors'

const SECRET = 'a-very-long-test-secret-value'

describe('encryptSecret / decryptSecret', () => {
  it('加密后能还原，且每次密文不同', () => {
    const a = encryptSecret('sk-123456789', SECRET)
    const b = encryptSecret('sk-123456789', SECRET)
    expect(a).not.toBe(b)
    expect(a).not.toContain('sk-123456789')
    expect(decryptSecret(a, SECRET)).toBe('sk-123456789')
  })

  it('加密密钥不对时报错，不返回乱码', () => {
    const token = encryptSecret('sk-123456789', SECRET)
    expect(() => decryptSecret(token, 'another-secret-value-xx')).toThrow(AppError)
  })

  it('密文被篡改时报错', () => {
    const [v, iv, tag, body] = encryptSecret('sk-123456789', SECRET).split(':')
    const flipped = Buffer.from(body!, 'base64')
    flipped[0] = flipped[0]! ^ 0xff
    const tampered = [v, iv, tag, flipped.toString('base64')].join(':')
    expect(() => decryptSecret(tampered, SECRET)).toThrow(AppError)
  })

  it('格式不对时报错', () => {
    expect(() => decryptSecret('plain-text', SECRET)).toThrow(AppError)
  })
})

describe('maskSecret', () => {
  it('保留前 3 位和后 4 位', () => {
    expect(maskSecret('sk-abcdefghijklmn')).toBe('sk-****klmn')
  })
  it('太短的 Key 全部打码', () => {
    expect(maskSecret('short')).toBe('****')
  })
})
