import { describe, expect, it } from 'vitest'
import { isPrivateMode, parseEnvFile, setEnvValue, validateSecrets } from './secrets'

const VALID = new Map([
  ['KEY_ENCRYPTION_SECRET', 'x'.repeat(44)],
  ['ADMIN_OPENIDS', 'o13Rf1abcdefghijklmnopqTSX8'],
  ['TENCENT_SECRET_ID', 'AKIDabcdefghijklmnop'],
  ['TENCENT_SECRET_KEY', 'k'.repeat(32)],
])

describe('parseEnvFile', () => {
  it('不带引号的值去掉行尾注释，带引号的保留 #', () => {
    const values = parseEnvFile('A= # 留空\nB=abc # 注释\nC="x # y"\nD=a#b\n')
    expect([...values]).toEqual([
      ['A', ''],
      ['B', 'abc'],
      ['C', 'x # y'],
      ['D', 'a#b'],
    ])
  })

  it('去掉复制粘贴带进来的不可见字符', () => {
    const values = parseEnvFile('A=\u200B\nB=\uFEFFo13Rf1abc\u200D\n')
    expect(values.get('A')).toBe('')
    expect(values.get('B')).toBe('o13Rf1abc')
  })

  it('解析键值，忽略注释和空行，去掉引号', () => {
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
  it('替换已有的行，其他内容不变', () => {
    expect(setEnvValue('# c\nA=\nB=2\n', 'A', 'x$1y')).toBe('# c\nA=x$1y\nB=2\n')
  })
  it('没有这一行时追加', () => {
    expect(setEnvValue('B=2', 'A', 'v')).toBe('B=2\nA=v\n')
  })
})

describe('validateSecrets', () => {
  it('完整有效的配置没有问题', () => {
    expect(validateSecrets(VALID)).toEqual([])
  })

  it.each([
    ['KEY_ENCRYPTION_SECRET', '留空', '现在有 2 个字符'],
    ['ADMIN_OPENIDS', '', 'ADMIN_OPENIDS 不能为空'],
    ['ADMIN_OPENIDS', 'o13Rf1…TSX8', '打码显示'],
    ['ADMIN_OPENIDS', 'o13Rf1abcdefghijklmnopqTSX8，o13Rf1abcdefghijklmnopqTSX9', '中文逗号'],
    ['ADMIN_OPENIDS', 'o13Rf1abc defghijklmnopqTSX8', '空格'],
    ['ADMIN_OPENIDS', 'x13Rf1abcdefghijklmnopqTSX8', '第一个字符是小写字母'],
    ['ADMIN_OPENIDS', '“o13Rf1abcdefghijklmnopqTSX8”', '第一个字符是引号'],
    ['KEY_ENCRYPTION_SECRET', '“', '第一个字符是引号'],
    ['TENCENT_SECRET_ID', 'abc', 'TENCENT_SECRET_ID'],
    ['TENCENT_SECRET_KEY', '', 'TENCENT_SECRET_KEY'],
  ])('%s=%j 报错', (key, value, text) => {
    const problems = validateSecrets(new Map([...VALID, [key, value]]))
    expect(problems.join('\n')).toContain(text)
  })

  it('问题描述里不包含任何值', () => {
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
