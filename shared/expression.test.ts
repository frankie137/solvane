import { describe, expect, it } from 'vitest'
import { baseForms, expressionKey, findOccurrence, tokenizeWords } from './expression'

describe('expressionKey', () => {
  it('忽略大小写、首尾标点、多余空格，统一撇号', () => {
    expect(expressionKey('  Catch   up! ')).toBe('catch up')
    expect(expressionKey('“Hang in there.”')).toBe('hang in there')
    expect(expressionKey('I’m down')).toBe("i'm down")
  })

  it('中间的标点保留，不同说法不合并', () => {
    expect(expressionKey('laid-back')).toBe('laid-back')
    expect(expressionKey('catch up')).not.toBe(expressionKey('caught up'))
  })
})

describe('tokenizeWords', () => {
  it('连字符和标点都是分隔，保留撇号缩写和位置', () => {
    const tokens = tokenizeWords("It's laid-back, isn't it?")
    expect(tokens.map((t) => t.word)).toEqual(["it's", 'laid', 'back', "isn't", 'it'])
    expect(tokens[1]).toMatchObject({ start: 5, end: 9 })
  })
})

describe('baseForms', () => {
  it.each([
    ['caught', 'catch'],
    ['catching', 'catch'],
    ['stopped', 'stop'],
    ['running', 'run'],
    ['making', 'make'],
    ['tries', 'try'],
    ['tried', 'try'],
    ['lying', 'lie'],
    ['goes', 'go'],
    ['going', 'go'],
    ["friend's", 'friend'],
  ])('%s → %s', (word, base) => {
    expect(baseForms(word).has(base)).toBe(true)
  })

  it('词干太短时不去词尾', () => {
    expect(baseForms('bed').has('b')).toBe(false)
    expect(baseForms('sing').has('s')).toBe(false)
    expect(baseForms('this').has('thi')).toBe(false)
  })
})

describe('findOccurrence', () => {
  const at = (sentence: string, phrase: string) => {
    const o = findOccurrence(sentence, phrase)
    return o ? sentence.slice(o.start, o.end) : null
  }

  it('大小写和标点不敏感', () => {
    expect(at('Let’s CATCH UP soon!', 'catch up')).toBe('CATCH UP')
  })

  it('认词形变化，原形和变化形式互相匹配', () => {
    expect(at('We caught up last week.', 'catch up')).toBe('caught up')
    expect(at("I'm catching up on sleep.", 'caught up')).toBe('catching up')
    expect(at('She gave me a hand.', 'give someone a hand')).toBe('gave me a hand')
  })

  it('占位词匹配 1～3 个词', () => {
    expect(at('Can you give my little brother a hand?', 'give sb a hand')).toBe(
      'give my little brother a hand',
    )
    expect(at('Give a hand.', 'give sb a hand')).toBeNull()
  })

  it('首尾的占位词不参与定位', () => {
    expect(at('Thanks for your call.', "one's call")).toBe('call')
  })

  it('整词匹配，不匹配词的一部分', () => {
    expect(at('The category is wrong.', 'cat')).toBeNull()
    expect(at('I need a break.', 'break')).toBe('break')
  })

  it('找不到或表达为空时返回 null', () => {
    expect(at('Hello there.', 'goodbye')).toBeNull()
    expect(findOccurrence('Hello', '...')).toBeNull()
    expect(findOccurrence('Hello', 'sb')).toBeNull()
  })
})
