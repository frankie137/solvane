import { AppError } from '../errors'

type Product = '语音识别' | '语音合成'

/** 把腾讯云 API 的错误码翻译成可操作的提示（fn 为配置密钥的云函数名） */
export function toTencentError(err: unknown, product: Product, fn: string): AppError {
  const code = String((err as { code?: unknown })?.code ?? '')
  const message = (err as Error)?.message ?? ''
  if (code.startsWith('AuthFailure')) {
    return new AppError(
      'NOT_CONFIGURED',
      `腾讯云密钥无效，请检查 ${fn} 云函数的 TENCENT_SECRET_ID / TENCENT_SECRET_KEY`,
    )
  }
  if (code.startsWith('UnauthorizedOperation')) {
    return new AppError('NOT_CONFIGURED', `这组密钥没有${product}权限，请在腾讯云访问管理中授权`)
  }
  if (
    /ServiceIsolate|UserNotRegistered|NoFreeAccount|ResourceInsufficient|AppIdNotRegistered|NotOpen|UnsupportedOperation\.(?:Pkg|Account)/.test(
      code,
    )
  ) {
    return new AppError('NOT_CONFIGURED', `腾讯云${product}未开通、额度已用完或已欠费`)
  }
  if (/Timeout|timed out/i.test(`${code} ${message}`)) {
    return new AppError('TIMEOUT', `${product}超时，请重试`)
  }
  return new AppError('UPSTREAM_ERROR', `${product}失败，请重试`)
}
