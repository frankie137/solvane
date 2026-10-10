/**
 * 尽量不打扰使用者地驱动微信开发者工具做自动化测试。
 *
 * 开发者工具没有无界面模式，这里的做法是：
 * - 没在运行时用 `open -g -j` 隐藏启动，不抢前台
 * - 自动化连接期间反复隐藏窗口，结束后再隐藏一次
 * - 由我们启动的，测完自动退出；使用者本来就开着的，只隐藏不关闭
 *
 * 隐藏窗口通过 System Events 完成，首次运行 macOS 会询问是否允许，拒绝也不影响测试本身。
 */
import { execFile, execFileSync, spawn } from 'node:child_process'
import automator from 'miniprogram-automator'

export const CLI_PATH =
  process.env.WECHAT_DEVTOOLS_CLI ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const APP_PATH = '/Applications/wechatwebdevtools.app'
const PROCESS_PATTERN = 'wechatwebdevtools.app/Contents/MacOS/Electron'

type MiniProgram = Awaited<ReturnType<typeof automator.launch>>

function devtoolsPid(): number | null {
  try {
    const first = execFileSync('pgrep', ['-f', PROCESS_PATTERN], { encoding: 'utf8' })
      .trim()
      .split('\n')[0]
    return first ? Number(first) : null
  } catch {
    return null
  }
}

let hiding = false

/** 异步隐藏开发者工具；上一次还没结束时跳过，避免堆积 osascript 进程 */
function hideDevtools(): Promise<void> {
  const pid = devtoolsPid()
  if (!pid || hiding) return Promise.resolve()
  hiding = true
  const script = `tell application "System Events" to set visible of (first process whose unix id is ${pid}) to false`
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, () => {
      hiding = false
      resolve()
    })
  })
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return check()
}

function quitDevtools(): void {
  try {
    execFileSync(CLI_PATH, ['quit'], { stdio: 'ignore', timeout: 30_000 })
  } catch {
    // 退出失败不影响测试结果
  }
}

/**
 * 确保开发者工具在后台运行并保持隐藏，执行 fn 后恢复原来的运行状态：
 * 由我们启动的就退出，使用者本来开着的只隐藏不关闭。
 */
export async function withHiddenDevtools<T>(fn: () => Promise<T>): Promise<T> {
  const startedByUs = devtoolsPid() === null
  if (startedByUs) {
    execFileSync('open', ['-g', '-j', '-a', APP_PATH])
    await waitFor(() => devtoolsPid() !== null, 20_000)
  }

  const hider = setInterval(() => void hideDevtools(), 400)
  try {
    return await fn()
  } finally {
    clearInterval(hider)
    if (startedByUs) {
      quitDevtools()
    } else {
      await hideDevtools()
    }
  }
}

/** 在后台的开发者工具里打开项目并运行自动化测试 */
export function withQuietDevtools<T>(
  projectPath: string,
  fn: (mp: MiniProgram) => Promise<T>,
): Promise<T> {
  return withHiddenDevtools(async () => {
    const mp = await automator.launch({ cliPath: CLI_PATH, projectPath, trustProject: true })
    try {
      return await fn(mp)
    } finally {
      await mp.close().catch(() => {})
    }
  })
}

/**
 * 在后台调用开发者工具命令行，输出同时打印到终端。
 * 命令行在部分失败时退出码仍是 0，所以由 failIf 按输出内容判断是否失败。
 */
export function runDevtoolsCli(args: string[], failIf?: RegExp): Promise<void> {
  return withHiddenDevtools(
    () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(CLI_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        const collect = (chunk: Buffer, target: NodeJS.WriteStream) => {
          output += chunk.toString()
          target.write(chunk)
        }
        child.stdout.on('data', (c: Buffer) => collect(c, process.stdout))
        child.stderr.on('data', (c: Buffer) => collect(c, process.stderr))
        child.on('error', reject)
        child.on('close', (code) => {
          if (code !== 0) reject(new Error(`开发者工具命令行退出码 ${code}`))
          else if (failIf?.test(output)) reject(new Error('开发者工具报告执行失败，详见上方输出'))
          else resolve()
        })
      }),
  )
}
