/**
 * Write the secrets in .keys/cloud.env into each cloud function's environment variables and set timeouts: pnpm cloud:config
 *
 * Security constraints:
 * - The secrets file lives in .keys/ (not committed) and must be readable and writable by the owner only (600), or the script refuses to run
 * - Each function receives only the variables declared in cloud/src/function-config.ts
 * - Never prints any value; reads back after writing to verify, and only reports "verified"
 *
 * Authenticates through miniprogram-ci (code upload key + IP whitelist) and calls Tencent Cloud SCF's
 * UpdateFunctionConfiguration. miniprogram-ci doesn't expose this publicly, so this uses its internal modules;
 * re-verify after upgrading miniprogram-ci.
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
// Internal modules of miniprogram-ci (no type declarations; only the parts used here are declared)

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
    // Create it directly with mode 600 (copying the file would keep the template's 644)
    writeFileSync(secretsFile, readFileSync(templateFile), { mode: 0o600, flag: 'wx' })
    fail(
      `Created ${secretsFile} (mode 600). Fill in the settings, then run pnpm cloud:config again`,
    )
  }
  if (!isPrivateMode(statSync(secretsFile).mode)) {
    fail(`${secretsFile} has overly broad permissions; first run: chmod 600 "${secretsFile}"`)
  }

  let text = readFileSync(secretsFile, 'utf8')
  const values = parseEnvFile(text)
  if (!values.get('KEY_ENCRYPTION_SECRET')) {
    const generated = randomBytes(32).toString('base64')
    text = setEnvValue(text, 'KEY_ENCRYPTION_SECRET', generated)
    writeFileSync(secretsFile, text, { mode: 0o600 })
    values.set('KEY_ENCRYPTION_SECRET', generated)
    console.info(
      '• KEY_ENCRYPTION_SECRET was empty, so one was generated and written back to the file. Do not change or delete it afterwards.',
    )
  }
  return values
}

function readEnvId(): string {
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const id = process.env.VITE_CLOUD_ENV
  if (!id) fail('Missing CloudBase environment ID: set VITE_CLOUD_ENV in .env.local')
  return id
}

function createProject(): ci.Project {
  const { appid } = JSON.parse(readFileSync(join(root, 'project.config.json'), 'utf8')) as {
    appid: string
  }
  const keyPath = resolve(root, process.env.WX_PRIVATE_KEY_PATH ?? `.keys/private.${appid}.key`)
  if (!existsSync(keyPath)) fail(`Code upload key not found: ${keyPath}`)
  return new ci.Project({ appid, type: 'miniProgram', projectPath: root, privateKeyPath: keyPath })
}

/** Accept both capitalized and lowercase field names returned by the API */
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
    if (Date.now() > deadline)
      fail(`Function status is stuck at ${String(status)}; try again later`)
    await new Promise((r) => setTimeout(r, 2_000))
  }
}

async function main(): Promise<void> {
  const values = loadSecrets()
  const problems = validateSecrets(values)
  if (problems.length > 0) {
    fail(`${secretsFile} has problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
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
    if (!env) fail(`The mini program that owns the code upload key has no environment ${envId}`)
    region = env.functions[0]?.region ?? ''
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid ip/i.test(message)) {
      fail(
        `The current IP is not in the code upload whitelist; add it in the WeChat MP console.\n  Original message: ${message}`,
      )
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

    // Read back to verify: timeout matches and variables match the local ones exactly (none missing, none extra); values are not printed
    const remote = readVariables(info)
    const timeoutOk = Number(pick(info, 'Timeout')) === timeout
    const varsOk =
      remote.size === variables.length && variables.every((v) => remote.get(v.key) === v.value)
    if (!timeoutOk || !varsOk) {
      fail(
        `${name}: mismatch after writing (timeout ${timeoutOk ? 'ok' : 'wrong'}, variables ${varsOk ? 'ok' : 'wrong'})`,
      )
    }
    const varsText = env.length > 0 ? env.join(', ') : 'none'
    console.info(`✓ ${name}: timeout ${timeout}s; env vars ${varsText} (verified)`)
  }
}

// miniprogram-ci keeps network connections open, so exit explicitly when done
main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
