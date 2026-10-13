/**
 * Upload, preview and deploy cloud functions with WeChat's official miniprogram-ci, without opening WeChat DevTools.
 *
 *   pnpm preview                 Build and generate the preview QR code .ci/preview.png (scanned by admins and developers)
 *   pnpm upload [--desc text]    Build and upload as the development version, which can be set as the trial version in the WeChat MP console
 *   pnpm deploy:cloud [name...]  Bundle and deploy cloud functions (all of them if no name is given)
 *   pnpm deploy:cloud:devtools   Same, but deploy through WeChat DevTools: no code upload key needed, not subject to the IP whitelist
 *
 * Prerequisites:
 *   1. Generate a code upload key in the WeChat MP console under Management → Development Management →
 *      Development Settings → Mini Program Code Upload (「管理 → 开发管理 → 开发设置 → 小程序代码上传」),
 *      download it to .keys/private.<appid>.key (ignored by git), or point WX_PRIVATE_KEY_PATH at it
 *   2. Configure the IP whitelist in the same place (add this machine's public IP; the first failure's error shows the current IP)
 *   3. Deploying cloud functions also needs the CloudBase environment ID: the --env option, or VITE_CLOUD_ENV in .env.local
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import * as ci from 'miniprogram-ci'
import { runDevtoolsCli } from './devtools'

const root = resolve(__dirname, '..')
const miniprogramDir = join(root, 'dist/mp-weixin')
const cloudfunctionsDir = join(root, 'cloudfunctions')
const outDir = join(root, '.ci')

/** Manual uploads always use robot 1; automated CI uploads can later use robot 2, so they don't overwrite each other */
const ROBOT = 1

const COMPILE_SETTING = {
  es6: true,
  es7: true,
  minify: true,
  autoPrefixWXSS: true,
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function getAppid(): string {
  const { appid } = readJson<{ appid?: string }>(join(root, 'project.config.json'))
  if (!appid) fail('project.config.json has no appid')
  return appid
}

function getPrivateKeyPath(appid: string): string {
  const path = resolve(root, process.env.WX_PRIVATE_KEY_PATH ?? `.keys/private.${appid}.key`)
  if (!existsSync(path)) {
    fail(
      `Code upload key not found: ${path}\n` +
        '  Generate and download one in the WeChat MP console under Management → Development Management → Development Settings → Mini Program Code Upload (「管理 → 开发管理 → 开发设置 → 小程序代码上传」),\n' +
        `  then put it at .keys/private.${appid}.key, or set the WX_PRIVATE_KEY_PATH environment variable.`,
    )
  }
  return path
}

function createProject(projectPath: string): ci.Project {
  const appid = getAppid()
  return new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath: getPrivateKeyPath(appid),
    ignores: ['node_modules/**/*'],
  })
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/** Version description: branch@commit + commit subject, to trace versions in the WeChat MP console back to the code */
function defaultDesc(): string {
  const branch = git('rev-parse --abbrev-ref HEAD')
  const sha = git('rev-parse --short HEAD')
  const subject = git('log -1 --pretty=%s')
  const dirty = git('status --porcelain') ? ' (uncommitted changes)' : ''
  return `${branch}@${sha}${dirty} ${subject}`.slice(0, 200)
}

function logProgress(task: string | { message: string; status: string }) {
  if (typeof task === 'string') return
  if (task.status === 'done' || task.status === 'fail') console.info(`  ${task.message}`)
}

/** Turn common failures such as whitelist and key errors into actionable hints */
function explain(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  // Match on word boundaries so words like zip or description don't cause false positives
  if (/白名单|\bip\b.*\b(white ?list|invalid|not in)\b|\b(white ?list)\b.*\bip\b/i.test(message)) {
    fail(
      `The current IP is not in the whitelist; add it in the code upload settings of the WeChat MP console.\n  Original message: ${message}`,
    )
  }
  if (/private ?key|签名|\bsignature\b/i.test(message)) {
    fail(
      `The code upload key is invalid or has been reset; generate and download a new one.\n  Original message: ${message}`,
    )
  }
  fail(message)
}

function ensureBuilt(dir: string, hint: string) {
  if (!existsSync(dir)) fail(`${dir} not found; run ${hint} first`)
}

async function preview(): Promise<void> {
  ensureBuilt(miniprogramDir, 'pnpm build')
  mkdirSync(outDir, { recursive: true })
  const dest = join(outDir, 'preview.png')
  const { version } = readJson<{ version: string }>(join(root, 'package.json'))
  await ci.preview({
    project: createProject(miniprogramDir),
    version,
    desc: defaultDesc(),
    setting: COMPILE_SETTING,
    robot: ROBOT,
    qrcodeFormat: 'image',
    qrcodeOutputDest: dest,
    onProgressUpdate: logProgress,
  })
  console.info(
    `\n✓ Preview QR code: ${dest} (scan with WeChat; only admins and developers can open it)`,
  )
}

async function upload(desc?: string): Promise<void> {
  ensureBuilt(miniprogramDir, 'pnpm build')
  const { version } = readJson<{ version: string }>(join(root, 'package.json'))
  await ci.upload({
    project: createProject(miniprogramDir),
    version,
    desc: desc ?? defaultDesc(),
    setting: COMPILE_SETTING,
    robot: ROBOT,
    onProgressUpdate: logProgress,
  })
  console.info(
    `\n✓ Uploaded v${version} (CI robot ${ROBOT}).` +
      '\n  After the first upload, set it as the trial version in the WeChat MP console under Management → Version Management (「管理 → 版本管理」); later uploads from the same robot update the trial version.',
  )
}

function readCloudEnv(cliEnv?: string): string {
  if (cliEnv) return cliEnv
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const env = process.env.VITE_CLOUD_ENV
  if (!env)
    fail('Missing CloudBase environment ID: pass --env, or set VITE_CLOUD_ENV in .env.local')
  return env
}

async function deployCloud(names: string[], cliEnv?: string, via = 'ci'): Promise<void> {
  ensureBuilt(cloudfunctionsDir, 'pnpm build:cloud')
  const env = readCloudEnv(cliEnv)
  const available = readdirSync(cloudfunctionsDir)
  const targets = names.length > 0 ? names : available
  const unknown = targets.filter((n) => !available.includes(n))
  if (unknown.length > 0)
    fail(`Unknown cloud functions: ${unknown.join(', ')} (available: ${available.join(', ')})`)

  if (via === 'devtools') {
    // Uses WeChat DevTools' login session, so no upload key or IP whitelist is needed
    const args = ['cloud', 'functions', 'deploy', '--env', env, '--names', ...targets]
    await runDevtoolsCli(
      [...args, '--project', root, '--remote-npm-install'],
      /fail to deploy|│\s*false\s*│/,
    )
    console.info(`\n✓ Deployed via WeChat DevTools: ${targets.join(', ')} → ${env}`)
    return
  }

  const project = createProject(root)
  for (const name of targets) {
    const { filesCount, packSize } = await ci.cloud.uploadFunction({
      project,
      env,
      name,
      path: join(cloudfunctionsDir, name),
      // Dependencies (wx-server-sdk) are installed in the cloud; only the bundled code is uploaded
      remoteNpmInstall: true,
    })
    console.info(`✓ ${name} → ${env} (${filesCount} files, ${(packSize / 1024).toFixed(1)} KB)`)
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      desc: { type: 'string' },
      env: { type: 'string' },
      via: { type: 'string' },
    },
  })
  const [command, ...rest] = positionals

  switch (command) {
    case 'preview':
      return preview()
    case 'upload':
      return upload(values.desc)
    case 'deploy-cloud':
      return deployCloud(rest, values.env, values.via)
    default:
      fail('Usage: tsx scripts/mp-ci.ts <preview | upload | deploy-cloud> [options]')
  }
}

// miniprogram-ci keeps network connections open after finishing, so the process won't exit on its own; exit explicitly once the task is done
main().then(() => process.exit(0), explain)
