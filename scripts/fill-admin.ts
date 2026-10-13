/**
 * Call data.ping once in WeChat DevTools running in the background to get the user ID (OpenID) of the
 * logged-in WeChat account in this mini program, and write it to ADMIN_OPENIDS in .keys/cloud.env; the ID is never printed.
 * Also clears an invalid KEY_ENCRYPTION_SECRET so that pnpm cloud:config generates one.
 *
 * WeChat DevTools is logged in with the same WeChat account as the phone, so the OpenID is the same.
 * Run: pnpm cloud:fill-admin (launches WeChat DevTools; ask the owner first)
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { withAutomator } from './devtools'
import { isPrivateMode, parseEnvFile, setEnvValue } from './lib/secrets'

// Functions passed to evaluate run in the mini program environment; only the wx APIs used here are declared
declare const wx: {
  cloud: {
    init(options: object): void
    callFunction(options: object): Promise<{ result: unknown }>
  }
}

const root = resolve(__dirname, '..')
const secretsFile = resolve(root, process.env.CLOUD_SECRETS_FILE ?? '.keys/cloud.env')

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function readEnvId(): string {
  const envFile = join(root, '.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const id = process.env.VITE_CLOUD_ENV
  if (!id) fail('Missing CloudBase environment ID: set VITE_CLOUD_ENV in .env.local')
  return id
}

async function main(): Promise<void> {
  if (!existsSync(secretsFile))
    fail(`${secretsFile} not found; run pnpm cloud:config first to create it from the template`)
  if (!isPrivateMode(statSync(secretsFile).mode)) {
    fail(`${secretsFile} has overly broad permissions; first run: chmod 600 "${secretsFile}"`)
  }
  const envId = readEnvId()

  const openid = await withAutomator(root, async (mp) => {
    // Call the cloud function directly inside the mini program runtime; the result stays in this process
    const result = (await mp.evaluate(async (env: string) => {
      wx.cloud.init({ env, traceUser: true })
      const res = await wx.cloud.callFunction({
        name: 'data',
        data: { action: 'ping', payload: {} },
      })
      return res.result as { ok: boolean; data?: { openid?: string } }
    }, envId)) as { ok: boolean; data?: { openid?: string } } | undefined
    return result?.ok ? (result.data?.openid ?? '') : ''
  })

  if (!/^o[\w-]{20,40}$/.test(openid)) {
    fail(
      'Did not get a valid user ID: make sure WeChat DevTools is logged in and the data cloud function is deployed',
    )
  }

  let text = readFileSync(secretsFile, 'utf8')
  text = setEnvValue(text, 'ADMIN_OPENIDS', openid)
  const secret = parseEnvFile(text).get('KEY_ENCRYPTION_SECRET') ?? ''
  const clearedSecret = secret.length > 0 && secret.length < 16
  if (clearedSecret) text = setEnvValue(text, 'KEY_ENCRYPTION_SECRET', '')
  // The file already exists, so writing doesn't change its permissions
  writeFileSync(secretsFile, text)

  console.info("✓ Wrote the current WeChat account's user ID to ADMIN_OPENIDS (not shown)")
  if (clearedSecret) {
    console.info(
      '✓ KEY_ENCRYPTION_SECRET was shorter than 16 characters, so it was cleared; pnpm cloud:config will generate a new one',
    )
  }
}

// Handles may linger after the automation connection closes, so exit explicitly when done
main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
