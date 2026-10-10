import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/lib/errors'
import {
  buildSoeUrl,
  evaluatePronunciation,
  parseSoeResult,
  type SocketLike,
} from '../src/lib/tencent/soe'

const CRED = { secretId: 'AKIDtest', secretKey: 'secret-key', appId: '1300000000' }
const FIXED = { timestamp: 1700000000, nonce: 12345, voiceId: 'voice-1' }

describe('buildSoeUrl', () => {
  it('参数按字典序拼接、用未编码原值签名，签名原文不带 wss://', () => {
    const url = buildSoeUrl(CRED, { refText: "I'm going hiking.", mode: 'sentence', ...FIXED })
    const raw = [
      'eval_mode=1',
      'expired=1700003600',
      'nonce=12345',
      'rec_mode=1',
      "ref_text=I'm going hiking.",
      'score_coeff=3.5',
      'secretid=AKIDtest',
      'sentence_info_enabled=0',
      'server_engine_type=16k_en',
      'text_mode=0',
      'timestamp=1700000000',
      'voice_format=0',
      'voice_id=voice-1',
    ].join('&')
    const expected = createHmac('sha1', 'secret-key')
      .update(`soe.cloud.tencent.com/soe/api/1300000000?${raw}`)
      .digest('base64')
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('wss:')
    expect(parsed.pathname).toBe('/soe/api/1300000000')
    expect(parsed.searchParams.get('signature')).toBe(expected)
    expect(parsed.searchParams.get('ref_text')).toBe("I'm going hiking.")
  })

  it('签名里的 + 和 = 被正确编码', () => {
    const url = buildSoeUrl(CRED, { refText: 'a', mode: 'paragraph', ...FIXED })
    const encoded = url.split('signature=')[1]!
    expect(encoded).not.toMatch(/[+=/]/)
    expect(new URL(url).searchParams.get('eval_mode')).toBe('2')
  })
})

describe('parseSoeResult', () => {
  const sample = {
    PronAccuracy: 82.5,
    PronFluency: 0.91,
    PronCompletion: 0.95,
    Words: [
      {
        Word: 'think',
        ReferenceWord: 'think',
        MemBeginTime: 120,
        MemEndTime: 480,
        PronAccuracy: 55,
        MatchTag: 0,
        PhoneInfos: [{ Phone: 's', ReferencePhone: 'th', PronAccuracy: 30 }],
      },
      { Word: ',', MatchTag: 5 },
      {
        Word: '',
        ReferenceWord: 'about',
        MemBeginTime: -1,
        MemEndTime: -1,
        PronAccuracy: -1,
        MatchTag: 2,
      },
    ],
  }

  it('转换分数、单词和音素，去掉标点', () => {
    const r = parseSoeResult(sample)
    expect(r).toMatchObject({ accuracy: 82.5, fluency: 0.91, completeness: 0.95 })
    expect(r.words).toHaveLength(2)
    expect(r.words[0]).toMatchObject({
      word: 'think',
      startMs: 120,
      endMs: 480,
      accuracy: 55,
      match: 'ok',
      phones: [{ refPhone: 'th', phone: 's', accuracy: 30 }],
    })
    expect(r.words[1]).toMatchObject({
      refWord: 'about',
      match: 'missing',
      startMs: 0,
      accuracy: -1,
    })
  })

  it('result 是 JSON 字符串时也能解析', () => {
    expect(parseSoeResult(JSON.stringify(sample)).words).toHaveLength(2)
  })
})

/** 按脚本回放服务端消息的假连接 */
function fakeSocket(script: (s: FakeSocket) => void) {
  const sent: (Buffer | string)[] = []
  let socket: FakeSocket
  const factory = (url: string) => {
    socket = new FakeSocket(url, sent)
    queueMicrotask(() => script(socket))
    return socket as unknown as SocketLike
  }
  return { factory, sent }
}

class FakeSocket {
  listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  closed = false
  constructor(
    readonly url: string,
    readonly sent: (Buffer | string)[],
  ) {}
  on(event: string, l: (...args: unknown[]) => void) {
    ;(this.listeners[event] ??= []).push(l)
    return this
  }
  emit(event: string, ...args: unknown[]) {
    for (const l of this.listeners[event] ?? []) l(...args)
  }
  send(data: Buffer | string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  terminate() {
    this.closed = true
  }
}

const audio = Buffer.alloc(320)
const req = { refText: 'Hi there.', mode: 'sentence' as const, timeoutMs: 1000 }

describe('evaluatePronunciation', () => {
  it('发送音频和结束标记，拿到最终结果', async () => {
    const { factory, sent } = fakeSocket((s) => {
      s.emit('open')
      s.emit('message', JSON.stringify({ code: 0, final: 0, result: {} }))
      s.emit(
        'message',
        JSON.stringify({ code: 0, final: 1, result: { PronAccuracy: 90, Words: [] } }),
      )
    })
    const r = await evaluatePronunciation(CRED, audio, req, factory)
    expect(r.accuracy).toBe(90)
    expect(sent[0]).toBe(audio)
    expect(sent[1]).toBe('{"type":"end"}')
  })

  it('接口报错时给出可读提示', async () => {
    const { factory } = fakeSocket((s) => {
      s.emit('open')
      s.emit('message', JSON.stringify({ code: 4002, message: 'signature invalid' }))
    })
    const err = await evaluatePronunciation(CRED, audio, req, factory).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).message).toContain('SOE_APP_ID')
  })

  it('没有结果就断开时报错', async () => {
    const { factory } = fakeSocket((s) => s.emit('close'))
    await expect(evaluatePronunciation(CRED, audio, req, factory)).rejects.toThrow('断开')
  })

  it('超时报 TIMEOUT', async () => {
    const { factory } = fakeSocket(() => {})
    const err = await evaluatePronunciation(CRED, audio, { ...req, timeoutMs: 10 }, factory).catch(
      (e: unknown) => e,
    )
    expect((err as AppError).code).toBe('TIMEOUT')
  })
})
