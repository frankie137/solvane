/**
 * 在后台的开发者工具里调用一次 data.ping，取得当前登录微信号在本小程序下的用户 ID（openid），
 * 写入 .keys/cloud.env 的 ADMIN_OPENIDS；不打印 ID。
 * 同时清掉不合格的 KEY_ENCRYPTION_SECRET，让 pnpm cloud:config 自动生成。
 *
 * 开发者工具登录的微信号与手机上的是同一个，openid 一致。
 * 运行：pnpm cloud:fill-admin（会启动开发者工具，需先征得使用者同意）
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { withQuietDevtools } from './devtools'
import { isPrivateMode, parseEnvFile, setEnvValue } from './lib/secrets'

// evaluate 里的函数运行在小程序环境中，这里只声明用到的 wx 接口
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
  if (!id) fail('缺少云开发环境 ID：请在 .env.local 里填写 VITE_CLOUD_ENV')
  return id
}

async function main(): Promise<void> {
  if (!existsSync(secretsFile)) fail(`找不到 ${secretsFile}，请先运行 pnpm cloud:config 生成模板`)
  if (!isPrivateMode(statSync(secretsFile).mode)) {
    fail(`${secretsFile} 的权限过宽，请先运行：chmod 600 "${secretsFile}"`)
  }
  const envId = readEnvId()

  const openid = await withQuietDevtools(root, async (mp) => {
    // 在小程序运行环境里直接调用云函数，结果只留在本进程内
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
    fail('没有取到有效的用户 ID：请确认开发者工具已登录、data 云函数已部署')
  }

  let text = readFileSync(secretsFile, 'utf8')
  text = setEnvValue(text, 'ADMIN_OPENIDS', openid)
  const secret = parseEnvFile(text).get('KEY_ENCRYPTION_SECRET') ?? ''
  const clearedSecret = secret.length > 0 && secret.length < 16
  if (clearedSecret) text = setEnvValue(text, 'KEY_ENCRYPTION_SECRET', '')
  // 文件已存在，写入不会改变权限
  writeFileSync(secretsFile, text)

  console.info('✓ 已把当前微信号的用户 ID 写入 ADMIN_OPENIDS（不显示）')
  if (clearedSecret) {
    console.info(
      '✓ KEY_ENCRYPTION_SECRET 原来的内容不足 16 位，已清空，运行 pnpm cloud:config 时会自动生成',
    )
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
