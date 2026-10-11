/**
 * 会员与免费次数：判断 Pro、占用和退回免费次数、管理员开通或结束 Pro。
 * 免费次数用数据库条件更新来占用，并发请求也不会多扣；占用以后任务失败要退回。
 */
import { PRO } from '@shared/constants'
import type { Account } from '@shared/types'
import { AppError } from './errors'
import type { AccountDoc, AccountRepo } from './repos'

const DAY_MS = 24 * 60 * 60 * 1000
/** 并发开通时重新读一次再算，最多试几次 */
const MAX_ATTEMPTS = 3

export const QUOTA_MESSAGE = `免费体验的 ${PRO.freeTrials} 次已经用完，开通 Pro 后可以继续使用`

/** 档案换成前端看到的会员状态；还没建档的按新用户算 */
export function toAccount(doc: AccountDoc | null, isAdmin: boolean, now: number): Account {
  const freeUsed = doc?.freeUsed ?? 0
  const proUntil = doc?.proUntil ?? null
  return {
    isAdmin,
    pro: isAdmin || (proUntil !== null && proUntil > now),
    proUntil,
    freeUsed,
    freeLeft: Math.max(0, PRO.freeTrials - freeUsed),
  }
}

/** 开通一次后的到期时间：没开通或已过期的从现在起算，还没到期的在到期时间上往后加 */
export function extendedUntil(proUntil: number | null, now: number): number {
  return Math.max(proUntil ?? 0, now) + PRO.grantDays * DAY_MS
}

export interface AccountsDeps {
  accounts: AccountRepo
  adminOpenids: () => string[]
  now: () => number
}

export type Accounts = ReturnType<typeof createAccounts>

export function createAccounts(deps: AccountsDeps) {
  const isAdmin = (openid: string) => deps.adminOpenids().includes(openid)

  /** 读档案，没有就新建 */
  async function load(openid: string): Promise<AccountDoc> {
    const existing = await deps.accounts.get(openid)
    if (existing) return existing
    const now = deps.now()
    const doc: AccountDoc = {
      _id: openid,
      freeUsed: 0,
      proUntil: null,
      grants: [],
      createdAt: now,
      updatedAt: now,
    }
    await deps.accounts.create(doc)
    // 并发建档时以先写入的为准
    return (await deps.accounts.get(openid)) ?? doc
  }

  async function view(openid: string): Promise<Account> {
    return toAccount(await load(openid), isAdmin(openid), deps.now())
  }

  return {
    isAdmin,
    load,
    view,

    /** 发起前检查：是 Pro 或者还有免费次数（只检查，不占用） */
    async assertAvailable(openid: string): Promise<void> {
      const account = await view(openid)
      if (!account.pro && account.freeLeft === 0) {
        throw new AppError('QUOTA_EXCEEDED', QUOTA_MESSAGE)
      }
    },

    /**
     * 占用一次免费次数。Pro 不占用，返回 false；占用成功返回 true；用完了报 QUOTA_EXCEEDED。
     * 返回 true 时调用方要记下来，任务失败时调用 refund 退回。
     */
    async consume(openid: string): Promise<boolean> {
      const account = await view(openid)
      if (account.pro) return false
      if (await deps.accounts.consume(openid, PRO.freeTrials, deps.now())) return true
      throw new AppError('QUOTA_EXCEEDED', QUOTA_MESSAGE)
    },

    async refund(openid: string): Promise<void> {
      await deps.accounts.refund(openid, deps.now())
    },

    /** 管理员开通（加 30 天）或结束 Pro；并发操作时重新读到期时间再算 */
    async changePro(
      admin: string,
      openid: string,
      action: 'grant' | 'revoke',
    ): Promise<AccountDoc> {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const doc = await deps.accounts.get(openid)
        if (!doc) throw new AppError('NOT_FOUND', '找不到这位成员')
        const now = deps.now()
        if (action === 'revoke' && (doc.proUntil === null || doc.proUntil <= now)) return doc
        const until = action === 'grant' ? extendedUntil(doc.proUntil, now) : now
        const grant = { action, until, by: admin, at: now }
        if (await deps.accounts.setProUntil(openid, doc.proUntil, grant)) {
          return { ...doc, proUntil: until, grants: [...doc.grants, grant], updatedAt: now }
        }
      }
      throw new AppError('BAD_REQUEST', '操作太频繁，请稍后再试')
    },
  }
}
