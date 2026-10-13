import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { AppError } from './errors'

const VERSION = 'v1'

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** AES-256-GCM encryption; outputs v1:iv:tag:ciphertext (all base64) */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join(':')
}

export function decryptSecret(token: string, secret: string): string {
  const [version, iv, tag, body] = token.split(':')
  if (version !== VERSION || !iv || !tag || !body) {
    throw new AppError('INTERNAL', '保存的密钥格式无法识别，请重新填写 API Key')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString(
      'utf8',
    )
  } catch {
    // Usually means KEY_ENCRYPTION_SECRET was changed
    throw new AppError('INTERNAL', '无法解密已保存的 API Key，请重新填写')
  }
}

/** Masks for display: keeps the first 3 and last 4 characters */
export function maskSecret(plain: string): string {
  const s = plain.trim()
  if (s.length < 10) return '****'
  return `${s.slice(0, 3)}****${s.slice(-4)}`
}
