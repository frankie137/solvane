import nodeFetch from 'node-fetch'
import type { FetchLike } from './llm/client'

/**
 * The default cloud function runtime is Node.js 16, which has no global fetch.
 * Use the global fetch (Node 18+) when present, otherwise node-fetch; the parts of their APIs
 * used here are the same.
 */
export function resolveFetch(globalFetch: unknown): FetchLike {
  if (typeof globalFetch === 'function') {
    return (globalFetch as FetchLike).bind(globalThis)
  }
  return nodeFetch as unknown as FetchLike
}

export const defaultFetch: FetchLike = resolveFetch((globalThis as { fetch?: unknown }).fetch)
