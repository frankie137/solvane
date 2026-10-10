/**
 * 腾讯云智聆口语评测（新版）WebSocket 接口。官方没有 Node SDK，按文档实现：
 * https://cloud.tencent.cn/document/product/1774/107497
 *
 * 用「录音模式」（rec_mode=1）：每个连接一次性发送不超过 60 秒的完整音频，再发 {"type":"end"}，
 * 等到 final=1 的结果后断开。签名为 HMAC-SHA1，签名原文是不带 wss:// 的地址加按字典序排列的参数。
 */
import { createHmac, randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { PhoneScore, WordMatch } from '@shared/types'
import { AppError } from '../errors'

const HOST_PATH = 'soe.cloud.tencent.com/soe/api'

export interface SoeCredential {
  secretId: string
  secretKey: string
  /** 腾讯云账号的 AppID（数字），不是微信 AppID */
  appId: string
}

export type SoeMode = 'sentence' | 'paragraph'

export interface SoeRequest {
  refText: string
  mode: SoeMode
  /** 以下三个参数只在测试时固定，正常调用自动生成 */
  timestamp?: number
  nonce?: number
  voiceId?: string
}

/** 评分严格程度：1.0 对应儿童，4.0 对应成人严格打分 */
const SCORE_COEFF = 3.5

/** 生成带签名的连接地址 */
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
    rec_mode: 1,
  }
  const keys = Object.keys(params).sort()
  // 签名用未编码的原值，请求时 key 和 value 都要编码
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

/** 把接口返回的 result 转成内部结构；标点（MatchTag=5）丢掉 */
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

/** 接口返回的错误码转成可操作的提示 */
export function toSoeError(code: number, message: string): AppError {
  const brief = message.replace(/\s+/g, ' ').slice(0, 60)
  if (code === 4002 || /auth|signature|签名|鉴权/i.test(message)) {
    return new AppError(
      'NOT_CONFIGURED',
      '口语评测鉴权失败，请检查 assess 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / SOE_APP_ID',
    )
  }
  if (
    /欠费|未开通|not open|余额|额度|quota|arrear/i.test(message) ||
    code === 4003 ||
    code === 4004 ||
    code === 4005
  ) {
    return new AppError('NOT_CONFIGURED', '腾讯云口语评测未开通、额度已用完或已欠费')
  }
  return new AppError('UPSTREAM_ERROR', `口语评测失败（${code}${brief ? `：${brief}` : ''}）`)
}

/** 最小的 WebSocket 接口，便于测试时替换 */
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

/** 评测一段 PCM（16kHz 单声道）；超时、连接中断、接口报错都转成 AppError */
export function evaluatePronunciation(
  cred: SoeCredential,
  audio: Buffer,
  req: SoeRequest & { timeoutMs: number },
  socketFactory: SocketFactory = defaultSocket,
): Promise<SoeResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const socket = socketFactory(buildSoeUrl(cred, req))
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      try {
        socket.close()
      } catch {
        // 已经关闭
      }
    }
    const timer = setTimeout(
      () => finish(() => reject(new AppError('TIMEOUT', '口语评测超时，请重试'))),
      req.timeoutMs,
    )

    socket.on('open', () => {
      socket.send(audio)
      socket.send(JSON.stringify({ type: 'end' }))
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
