/**
 * 每个云函数的超时（秒）和需要的环境变量。
 * pnpm cloud:config 据此写入云端，每个函数只拿到自己需要的变量；
 * lib/env.ts 读取变量时也受这里约束，用错函数会在类型检查时报错。
 * 这个文件不能有任何 import，部署脚本也会直接引用它。
 */
export const FUNCTION_CONFIG = {
  compose: { timeout: 60, env: ['KEY_ENCRYPTION_SECRET', 'ADMIN_OPENIDS'] },
  speech: { timeout: 20, env: ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY'] },
  data: { timeout: 10, env: [] },
  assess: {
    timeout: 60,
    env: ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'SOE_APP_ID', 'KEY_ENCRYPTION_SECRET'],
  },
} as const

export type CloudFunctionName = keyof typeof FUNCTION_CONFIG
export type EnvVarOf<F extends CloudFunctionName> = (typeof FUNCTION_CONFIG)[F]['env'][number]
