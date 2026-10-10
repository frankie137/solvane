/**
 * 冒烟测试：通过微信开发者工具的自动化接口启动小程序，逐个打开关键页面并截图，
 * 页面抛出未捕获异常时失败。截图保存在 .smoke/ 目录。
 *
 * 前置条件：开发者工具已登录，并在「设置 → 安全设置」中开启服务端口。
 * 开发者工具没在运行时在后台启动，测完保持开着（见 scripts/devtools.ts）。
 * 运行：pnpm smoke（会先构建小程序）
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { withAutomator } from './devtools'

const root = resolve(__dirname, '..')
const outDir = join(root, '.smoke')

interface Route {
  name: string
  url: string
  /** 页面路径，用于确认确实打开了目标页 */
  path: string
}

const ROUTES: Route[] = [
  { name: '01-practice', url: '/pages/index/index?tab=practice', path: 'pages/index/index' },
  { name: '02-library', url: '/pages/index/index?tab=library', path: 'pages/index/index' },
  { name: '03-me', url: '/pages/index/index?tab=me', path: 'pages/index/index' },
  { name: '04-gallery', url: '/pkg-dev/gallery/index', path: 'pkg-dev/gallery/index' },
  { name: '05-llm-settings', url: '/pkg-settings/llm/index', path: 'pkg-settings/llm/index' },
  // 不存在的对话：检查加载失败状态的展示
  {
    name: '06-session-missing',
    url: '/pkg-session/session/index?id=smoke-missing',
    path: 'pkg-session/session/index',
  },
  {
    name: '07-recite-missing',
    url: '/pkg-recite/recite/index?sessionId=smoke-missing&vid=v1',
    path: 'pkg-recite/recite/index',
  },
  {
    name: '08-report-missing',
    url: '/pkg-recite/report/index?practiceId=smoke-missing',
    path: 'pkg-recite/report/index',
  },
  { name: '09-history', url: '/pkg-library/history/index', path: 'pkg-library/history/index' },
  {
    name: '10-folder-missing',
    url: '/pkg-library/folder/index?id=smoke-missing',
    path: 'pkg-library/folder/index',
  },
  {
    name: '11-expression-missing',
    url: '/pkg-library/expression/index?id=smoke-missing',
    path: 'pkg-library/expression/index',
  },
]

/** 等 tab 切换和入场动画结束 */
const SETTLE_MS = 900

async function main(): Promise<void> {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const exceptions: string[] = []
  const consoleErrors: string[] = []

  const failures: string[] = []
  await withAutomator(root, async (mp) => {
    mp.on('exception', (e: { message?: string }) => exceptions.push(e.message ?? String(e)))
    mp.on('console', (msg: { type?: string; args?: unknown[] }) => {
      if (msg.type === 'error') consoleErrors.push(JSON.stringify(msg.args))
    })

    for (const route of ROUTES) {
      const page = await mp.reLaunch(route.url)
      if (!page || page.path !== route.path) {
        failures.push(`${route.name}: 期望打开 ${route.path}，实际是 ${page?.path ?? '无'}`)
        continue
      }
      await page.waitFor(SETTLE_MS)
      await mp.screenshot({ path: join(outDir, `${route.name}.png`) })
      console.info(`✓ ${route.name}`)
    }
  })

  failures.push(...exceptions.map((e) => `未捕获异常：${e}`))
  failures.push(...consoleErrors.map((e) => `console.error：${e}`))

  if (failures.length > 0) {
    console.error(`\n冒烟测试失败：\n${failures.map((f) => `  - ${f}`).join('\n')}`)
    process.exit(1)
  }
  console.info(`\n全部通过，截图在 ${outDir}`)
}

// 自动化连接断开后可能还留着句柄，结束时主动退出
main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
