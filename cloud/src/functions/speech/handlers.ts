import { z } from 'zod'
import { AppError } from '../../lib/errors'
import type { Handlers } from '../../lib/router'
import { parsePayload } from '../../lib/validate'

export interface SpeechDeps {
  storage: {
    download(fileID: string): Promise<Buffer>
    remove(fileID: string): Promise<void>
  }
  /** 中文一句话识别，输入 16kHz 单声道 PCM */
  recognizeZh(audio: Buffer): Promise<string>
}

/** 60 秒 16kHz 16bit 单声道 PCM 约 1.92 MB，留一点余量 */
const MAX_AUDIO_BYTES = 2_100_000

export function createSpeechHandlers(deps: SpeechDeps): Handlers<'speech'> {
  return {
    async recognize(payload) {
      const { fileID } = parsePayload(
        z.object({ fileID: z.string().startsWith('cloud://').max(500) }),
        payload,
      )
      try {
        const audio = await deps.storage.download(fileID)
        if (audio.length > MAX_AUDIO_BYTES) {
          throw new AppError('BAD_REQUEST', '录音太长了，请控制在 60 秒以内')
        }
        const text = (await deps.recognizeZh(audio)).trim()
        if (!text) throw new AppError('BAD_REQUEST', '没有听清，请靠近一点再说一遍')
        return { text }
      } finally {
        // 录音只用于识别，无论成功与否都删除
        await deps.storage.remove(fileID).catch((err: unknown) => {
          console.error('[speech.recognize] 删除录音失败', err instanceof Error ? err.message : err)
        })
      }
    },
  }
}
