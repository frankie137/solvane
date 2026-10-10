import { z } from 'zod'

/** 去掉首尾空白、限制长度；超长时截断而不是报错，避免因为一点点超长就整体重试 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, max))

/** 数组超过上限时截断 */
const list = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .default([])
    .transform((items) => items.slice(0, max))

const sentences = z
  .array(z.object({ en: text(400), zh: text(400) }))
  .min(1)
  .transform((items) => items.slice(0, 30))

const alternatives = list(z.object({ label: text(10), en: text(1000) }), 3)

/** 第一次生成 */
export const draftSchema = z.object({
  title: text(20),
  polishedZh: text(1500),
  sentences,
  alternatives,
})

/** 按要求修改 */
export const revisionSchema = z.object({
  sentences,
  alternatives,
})

const field = text(200)

export const analysisSchema = z.object({
  keyPhrases: list(z.object({ phrase: field, meaning: field, usage: field, example: field }), 6),
  slang: list(z.object({ phrase: field, meaning: field, register: text(10), region: text(10) }), 4),
  culture: list(z.object({ topic: field, note: field }), 3),
  chinglish: list(z.object({ literal: field, natural: field, why: field }), 4),
})

export type Draft = z.infer<typeof draftSchema>
export type Revision = z.infer<typeof revisionSchema>
