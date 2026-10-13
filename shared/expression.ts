/**
 * Normalization and matching of saved expressions, shared by the frontend and the cloud:
 * - expressionKey: for merging cards; ignores only case, leading/trailing punctuation and extra spaces
 * - findOccurrence: for tracing sources; finds where an expression occurs in an English sentence, handling common inflections and placeholders like sb / sth
 */

const APOSTROPHES = /[’‘`]/g

/** Merge key: the same expression saved multiple times merges into one card */
export function expressionKey(text: string): string {
  return text
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export interface Token {
  /** The word, lowercased with apostrophes normalized */
  word: string
  start: number
  end: number
}

/** Split into words (hyphens, spaces and punctuation all separate), keeping positions in the original text */
export function tokenizeWords(text: string): Token[] {
  const normalized = text.replace(APOSTROPHES, "'")
  return [...normalized.matchAll(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }))
}

/** Placeholders for "someone / something" in a phrase; each matches 1-3 arbitrary words */
const PLACEHOLDERS = new Set([
  'sb',
  "sb's",
  'sth',
  "sth's",
  'someone',
  "someone's",
  'somebody',
  "somebody's",
  'something',
  "one's",
])
const PLACEHOLDER_MAX = 3

/** Common irregular verbs: base form → past tense and past participle (multiple forms separated by /) */
const IRREGULAR: Record<string, string> = {
  be: 'was/were/been/am/is/are',
  bear: 'bore/born/borne',
  beat: 'beat/beaten',
  become: 'became/become',
  begin: 'began/begun',
  bend: 'bent',
  bet: 'bet',
  bite: 'bit/bitten',
  blow: 'blew/blown',
  break: 'broke/broken',
  bring: 'brought',
  build: 'built',
  burn: 'burnt/burned',
  buy: 'bought',
  catch: 'caught',
  choose: 'chose/chosen',
  come: 'came/come',
  cost: 'cost',
  cut: 'cut',
  deal: 'dealt',
  dig: 'dug',
  do: 'did/done/does',
  draw: 'drew/drawn',
  dream: 'dreamt/dreamed',
  drink: 'drank/drunk',
  drive: 'drove/driven',
  eat: 'ate/eaten',
  fall: 'fell/fallen',
  feed: 'fed',
  feel: 'felt',
  fight: 'fought',
  find: 'found',
  fly: 'flew/flown/flies',
  forget: 'forgot/forgotten',
  forgive: 'forgave/forgiven',
  freeze: 'froze/frozen',
  get: 'got/gotten',
  give: 'gave/given',
  go: 'went/gone/goes',
  grow: 'grew/grown',
  hang: 'hung',
  have: 'had/has',
  hear: 'heard',
  hide: 'hid/hidden',
  hit: 'hit',
  hold: 'held',
  hurt: 'hurt',
  keep: 'kept',
  know: 'knew/known',
  lay: 'laid',
  lead: 'led',
  learn: 'learnt/learned',
  leave: 'left',
  lend: 'lent',
  let: 'let',
  lie: 'lay/lain/lied/lying',
  light: 'lit/lighted',
  lose: 'lost',
  make: 'made',
  mean: 'meant',
  meet: 'met',
  pay: 'paid',
  put: 'put',
  quit: 'quit',
  read: 'read',
  ride: 'rode/ridden',
  ring: 'rang/rung',
  rise: 'rose/risen',
  run: 'ran/run',
  say: 'said',
  see: 'saw/seen',
  seek: 'sought',
  sell: 'sold',
  send: 'sent',
  set: 'set',
  shake: 'shook/shaken',
  shine: 'shone/shined',
  shoot: 'shot',
  show: 'showed/shown',
  shut: 'shut',
  sing: 'sang/sung',
  sink: 'sank/sunk',
  sit: 'sat',
  sleep: 'slept',
  slide: 'slid',
  speak: 'spoke/spoken',
  spend: 'spent',
  spin: 'spun',
  split: 'split',
  spread: 'spread',
  stand: 'stood',
  steal: 'stole/stolen',
  stick: 'stuck',
  sting: 'stung',
  strike: 'struck',
  swear: 'swore/sworn',
  sweep: 'swept',
  swim: 'swam/swum',
  swing: 'swung',
  take: 'took/taken',
  teach: 'taught',
  tear: 'tore/torn',
  tell: 'told',
  think: 'thought',
  throw: 'threw/thrown',
  understand: 'understood',
  wake: 'woke/woken',
  wear: 'wore/worn',
  win: 'won',
  wind: 'wound',
  write: 'wrote/written',
}

/** Irregular form → base form */
const IRREGULAR_BASE = new Map<string, string>()
for (const [base, forms] of Object.entries(IRREGULAR)) {
  for (const form of forms.split('/')) {
    if (!IRREGULAR_BASE.has(form)) IRREGULAR_BASE.set(form, base)
  }
}

const VOWELS = /[aeiou]/
/** Only strip a suffix when the stem has at least 3 letters, avoiding false matches like bed → b, sing → s */
const MIN_STEM = 3

/**
 * Possible base forms of a word (including itself). Two words are the same if their base forms overlap,
 * so catch up / caught up / catching up all match each other.
 */
export function baseForms(word: string): Set<string> {
  const w = word.toLowerCase()
  const out = new Set<string>([w])
  const add = (stem: string) => {
    if (stem.length >= MIN_STEM || Object.prototype.hasOwnProperty.call(IRREGULAR, stem)) {
      out.add(stem)
    }
  }
  const irregular = IRREGULAR_BASE.get(w)
  if (irregular) out.add(irregular)

  // Possessive: friend's → friend
  if (w.endsWith("'s")) add(w.slice(0, -2))

  // -ies / -ied → -y (tries / tried → try)
  if (/[^aeiou](ies|ied)$/.test(w)) add(`${w.slice(0, -3)}y`)
  // -ying keeps the y (trying → try); -ying may also come from -ie (lying → lie)
  if (w.endsWith('ying')) {
    add(w.slice(0, -3))
    add(`${w.slice(0, -4)}ie`)
  }

  for (const suffix of ['es', 's', 'ed', 'd', 'ing']) {
    if (!w.endsWith(suffix)) continue
    const stem = w.slice(0, -suffix.length)
    if (suffix === 's' && /(ss|us|is)$/.test(w)) continue
    add(stem)
    // Doubled consonant: stopped → stop, running → run
    if ((suffix === 'ed' || suffix === 'ing') && /([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1))
    // Dropped e: making → make, hoped → hope
    if ((suffix === 'ing' || suffix === 'ed') && VOWELS.test(stem)) add(`${stem}e`)
  }
  return out
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const forms = baseForms(b)
  for (const f of baseForms(a)) if (forms.has(f)) return true
  return false
}

type Part = { kind: 'word'; word: string } | { kind: 'slot' }

function toPattern(phrase: string): Part[] {
  const parts: Part[] = tokenizeWords(phrase).map((t) =>
    PLACEHOLDERS.has(t.word) ? { kind: 'slot' } : { kind: 'word', word: t.word },
  )
  // Leading and trailing placeholders are ignored when locating ("sb's call" looks for call)
  while (parts[0]?.kind === 'slot') parts.shift()
  while (parts[parts.length - 1]?.kind === 'slot') parts.pop()
  return parts
}

/** Whether pattern matches starting at word i; returns the end word index (exclusive) */
function matchAt(tokens: Token[], i: number, pattern: Part[], p: number): number | null {
  if (p === pattern.length) return i
  const part = pattern[p]!
  if (part.kind === 'slot') {
    for (let n = 1; n <= PLACEHOLDER_MAX && i + n <= tokens.length; n++) {
      const end = matchAt(tokens, i + n, pattern, p + 1)
      if (end !== null) return end
    }
    return null
  }
  const token = tokens[i]
  if (!token || !sameWord(part.word, token.word)) return null
  return matchAt(tokens, i + 1, pattern, p + 1)
}

export interface Occurrence {
  /** Character position in the original sentence, for highlighting */
  start: number
  end: number
}

/** Find the first occurrence of an expression in an English sentence; null if not found */
export function findOccurrence(sentence: string, phrase: string): Occurrence | null {
  const pattern = toPattern(phrase)
  if (pattern.length === 0) return null
  const tokens = tokenizeWords(sentence)
  for (let i = 0; i < tokens.length; i++) {
    const end = matchAt(tokens, i, pattern, 0)
    if (end !== null) return { start: tokens[i]!.start, end: tokens[end - 1]!.end }
  }
  return null
}
