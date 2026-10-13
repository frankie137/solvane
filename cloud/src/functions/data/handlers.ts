import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import { AppError } from '../../lib/errors'
import type { Repos } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { requireSession, toSession, toSummary } from '../../lib/sessions'
import { toUserSettings } from '../../lib/settings'
import { parsePayload } from '../../lib/validate'
import { createLibraryHandlers } from './library'
import { createMemberHandlers } from './members'
import { createShareHandlers, type ShareStorage } from './share'

export interface DataDeps {
  repos: Repos
  storage: ShareStorage
  now: () => number
  newFileName: () => string
  adminOpenids: () => string[]
}

const levelSchema = z.enum(['junior', 'senior', 'cet4', 'cet6', 'ielts', 'toefl'])
const accentSchema = z.enum(['us', 'uk'])
const ttsVoiceSchema = z.enum(['female', 'male'])
const ttsSpeedSchema = z.enum(['normal', 'slow'])

export function createDataHandlers(deps: DataDeps): Handlers<'data'> {
  const { sessions, settings } = deps.repos

  const readSettings = async (openid: string) => toUserSettings(await settings.get(openid))

  return {
    ...createLibraryHandlers(deps),
    ...createShareHandlers(deps),
    ...createMemberHandlers(deps),

    async ping(_payload, ctx) {
      return { pong: true, openid: ctx.openid, serverTime: deps.now() }
    },

    async getSettings(_payload, ctx) {
      return readSettings(ctx.openid)
    },

    async updateSettings(payload, ctx) {
      const patch = parsePayload(
        z.object({
          level: levelSchema.optional(),
          accent: accentSchema.optional(),
          ttsVoice: ttsVoiceSchema.optional(),
          ttsSpeed: ttsSpeedSchema.optional(),
        }),
        payload,
      )
      await settings.upsert(ctx.openid, { ...patch, updatedAt: deps.now() })
      return readSettings(ctx.openid)
    },

    async getSession(payload, ctx) {
      const { sessionId } = parsePayload(z.object({ sessionId: z.string().min(1) }), payload)
      return { session: toSession(await requireSession(sessions, sessionId, ctx.openid)) }
    },

    async listSessions(payload, ctx) {
      const { limit } = parsePayload(
        z.object({ limit: z.number().int().min(1).max(50).optional() }),
        payload,
      )
      const docs = await sessions.listRecent(ctx.openid, limit ?? LIMITS.recentSessions)
      return { items: docs.map(toSummary) }
    },

    async setCurrentVersion(payload, ctx) {
      const { sessionId, vid } = parsePayload(
        z.object({ sessionId: z.string().min(1), vid: z.string().min(1) }),
        payload,
      )
      const doc = await requireSession(sessions, sessionId, ctx.openid)
      if (!doc.versions.some((v) => v.vid === vid)) {
        throw new AppError('BAD_REQUEST', '找不到这个版本')
      }
      // Switching versions isn't a content update; leave updatedAt alone so the "recent sessions"
      // order doesn't change
      await sessions.update(sessionId, ctx.openid, { currentVid: vid })
      return { session: toSession({ ...doc, currentVid: vid }) }
    },
  }
}
