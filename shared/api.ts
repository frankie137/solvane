/**
 * 云函数接口约定：每个云函数按 action 分发，这里登记所有 action 的入参和出参。
 * 前端 services/cloud.ts 与云端 cloud/src/lib/router.ts 都以此为准。
 */

export interface CloudApi {
  data: {
    ping: {
      req: Record<string, never>
      res: { pong: true; openid: string; serverTime: number }
    }
  }
}

export type FunctionName = keyof CloudApi
export type ActionName<F extends FunctionName> = keyof CloudApi[F] & string

type ActionSpec<F extends FunctionName, A extends ActionName<F>> = CloudApi[F][A] extends {
  req: unknown
  res: unknown
}
  ? CloudApi[F][A]
  : never

export type ActionReq<F extends FunctionName, A extends ActionName<F>> = ActionSpec<F, A>['req']
export type ActionRes<F extends FunctionName, A extends ActionName<F>> = ActionSpec<F, A>['res']

/** 前端发给云函数的 event 结构 */
export interface CloudEvent<F extends FunctionName, A extends ActionName<F>> {
  action: A
  payload: ActionReq<F, A>
}
