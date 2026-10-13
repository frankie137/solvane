import { z } from 'zod'
import { TTS_SPEEDS, TTS_VOICES } from '@shared/constants'
import type { TtsSentence } from '@shared/types'
import { mapLimit } from '../../lib/concurrency'
import { AppError } from '../../lib/errors'
import type { Repos, TtsCachedSentence } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { requireSession } from '../../lib/sessions'
import { toUserSettings } from '../../lib/settings'
import type { RecognizeOptions, RecognizeResult } from '../../lib/tencent/asr'
import type { SynthesizeOptions, SynthesizeResult } from '../../lib/tencent/tts'
import { parsePayload } from '../../lib/validate'

export interface SpeechStorage {
  download(fileID: string): Promise<Buffer>
  upload(cloudPath: string, data: Buffer): Promise<string>
  remove(fileID: string): Promise<void>
  /** Get temporary playback URLs, in the same order as the input */
  tempUrls(fileIDs: string[]): Promise<string[]>
}

export interface SpeechDeps {
  repos: Pick<Repos, 'sessions' | 'settings'>
  storage: SpeechStorage
  recognize(audio: Buffer, options: RecognizeOptions): Promise<RecognizeResult>
  synthesize(options: SynthesizeOptions): Promise<SynthesizeResult>
}

/**
 * Only handle recordings the frontend uploaded to voice-input/. The cloud function has admin access
 * to all of storage, so without this check anyone holding someone else's file ID could use this API
 * to read and delete their files.
 */
const VOICE_INPUT_FILE = /^cloud:\/\/[^/]+\/voice-input\/[\w-]+\.pcm$/

/** 60 s of 16 kHz 16-bit mono PCM is about 1.92 MB; leave some headroom */
const MAX_AUDIO_BYTES = 2_100_000

/** Sentences synthesized concurrently, below Tencent Cloud's default concurrency limit */
const TTS_CONCURRENCY = 4

export function createSpeechHandlers(deps: SpeechDeps): Handlers<'speech'> {
  const { sessions, settings } = deps.repos

  async function voiceFor(openid: string) {
    const prefs = toUserSettings(await settings.get(openid))
    const voice = TTS_VOICES.find((v) => v.id === prefs.ttsVoice) ?? TTS_VOICES[0]!
    const speed = TTS_SPEEDS.find((s) => s.id === prefs.ttsSpeed) ?? TTS_SPEEDS[0]!
    return { voice, speed, key: `${voice.id}-${speed.id}` }
  }

  return {
    async recognize(payload) {
      const { fileID } = parsePayload(
        z.object({ fileID: z.string().max(500).regex(VOICE_INPUT_FILE) }),
        payload,
      )
      try {
        const audio = await deps.storage.download(fileID)
        if (audio.length > MAX_AUDIO_BYTES) {
          throw new AppError('BAD_REQUEST', '录音太长了，请控制在 60 秒以内')
        }
        const { text } = await deps.recognize(audio, { engine: '16k_zh' })
        if (!text.trim()) throw new AppError('BAD_REQUEST', '没有听清，请靠近一点再说一遍')
        return { text: text.trim() }
      } finally {
        // The recording is only used for recognition; delete it whether or not that succeeds
        await deps.storage.remove(fileID).catch((err: unknown) => {
          console.error(
            '[speech.recognize] Failed to delete recording',
            err instanceof Error ? err.message : err,
          )
        })
      }
    },

    async tts(payload, ctx) {
      const { sessionId, vid } = parsePayload(
        z.object({ sessionId: z.string().min(1), vid: z.string().min(1) }),
        payload,
      )
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      const version = doc.versions.find((v) => v.vid === vid)
      if (!version) throw new AppError('BAD_REQUEST', '找不到这个版本')
      const { voice, speed, key } = await voiceFor(ctx.openid)

      let cached = doc.tts?.[vid]?.[key]
      if (!cached || cached.length !== version.sentences.length) {
        cached = await mapLimit(version.sentences, TTS_CONCURRENCY, async (sentence, i) => {
          const { audio, words } = await deps.synthesize({
            text: sentence.en,
            voiceType: voice.voiceType,
            speed: speed.speed,
          })
          const fileID = await deps.storage.upload(
            `tts/${ctx.openid}/${sessionId}/${vid}/${key}/${i}.mp3`,
            audio,
          )
          return { fileID, words } satisfies TtsCachedSentence
        })
        // The cache is server-side only; leave updatedAt alone, since listening to the demo reading
        // doesn't edit the session
        await sessions.update(sessionId, ctx.openid, {
          tts: { ...doc.tts, [vid]: { ...doc.tts?.[vid], [key]: cached } },
        })
      }

      const urls = await deps.storage.tempUrls(cached.map((c) => c.fileID))
      const sentences: TtsSentence[] = cached.map((c, index) => ({
        index,
        url: urls[index] ?? '',
        words: c.words,
      }))
      return { sentences }
    },

    async ttsWord(payload, ctx) {
      const { word } = parsePayload(
        z.object({
          // A word or saved phrase: letters, apostrophes, hyphens and spaces only
          word: z
            .string()
            .transform((w) => w.replace(/\s+/g, ' ').trim())
            .pipe(z.string().regex(/^[A-Za-z][A-Za-z' -]{0,59}$/)),
        }),
        payload,
      )
      const { voice } = await voiceFor(ctx.openid)
      // Words are read at normal speed so they're clearer
      const { audio } = await deps.synthesize({ text: word, voiceType: voice.voiceType, speed: 0 })
      return { audio: audio.toString('base64') }
    },
  }
}
