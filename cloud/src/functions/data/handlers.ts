import type { Handlers } from '../../lib/router'

export const handlers: Handlers<'data'> = {
  async ping(_payload, ctx) {
    return { pong: true, openid: ctx.openid, serverTime: Date.now() }
  },
}
