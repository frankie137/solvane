import type { z } from 'zod'
import type { LlmService } from '../../src/functions/compose/handlers'
import type { LlmTarget } from '../../src/lib/llm/client'
import {
  analysisSchema,
  draftSchema,
  explainSchema,
  revisionSchema,
} from '../../src/lib/llm/schemas'

export const DRAFT = {
  title: '周末计划',
  polishedZh: '这周末我想去爬山，顺便拍点照片。',
  sentences: [
    { en: "I'm thinking of going hiking this weekend.", zh: '这周末我想去爬山。' },
    { en: 'Maybe take some photos while I’m at it.', zh: '顺便拍点照片。' },
  ],
  alternatives: [{ label: '更随意', en: 'Gonna hit the trails this weekend and snap some pics.' }],
}

export const REVISION = {
  sentences: [{ en: 'Gonna go hiking this weekend.', zh: '这周末去爬山。' }],
  alternatives: [],
}

export const ANALYSIS = {
  keyPhrases: [
    {
      phrase: 'hit the trails',
      meaning: '去徒步',
      usage: '朋友间聊户外活动',
      example: 'Let’s hit the trails. (去走走吧。)',
    },
  ],
  slang: [{ phrase: 'snap some pics', meaning: '随手拍照', register: '口语', region: '通用' }],
  culture: [],
  chinglish: [{ literal: 'climb mountain', natural: 'go hiking', why: '休闲爬山通常说 hiking' }],
}

export const EXPLAIN = {
  meaning: '赶上进度',
  usage: '常说 catch up on sth，表示补上落下的事',
  example: 'I need to catch up on sleep. (我得补补觉。)',
}

/** 按 schema 返回预设结果的假大模型，记录调用 */
export function createFakeLlm() {
  const calls: { kind: string; target: LlmTarget; prompt: string }[] = []
  let failWith: Error | null = null
  const llm: LlmService = {
    async chatJson<S extends z.ZodType>(
      target: LlmTarget,
      messages: { content: string }[],
      schema: S,
    ) {
      const kind =
        schema === (draftSchema as z.ZodType)
          ? 'draft'
          : schema === (revisionSchema as z.ZodType)
            ? 'revision'
            : schema === (analysisSchema as z.ZodType)
              ? 'analysis'
              : schema === (explainSchema as z.ZodType)
                ? 'explain'
                : 'unknown'
      calls.push({ kind, target, prompt: messages.map((m) => m.content).join('\n') })
      if (failWith) throw failWith
      const raw =
        kind === 'draft'
          ? DRAFT
          : kind === 'revision'
            ? REVISION
            : kind === 'explain'
              ? EXPLAIN
              : ANALYSIS
      return schema.parse(raw) as z.infer<S>
    },
    async ping(target) {
      calls.push({ kind: 'ping', target, prompt: '' })
      if (failWith) throw failWith
      return 'OK'
    },
  }
  return {
    llm,
    calls,
    fail(err: Error | null) {
      failWith = err
    },
  }
}
