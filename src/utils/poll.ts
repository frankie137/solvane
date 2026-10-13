export interface PollOptions {
  intervalMs: number
  timeoutMs: number
  /** Stop immediately when this returns true (e.g. the page has closed) */
  isCancelled?: () => boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Call load every intervalMs until done returns true or it times out.
 * A single failed load doesn't stop polling; on timeout, returns the last value loaded successfully.
 */
export async function pollUntil<T>(
  load: () => Promise<T>,
  done: (value: T) => boolean,
  options: PollOptions,
): Promise<{ value: T | undefined; timedOut: boolean; cancelled: boolean }> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const deadline = now() + options.timeoutMs
  let value: T | undefined

  const cancelled = () => options.isCancelled?.() === true

  while (now() < deadline) {
    await sleep(options.intervalMs)
    if (cancelled()) return { value, timedOut: false, cancelled: true }
    try {
      value = await load()
      if (done(value)) return { value, timedOut: false, cancelled: false }
    } catch {
      // On a network hiccup, keep waiting for the next round
    }
  }
  return { value, timedOut: true, cancelled: false }
}
