/**
 * Drive WeChat DevTools for automated testing and deployment.
 *
 * Only call this after the owner agrees (see CLAUDE.md). If WeChat DevTools isn't running, it is launched in the background (`open -g`, without taking focus);
 * afterwards it is neither closed nor hidden, and stays open for next time.
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

/** WeChat DevTools writes its service port to Default/.ide; the file remains after it quits, so it only tells us the port number */
function idePort(): number | null {
  const base = join(homedir(), 'Library/Application Support/微信开发者工具')
  try {
    for (const dir of readdirSync(base)) {
      try {
        const port = Number(readFileSync(join(base, dir, 'Default/.ide'), 'utf8').trim())
        if (Number.isInteger(port) && port > 0) return port
      } catch {
        // Not a user data directory
      }
    }
  } catch {
    // Fall back to the default flow when the directory isn't found
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

/** Right after launch the process exists but the service port isn't ready; the CLI would then read the stale port file, fail to connect and give up */
async function waitForPort(timeoutMs: number): Promise<void> {
  const port = idePort()
  if (!port) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portOpen(port)) return
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** Make sure WeChat DevTools is running and its service port is reachable, then run fn; leave it open afterwards */
export async function withDevtools<T>(fn: () => Promise<T>): Promise<T> {
  if (devtoolsPid() === null) {
    execFileSync('open', ['-g', '-a', APP_PATH])
    await waitFor(() => devtoolsPid() !== null, 20_000)
  }
  await waitForPort(40_000)
  return fn()
}

/** Open the project in WeChat DevTools and run automation; when done, only disconnect, without closing the project */
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
 * Run the WeChat DevTools CLI, echoing its output to the terminal.
 * The CLI still exits with 0 on partial failure, so failIf decides from the output whether it failed.
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
          if (code !== 0) reject(new Error(`WeChat DevTools CLI exited with code ${code}`))
          else if (failIf?.test(output))
            reject(new Error('WeChat DevTools reported a failure; see the output above'))
          else resolve()
        })
      }),
  )
}
