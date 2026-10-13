import { describe, expect, it } from 'vitest'
import { baseForms, expressionKey, findOccurrence, tokenizeWords } from './expression'

describe('expressionKey', () => {
  it('ignores case, leading/trailing punctuation and extra spaces, and normalizes apostrophes', () => {
    expect(expressionKey('  Catch   up! ')).toBe('catch up')
    expect(expressionKey('“Hang in there.”')).toBe('hang in there')
    expect(expressionKey('I’m down')).toBe("i'm down")
  })

  it('keeps inner punctuation and does not merge different wordings', () => {
    expect(expressionKey('laid-back')).toBe('laid-back')
    expect(expressionKey('catch up')).not.toBe(expressionKey('caught up'))
  })
})

describe('tokenizeWords', () => {
  it('splits on hyphens and punctuation, keeping contractions and positions', () => {
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

  it('does not strip suffixes when the stem is too short', () => {
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

  it('is case- and punctuation-insensitive', () => {
    expect(at('Let’s CATCH UP soon!', 'catch up')).toBe('CATCH UP')
  })

  it('handles inflections, matching base and inflected forms both ways', () => {
    expect(at('We caught up last week.', 'catch up')).toBe('caught up')
    expect(at("I'm catching up on sleep.", 'caught up')).toBe('catching up')
    expect(at('She gave me a hand.', 'give someone a hand')).toBe('gave me a hand')
  })

  it('placeholders match 1-3 words', () => {
    expect(at('Can you give my little brother a hand?', 'give sb a hand')).toBe(
      'give my little brother a hand',
    )
    expect(at('Give a hand.', 'give sb a hand')).toBeNull()
  })

  it('ignores leading and trailing placeholders when locating', () => {
    expect(at('Thanks for your call.', "one's call")).toBe('call')
  })

  it('matches whole words only, not parts of words', () => {
    expect(at('The category is wrong.', 'cat')).toBeNull()
    expect(at('I need a break.', 'break')).toBe('break')
  })

  it('returns null when not found or the expression is empty', () => {
    expect(at('Hello there.', 'goodbye')).toBeNull()
    expect(findOccurrence('Hello', '...')).toBeNull()
    expect(findOccurrence('Hello', 'sb')).toBeNull()
  })
})
