/**
 * Sharing: author profile, share snapshots (copies the recording), public reads, my shares, revoke.
 * getShare is the only read that doesn't check ownership by OPENID; it returns snapshot fields
 * only, without openid, scores or analysis.
 */
import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import type { Profile, Share, ShareSummary } from '@shared/types'
import { AppError } from '../../lib/errors'
import type { ProfileStored, Repos, ShareDoc } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { requireSession, sessionTitle } from '../../lib/sessions'
import { buildShareSentences, wordsFromTranscript } from '../../lib/share'
import { parsePayload } from '../../lib/validate'

export interface ShareStorage {
  download(fileID: string): Promise<Buffer>
  upload(cloudPath: string, data: Buffer): Promise<string>
  remove(fileID: string): Promise<void>
  tempUrls(fileIDs: string[]): Promise<string[]>
}

export interface ShareDeps {
  repos: Repos
  storage: ShareStorage
  now: () => number
  /** Recording copy file name; no openid in the path, since temporary URLs expose it */
  newFileName: () => string
}

type ShareActions =
  'getProfile' | 'updateProfile' | 'createShare' | 'getShare' | 'listShares' | 'revokeShare'

/**
 * Only accept avatars the frontend uploaded to avatars/. The cloud function has admin access to all
 * of storage, so without a path check anyone holding someone else's file ID could attach it to
 * their own share.
 */
const AVATAR_FILE = /^cloud:\/\/[^/]+\/avatars\/[\w-]+\.(jpe?g|png|webp)$/

const id = z.string().min(1).max(64)

const shareIdOf = (practiceId: string) => `share-${practiceId}`

/** Nicknames are checked in the function so the error can say exactly what's wrong */
const nickname = z
  .string()
  .max(200)
  .transform((raw) => {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name) throw new AppError('BAD_REQUEST', '昵称不能为空')
    if (name.length > LIMITS.nicknameMax) {
      throw new AppError('BAD_REQUEST', `昵称最多 ${LIMITS.nicknameMax} 个字`)
    }
    return name
  })

export function createShareHandlers(deps: ShareDeps): Pick<Handlers<'data'>, ShareActions> {
  const { settings, practices, sessions, shares } = deps.repos

  /** Turn the stored avatar into a temporary URL */
  async function toProfile(stored: ProfileStored): Promise<Profile> {
    const [avatarUrl] = stored.avatarFileID
      ? await deps.storage.tempUrls([stored.avatarFileID])
      : []
    return { nickname: stored.nickname, avatarUrl: avatarUrl || null }
  }

  async function requireOwnShare(shareId: string, openid: string): Promise<ShareDoc> {
    const doc = await shares.get(shareId)
    if (!doc || doc._openid !== openid) throw new AppError('NOT_FOUND', '分享已撤回或不存在')
    return doc
  }

  return {
    async getProfile(_payload, ctx) {
      const stored = (await settings.get(ctx.openid))?.profile
      return { profile: stored ? await toProfile(stored) : null }
    },

    async updateProfile(payload, ctx) {
      const input = parsePayload(
        z.object({ nickname, avatarFileID: z.string().max(300).optional() }),
        payload,
      )
      if (input.avatarFileID !== undefined && !AVATAR_FILE.test(input.avatarFileID)) {
        throw new AppError('BAD_REQUEST', '头像文件不正确，请重新选择')
      }
      const previous = (await settings.get(ctx.openid))?.profile
      // Keep the old avatar: snapshots already shared still use it
      const profile: ProfileStored = {
        nickname: input.nickname,
        avatarFileID: input.avatarFileID ?? previous?.avatarFileID ?? null,
      }
      await settings.upsert(ctx.openid, { profile, updatedAt: deps.now() })
      return { profile: await toProfile(profile) }
    },

    async createShare(payload, ctx) {
      const { practiceId } = parsePayload(z.object({ practiceId: id }), payload)
      const existing = await shares.findByPractice(ctx.openid, practiceId)
      if (existing) return { shareId: existing._id, created: false }

      const practice = await practices.get(practiceId, ctx.openid)
      if (!practice) throw new AppError('NOT_FOUND', '练习记录不存在或已被删除')
      // Lyric timings come from recognition and alignment: scored practices already have them; for
      // unscored ones the frontend calls assess.prepareShare first
      if (!practice.wavFileID || !practice.alignment || !practice.transcript) {
        throw new AppError('BAD_REQUEST', '歌词还没准备好，请稍后再试')
      }
      const profile = (await settings.get(ctx.openid))?.profile
      if (!profile) throw new AppError('BAD_REQUEST', '请先设置头像和昵称')
      const session = await requireSession(sessions, practice.sessionId, ctx.openid)
      const version = session.versions.find((v) => v.vid === practice.vid)
      if (!version) throw new AppError('NOT_FOUND', '背诵的版本已不存在')

      // Copy the recording so shared links keep working when the practice record is cleaned up
      const audio = await deps.storage.download(practice.wavFileID)
      const audioFileID = await deps.storage.upload(`shares/${deps.newFileName()}.wav`, audio)
      const doc: Omit<ShareDoc, '_id'> = {
        _openid: ctx.openid,
        sessionId: practice.sessionId,
        practiceId,
        title: sessionTitle(session),
        preview: version.sentences[0]?.en ?? '',
        sentences: buildShareSentences(
          version.sentences,
          practice.alignment.sentences,
          // Scored practices use per-word timings from the assessment (more accurate); unscored
          // ones use the recognition result
          practice.pronunciation?.words ??
            wordsFromTranscript(practice.transcript.words, practice.alignment.sentences),
        ),
        audioFileID,
        durationMs: practice.durationMs,
        author: profile,
        createdAt: deps.now(),
      }
      // The share id is derived from the practice: concurrent shares of one practice (double taps,
      // retries after a timeout) leave just one
      const shareId = shareIdOf(practiceId)
      let created = false
      try {
        created = await shares.create(shareId, doc)
      } finally {
        if (!created) await deps.storage.remove(audioFileID).catch(() => {})
      }
      return { shareId, created }
    },

    async getShare(payload, ctx) {
      const { shareId } = parsePayload(z.object({ shareId: id }), payload)
      const doc = await shares.get(shareId)
      if (!doc) throw new AppError('NOT_FOUND', '分享已撤回或不存在')
      const [audioUrl] = await deps.storage.tempUrls([doc.audioFileID])
      // The share still exists, only the recording is temporarily unavailable: don't say revoked
      if (!audioUrl) throw new AppError('UPSTREAM_ERROR', '录音暂时取不到，请稍后再试')
      const share: Share = {
        id: doc._id,
        title: doc.title,
        sentences: doc.sentences,
        audioUrl,
        durationMs: doc.durationMs,
        author: await toProfile(doc.author),
        createdAt: doc.createdAt,
        mine: doc._openid === ctx.openid,
      }
      return { share }
    },

    async listShares(_payload, ctx) {
      const docs = await shares.listByOwner(ctx.openid, LIMITS.sharesMax)
      const items: ShareSummary[] = docs.map((d) => ({
        id: d._id,
        title: d.title,
        preview: d.preview,
        durationMs: d.durationMs,
        createdAt: d.createdAt,
      }))
      return { items }
    },

    async revokeShare(payload, ctx) {
      const { shareId } = parsePayload(z.object({ shareId: id }), payload)
      const doc = await requireOwnShare(shareId, ctx.openid)
      await shares.remove(shareId, ctx.openid)
      // The link is invalidated first; failing to delete the recording copy doesn't matter
      await deps.storage.remove(doc.audioFileID).catch(() => {})
      return {}
    },
  }
}
