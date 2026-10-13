import { describe, expect, it } from 'vitest'
import { isPrivateMode, parseEnvFile, setEnvValue, validateSecrets } from './secrets'

const VALID = new Map([
  ['KEY_ENCRYPTION_SECRET', 'x'.repeat(44)],
  ['ADMIN_OPENIDS', 'o13Rf1abcdefghijklmnopqTSX8'],
  ['TENCENT_SECRET_ID', 'AKIDabcdefghijklmnop'],
  ['TENCENT_SECRET_KEY', 'k'.repeat(32)],
  ['SOE_APP_ID', '1300000000'],
])

describe('parseEnvFile', () => {
  it('strips trailing comments from unquoted values and keeps # in quoted ones', () => {
    const values = parseEnvFile('A= # 留空\nB=abc # 注释\nC="x # y"\nD=a#b\n')
    expect([...values]).toEqual([
      ['A', ''],
      ['B', 'abc'],
      ['C', 'x # y'],
      ['D', 'a#b'],
    ])
  })

  it('removes invisible characters brought in by copy-paste', () => {
    const values = parseEnvFile('A=\u200B\nB=\uFEFFo13Rf1abc\u200D\n')
    expect(values.get('A')).toBe('')
    expect(values.get('B')).toBe('o13Rf1abc')
  })

  it('parses key-value pairs, skipping comments and blank lines and stripping quotes', () => {
    const values = parseEnvFile('# 注释\n\nA=1\n B = two \nC="three=3"\nD=\nbad line\n')
    expect([...values]).toEqual([
      ['A', '1'],
      ['B', 'two'],
      ['C', 'three=3'],
      ['D', ''],
    ])
  })
})

describe('setEnvValue', () => {
  it('replaces the existing line and leaves the rest unchanged', () => {
    expect(setEnvValue('# c\nA=\nB=2\n', 'A', 'x$1y')).toBe('# c\nA=x$1y\nB=2\n')
  })
  it('appends the line when it is missing', () => {
    expect(setEnvValue('B=2', 'A', 'v')).toBe('B=2\nA=v\n')
  })
})

describe('validateSecrets', () => {
  it('reports no problems for a complete, valid config', () => {
    expect(validateSecrets(VALID)).toEqual([])
  })

  it.each([
    ['KEY_ENCRYPTION_SECRET', '留空', 'currently has 2 characters'],
    ['ADMIN_OPENIDS', '', 'ADMIN_OPENIDS must not be empty'],
    ['ADMIN_OPENIDS', 'o13Rf1…TSX8', 'masked ID'],
    [
      'ADMIN_OPENIDS',
      'o13Rf1abcdefghijklmnopqTSX8，o13Rf1abcdefghijklmnopqTSX9',
      'full-width comma',
    ],
    ['ADMIN_OPENIDS', 'o13Rf1abc defghijklmnopqTSX8', 'contains a space'],
    ['ADMIN_OPENIDS', 'x13Rf1abcdefghijklmnopqTSX8', 'the first character is a lowercase letter'],
    ['ADMIN_OPENIDS', '“o13Rf1abcdefghijklmnopqTSX8”', 'the first character is a quotation mark'],
    ['KEY_ENCRYPTION_SECRET', '“', 'the first character is a quotation mark'],
    ['SOE_APP_ID', '', 'SOE_APP_ID must not be empty'],
    ['SOE_APP_ID', 'wx46ecc9293eb0f276', 'not the WeChat AppID that starts with wx'],
    ['SOE_APP_ID', '100012345678', 'looks like the account ID'],
    ['TENCENT_SECRET_ID', 'abc', 'TENCENT_SECRET_ID'],
    ['TENCENT_SECRET_KEY', '', 'TENCENT_SECRET_KEY'],
  ])('%s=%j is reported', (key, value, text) => {
    const problems = validateSecrets(new Map([...VALID, [key, value]]))
    expect(problems.join('\n')).toContain(text)
  })

  it('never includes any value in problem descriptions', () => {
    const secretish = new Map([...VALID, ['TENCENT_SECRET_ID', 'sk-leaky-value']])
    expect(validateSecrets(secretish).join('\n')).not.toContain('sk-leaky-value')
  })
})

describe('isPrivateMode', () => {
  it.each([
    [0o600, true],
    [0o400, true],
    [0o640, false],
    [0o644, false],
    [0o604, false],
  ])('%o → %s', (mode, ok) => {
    expect(isPrivateMode(mode)).toBe(ok)
  })
})
