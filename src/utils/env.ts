/** Which mini program version is running: develop (development version) / trial (trial version) / release */
export function getEnvVersion(): 'develop' | 'trial' | 'release' {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion
  } catch {
    return 'release'
  }
}

export const isDevelop = () => getEnvVersion() === 'develop'
