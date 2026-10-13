/**
 * WebSocket API for Tencent Cloud Smart Oral Evaluation (SOE, new version). There is no official
 * Node SDK, so this follows the docs:
 * https://cloud.tencent.cn/document/product/1774/107497
 *
 * Uses the recommended real-time streaming mode (rec_mode=0): PCM is sent in chunks at a 1:1
 * real-time rate (sending faster than real time is an error), then {"type":"end"}, and the
 * connection closes after the final=1 result.
 * Signature: HMAC-SHA1 over the URL without wss:// plus the parameters in lexicographic order.
 */
import { createHmac, randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { PhoneScore, WordMatch } from '@shared/types'
import { AppError } from '../errors'

const HOST_PATH = 'soe.cloud.tencent.com/soe/api'

export interface SoeCredential {
  secretId: string
  secretKey: string
  /** The Tencent Cloud account AppID (numeric), not the WeChat AppID */
  appId: string
}

export type SoeMode = 'sentence' | 'paragraph'

export interface SoeRequest {
  refText: string
  mode: SoeMode
  /** The next three parameters are fixed only in tests; normally they are generated */
  timestamp?: number
  nonce?: number
  voiceId?: string
}

/** Scoring strictness: 1.0 is for children, 4.0 is strict adult scoring */
const SCORE_COEFF = 3.5

/** Builds the signed connection URL */
export function buildSoeUrl(cred: SoeCredential, req: SoeRequest): string {
  const timestamp = req.timestamp ?? Math.floor(Date.now() / 1000)
  const params: Record<string, string | number> = {
    secretid: cred.secretId,
    timestamp,
    expired: timestamp + 3600,
    nonce: req.nonce ?? Math.floor(Math.random() * 1e9) + 1,
    server_engine_type: '16k_en',
    voice_id: req.voiceId ?? randomUUID(),
    voice_format: 0, // pcm
    text_mode: 0,
    ref_text: req.refText,
    eval_mode: req.mode === 'sentence' ? 1 : 2,
    score_coeff: SCORE_COEFF,
    sentence_info_enabled: 0,
    rec_mode: 0,
  }
  const keys = Object.keys(params).sort()
  // Sign the raw unencoded values; in the request both keys and values must be encoded
  const raw = keys.map((k) => `${k}=${params[k]}`).join('&')
  const signature = createHmac('sha1', cred.secretKey)
    .update(`${HOST_PATH}/${cred.appId}?${raw}`)
    .digest('base64')
  const query = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
  query.push(`signature=${encodeURIComponent(signature)}`)
  return `wss://${HOST_PATH}/${cred.appId}?${query.join('&')}`
}

export interface SoeWord {
  word: string
  refWord: string
  startMs: number
  endMs: number
  accuracy: number
  match: WordMatch
  phones: PhoneScore[]
}

export interface SoeResult {
  /** 0～100 */
  accuracy: number
  /** 0～1 */
  fluency: number
  /** 0～1 */
  completeness: number
  words: SoeWord[]
}

const MATCH: Record<number, WordMatch> = {
  0: 'ok',
  1: 'extra',
  2: 'missing',
  3: 'wrong',
  4: 'other',
}

type Raw = Record<string, unknown>
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Converts the API's result into the internal shape; punctuation (MatchTag=5) is dropped */
export function parseSoeResult(result: unknown): SoeResult {
  const r = (typeof result === 'string' ? JSON.parse(result) : result) as Raw
  const words = (Array.isArray(r.Words) ? (r.Words as Raw[]) : [])
    .filter((w) => num(w.MatchTag) !== 5)
    .map((w) => ({
      word: str(w.Word),
      refWord: str(w.ReferenceWord) || str(w.Word),
      startMs: Math.max(0, num(w.MemBeginTime)),
      endMs: Math.max(0, num(w.MemEndTime)),
      accuracy: num(w.PronAccuracy, -1),
      match: MATCH[num(w.MatchTag, 4)] ?? 'other',
      phones: (Array.isArray(w.PhoneInfos) ? (w.PhoneInfos as Raw[]) : []).map((p) => ({
        refPhone: str(p.ReferencePhone) || str(p.Phone),
        phone: str(p.Phone),
        accuracy: num(p.PronAccuracy, -1),
      })),
    }))
  return {
    accuracy: Math.max(0, num(r.PronAccuracy)),
    fluency: Math.max(0, num(r.PronFluency)),
    completeness: Math.max(0, num(r.PronCompletion)),
    words,
  }
}

/** Turns API error codes into actionable messages */
export function toSoeError(code: number, message: string): AppError {
  const brief = message.replace(/\s+/g, ' ').slice(0, 60)
  // Include the code and reason for troubleshooting (nothing sensitive)
  const tag = `（${code}${brief ? `：${brief}` : ''}）`
  // Check the code first: "not enabled" and "overdue" messages may also contain "auth"
  if (code === 4003 || code === 4004 || code === 4005) {
    return new AppError('NOT_CONFIGURED', `腾讯云口语评测未开通、额度已用完或已欠费${tag}`)
  }
  if (code === 4002) {
    return new AppError(
      'NOT_CONFIGURED',
      `口语评测鉴权失败，请检查 assess 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / SOE_APP_ID，以及子账号是否有口语评测权限${tag}`,
    )
  }
  if (/欠费|未开通|not open|余额|额度|quota|arrear/i.test(message)) {
    return new AppError('NOT_CONFIGURED', `腾讯云口语评测未开通、额度已用完或已欠费${tag}`)
  }
  if (/auth|signature|签名|鉴权/i.test(message)) {
    return new AppError(
      'NOT_CONFIGURED',
      `口语评测鉴权失败，请检查 assess 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / SOE_APP_ID，以及子账号是否有口语评测权限${tag}`,
    )
  }
  return new AppError('UPSTREAM_ERROR', `口语评测失败${tag}`)
}

/** Minimal WebSocket interface, easy to swap out in tests */
export interface SocketLike {
  on(event: 'open', listener: () => void): unknown
  on(event: 'message', listener: (data: unknown, isBinary: boolean) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'close', listener: () => void): unknown
  send(data: Buffer | string): void
  close(): void
  terminate(): void
}

export type SocketFactory = (url: string) => SocketLike

const defaultSocket: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike

/** 200 ms of 16 kHz mono PCM per chunk */
const CHUNK_BYTES = 6400
const CHUNK_INTERVAL_MS = 200

/** Roughly how long sending the audio takes at the real-time rate (ms) */
export function streamDurationMs(audio: Buffer): number {
  return Math.ceil(audio.length / CHUNK_BYTES) * CHUNK_INTERVAL_MS
}

/** Assesses 16 kHz mono PCM; timeouts, dropped connections and API errors all become AppError */
export function evaluatePronunciation(
  cred: SoeCredential,
  audio: Buffer,
  req: SoeRequest & { timeoutMs: number; chunkIntervalMs?: number },
  socketFactory: SocketFactory = defaultSocket,
): Promise<SoeResult> {
  const interval = req.chunkIntervalMs ?? CHUNK_INTERVAL_MS
  return new Promise((resolve, reject) => {
    let settled = false
    let sendTimer: ReturnType<typeof setTimeout> | null = null
    const socket = socketFactory(buildSoeUrl(cred, req))
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (sendTimer) clearTimeout(sendTimer)
      fn()
      try {
        socket.close()
      } catch {
        // Already closed
      }
    }
    const timer = setTimeout(
      () => finish(() => reject(new AppError('TIMEOUT', '口语评测超时，请重试'))),
      req.timeoutMs,
    )

    socket.on('open', () => {
      let offset = 0
      const sendNext = () => {
        if (settled) return
        if (offset >= audio.length) {
          socket.send(JSON.stringify({ type: 'end' }))
          return
        }
        socket.send(audio.subarray(offset, offset + CHUNK_BYTES))
        offset += CHUNK_BYTES
        sendTimer = setTimeout(sendNext, interval)
      }
      sendNext()
    })
    socket.on('message', (data) => {
      let msg: Raw
      try {
        msg = JSON.parse(String(data)) as Raw
      } catch {
        return
      }
      const code = num(msg.code)
      if (code !== 0) {
        finish(() => reject(toSoeError(code, str(msg.message))))
        return
      }
      if (num(msg.final) === 1) {
        try {
          const parsed = parseSoeResult(msg.result)
          finish(() => resolve(parsed))
        } catch {
          finish(() => reject(new AppError('UPSTREAM_ERROR', '口语评测返回的数据无法解析')))
        }
      }
    })
    socket.on('error', () =>
      finish(() => reject(new AppError('UPSTREAM_ERROR', '无法连接口语评测服务'))),
    )
    socket.on('close', () =>
      finish(() => reject(new AppError('UPSTREAM_ERROR', '口语评测连接意外断开'))),
    )
  })
}
