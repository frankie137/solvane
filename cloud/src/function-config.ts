/**
 * Timeout (seconds) and required environment variables for each cloud function.
 * pnpm cloud:config writes these to the cloud, so each function only gets the variables it needs;
 * lib/env.ts is also bound by this when reading variables, so using the wrong function fails
 * type checking.
 * This file must not have any imports, because the deployment scripts also reference it directly.
 */
export const FUNCTION_CONFIG = {
  compose: { timeout: 60, env: ['KEY_ENCRYPTION_SECRET', 'ADMIN_OPENIDS'] },
  speech: { timeout: 20, env: ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY'] },
  data: { timeout: 10, env: ['ADMIN_OPENIDS'] },
  assess: {
    timeout: 60,
    env: [
      'TENCENT_SECRET_ID',
      'TENCENT_SECRET_KEY',
      'SOE_APP_ID',
      'KEY_ENCRYPTION_SECRET',
      'ADMIN_OPENIDS',
    ],
  },
} as const

export type CloudFunctionName = keyof typeof FUNCTION_CONFIG
export type EnvVarOf<F extends CloudFunctionName> = (typeof FUNCTION_CONFIG)[F]['env'][number]
