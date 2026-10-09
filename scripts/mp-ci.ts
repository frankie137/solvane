/**
 * 不打开开发者工具，直接用微信官方的 miniprogram-ci 上传、预览、部署云函数。
 *
 *   pnpm preview                 构建并生成预览二维码 .ci/preview.png（管理员和开发者扫码）
 *   pnpm upload [--desc 说明]     构建并上传为开发版，可在公众平台设为体验版
 *   pnpm deploy:cloud [函数名…]   打包并部署云函数（不写函数名则部署全部）
 *   pnpm deploy:cloud:devtools    同上，但通过开发者工具部署：不需要代码上传密钥，也不受 IP 白名单限制
 *
 * 前置条件：
 *   1. 公众平台「管理 → 开发管理 → 开发设置 → 小程序代码上传」生成代码上传密钥，
 *      下载后放到 .keys/private.<appid>.key（已被 git 忽略），或用 WX_PRIVATE_KEY_PATH 指定路径
 *   2. 同一处配置 IP 白名单（把本机公网 IP 加进去；首次失败的报错里会给出当前 IP）
 *   3. 部署云函数还需要云开发环境 ID：--env 参数，或 .env.local 里的 VITE_CLOUD_ENV
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

/** 手动上传固定用 1 号机器人；以后 CI 自动上传可用 2 号，互不覆盖 */
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
  if (!appid) fail('project.config.json 里没有 appid')
  return appid
}

function getPrivateKeyPath(appid: string): string {
  const path = resolve(root, process.env.WX_PRIVATE_KEY_PATH ?? `.keys/private.${appid}.key`)
  if (!existsSync(path)) {
    fail(
      `找不到代码上传密钥：${path}\n` +
        '  请在公众平台「管理 → 开发管理 → 开发设置 → 小程序代码上传」生成并下载密钥，\n' +
        `  放到 .keys/private.${appid}.key，或通过环境变量 WX_PRIVATE_KEY_PATH 指定。`,
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

/** 版本说明：分支@提交 + 提交标题，方便在公众平台对应到代码 */
function defaultDesc(): string {
  const branch = git('rev-parse --abbrev-ref HEAD')
  const sha = git('rev-parse --short HEAD')
  const subject = git('log -1 --pretty=%s')
  const dirty = git('status --porcelain') ? '（含未提交改动）' : ''
  return `${branch}@${sha}${dirty} ${subject}`.slice(0, 200)
}

function logProgress(task: string | { message: string; status: string }) {
  if (typeof task === 'string') return
  if (task.status === 'done' || task.status === 'fail') console.info(`  ${task.message}`)
}

/** 把白名单、密钥这类常见失败翻译成可操作的提示 */
function explain(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  // 用单词边界匹配，避免 zip、description 之类的词误判
  if (/白名单|\bip\b.*\b(white ?list|invalid|not in)\b|\b(white ?list)\b.*\bip\b/i.test(message)) {
    fail(`当前 IP 不在白名单里，请到公众平台的代码上传设置里添加。\n  原始信息：${message}`)
  }
  if (/private ?key|签名|\bsignature\b/i.test(message)) {
    fail(`代码上传密钥无效或已重置，请重新生成并下载。\n  原始信息：${message}`)
  }
  fail(message)
}

function ensureBuilt(dir: string, hint: string) {
  if (!existsSync(dir)) fail(`没有找到 ${dir}，请先运行 ${hint}`)
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
  console.info(`\n✓ 预览二维码：${dest}（用微信扫码，仅管理员和开发者可打开）`)
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
    `\n✓ 已上传 v${version}（ci 机器人 ${ROBOT}）。` +
      '\n  首次上传后，在公众平台「管理 → 版本管理」把它设为体验版；之后同一机器人再上传会更新体验版。',
  )
}

function readCloudEnv(cliEnv?: string): string {
  if (cliEnv) return cliEnv
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const env = process.env.VITE_CLOUD_ENV
  if (!env) fail('缺少云开发环境 ID：用 --env 指定，或在 .env.local 里填写 VITE_CLOUD_ENV')
  return env
}

async function deployCloud(names: string[], cliEnv?: string, via = 'ci'): Promise<void> {
  ensureBuilt(cloudfunctionsDir, 'pnpm build:cloud')
  const env = readCloudEnv(cliEnv)
  const available = readdirSync(cloudfunctionsDir)
  const targets = names.length > 0 ? names : available
  const unknown = targets.filter((n) => !available.includes(n))
  if (unknown.length > 0)
    fail(`没有这些云函数：${unknown.join('、')}（可选：${available.join('、')}）`)

  if (via === 'devtools') {
    // 走开发者工具的登录状态，不需要上传密钥和 IP 白名单
    const args = ['cloud', 'functions', 'deploy', '--env', env, '--names', ...targets]
    await runDevtoolsCli(
      [...args, '--project', root, '--remote-npm-install'],
      /fail to deploy|│\s*false\s*│/,
    )
    console.info(`\n✓ 已通过开发者工具部署：${targets.join('、')} → ${env}`)
    return
  }

  const project = createProject(root)
  for (const name of targets) {
    const { filesCount, packSize } = await ci.cloud.uploadFunction({
      project,
      env,
      name,
      path: join(cloudfunctionsDir, name),
      // 依赖（wx-server-sdk）在云端安装，本地只上传打包好的代码
      remoteNpmInstall: true,
    })
    console.info(`✓ ${name} → ${env}（${filesCount} 个文件，${(packSize / 1024).toFixed(1)} KB）`)
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
      fail('用法：tsx scripts/mp-ci.ts <preview | upload | deploy-cloud> [参数]')
  }
}

main().catch(explain)
