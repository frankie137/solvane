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
  it('新用户有 5 次免费体验，不是 Pro', () => {
    expect(toAccount(ME.openid, null, false, NOW)).toEqual({
      openid: ME.openid,
      isAdmin: false,
      pro: false,
      proUntil: null,
      freeUsed: 0,
      freeLeft: PRO.freeTrials,
    })
  })

  it('没到期是 Pro，到期后不是；剩余次数不小于 0', () => {
    expect(toAccount(ME.openid, doc({ proUntil: NOW + 1 }), false, NOW).pro).toBe(true)
    expect(toAccount(ME.openid, doc({ proUntil: NOW }), false, NOW).pro).toBe(false)
    expect(toAccount(ME.openid, doc({ freeUsed: 7 }), false, NOW).freeLeft).toBe(0)
  })

  it('管理员一直是 Pro', () => {
    expect(toAccount(ME.openid, doc(), true, NOW).pro).toBe(true)
  })
})

describe('extendedUntil', () => {
  it('没开通或已过期的从现在起算，没到期的往后加', () => {
    expect(extendedUntil(null, NOW)).toBe(NOW + 30 * DAY)
    expect(extendedUntil(NOW - DAY, NOW)).toBe(NOW + 30 * DAY)
    expect(extendedUntil(NOW + 5 * DAY, NOW)).toBe(NOW + 35 * DAY)
  })
})

describe('免费次数的占用和退回', () => {
  function setup() {
    const repos = createMemoryRepos()
    const accounts = createAccounts({
      accounts: repos.accounts,
      adminOpenids: () => [ADMIN.openid],
      now: () => NOW,
    })
    return { repos, accounts }
  }

  it('第一次用到时建档；用完 5 次后报 QUOTA_EXCEEDED', async () => {
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

  it('并发占用最后一次时只有一个成功', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc({ freeUsed: PRO.freeTrials - 1 }))
    const results = await Promise.allSettled([
      accounts.consume(ME.openid),
      accounts.consume(ME.openid),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(PRO.freeTrials)
  })

  it('退回不会让已用次数小于 0', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc())
    await accounts.refund(ME.openid)
    expect(repos.accountDocs.get(ME.openid)!.freeUsed).toBe(0)
  })

  it('Pro 和管理员不占用', async () => {
    const { repos, accounts } = setup()
    await repos.accounts.create(doc({ freeUsed: PRO.freeTrials, proUntil: NOW + DAY }))
    await expect(accounts.consume(ME.openid)).resolves.toBe(false)
    await expect(accounts.consume(ADMIN.openid)).resolves.toBe(false)
    expect(repos.accountDocs.get(ADMIN.openid)!.freeUsed).toBe(0)
  })
})

describe('会员接口', () => {
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

  it('查看自己的状态时建档', async () => {
    const { repos, data } = setup()
    const { account } = await data.getAccount({}, ME)
    expect(account).toMatchObject({ pro: false, freeLeft: PRO.freeTrials, isAdmin: false })
    expect(repos.accountDocs.get(ME.openid)!.createdAt).toBe(NOW)
    expect((await data.getAccount({}, ADMIN)).account).toMatchObject({ pro: true, isAdmin: true })
  })

  it('只有管理员能管理会员', async () => {
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

  it('成员列表带上昵称和头像', async () => {
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

  it('开通 30 天、再开通往后加；结束后立即回到免费状态，记录操作', async () => {
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

    // 已经不是 Pro 时再结束不留记录
    await data.revokePro({ openid: ME.openid }, ADMIN)
    expect(repos.accountDocs.get(ME.openid)!.grants).toHaveLength(3)
  })

  it('过期后再开通从当天起算', async () => {
    const { data, clock } = setup()
    await data.getAccount({}, ME)
    await data.grantPro({ openid: ME.openid }, ADMIN)
    clock.now += 40 * DAY
    expect((await data.getAccount({}, ME)).account.pro).toBe(false)
    const { member } = await data.grantPro({ openid: ME.openid }, ADMIN)
    expect(member.proUntil).toBe(clock.now + 30 * DAY)
  })

  it('同时开通两次各加 30 天', async () => {
    const { data } = setup()
    await data.getAccount({}, ME)
    await Promise.all([
      data.grantPro({ openid: ME.openid }, ADMIN),
      data.grantPro({ openid: ME.openid }, ADMIN),
    ])
    expect((await data.getAccount({}, ME)).account.proUntil).toBe(NOW + 60 * DAY)
  })

  it('没有档案的人不能开通', async () => {
    const { data } = setup()
    await expect(data.grantPro({ openid: 'o_nobody' }, ADMIN)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
