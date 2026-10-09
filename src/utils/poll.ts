export interface PollOptions {
  intervalMs: number
  timeoutMs: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 每隔 intervalMs 调用一次 load，直到 done 返回 true 或超时。
 * 单次 load 失败不会中断轮询；超时后返回最后一次成功取到的值。
 */
export async function pollUntil<T>(
  load: () => Promise<T>,
  done: (value: T) => boolean,
  options: PollOptions,
): Promise<{ value: T | undefined; timedOut: boolean }> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const deadline = now() + options.timeoutMs
  let value: T | undefined

  while (now() < deadline) {
    await sleep(options.intervalMs)
    try {
      value = await load()
      if (done(value)) return { value, timedOut: false }
    } catch {
      // 网络抖动时继续等下一轮
    }
  }
  return { value, timedOut: true }
}
