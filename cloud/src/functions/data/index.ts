import * as cloud from 'wx-server-sdk'
import { createRouter } from '../../lib/router'
import { handlers } from './handlers'

// SDK 的类型把 env 声明成了 string，但官方用法就是传这个 symbol，表示跟随当前环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string })

export const main = createRouter('data', handlers, () => {
  const { OPENID, APPID } = cloud.getWXContext()
  return { openid: OPENID, appid: APPID }
})
