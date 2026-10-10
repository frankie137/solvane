import type { CloudFunctionName, EnvVarOf } from '../function-config'
import { AppError } from './errors'

/** 读取云函数环境变量；缺失时给出指向具体配置项的提示 */
function required<F extends CloudFunctionName>(name: EnvVarOf<F>, fn: F, minLength = 1): string {
  const value = process.env[name]?.trim()
  if (!value || value.length < minLength) {
    throw new AppError(
      'NOT_CONFIGURED',
      `服务端缺少配置：${fn} 云函数的环境变量 ${name}（在 .keys/cloud.env 填写后运行 pnpm cloud:config）`,
    )
  }
  return value
}

export const env = {
  encryptionSecret: () => required('KEY_ENCRYPTION_SECRET', 'compose', 16),
  adminOpenids: (): string[] =>
    (process.env.ADMIN_OPENIDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  /** 腾讯云密钥：speech 和 assess 都需要，各自在自己的环境变量里 */
  tencentCredential: (fn: 'speech' | 'assess') => ({
    secretId: required('TENCENT_SECRET_ID', fn),
    secretKey: required('TENCENT_SECRET_KEY', fn),
  }),
  soeAppId: () => required('SOE_APP_ID', 'assess'),
  assessEncryptionSecret: () => required('KEY_ENCRYPTION_SECRET', 'assess', 16),
}
