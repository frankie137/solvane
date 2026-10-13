import { LIMITS } from '@shared/constants'

/** Same as the cloud: strip a leading # and collapse whitespace; returns the reason when invalid */
export function normalizeTag(raw: string): { tag: string } | { error: string } {
  const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
  if (!tag) return { error: '标签不能为空' }
  if (tag.length > LIMITS.tagMax) return { error: `标签最多 ${LIMITS.tagMax} 个字` }
  return { tag }
}
