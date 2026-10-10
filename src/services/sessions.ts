import type { InputMode, Session, SessionSummary } from '@shared/types'
import { JOB_STALE_MS } from '@shared/constants'
import { pollUntil, type PollOptions } from '@/utils/poll'
import { callCloud, CloudError } from './cloud'
import { mayStillRun } from './cloud-error'

export async function createSession(mode: InputMode, rawText: string): Promise<string> {
  const { sessionId } = await callCloud('compose', 'create', { mode, rawText })
  return sessionId
}

export async function getSession(sessionId: string): Promise<Session> {
  return (await callCloud('data', 'getSession', { sessionId })).session
}

export async function listRecentSessions(): Promise<SessionSummary[]> {
  return (await callCloud('data', 'listSessions', {})).items
}

export async function setCurrentVersion(sessionId: string, vid: string): Promise<Session> {
  return (await callCloud('data', 'setCurrentVersion', { sessionId, vid })).session
}

export interface JobOptions {
  /** 判断这次任务想要的结果是否已经出现在对话里 */
  isDone: (session: Session) => boolean
  /** 页面关闭后返回 true，停止等待并抛出 CANCELLED */
  isCancelled?: () => boolean
  poll?: Partial<PollOptions>
}

/**
 * 运行一个生成任务（generate / revise / analyze）。
 * 云函数可能比小程序端等待得更久：等不到返回时，转为轮询对话状态直到任务结束。
 * 成功返回最新的对话；失败抛出 CloudError，message 可直接展示。
 */
export async function runSessionJob(
  sessionId: string,
  start: () => Promise<{ session: Session }>,
  options: JobOptions,
): Promise<Session> {
  let startError: CloudError | null = null
  try {
    const { session } = await start()
    if (!session.job) return finish(session, options, null)
  } catch (err) {
    if (!mayStillRun(err)) throw err
    startError = err
  }

  const { value, timedOut, cancelled } = await pollUntil(
    () => getSession(sessionId),
    (s) => s.job === null,
    {
      intervalMs: 2_000,
      timeoutMs: JOB_STALE_MS,
      isCancelled: options.isCancelled,
      ...options.poll,
    },
  )
  if (cancelled) throw new CloudError('CANCELLED', '已取消')
  if (timedOut || !value) {
    throw new CloudError('TIMEOUT', '生成时间太长了，请稍后回来看看')
  }
  return finish(value, options, startError)
}

function finish(session: Session, options: JobOptions, startError: CloudError | null): Session {
  if (options.isDone(session)) return session
  if (session.lastError) {
    throw new CloudError(session.lastError.code, session.lastError.message)
  }
  // 任务没有运行过：多半是请求根本没到云端
  throw startError ?? new CloudError('INTERNAL', '生成失败，请重试')
}
