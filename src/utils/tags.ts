import { LIMITS } from '@shared/constants'

/** 和云端一致：去掉开头的 #、合并空白；不合法时返回原因 */
export function normalizeTag(raw: string): { tag: string } | { error: string } {
  const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
  if (!tag) return { error: '标签不能为空' }
  if (tag.length > LIMITS.tagMax) return { error: `标签最多 ${LIMITS.tagMax} 个字` }
  return { tag }
}
