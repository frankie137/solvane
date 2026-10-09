import { AppError } from '../errors'

export interface LlmTarget {
  baseUrl: string
  model: string
  apiKey: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  timeoutMs: number
  temperature?: number
  maxTokens?: number
  /** 要求服务商以 JSON 对象输出 */
  json?: boolean
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** 从上游错误里取一小段说明给用户看，先去掉任何可能是 Key 的内容 */
function upstreamReason(body: string, apiKey: string): string {
  let reason = body
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    const err = parsed.error
    reason = (typeof err === 'string' ? err : err?.message) ?? parsed.message ?? body
  } catch {
    // 不是 JSON，用原文
  }
  return reason
    .split(apiKey)
    .join('***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function errorForStatus(status: number, reason: string): AppError {
  const suffix = reason ? `（${reason}）` : ''
  if (status === 401 || status === 403) {
    return new AppError('UPSTREAM_ERROR', `大模型 API Key 无效或没有权限${suffix}`)
  }
  if (status === 404) {
    return new AppError('UPSTREAM_ERROR', `接口地址或模型名不正确${suffix}`)
  }
  if (status === 429) {
    return new AppError('UPSTREAM_ERROR', `大模型请求太频繁或额度已用完${suffix}`)
  }
  if (status >= 500) {
    return new AppError('UPSTREAM_ERROR', '大模型服务暂时不可用，请稍后再试')
  }
  return new AppError('UPSTREAM_ERROR', `大模型请求失败（${status}）${suffix}`)
}

/** 调用 OpenAI 兼容的 /chat/completions，返回第一条回复的文本 */
export async function chat(
  target: LlmTarget,
  messages: ChatMessage[],
  options: ChatOptions,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const send = async (json: boolean): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      return await fetchImpl(`${target.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: target.model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: false,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new AppError('TIMEOUT', '大模型响应超时，请稍后重试')
      }
      throw new AppError('UPSTREAM_ERROR', '无法连接大模型服务，请检查接口地址')
    } finally {
      clearTimeout(timer)
    }
  }

  let res = await send(options.json === true)
  if (!res.ok && res.status === 400 && options.json) {
    const body = await res.text()
    // 部分服务商或模型不支持 JSON 模式，去掉后重试；提示词本身也要求只输出 JSON
    if (/response_format|json_object|json mode|json_schema/i.test(body)) {
      res = await send(false)
    } else {
      throw errorForStatus(400, upstreamReason(body, target.apiKey))
    }
  }
  if (!res.ok) {
    throw errorForStatus(res.status, upstreamReason(await res.text(), target.apiKey))
  }

  let content: unknown
  try {
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    content = body.choices?.[0]?.message?.content
  } catch {
    throw new AppError('UPSTREAM_ERROR', '大模型返回的数据无法解析，请检查接口地址')
  }
  if (typeof content !== 'string' || content.trim() === '') {
    throw new AppError('UPSTREAM_ERROR', '大模型返回了空内容')
  }
  return content
}
