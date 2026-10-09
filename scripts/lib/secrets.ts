/** 密钥文件的解析与校验（纯函数，不读写文件、不打印值） */

/** 解析 KEY=VALUE 格式；忽略注释和空行，去掉值两侧的引号 */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
    values.set(key, value)
  }
  return values
}

/** 把某个变量的值写回文本：替换已有的行，没有就追加 */
export function setEnvValue(text: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, () => `${key}=${value}`)
  return `${text.trimEnd()}\n${key}=${value}\n`
}

/** 校验格式，返回问题列表（不包含任何值） */
export function validateSecrets(values: Map<string, string>): string[] {
  const problems: string[] = []
  if ((values.get('KEY_ENCRYPTION_SECRET') ?? '').length < 16) {
    problems.push('KEY_ENCRYPTION_SECRET 至少 16 位')
  }

  const admins = (values.get('ADMIN_OPENIDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (admins.length === 0) {
    problems.push('ADMIN_OPENIDS 不能为空（小程序「我的 → 用户 ID」可复制）')
  } else if (admins.some((id) => !/^o[\w-]{20,40}$/.test(id))) {
    problems.push('ADMIN_OPENIDS 格式不对：用户 ID 以 o 开头，多个用英文逗号分隔')
  }

  if (!/^AKID\w{8,}$/.test(values.get('TENCENT_SECRET_ID') ?? '')) {
    problems.push('TENCENT_SECRET_ID 格式不对：腾讯云 SecretId 以 AKID 开头')
  }
  if ((values.get('TENCENT_SECRET_KEY') ?? '').length < 16) {
    problems.push('TENCENT_SECRET_KEY 看起来不完整')
  }
  return problems
}

/** 文件权限只允许本人读写：组和其他用户有任何权限都不行 */
export function isPrivateMode(mode: number): boolean {
  return (mode & 0o077) === 0
}
