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
 * Wraps the handlers registered by action into a cloud function entry point:
 * validates the event shape, injects the caller's identity, and turns every error into a
 * uniform ApiResult.
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
      // Log only the error itself, never the payload, so user data and keys stay out of the logs
      console.error(`[${fn}.${action}]`, err instanceof Error ? err.stack : String(err))
      return fail('INTERNAL', '服务暂时不可用，请稍后再试')
    }
  }
}
