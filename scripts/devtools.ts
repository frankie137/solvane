/**
 * 驱动微信开发者工具做自动化测试、部署。
 *
 * 使用者同意后才能调用（见 CLAUDE.md）。开发者工具没在运行时在后台启动（`open -g`，不抢前台），
 * 用完不关闭、也不隐藏窗口，留着给下一次用。
 */
import { execFileSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  return check()
}

/** 开发者工具把服务端口写在 Default/.ide 里；退出后文件还在，所以只能用来知道端口号 */
function idePort(): number | null {
  const base = join(homedir(), 'Library/Application Support/微信开发者工具')
  try {
    for (const dir of readdirSync(base)) {
      try {
        const port = Number(readFileSync(join(base, dir, 'Default/.ide'), 'utf8').trim())
        if (Number.isInteger(port) && port > 0) return port
      } catch {
        // 不是用户数据目录
      }
    }
  } catch {
    // 没找到目录时按默认流程走
  }
  return null
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

/** 刚启动时进程已在但服务端口还没就绪，这时命令行会读到旧的端口文件、连不上就放弃 */
async function waitForPort(timeoutMs: number): Promise<void> {
  const port = idePort()
  if (!port) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** 确保开发者工具在运行、服务端口可以连接，再执行 fn；用完保持开着 */
export async function withDevtools<T>(fn: () => Promise<T>): Promise<T> {
  if (devtoolsPid() === null) {
    execFileSync('open', ['-g', '-a', APP_PATH])
    await waitFor(() => devtoolsPid() !== null, 20_000)
  }
  await waitForPort(40_000)
  return fn()
}

/** 在开发者工具里打开项目并运行自动化测试；结束时只断开连接，不关闭项目 */
export function withAutomator<T>(
  projectPath: string,
  fn: (mp: MiniProgram) => Promise<T>,
): Promise<T> {
  return withDevtools(async () => {
    const mp = await automator.launch({ cliPath: CLI_PATH, projectPath, trustProject: true })
    try {
      return await fn(mp)
    } finally {
      mp.disconnect()
    }
  })
}

/**
 * 调用开发者工具命令行，输出同时打印到终端。
 * 命令行在部分失败时退出码仍是 0，所以由 failIf 按输出内容判断是否失败。
 */
export function runDevtoolsCli(args: string[], failIf?: RegExp): Promise<void> {
  return withDevtools(
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
