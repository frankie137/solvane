import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, maskSecret } from '../src/lib/crypto'
import { AppError } from '../src/lib/errors'

const SECRET = 'a-very-long-test-secret-value'

describe('encryptSecret / decryptSecret', () => {
  it('round-trips, producing different ciphertext each time', () => {
    const a = encryptSecret('sk-123456789', SECRET)
    const b = encryptSecret('sk-123456789', SECRET)
    expect(a).not.toBe(b)
    expect(a).not.toContain('sk-123456789')
    expect(decryptSecret(a, SECRET)).toBe('sk-123456789')
  })

  it('throws with the wrong encryption secret instead of returning garbage', () => {
    const token = encryptSecret('sk-123456789', SECRET)
    expect(() => decryptSecret(token, 'another-secret-value-xx')).toThrow(AppError)
  })

  it('throws when the ciphertext is tampered with', () => {
    const [v, iv, tag, body] = encryptSecret('sk-123456789', SECRET).split(':')
    const flipped = Buffer.from(body!, 'base64')
    flipped[0] = flipped[0]! ^ 0xff
    const tampered = [v, iv, tag, flipped.toString('base64')].join(':')
    expect(() => decryptSecret(tampered, SECRET)).toThrow(AppError)
  })

  it('throws on a malformed token', () => {
    expect(() => decryptSecret('plain-text', SECRET)).toThrow(AppError)
  })
})

describe('maskSecret', () => {
  it('keeps the first 3 and last 4 characters', () => {
    expect(maskSecret('sk-abcdefghijklmn')).toBe('sk-****klmn')
  })
  it('fully masks keys that are too short', () => {
    expect(maskSecret('short')).toBe('****')
  })
})
