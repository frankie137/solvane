import * as tencentcloud from 'tencentcloud-sdk-nodejs-asr'
import type { SpokenWord } from '@shared/types'
import { toTencentError } from './errors'

const AsrClient = tencentcloud.asr.v20190614.Client

export type Credential = { secretId: string; secretKey: string }

export interface RecognizeOptions {
  /** 16k_zh for Chinese, 16k_en for English */
  engine: '16k_zh' | '16k_en'
  /** Return the timing of each word */
  words?: boolean
}

export interface RecognizeResult {
  text: string
  words: SpokenWord[]
}

/**
 * Tencent Cloud short-sentence recognition (up to 60 s of 16 kHz mono PCM); fn is the cloud
 * function that holds the credentials, used in error messages
 */
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
