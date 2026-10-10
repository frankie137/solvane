import nodeFetch from 'node-fetch'
import type { FetchLike } from './llm/client'

/**
 * 云函数默认运行时是 Node.js 16，没有全局 fetch。
 * 有全局 fetch（Node 18+）时用它，否则用 node-fetch，两者的接口在这里用到的部分一致。
 */
export function resolveFetch(globalFetch: unknown): FetchLike {
  if (typeof globalFetch === 'function') {
    return (globalFetch as FetchLike).bind(globalThis)
  }
  return nodeFetch as unknown as FetchLike
}

export const defaultFetch: FetchLike = resolveFetch((globalThis as { fetch?: unknown }).fetch)
