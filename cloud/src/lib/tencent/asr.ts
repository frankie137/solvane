import * as tencentcloud from 'tencentcloud-sdk-nodejs-asr'
import type { SpokenWord } from '@shared/types'
import { toTencentError } from './errors'

const AsrClient = tencentcloud.asr.v20190614.Client

export type Credential = { secretId: string; secretKey: string }

export interface RecognizeOptions {
  /** 16k_zh 中文、16k_en 英文 */
  engine: '16k_zh' | '16k_en'
  /** 返回每个词的时间位置 */
  words?: boolean
}

export interface RecognizeResult {
  text: string
  words: SpokenWord[]
}

/** 腾讯云一句话识别（≤60 秒，16kHz 单声道 PCM）；fn 为配置密钥的云函数名，用于报错提示 */
export function createSentenceRecognizer(getCredential: () => Credential, fn: string) {
  let client: InstanceType<typeof AsrClient> | null = null

  return async function recognize(
    audio: Buffer,
    options: RecognizeOptions,
  ): Promise<RecognizeResult> {
    client ??= new AsrClient({
      credential: getCredential(),
      region: '',
      profile: { httpProfile: { reqTimeout: 15 } },
    })
    try {
      const res = await client.SentenceRecognition({
        EngSerViceType: options.engine,
        SourceType: 1,
        VoiceFormat: 'pcm',
        Data: audio.toString('base64'),
        DataLen: audio.length,
        FilterPunc: 0,
        ConvertNumMode: 1,
        WordInfo: options.words ? 1 : 0,
      })
      return {
        text: res.Result ?? '',
        words: (res.WordList ?? [])
          .filter((w) => typeof w.Word === 'string' && w.Word.trim())
          .map((w) => ({
            word: (w.Word ?? '').trim(),
            startMs: w.StartTime ?? 0,
            endMs: w.EndTime ?? 0,
          })),
      }
    } catch (err) {
      throw toTencentError(err, '语音识别', fn)
    }
  }
}
