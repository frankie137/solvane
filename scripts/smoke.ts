/**
 * Smoke test: launch the mini program through the WeChat DevTools automation API, open each key page and take a screenshot;
 * fails if a page throws an uncaught exception. Screenshots are saved to .smoke/.
 *
 * Prerequisites: WeChat DevTools is logged in, with the service port enabled under Settings → Security (「设置 → 安全设置」).
 * If WeChat DevTools isn't running, it is launched in the background and stays open afterwards (see scripts/devtools.ts).
 * Run: pnpm smoke (builds the mini program first)
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { withAutomator } from './devtools'

const root = resolve(__dirname, '..')
const outDir = join(root, '.smoke')

interface Route {
  name: string
  url: string
  /** Page path, used to confirm the target page actually opened */
  path: string
}

const ROUTES: Route[] = [
  { name: '01-practice', url: '/pages/index/index?tab=practice', path: 'pages/index/index' },
  { name: '02-library', url: '/pages/index/index?tab=library', path: 'pages/index/index' },
  { name: '03-me', url: '/pages/index/index?tab=me', path: 'pages/index/index' },
  { name: '04-gallery', url: '/pkg-dev/gallery/index', path: 'pkg-dev/gallery/index' },
  { name: '05-llm-settings', url: '/pkg-settings/llm/index', path: 'pkg-settings/llm/index' },
  // Nonexistent session: checks how the load-failure state is shown
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
  {
    name: '12-share-missing',
    url: '/pkg-share/play/index?shareId=smoke-missing',
    path: 'pkg-share/play/index',
  },
  { name: '13-my-shares', url: '/pkg-share/mine/index', path: 'pkg-share/mine/index' },
  // Shows the member list when WeChat DevTools is logged in as an admin, otherwise 「只有管理员可以管理会员」 (only admins can manage membership)
  { name: '14-members', url: '/pkg-admin/members/index', path: 'pkg-admin/members/index' },
]

/** Wait for the tab switch and entrance animation to finish */
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
        failures.push(`${route.name}: expected ${route.path}, got ${page?.path ?? 'none'}`)
        continue
      }
      await page.waitFor(SETTLE_MS)
      await mp.screenshot({ path: join(outDir, `${route.name}.png`) })
      console.info(`✓ ${route.name}`)
    }
  })

  failures.push(...exceptions.map((e) => `Uncaught exception: ${e}`))
  failures.push(...consoleErrors.map((e) => `console.error: ${e}`))

  if (failures.length > 0) {
    console.error(`\nSmoke test failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
    process.exit(1)
  }
  console.info(`\nAll passed; screenshots are in ${outDir}`)
}

// Handles may linger after the automation connection closes, so exit explicitly when done
main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
