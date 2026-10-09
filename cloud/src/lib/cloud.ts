import * as cloud from 'wx-server-sdk'
import type { FunctionName } from '@shared/api'
import { createRouter, type Handlers } from './router'

let initialized = false

/** 初始化云开发 SDK 并返回它；多次调用只初始化一次 */
export function getCloud(): typeof cloud {
  if (!initialized) {
    // SDK 的类型把 env 声明成了 string，但官方用法就是传这个 symbol，表示跟随当前环境
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string })
    initialized = true
  }
  return cloud
}

/** 每个云函数的入口都用它生成：初始化 SDK、从微信上下文取调用者身份、按 action 分发 */
export function createFunction<F extends FunctionName>(name: F, handlers: Handlers<F>) {
  const sdk = getCloud()
  return createRouter(name, handlers, () => {
    const { OPENID, APPID } = sdk.getWXContext()
    return { openid: OPENID, appid: APPID }
  })
}
