/**
 * 分享：署名资料、生成分享快照（复制录音）、公开读取、我的分享、撤回。
 * getShare 是唯一不按 OPENID 校验归属的读取，只返回快照字段，不含 openid、分数和解析。
 */
import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import type { Profile, Share, ShareSummary } from '@shared/types'
import { AppError } from '../../lib/errors'
import type { ProfileStored, Repos, ShareDoc } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { requireSession, sessionTitle } from '../../lib/sessions'
import { buildShareSentences } from '../../lib/share'
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
  /** 录音副本的文件名；路径里不放 openid，临时链接会暴露路径 */
  newFileName: () => string
}

type ShareActions =
  'getProfile' | 'updateProfile' | 'createShare' | 'getShare' | 'listShares' | 'revokeShare'

/**
 * 只接受前端上传到 avatars/ 目录的头像。云函数有整个存储的管理权限，
 * 不限制路径的话，拿到别人文件 ID 就能把它挂到自己的分享上。
 */
const AVATAR_FILE = /^cloud:\/\/[^/]+\/avatars\/[\w-]+\.(jpe?g|png|webp)$/

const id = z.string().min(1).max(64)

const shareIdOf = (practiceId: string) => `share-${practiceId}`

/** 昵称在函数里检查，报错能说清楚原因 */
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

  /** 把存储里的头像换成临时链接 */
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
      // 旧头像不删：已经分享出去的快照还在用
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
      if (practice.stage !== 'done' || !practice.wavFileID || !practice.alignment) {
        throw new AppError('BAD_REQUEST', '评测完成后才能分享')
      }
      const profile = (await settings.get(ctx.openid))?.profile
      if (!profile) throw new AppError('BAD_REQUEST', '请先设置头像和昵称')
      const session = await requireSession(sessions, practice.sessionId, ctx.openid)
      const version = session.versions.find((v) => v.vid === practice.vid)
      if (!version) throw new AppError('NOT_FOUND', '背诵的版本已不存在')

      // 复制一份录音：练习记录被清理时，已分享的链接不受影响
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
          practice.pronunciation?.words ?? [],
        ),
        audioFileID,
        durationMs: practice.durationMs,
        author: profile,
        createdAt: deps.now(),
      }
      // 分享 id 由练习决定：同一次练习并发分享（重复点、超时后重试）时只会留下一个
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
      // 分享还在，只是暂时取不到录音：不能说成已撤回
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
      // 链接先失效；录音副本删不掉也不影响
      await deps.storage.remove(doc.audioFileID).catch(() => {})
      return {}
    },
  }
}
