import { describe, expect, it } from 'vitest'
import { extendedUntil } from '@shared/account'
import { PRO } from '@shared/constants'
import { createDataHandlers } from '../src/functions/data/handlers'
import { createAccounts, toAccount } from '../src/lib/account'
import { createMemoryRepos } from './support/memory-repos'
import { createMemoryStorage } from './support/memory-storage'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY
const ME = { openid: 'o_me' }
const ADMIN = { openid: 'o_admin' }
const AVATAR = 'cloud://env.x/avatars/a1.jpg'

const doc = (patch: Partial<Parameters<typeof toAccount>[1] & object> = {}) => ({
  _id: ME.openid,
  freeUsed: 0,
  proUntil: null,
  grants: [],
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

describe('toAccount', () => {
  it('a new user has 5 free uses and is not Pro', () => {
    expect(toAccount(ME.openid, null, false, NOW)).toEqual({
      openid: ME.openid,
      isAdmin: false,
      pro: false,
      proUntil: null,
      freeUsed: 0,
      freeLeft: PRO.freeTrials,
    })
  })

  it('is Pro until expiry and not after; free uses left never drop below 0', () => {
    expect(toAccount(ME.openid, doc({ proUntil: NOW + 1 }), false, NOW).pro).toBe(true)
    expect(toAccount(ME.openid, doc({ proUntil: NOW }), false, NOW).pro).toBe(false)
    expect(toAccount(ME.openid, doc({ freeUsed: 7 }), false, NOW).freeLeft).toBe(0)
  })

  it('admins are always Pro', () => {
    expect(toAccount(ME.openid, doc(), true, NOW).pro).toBe(true)
  })
})

describe('extendedUntil', () => {
  it('counts from now if never granted or expired, and extends if still active', () => {
    expect(extendedUntil(null, NOW)).toBe(NOW + 30 * DAY)
    expect(extendedUntil(NOW - DAY, NOW)).toBe(NOW + 30 * DAY)
    expect(extendedUntil(NOW + 5 * DAY, NOW)).toBe(NOW + 35 * DAY)
  })
})

describe('charging and refunding free uses', () => {
  function setup() {
    const repos = createMemoryRepos()
    const accounts = createAccounts({
      accounts: repos.accounts,
      adminOpenids: () => [ADMIN.openid],
      now: () => NOW,
    })
    return { repos, accounts }
  }

  it('creates the account on first use; throws QUOTA_EXCEEDED after 5 uses', async () => {
    const { repos, accounts } = setup()
    for (let i = 0; i < PRO.freeTrials; i++) {
      await expect(accounts.consume(ME.openid)).resolves.toBe(true)
    }
    await expect(accounts.consume(ME.openid)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    await expect(accounts.assertAvailable(ME.openid)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    })
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(PRO.freeTrials)
    await accounts.refund(ME.openid)
    await expect(accounts.assertAvailable(ME.openid)).resolves.toBeUndefined()
  })

  it('only one of two concurrent charges for the last use succeeds', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc({ freeUsed: PRO.freeTrials - 1 }))
    const results = await Promise.allSettled([
      accounts.consume(ME.openid),
      accounts.consume(ME.openid),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(PRO.freeTrials)
  })

  it('refunds never take the used count below 0', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc())
    await accounts.refund(ME.openid)
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(0)
  })

  it('does not charge Pro users or admins', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc({ freeUsed: PRO.freeTrials, proUntil: NOW + DAY }))
    await expect(accounts.consume(ME.openid)).resolves.toBe(false)
    await expect(accounts.consume(ADMIN.openid)).resolves.toBe(false)
    expect(repos.accountDocs.get(ADMIN.openid)!.freeUsed).toBe(0)
  })
})

describe('membership API', () => {
  function setup() {
    const repos = createMemoryRepos()
    const storage = createMemoryStorage()
    const clock = { now: NOW }
    const data = createDataHandlers({
      repos,
      storage,
      now: () => clock.now,
      newFileName: () => 'f',
      adminOpenids: () => [ADMIN.openid],
    })
    return { repos, data, clock }
  }

  it('creates the account when viewing own status', async () => {
    const { repos, data } = setup()
    const { account } = await data.getAccount({}, ME)
    expect(account).toMatchObject({ pro: false, freeLeft: PRO.freeTrials, isAdmin: false })
    expect(repos.accountDocs.get(ME.openid)!.createdAt).toBe(NOW)
    expect((await data.getAccount({}, ADMIN)).account).toMatchObject({ pro: true, isAdmin: true })
  })

  it('only admins can manage membership', async () => {
    const { data } = setup()
    await data.getAccount({}, ME)
    await expect(data.listMembers({}, ME)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(data.grantPro({ openid: ME.openid }, ME)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(data.revokePro({ openid: ME.openid }, ME)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('member list includes nickname and avatar', async () => {
    const { data, clock } = setup()
    await data.updateProfile({ nickname: '小明', avatarFileID: AVATAR }, ME)
    await data.getAccount({}, ADMIN)
    clock.now += 1000
    await data.getAccount({}, ME)
    const { members } = await data.listMembers({}, ADMIN)
    expect(members.map((m) => m.openid)).toEqual([ADMIN.openid, ME.openid])
    expect(members[1]).toMatchObject({
      nickname: '小明',
      avatarUrl: `https://tmp/${AVATAR}`,
      pro: false,
      freeUsed: 0,
    })
    expect(members[0]).toMatchObject({ nickname: null, avatarUrl: null, isAdmin: true })
  })

  it('grants 30 days and extends on a second grant; revoking returns to free immediately; logs each action', async () => {
    const { repos, data, clock } = setup()
    await data.getAccount({}, ME)
    const first = await data.grantPro({ openid: ME.openid }, ADMIN)
    expect(first.member).toMatchObject({ pro: true, proUntil: NOW + 30 * DAY })
    clock.now += 10 * DAY
    const second = await data.grantPro({ openid: ME.openid }, ADMIN)
    expect(second.member.proUntil).toBe(NOW + 60 * DAY)
    expect((await data.getAccount({}, ME)).account.pro).toBe(true)

    const revoked = await data.revokePro({ openid: ME.openid }, ADMIN)
    expect(revoked.member).toMatchObject({ pro: false, proUntil: clock.now })
    expect((await data.getAccount({}, ME)).account.pro).toBe(false)
    expect(repos.accountDocs.get(ME.openid)!.grants.map((g) => [g.action, g.by])).toEqual([
      ['grant', ADMIN.openid],
      ['grant', ADMIN.openid],
      ['revoke', ADMIN.openid],
    ])

    // Revoking when already not Pro leaves no record
    await data.revokePro({ openid: ME.openid }, ADMIN)
    expect(repos.accountDocs.get(ME.openid)!.grants).toHaveLength(3)
  })

  it('a grant after expiry counts from today', async () => {
    const { data, clock } = setup()
    await data.getAccount({}, ME)
    await data.grantPro({ openid: ME.openid }, ADMIN)
    clock.now += 40 * DAY
    expect((await data.getAccount({}, ME)).account.pro).toBe(false)
    const { member } = await data.grantPro({ openid: ME.openid }, ADMIN)
    expect(member.proUntil).toBe(clock.now + 30 * DAY)
  })

  it('two concurrent grants each add 30 days', async () => {
    const { data } = setup()
    await data.getAccount({}, ME)
    await Promise.all([
      data.grantPro({ openid: ME.openid }, ADMIN),
      data.grantPro({ openid: ME.openid }, ADMIN),
    ])
    expect((await data.getAccount({}, ME)).account.proUntil).toBe(NOW + 60 * DAY)
  })

  it('cannot grant Pro to a user without an account', async () => {
    const { data } = setup()
    await expect(data.grantPro({ openid: 'o_nobody' }, ADMIN)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
