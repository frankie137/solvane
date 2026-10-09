import nodeFetch from 'node-fetch'
import { describe, expect, it } from 'vitest'
import { resolveFetch } from '../src/lib/http'

describe('resolveFetch', () => {
  it('有全局 fetch 时使用它', async () => {
    const calls: string[] = []
    const fake = async (url: string) => {
      calls.push(url)
      return new Response('ok')
    }
    const f = resolveFetch(fake)
    await f('https://example.com', {})
    expect(calls).toEqual(['https://example.com'])
  })

  it('Node 16 没有全局 fetch 时退回 node-fetch', () => {
    expect(resolveFetch(undefined)).toBe(nodeFetch)
  })
})
