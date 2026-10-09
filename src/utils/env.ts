/** 当前运行的小程序版本：develop 开发版 / trial 体验版 / release 正式版 */
export function getEnvVersion(): 'develop' | 'trial' | 'release' {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion
  } catch {
    return 'release'
  }
}

export const isDevelop = () => getEnvVersion() === 'develop'
