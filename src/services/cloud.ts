import type { ActionName, ActionReq, ActionRes, CloudEvent, FunctionName } from '@shared/api'
import { isApiResult } from '@shared/result'
import { CloudError, toCloudError } from './cloud-error'

export { CloudError } from './cloud-error'

let initialized = false

function ensureCloud(): void {
  if (initialized) return
  if (!wx.cloud) {
    throw new CloudError('NOT_CONFIGURED', '当前微信版本不支持云开发，请升级微信')
  }
  const env = import.meta.env.VITE_CLOUD_ENV
  wx.cloud.init(env ? { env, traceUser: true } : { traceUser: true })
  initialized = true
}

/**
 * 类型安全地调用云函数：入参出参都由 shared/api.ts 约束。
 * 成功返回 data；任何失败都抛出 CloudError，message 可直接展示给用户。
 */
export async function callCloud<F extends FunctionName, A extends ActionName<F>>(
  name: F,
  action: A,
  payload: ActionReq<F, A>,
): Promise<ActionRes<F, A>> {
  ensureCloud()
  const event: CloudEvent<F, A> = { action, payload }

  let raw: unknown
  try {
    const res = await wx.cloud.callFunction({
      name,
      data: event as unknown as WechatMiniprogram.IAnyObject,
    })
    raw = res.result
  } catch (err) {
    throw toCloudError(err)
  }

  if (!isApiResult(raw)) {
    throw new CloudError('INTERNAL', '服务返回了无法识别的数据')
  }
  if (!raw.ok) {
    throw new CloudError(raw.error.code, raw.error.message)
  }
  return raw.data as ActionRes<F, A>
}
