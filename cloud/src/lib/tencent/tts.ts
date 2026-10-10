import { randomUUID } from 'node:crypto'
import * as tencentcloud from 'tencentcloud-sdk-nodejs-tts'
import type { TimedText } from '@shared/types'
import type { Credential } from './asr'
import { toTencentError } from './errors'

const TtsClient = tencentcloud.tts.v20190823.Client

export interface SynthesizeOptions {
  text: string
  /** 腾讯云音色 ID */
  voiceType: number
  /** 腾讯云 Speed：-1 为 0.8 倍，0 为正常 */
  speed: number
}

export interface SynthesizeResult {
  audio: Buffer
  words: TimedText[]
}

/** 腾讯云基础语音合成，英文单次不超过 500 个字母；返回 mp3 和逐词时间 */
export function createSynthesizer(getCredential: () => Credential, fn: string) {
  let client: InstanceType<typeof TtsClient> | null = null

  return async function synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
    client ??= new TtsClient({
      credential: getCredential(),
      region: '',
      profile: { httpProfile: { reqTimeout: 15 } },
    })
    try {
      const res = await client.TextToVoice({
        Text: options.text,
        SessionId: randomUUID(),
        VoiceType: options.voiceType,
        PrimaryLanguage: 2,
        ModelType: 1,
        Codec: 'mp3',
        SampleRate: 16000,
        Speed: options.speed,
        EnableSubtitle: true,
      })
      if (!res.Audio) throw new Error('empty audio')
      return {
        audio: Buffer.from(res.Audio, 'base64'),
        words: (res.Subtitles ?? []).map((s) => ({
          text: s.Text ?? '',
          beginMs: s.BeginTime ?? 0,
          endMs: s.EndTime ?? 0,
          beginIndex: s.BeginIndex ?? 0,
          endIndex: s.EndIndex ?? 0,
        })),
      }
    } catch (err) {
      throw toTencentError(err, '语音合成', fn)
    }
  }
}
