/**
 * 会员：自己的会员状态；管理员查看成员、开通和结束 Pro。
 * 管理员身份由环境变量 ADMIN_OPENIDS 决定，管理接口逐个校验。
 */
import { z } from 'zod'
import type { Member } from '@shared/types'
import { createAccounts, toAccount } from '../../lib/account'
import { AppError } from '../../lib/errors'
import type { AccountDoc, ProfileStored, Repos } from '../../lib/repos'
import type { Handlers } from '../../lib/router'
import { parsePayload } from '../../lib/validate'
import type { ShareStorage } from './share'

export interface MemberDeps {
  repos: Repos
  storage: Pick<ShareStorage, 'tempUrls'>
  adminOpenids: () => string[]
  now: () => number
}

type MemberActions = 'getAccount' | 'listMembers' | 'grantPro' | 'revokePro'

/** 会员管理页最多列多少人（体验成员上限只有十几个） */
const MEMBERS_MAX = 200

export function createMemberHandlers(deps: MemberDeps): Pick<Handlers<'data'>, MemberActions> {
  const { accounts: accountRepo, settings } = deps.repos
  const accounts = createAccounts({
    accounts: accountRepo,
    adminOpenids: deps.adminOpenids,
    now: deps.now,
  })

  function assertAdmin(openid: string) {
    if (!accounts.isAdmin(openid)) throw new AppError('FORBIDDEN', '只有管理员可以管理会员')
  }

  /** 档案配上署名资料；头像换成临时链接 */
  async function toMembers(docs: AccountDoc[]): Promise<Member[]> {
    const profiles = new Map<string, ProfileStored | null | undefined>(
      (await settings.listProfiles(docs.map((d) => d._id))).map((s) => [s._id, s.profile]),
    )
    const avatarIds = [...profiles.values()]
      .map((p) => p?.avatarFileID)
      .filter((id): id is string => !!id)
    const urls = avatarIds.length ? await deps.storage.tempUrls(avatarIds) : []
    const avatarUrl = new Map(avatarIds.map((id, i) => [id, urls[i] || null]))
    const now = deps.now()
    return docs.map((doc) => {
      const profile = profiles.get(doc._id)
      return {
        ...toAccount(doc._id, doc, accounts.isAdmin(doc._id), now),
        nickname: profile?.nickname ?? null,
        avatarUrl: profile?.avatarFileID ? (avatarUrl.get(profile.avatarFileID) ?? null) : null,
        createdAt: doc.createdAt,
      }
    })
  }

  const target = (payload: unknown) =>
    parsePayload(z.object({ openid: z.string().min(1).max(64) }), payload).openid

  return {
    async getAccount(_payload, ctx) {
      return { account: await accounts.view(ctx.openid) }
    },

    async listMembers(_payload, ctx) {
      assertAdmin(ctx.openid)
      return { members: await toMembers(await accountRepo.list(MEMBERS_MAX)) }
    },

    async grantPro(payload, ctx) {
      assertAdmin(ctx.openid)
      const doc = await accounts.changePro(ctx.openid, target(payload), 'grant')
      const [member] = await toMembers([doc])
      return { member: member! }
    },

    async revokePro(payload, ctx) {
      assertAdmin(ctx.openid)
      const doc = await accounts.changePro(ctx.openid, target(payload), 'revoke')
      const [member] = await toMembers([doc])
      return { member: member! }
    },
  }
}
