import { AppError } from '../errors'

type Product = '语音识别' | '语音合成'

/**
 * Turns Tencent Cloud API error codes into actionable messages (fn is the cloud function that
 * holds the credentials)
 */
export function toTencentError(err: unknown, product: Product, fn: string): AppError {
  const code = String((err as { code?: unknown })?.code ?? '')
  const message = (err as Error)?.message ?? ''
  // Include the error code for troubleshooting (codes contain nothing sensitive)
  const tag = code ? `（${code}）` : ''
  if (code.startsWith('AuthFailure')) {
    return new AppError(
      'NOT_CONFIGURED',
      `腾讯云密钥无效，请检查 ${fn} 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY${tag}`,
    )
  }
  if (code.startsWith('UnauthorizedOperation')) {
    return new AppError(
      'NOT_CONFIGURED',
      `这组密钥没有${product}权限，请在腾讯云访问管理中授权${tag}`,
    )
  }
  if (
    /ServiceIsolate|UserNotRegistered|NoFreeAccount|ResourceInsufficient|AppIdNotRegistered|NotOpen|UnsupportedOperation\.(?:Pkg|Account)/.test(
      code,
    )
  ) {
    return new AppError('NOT_CONFIGURED', `腾讯云${product}未开通、额度已用完或已欠费${tag}`)
  }
  if (/Timeout|timed out/i.test(`${code} ${message}`)) {
    return new AppError('TIMEOUT', `${product}超时，请重试`)
  }
  return new AppError('UPSTREAM_ERROR', `${product}失败，请重试${tag}`)
}
