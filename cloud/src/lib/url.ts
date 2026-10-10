import { isIP } from 'node:net'
import { AppError } from './errors'

/**
 * 校验并规范化大模型接口地址：只允许 https 的公网域名，
 * 避免云函数被用来访问内网地址。返回去掉末尾斜杠的地址。
 */
export function normalizeBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new AppError('BAD_REQUEST', '接口地址格式不正确')
  }
  if (url.protocol !== 'https:') {
    throw new AppError('BAD_REQUEST', '接口地址必须以 https:// 开头')
  }
  const host = url.hostname.toLowerCase()
  const looksInternal =
    isIP(host.replace(/^\[|\]$/g, '')) !== 0 ||
    host === 'localhost' ||
    !host.includes('.') ||
    /\.(local|internal|localhost|lan)$/.test(host)
  if (looksInternal) {
    throw new AppError('BAD_REQUEST', '接口地址必须是公网域名')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AppError('BAD_REQUEST', '接口地址不能包含账号、查询参数或锚点')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}
