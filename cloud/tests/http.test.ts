import nodeFetch from 'node-fetch'
import { describe, expect, it } from 'vitest'
import { resolveFetch } from '../src/lib/http'

describe('resolveFetch', () => {
  it('uses the global fetch when available', async () => {
    const calls: string[] = []
    const fake = async (url: string) => {
      calls.push(url)
      return new Response('ok')
    }
    const f = resolveFetch(fake)
    await f('https://example.com', {})
    expect(calls).toEqual(['https://example.com'])
  })

  it('falls back to node-fetch on Node 16 without a global fetch', () => {
    expect(resolveFetch(undefined)).toBe(nodeFetch)
  })
})
