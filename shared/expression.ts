/**
 * 收藏表达的规范化与匹配，前后端共用：
 * - expressionKey：合并卡片用，只忽略大小写、首尾标点和多余空格
 * - findOccurrence：溯源用，在一句英文里找表达出现的位置，认常见词形变化和 sb / sth 之类的占位词
 */

const APOSTROPHES = /[’‘`]/g

/** 合并键：同一个表达多次收藏合并为一张卡片 */
export function expressionKey(text: string): string {
  return text
    .replace(APOSTROPHES, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export interface Token {
  /** 小写、撇号统一后的词 */
  word: string
  start: number
  end: number
}

/** 按词切分（连字符、空格和标点都是分隔），保留在原文里的位置 */
export function tokenizeWords(text: string): Token[] {
  const normalized = text.replace(APOSTROPHES, "'")
  return [...normalized.matchAll(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }))
}

/** 短语里表示"某人 / 某事"的占位词，匹配 1～3 个任意词 */
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

/** 常用不规则动词：原形 → 过去式、过去分词（多个写法用 / 分隔） */
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

/** 不规则形式 → 原形 */
const IRREGULAR_BASE = new Map<string, string>()
for (const [base, forms] of Object.entries(IRREGULAR)) {
  for (const form of forms.split('/')) {
    if (!IRREGULAR_BASE.has(form)) IRREGULAR_BASE.set(form, base)
  }
}

const VOWELS = /[aeiou]/
/** 词干至少 3 个字母才去词尾，避免 bed → b、sing → s 这类误判 */
const MIN_STEM = 3

/**
 * 一个词可能的原形（含它自己）。两边都还原后有交集就算同一个词，
 * 所以 catch up / caught up / catching up 能互相匹配。
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

  // 所有格：friend's → friend
  if (w.endsWith("'s")) add(w.slice(0, -2))

  // -ies / -ied → -y（tries / tried → try）
  if (/[^aeiou](ies|ied)$/.test(w)) add(`${w.slice(0, -3)}y`)
  // -ying 保留 y（trying → try），-ying 也可能来自 -ie（lying → lie）
  if (w.endsWith('ying')) {
    add(w.slice(0, -3))
    add(`${w.slice(0, -4)}ie`)
  }

  for (const suffix of ['es', 's', 'ed', 'd', 'ing']) {
    if (!w.endsWith(suffix)) continue
    const stem = w.slice(0, -suffix.length)
    if (suffix === 's' && /(ss|us|is)$/.test(w)) continue
    add(stem)
    // 双写辅音：stopped → stop、running → run
    if ((suffix === 'ed' || suffix === 'ing') && /([^aeiou])\1$/.test(stem)) add(stem.slice(0, -1))
    // 去掉的 e：making → make、hoped → hope
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
  // 首尾的占位词不参与定位（"sb's call" 找的是 call）
  while (parts[0]?.kind === 'slot') parts.shift()
  while (parts[parts.length - 1]?.kind === 'slot') parts.pop()
  return parts
}

/** 从第 i 个词开始能否匹配 pattern；返回结束的词序号（不含） */
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
  /** 在原句里的字符位置，用于高亮 */
  start: number
  end: number
}

/** 在一句英文里找表达第一次出现的位置；找不到返回 null */
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
