import type { z } from 'zod'
import { AppError } from '../errors'
import { chat, type ChatMessage, type ChatOptions, type FetchLike, type LlmTarget } from './client'

/** 从模型回复中取出 JSON 对象：兼容 ```json 代码块和前后多余文字 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) throw new SyntaxError('no json object')
  return JSON.parse(candidate.slice(start, end + 1))
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`)
    .join('；')
}

export interface ChatJsonOptions extends Omit<ChatOptions, 'json' | 'timeoutMs'> {
  /** 整个调用（含重试）必须在这个时间点前结束 */
  deadline: number
  /** 单次请求的超时上限 */
  maxRequestMs?: number
  now?: () => number
  fetchImpl?: FetchLike
}

/** 留给重试的最短时间，不够就不再重试 */
const MIN_RETRY_MS = 8_000

/**
 * 请求 JSON 输出并用 schema 校验。格式不对时把错误反馈给模型修正一次。
 */
export async function chatJson<S extends z.ZodType>(
  target: LlmTarget,
  messages: ChatMessage[],
  schema: S,
  options: ChatJsonOptions,
): Promise<z.infer<S>> {
  const now = options.now ?? Date.now
  const maxRequestMs = options.maxRequestMs ?? 45_000
  const timeoutFor = () => Math.min(maxRequestMs, options.deadline - now())

  const ask = (msgs: ChatMessage[]) => {
    const timeoutMs = timeoutFor()
    if (timeoutMs <= 0) throw new AppError('TIMEOUT', '大模型响应超时，请稍后再试')
    return chat(
      target,
      msgs,
      {
        timeoutMs,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        json: true,
      },
      options.fetchImpl,
    )
  }

  const reply = await ask(messages)
  let problem: string
  try {
    const result = schema.safeParse(extractJsonObject(reply))
    if (result.success) return result.data
    problem = describeIssues(result.error)
  } catch {
    problem = '不是合法的 JSON'
  }

  if (timeoutFor() < MIN_RETRY_MS) {
    throw new AppError('UPSTREAM_ERROR', '大模型返回的内容格式不正确，请重试')
  }
  const repaired = await ask([
    ...messages,
    { role: 'assistant', content: reply },
    {
      role: 'user',
      content: `上面的输出有问题：${problem}。请严格按要求的 JSON 格式重新输出，不要包含任何其他文字。`,
    },
  ])
  try {
    const result = schema.safeParse(extractJsonObject(repaired))
    if (result.success) return result.data
  } catch {
    // 落到下面统一报错
  }
  throw new AppError('UPSTREAM_ERROR', '大模型返回的内容格式不正确，请重试')
}
