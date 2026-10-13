import { randomUUID } from 'node:crypto'
import * as tencentcloud from 'tencentcloud-sdk-nodejs-tts'
import type { TimedText } from '@shared/types'
import type { Credential } from './asr'
import { toTencentError } from './errors'

const TtsClient = tencentcloud.tts.v20190823.Client

export interface SynthesizeOptions {
  text: string
  /** Tencent Cloud voice ID */
  voiceType: number
  /** Tencent Cloud Speed: -1 is 0.8x, 0 is normal */
  speed: number
}

export interface SynthesizeResult {
  audio: Buffer
  words: TimedText[]
}

/** Tencent Cloud basic TTS, up to 500 English letters per call; returns mp3 and per-word timings */
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
