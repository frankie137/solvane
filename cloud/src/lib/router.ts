import type { ActionName, ActionReq, ActionRes, FunctionName } from '@shared/api'
import { type ApiResult, fail, ok } from '@shared/result'
import { AppError } from './errors'

export interface RequestContext {
  openid: string
  appid?: string
}

export type Handlers<F extends FunctionName> = {
  [A in ActionName<F>]: (payload: ActionReq<F, A>, ctx: RequestContext) => Promise<ActionRes<F, A>>
}

type AnyHandler = (payload: unknown, ctx: RequestContext) => Promise<unknown>

/**
 * 把按 action 登记的处理函数包装成云函数入口：
 * 校验 event 结构、注入调用者身份、把所有异常转换成统一的 ApiResult。
 */
export function createRouter<F extends FunctionName>(
  fn: F,
  handlers: Handlers<F>,
  getContext: () => Partial<RequestContext>,
): (event: unknown) => Promise<ApiResult<unknown>> {
  return async (event) => {
    if (typeof event !== 'object' || event === null) {
      return fail('BAD_REQUEST', '请求格式不正确')
    }
    const { action, payload } = event as { action?: unknown; payload?: unknown }
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, action)) {
      return fail('BAD_REQUEST', '不支持的操作')
    }
    if (
      payload !== undefined &&
      (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    ) {
      return fail('BAD_REQUEST', '请求参数不正确')
    }

    const ctx = getContext()
    if (!ctx.openid) {
      return fail('UNAUTHORIZED', '无法识别当前用户，请重新打开小程序')
    }

    const handler = (handlers as Record<string, AnyHandler>)[action] as AnyHandler
    try {
      const data = await handler(payload ?? {}, { openid: ctx.openid, appid: ctx.appid })
      return ok(data)
    } catch (err) {
      if (err instanceof AppError) {
        return fail(err.code, err.message)
      }
      // 只记录错误本身，不记录 payload，避免把用户数据或密钥写进日志
      console.error(`[${fn}.${action}]`, err instanceof Error ? err.stack : String(err))
      return fail('INTERNAL', '服务暂时不可用，请稍后再试')
    }
  }
}
