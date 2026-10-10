/** 密钥文件的解析与校验（纯函数，不读写文件、不打印值） */

/** 复制粘贴时容易带进来的不可见字符：零宽空格、零宽连接符、BOM 等，trim() 去不掉 */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g

/**
 * 解析 KEY=VALUE 格式：忽略注释行和空行；带引号的值去掉两侧引号；
 * 不带引号的值里，空格后面的 # 视为行尾注释；不可见字符直接去掉。
 */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(INVISIBLE, '').trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const rest = line.slice(eq + 1).trim()
    const quoted = rest.match(/^(['"])(.*)\1$/)
    const value = quoted ? (quoted[2] ?? '') : rest.replace(/(^|\s+)#.*$/, '').trim()
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

/** 描述一个字符属于哪一类，用于提示，不回显字符本身 */
export function charKind(ch: string): string {
  if (/[a-z]/.test(ch)) return '小写字母'
  if (/[A-Z]/.test(ch)) return '大写字母'
  if (/\d/.test(ch)) return '数字'
  if (/["'“”‘’`]/.test(ch)) return '引号'
  if (/[\u4e00-\u9fff]/.test(ch)) return '汉字'
  if (/[\u3000-\u303f\uff00-\uffef]/.test(ch)) return '全角符号'
  return '符号'
}

/** 说明一个用户 ID 哪里不对；只描述特征（长度、字符类型），不回显内容 */
function describeOpenidProblem(id: string): string | null {
  if (/^o[\w-]{20,40}$/.test(id)) return null
  if (/…|\.\.\./.test(id)) {
    return '看起来抄的是界面上打码显示的 ID（带省略号）。请在「我的 → 用户 ID」那一行点一下，系统会复制完整的 ID'
  }
  if (/\s/.test(id)) return 'ID 中间有空格'
  if (!id.startsWith('o')) {
    return `用户 ID 应该以小写字母 o 开头，现在第一个字符是${charKind(id.charAt(0))}`
  }
  return `长度 ${id.length} 位或含有特殊字符，正常的用户 ID 是 28 位左右的字母、数字、下划线或横线`
}

/** 校验格式，返回问题列表（不包含任何值） */
export function validateSecrets(values: Map<string, string>): string[] {
  const problems: string[] = []
  const secret = values.get('KEY_ENCRYPTION_SECRET') ?? ''
  if (secret.length < 16) {
    const kind = secret.length > 0 ? `（第一个字符是${charKind(secret.charAt(0))}）` : ''
    problems.push(
      `KEY_ENCRYPTION_SECRET 现在有 ${secret.length} 个字符${kind}，至少需要 16 位。想让脚本自动生成，就把等号后面的内容全部删掉`,
    )
  }

  const rawAdmins = values.get('ADMIN_OPENIDS') ?? ''
  if (/，/.test(rawAdmins)) problems.push('ADMIN_OPENIDS 里用了中文逗号，多个 ID 请用英文逗号分隔')
  const admins = rawAdmins
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (admins.length === 0) {
    problems.push('ADMIN_OPENIDS 不能为空（小程序「我的 → 用户 ID」点一下即可复制）')
  }
  admins.forEach((id, i) => {
    const problem = describeOpenidProblem(id)
    if (problem) problems.push(`ADMIN_OPENIDS 第 ${i + 1} 个 ID：${problem}`)
  })

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
