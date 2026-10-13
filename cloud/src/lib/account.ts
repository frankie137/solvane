/**
 * Membership and free uses: check Pro, consume and refund free uses, admins grant or revoke Pro.
 * Free uses are consumed with a conditional database update, so concurrent requests never
 * overcharge; if the job fails after consuming one, it must be refunded.
 */
import { extendedUntil } from '@shared/account'
import { PRO } from '@shared/constants'
import type { Account } from '@shared/types'
import { AppError } from './errors'
import type { AccountDoc, AccountRepo } from './repos'

/** On concurrent grants, re-read and recompute; maximum number of attempts */
const MAX_ATTEMPTS = 3

export const QUOTA_MESSAGE = `免费体验的 ${PRO.freeTrials} 次已经用完，开通 Pro 后可以继续使用`

/** Account record → membership status for the frontend; no record yet counts as a new user */
export function toAccount(
  openid: string,
  doc: AccountDoc | null,
  isAdmin: boolean,
  now: number,
): Account {
  const freeUsed = doc?.freeUsed ?? 0
  const proUntil = doc?.proUntil ?? null
  return {
    openid,
    isAdmin,
    pro: isAdmin || (proUntil !== null && proUntil > now),
    proUntil,
    freeUsed,
    freeLeft: Math.max(0, PRO.freeTrials - freeUsed),
  }
}

export interface AccountsDeps {
  accounts: AccountRepo
  adminOpenids: () => string[]
  now: () => number
}

export type Accounts = ReturnType<typeof createAccounts>

export function createAccounts(deps: AccountsDeps) {
  const isAdmin = (openid: string) => deps.adminOpenids().includes(openid)

  /** Reads the account record, creating it if missing */
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
    // On concurrent creation, the first write wins
    return (await deps.accounts.get(openid)) ?? doc
  }

  async function view(openid: string): Promise<Account> {
    return toAccount(openid, await load(openid), isAdmin(openid), deps.now())
  }

  return {
    isAdmin,
    load,
    view,

    /** Pre-check before starting: Pro, or free uses left (checks only, does not consume) */
    async assertAvailable(openid: string): Promise<void> {
      const account = await view(openid)
      if (!account.pro && account.freeLeft === 0) {
        throw new AppError('QUOTA_EXCEEDED', QUOTA_MESSAGE)
      }
    },

    /**
     * Consumes one free use. Pro doesn't consume and returns false; returns true on success;
     * throws QUOTA_EXCEEDED when none are left.
     * When it returns true, the caller must record that and call refund if the job fails.
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

    /** Admin grants (adds 30 days) or revokes Pro; recomputes from a fresh expiry on conflicts */
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
