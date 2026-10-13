/**
 * On errors, write to WeChat's realtime log (WeChat MP console: Development → Development Management →
 * Ops Center → Realtime Logs, 开发 → 开发管理 → 运维中心 → 实时日志) to help debug issues on real devices.
 * Logs only the location, error code and error message; never user content, parameters or secrets.
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

/** These are normal business outcomes, not failures, so they aren't logged */
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
