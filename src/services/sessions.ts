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
  /** Whether the result this job is after already shows up in the session */
  isDone: (session: Session) => boolean
  /** Returns true once the page closes, to stop waiting and throw CANCELLED */
  isCancelled?: () => boolean
  poll?: Partial<PollOptions>
}

/**
 * Run a generation job (generate / revise / analyze).
 * The cloud function may run longer than the client can wait: if no response arrives, poll the session state until the job ends.
 * Returns the latest session on success; on failure throws a CloudError whose message can be shown as is.
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
  // The job never ran: most likely the request never reached the cloud
  throw startError ?? new CloudError('INTERNAL', '生成失败，请重试')
}
