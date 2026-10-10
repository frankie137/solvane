import { describe, expect, it, vi } from 'vitest'
import { toAsrError } from '../src/functions/speech/asr'
import { createSpeechHandlers, type SpeechDeps } from '../src/functions/speech/handlers'

const ME = { openid: 'o_me' }
const FILE = 'cloud://env-1.xxx/voice-input/a.pcm'

function setup(audio: Buffer, recognized: string | Error) {
  const removed: string[] = []
  const deps: SpeechDeps = {
    storage: {
      download: vi.fn(async () => audio),
      remove: vi.fn(async (id: string) => {
        removed.push(id)
      }),
    },
    recognizeZh: vi.fn(async () => {
      if (recognized instanceof Error) throw recognized
      return recognized
    }),
  }
  return { handlers: createSpeechHandlers(deps), deps, removed }
}

describe('speech.recognize', () => {
  it('返回识别文字并删除录音', async () => {
    const { handlers, removed } = setup(Buffer.alloc(1000), '  周末想去爬山  ')
    await expect(handlers.recognize({ fileID: FILE }, ME)).resolves.toEqual({
      text: '周末想去爬山',
    })
    expect(removed).toEqual([FILE])
  })

  it('没识别出内容时提示重说，仍然删除录音', async () => {
    const { handlers, removed } = setup(Buffer.alloc(1000), '')
    await expect(handlers.recognize({ fileID: FILE }, ME)).rejects.toThrow('没有听清')
    expect(removed).toEqual([FILE])
  })

  it('录音过大时拒绝，不调用识别', async () => {
    const { handlers, deps, removed } = setup(Buffer.alloc(2_200_000), 'x')
    await expect(handlers.recognize({ fileID: FILE }, ME)).rejects.toThrow('60 秒')
    expect(deps.recognizeZh).not.toHaveBeenCalled()
    expect(removed).toEqual([FILE])
  })

  it.each([
    ['非云存储地址', 'https://evil.example/voice-input/a.pcm'],
    ['其他目录的文件', 'cloud://env-1.xxx/recordings/o_other/a.mp3'],
    ['目录穿越', 'cloud://env-1.xxx/voice-input/../shares/a.pcm'],
    ['非 pcm 文件', 'cloud://env-1.xxx/voice-input/a.mp3'],
  ])('拒绝%s，且不读取、不删除', async (_name, fileID) => {
    const { handlers, deps, removed } = setup(Buffer.alloc(10), 'x')
    await expect(handlers.recognize({ fileID }, ME)).rejects.toThrow()
    expect(deps.storage.download).not.toHaveBeenCalled()
    expect(removed).toEqual([])
  })
})

describe('toAsrError', () => {
  it.each([
    ['AuthFailure.SecretIdNotFound', 'NOT_CONFIGURED', 'TENCENT_SECRET_ID'],
    ['UnauthorizedOperation.CamNoAuth', 'NOT_CONFIGURED', '权限'],
    ['FailedOperation.ServiceIsolate', 'NOT_CONFIGURED', '欠费'],
    ['FailedOperation.ErrorRecognize', 'UPSTREAM_ERROR', '识别失败'],
  ])('%s → %s', (code, expected, text) => {
    const err = toAsrError({ code, message: 'x' })
    expect(err.code).toBe(expected)
    expect(err.message).toContain(text)
  })
})
