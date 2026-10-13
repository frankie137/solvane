/** Parsing and validation of the secrets file (pure functions: no file I/O, never prints values) */

/** Invisible characters that copy-paste tends to bring in (zero-width space, zero-width joiner, BOM, etc.); trim() doesn't remove them */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g

/**
 * Parse KEY=VALUE lines: skip comments and blank lines; strip surrounding quotes from quoted values;
 * in unquoted values, a # after whitespace starts a trailing comment; invisible characters are removed.
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

/** Write a variable's value back into the text: replace the existing line, or append one */
export function setEnvValue(text: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, () => `${key}=${value}`)
  return `${text.trimEnd()}\n${key}=${value}\n`
}

/** Describe what kind of character this is, for hints, without echoing the character itself */
export function charKind(ch: string): string {
  if (/[a-z]/.test(ch)) return 'a lowercase letter'
  if (/[A-Z]/.test(ch)) return 'an uppercase letter'
  if (/\d/.test(ch)) return 'a digit'
  if (/["'“”‘’`]/.test(ch)) return 'a quotation mark'
  if (/[\u4e00-\u9fff]/.test(ch)) return 'a Chinese character'
  if (/[\u3000-\u303f\uff00-\uffef]/.test(ch)) return 'a full-width symbol'
  return 'a symbol'
}

/** Explain what's wrong with a user ID; describes only traits (length, character kinds), never the content */
function describeOpenidProblem(id: string): string | null {
  if (/^o[\w-]{20,40}$/.test(id)) return null
  if (/…|\.\.\./.test(id)) {
    return 'looks like the masked ID shown in the UI (with an ellipsis). Tap the Me → User ID (「我的 → 用户 ID」) row to copy the full ID'
  }
  if (/\s/.test(id)) return 'the ID contains a space'
  if (!id.startsWith('o')) {
    return `a user ID should start with a lowercase o, but the first character is ${charKind(id.charAt(0))}`
  }
  return `${id.length} characters long or contains special characters; a valid user ID is about 28 letters, digits, underscores or hyphens`
}

/** Validate the format and return a list of problems (never containing any value) */
export function validateSecrets(values: Map<string, string>): string[] {
  const problems: string[] = []
  const secret = values.get('KEY_ENCRYPTION_SECRET') ?? ''
  if (secret.length < 16) {
    const kind = secret.length > 0 ? ` (the first character is ${charKind(secret.charAt(0))})` : ''
    problems.push(
      `KEY_ENCRYPTION_SECRET currently has ${secret.length} characters${kind}; at least 16 are required. To have the script generate one, delete everything after the equals sign`,
    )
  }

  const rawAdmins = values.get('ADMIN_OPENIDS') ?? ''
  if (/，/.test(rawAdmins))
    problems.push('ADMIN_OPENIDS uses a full-width comma; separate multiple IDs with ASCII commas')
  const admins = rawAdmins
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (admins.length === 0) {
    problems.push(
      'ADMIN_OPENIDS must not be empty. In the mini program, tap Me → User ID (「我的 → 用户 ID」) to copy it',
    )
  }
  admins.forEach((id, i) => {
    const problem = describeOpenidProblem(id)
    if (problem) problems.push(`ADMIN_OPENIDS ID #${i + 1}: ${problem}`)
  })

  if (!/^AKID\w{8,}$/.test(values.get('TENCENT_SECRET_ID') ?? '')) {
    problems.push(
      'TENCENT_SECRET_ID has the wrong format: a Tencent Cloud SecretId starts with AKID',
    )
  }
  if ((values.get('TENCENT_SECRET_KEY') ?? '').length < 16) {
    problems.push('TENCENT_SECRET_KEY looks incomplete')
  }

  const soeAppId = values.get('SOE_APP_ID') ?? ''
  if (!soeAppId) {
    problems.push(
      'SOE_APP_ID must not be empty: use your Tencent Cloud account AppID (a number shown under Account Info (「账号信息」) in Tencent Cloud)',
    )
  } else if (!/^\d{5,12}$/.test(soeAppId)) {
    problems.push(
      `SOE_APP_ID should be 5-12 digits but has ${soeAppId.length} characters; note that it is not the WeChat AppID that starts with wx`,
    )
  } else if (/^100\d{9}$/.test(soeAppId)) {
    // The top-right corner of the console shows the account ID (12 digits starting with 100), which is not the AppID
    problems.push(
      'SOE_APP_ID looks like the account ID (the number in the top-right corner of the console), not the AppID: in Tencent Cloud, find the APPID field under Account Center → Account Info (「账号中心 → 账号信息」); it is usually 10 digits',
    )
  }
  return problems
}

/** File permissions must allow only the owner to read and write: any group or other permission is rejected */
export function isPrivateMode(mode: number): boolean {
  return (mode & 0o077) === 0
}
