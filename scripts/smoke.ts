/**
 * 冒烟测试：通过微信开发者工具的自动化接口启动小程序，逐个打开关键页面并截图，
 * 页面抛出未捕获异常时失败。截图保存在 .smoke/ 目录。
 *
 * 前置条件：开发者工具已登录，并在「设置 → 安全设置」中开启服务端口。
 * 运行：pnpm smoke（会先构建小程序）
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import automator from 'miniprogram-automator'

const root = resolve(__dirname, '..')
const outDir = join(root, '.smoke')
const cliPath =
  process.env.WECHAT_DEVTOOLS_CLI ?? '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

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
]

/** 等 tab 切换和入场动画结束 */
const SETTLE_MS = 900

async function main(): Promise<void> {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const exceptions: string[] = []
  const consoleErrors: string[] = []

  const mp = await automator.launch({ cliPath, projectPath: root, trustProject: true })
  mp.on('exception', (e: { message?: string }) => exceptions.push(e.message ?? String(e)))
  mp.on('console', (msg: { type?: string; args?: unknown[] }) => {
    if (msg.type === 'error') consoleErrors.push(JSON.stringify(msg.args))
  })

  const failures: string[] = []
  try {
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
  } finally {
    await mp.close()
  }

  failures.push(...exceptions.map((e) => `未捕获异常：${e}`))
  failures.push(...consoleErrors.map((e) => `console.error：${e}`))

  if (failures.length > 0) {
    console.error(`\n冒烟测试失败：\n${failures.map((f) => `  - ${f}`).join('\n')}`)
    process.exit(1)
  }
  console.info(`\n全部通过，截图在 ${outDir}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
