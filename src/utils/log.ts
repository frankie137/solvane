/**
 * 出错时写微信的实时日志（公众平台「开发 → 开发管理 → 运维中心 → 实时日志」可查），
 * 方便排查真机上的问题。只记位置、错误码和错误文案，不记录用户的内容、参数和密钥。
 */
type RealtimeLog = {
  error(...args: unknown[]): void
  warn(...args: unknown[]): void
  setFilterMsg?(msg: string): void
}

let manager: RealtimeLog | null | undefined

function getLogger(): RealtimeLog | null {
  if (manager !== undefined) return manager
  try {
    manager = (wx.getRealtimeLogManager?.() as RealtimeLog | undefined) ?? null
  } catch {
    manager = null
  }
  return manager
}

/** 这些是正常的业务结果，不算故障，不写日志 */
const EXPECTED = new Set(['BAD_REQUEST', 'NOT_FOUND', 'CANCELLED'])

export function logError(where: string, err: unknown): void {
  const e = err as { code?: unknown; message?: unknown; errMsg?: unknown }
  const code = typeof e?.code === 'string' ? e.code : ''
  if (EXPECTED.has(code)) return
  const message = String(e?.message ?? e?.errMsg ?? err).slice(0, 200)
  const log = getLogger()
  if (!log) return
  log.setFilterMsg?.(where)
  log.error(where, code || 'ERROR', message)
}
