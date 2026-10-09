/**
 * 把 .keys/cloud.env 里的密钥写入各云函数的环境变量，并设置超时：pnpm cloud:config
 *
 * 安全约束：
 * - 密钥文件在 .keys/（不提交），权限必须是仅本人可读写（600），否则拒绝运行
 * - 每个函数只下发 cloud/src/function-config.ts 里声明的变量
 * - 不打印任何值；写入后读回核对，只报告"已核对"
 *
 * 通过 miniprogram-ci 鉴权（代码上传密钥 + IP 白名单），调用的是腾讯云 SCF 的
 * UpdateFunctionConfiguration。miniprogram-ci 没有公开这个能力，这里用的是它的内部模块，
 * 升级 miniprogram-ci 后需要重新验证。
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import * as ci from 'miniprogram-ci'
import { FUNCTION_CONFIG, type CloudFunctionName } from '../cloud/src/function-config'
import { isPrivateMode, parseEnvFile, setEnvValue, validateSecrets } from './lib/secrets'

const root = resolve(__dirname, '..')
const secretsFile = resolve(root, process.env.CLOUD_SECRETS_FILE ?? '.keys/cloud.env')
const templateFile = join(root, 'cloud.env.example')

// ---------------------------------------------------------------------------
// miniprogram-ci 的内部模块（没有类型声明，只声明用到的部分）

interface TransactOptions {
  request: unknown
  transactType: unknown
}
interface FunctionInfo {
  [key: string]: unknown
}
interface CloudApi {
  TransactType: { IDE: unknown }
  tcbGetEnvironments(
    input: object,
    opts: TransactOptions,
  ): Promise<{ envList: { envId: string; functions: { region: string }[] }[] }>
  scfGetFunctionInfo(input: object, opts: TransactOptions): Promise<FunctionInfo>
  scfUpdateFunctionInfo(input: object, opts: TransactOptions): Promise<unknown>
}
interface CiCloudApi {
  initCloudAPI(appid: string): void
  boundTransactRequest(project: ci.Project): unknown
}

const requireCi = createRequire(require.resolve('miniprogram-ci'))
const cloudAPI = requireCi('./common/cloud-api') as CloudApi
const ciCloudApi = requireCi('./ci/cloud/cloudapi') as CiCloudApi

// ---------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function loadSecrets(): Map<string, string> {
  if (!existsSync(secretsFile)) {
    // 直接以 600 权限新建（复制文件会沿用模板的 644）
    writeFileSync(secretsFile, readFileSync(templateFile), { mode: 0o600, flag: 'wx' })
    fail(`已创建 ${secretsFile}（权限 600）。请填写里面的配置后再运行 pnpm cloud:config`)
  }
  if (!isPrivateMode(statSync(secretsFile).mode)) {
    fail(`${secretsFile} 的权限过宽，请先运行：chmod 600 "${secretsFile}"`)
  }

  let text = readFileSync(secretsFile, 'utf8')
  const values = parseEnvFile(text)
  if (!values.get('KEY_ENCRYPTION_SECRET')) {
    const generated = randomBytes(32).toString('base64')
    text = setEnvValue(text, 'KEY_ENCRYPTION_SECRET', generated)
    writeFileSync(secretsFile, text, { mode: 0o600 })
    values.set('KEY_ENCRYPTION_SECRET', generated)
    console.info('• KEY_ENCRYPTION_SECRET 为空，已自动生成并写回文件。之后不要修改或删除它。')
  }
  return values
}

function readEnvId(): string {
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const id = process.env.VITE_CLOUD_ENV
  if (!id) fail('缺少云开发环境 ID：请在 .env.local 里填写 VITE_CLOUD_ENV')
  return id
}

function createProject(): ci.Project {
  const { appid } = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8')) as {
    appid: string
  }
  const keyPath = resolve(root, process.env.WX_PRIVATE_KEY_PATH ?? `.keys/private.${appid}.key`)
  if (!existsSync(keyPath)) fail(`找不到代码上传密钥：${keyPath}`)
  return new ci.Project({ appid, type: 'miniProgram', projectPath: root, privateKeyPath: keyPath })
}

/** 兼容接口返回的大小写两种字段名 */
function pick(obj: FunctionInfo | undefined, key: string): unknown {
  if (!obj) return undefined
  return obj[key] ?? obj[key.charAt(0).toLowerCase() + key.slice(1)]
}

function readVariables(info: FunctionInfo): Map<string, string> {
  const environment = pick(info, 'Environment') as FunctionInfo | undefined
  const variables = (pick(environment, 'Variables') as FunctionInfo[] | undefined) ?? []
  return new Map(variables.map((v) => [String(pick(v, 'Key')), String(pick(v, 'Value'))]))
}

async function waitUntilActive(get: () => Promise<FunctionInfo>): Promise<FunctionInfo> {
  const deadline = Date.now() + 60_000
  for (;;) {
    const info = await get()
    const status = pick(info, 'Status')
    if (status === undefined || status === 'Active') return info
    if (Date.now() > deadline) fail(`函数状态一直是 ${String(status)}，请稍后重试`)
    await new Promise((r) => setTimeout(r, 2_000))
  }
}

async function main(): Promise<void> {
  const values = loadSecrets()
  const problems = validateSecrets(values)
  if (problems.length > 0) {
    fail(`${secretsFile} 有问题：\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  }

  const envId = readEnvId()
  const project = createProject()
  ciCloudApi.initCloudAPI(project.appid)
  const opts: TransactOptions = {
    request: ciCloudApi.boundTransactRequest(project),
    transactType: cloudAPI.TransactType.IDE,
  }

  let region: string
  try {
    const { envList } = await cloudAPI.tcbGetEnvironments({}, opts)
    const env = envList.find((e) => e.envId === envId)
    if (!env) fail(`代码上传密钥所属的小程序下没有环境 ${envId}`)
    region = env.functions[0]?.region ?? ''
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid ip/i.test(message)) {
      fail(`当前 IP 不在代码上传的白名单里，请到公众平台添加。\n  原始信息：${message}`)
    }
    throw err
  }

  for (const name of Object.keys(FUNCTION_CONFIG) as CloudFunctionName[]) {
    const { timeout, env } = FUNCTION_CONFIG[name]
    const variables = env.map((key) => ({ key, value: values.get(key) ?? '' }))
    const target = { namespace: envId, region, functionName: name }
    const getInfo = () => cloudAPI.scfGetFunctionInfo(target, opts)

    await waitUntilActive(getInfo)
    await cloudAPI.scfUpdateFunctionInfo({ ...target, timeout, environment: { variables } }, opts)
    const info = await waitUntilActive(getInfo)

    // 读回核对：超时一致，变量和本地完全一致（不多不少），不打印值
    const remote = readVariables(info)
    const timeoutOk = Number(pick(info, 'Timeout')) === timeout
    const varsOk =
      remote.size === variables.length && variables.every((v) => remote.get(v.key) === v.value)
    if (!timeoutOk || !varsOk) {
      fail(
        `${name}：写入后核对不一致（超时${timeoutOk ? '正确' : '不对'}，变量${varsOk ? '正确' : '不对'}）`,
      )
    }
    const varsText = env.length > 0 ? env.join('、') : '无'
    console.info(`✓ ${name}：超时 ${timeout} 秒；环境变量 ${varsText}（已核对）`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
