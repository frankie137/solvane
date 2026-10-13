import * as cloud from 'wx-server-sdk'
import type { FunctionName } from '@shared/api'
import { createRouter, type Handlers } from './router'

let initialized = false

/** Initializes the CloudBase SDK and returns it; repeated calls initialize only once */
export function getCloud(): typeof cloud {
  if (!initialized) {
    // The SDK types declare env as string, but the official usage passes this symbol to
    // follow the current environment
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV as unknown as string })
    initialized = true
  }
  return cloud
}

/**
 * Builds every cloud function's entry point: initializes the SDK, reads the caller's identity
 * from the WeChat context, and dispatches by action
 */
export function createFunction<F extends FunctionName>(name: F, handlers: Handlers<F>) {
  const sdk = getCloud()
  return createRouter(name, handlers, () => {
    const { OPENID, APPID } = sdk.getWXContext()
    return { openid: OPENID, appid: APPID }
  })
}
