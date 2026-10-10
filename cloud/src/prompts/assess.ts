import { LEVELS } from '@shared/constants'
import type {
  PracticeDiff,
  PracticeScores,
  ScoredWord,
  SpokenWord,
  UserSettings,
} from '@shared/types'
import type { ChatMessage } from '../lib/llm/client'

const COACH = '你是一位以英语为母语、熟悉中国学习者的英语口语教练，正在帮学习者检查背诵。'

/** 用户内容放进三引号里；内容本身的三引号替换掉，避免提前闭合 */
function quote(content: string): string {
  return `"""\n${content.replace(/"""/g, '“”“')}\n"""`
}

export function buildAlignMessages(sentences: string[], words: SpokenWord[]): ChatMessage[] {
  const system = `${COACH}

学习者在不看原文的情况下背诵了一段英文。下面给出原文（按句编号）和语音识别出的内容（按词编号）。语音识别可能把发音不准的词识别成别的词，比如把发音不准的 think 识别成 sink。请：

1. sentences：对每一句原文，给出它对应识别结果里第几个词到第几个词（wordRange，含两端，用词的编号）；这句完全没背出来时 wordRange 为 null、intended 为空字符串。
   intended 是"学习者想说的那句话"：以识别结果为准，但把明显因发音不准而识别错的词改回学习者想说的词；学习者自己换了说法的部分保留他的说法，不要改回原文。
2. diffs：列出背诵和原文的差异，kind 取值：
   - mispronounced：读错了（识别结果和原文的词读音相近，很可能是发音问题）
   - paraphrase：换了说法，意思正确、表达地道（不算错误）
   - missing：漏说了
   - extra：多说了原文没有的内容
   - grammar：说法有语法错误或不地道
   target 写原文里的说法，said 写学习者实际说的，note 用一句中文说明。
3. content：0～100，原文的意思和关键表达背出来了多少；换了说法但意思对、表达地道的不扣分。
4. expression：0～100，学习者实际说出来的英文是否正确、地道（只看说出来的部分）。

只输出一个 JSON 对象，不要输出其他文字：
{"sentences": [{"index": 0, "intended": "", "wordRange": [0, 3]}], "diffs": [{"kind": "", "sentenceIndex": 0, "target": "", "said": "", "note": ""}], "content": 0, "expression": 0}`

  const original = sentences.map((s, i) => `${i}. ${s}`).join('\n')
  const spoken =
    words.length > 0 ? words.map((w, i) => `${i}:${w.word}`).join(' ') : '（没有识别出内容）'
  const user = `原文：
${quote(original)}

识别结果（编号:词）：
${quote(spoken)}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export interface ReportInput {
  scores: Omit<PracticeScores, 'overall'>
  diffs: PracticeDiff[]
  weakWords: ScoredWord[]
  settings: UserSettings
}

export function buildReportMessages(input: ReportInput): ChatMessage[] {
  const level = LEVELS.find((l) => l.id === input.settings.level) ?? LEVELS[3]!
  const system = `${COACH}

请根据评测数据，用中文给「${level.name}」水平的学习者写简短、具体、可操作的反馈：
- summary：一句话总结这次背诵（不超过 40 个字），先肯定做得好的地方。
- pronunciationTips：针对发音最差的几个词（最多 5 个），word 写单词，issue 说明哪个音没发好（可以用音标），howTo 说明怎么发（舌位、口型、对比的中文音等）。没有明显问题时返回空数组。
- recitationTips：1～3 条背诵建议，例如哪句漏了、哪里可以换成更地道的说法、怎么记住某个表达。

只输出一个 JSON 对象，不要输出其他文字：
{"summary": "", "pronunciationTips": [{"word": "", "issue": "", "howTo": ""}], "recitationTips": [""]}`

  const weak =
    input.weakWords.length > 0
      ? input.weakWords
          .map((w) => {
            const phones = w.phones
              .filter((p) => p.accuracy >= 0 && p.accuracy < 70)
              .map((p) =>
                p.phone && p.phone !== p.refPhone
                  ? `/${p.refPhone}/ 发成了 /${p.phone}/`
                  : `/${p.refPhone}/ ${Math.round(p.accuracy)} 分`,
              )
              .join('，')
            return `- ${w.word}：${Math.round(w.accuracy)} 分${phones ? `（${phones}）` : ''}`
          })
          .join('\n')
      : '（没有明显的发音问题）'
  const diffs =
    input.diffs.length > 0
      ? input.diffs
          .map((d) => `- [${d.kind}] 原文「${d.target}」，实际「${d.said}」：${d.note}`)
          .join('\n')
      : '（和原文基本一致）'
  const user = `分数（0～100）：发音 ${input.scores.pronunciation}，流利度 ${input.scores.fluency}，内容还原 ${input.scores.content}，表达正确 ${input.scores.expression}

发音较差的词：
${quote(weak)}

和原文的差异：
${quote(diffs)}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
