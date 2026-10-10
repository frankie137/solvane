import type { z } from 'zod'
import type { ChatMessage, LlmTarget } from './client'
import type { ChatJsonOptions } from './json'

/** 云函数里用到的大模型能力，测试时可以替换成假的实现 */
export interface LlmService {
  chatJson<S extends z.ZodType>(
    target: LlmTarget,
    messages: ChatMessage[],
    schema: S,
    options: Pick<ChatJsonOptions, 'deadline' | 'maxTokens' | 'temperature'>,
  ): Promise<z.infer<S>>
  /** 测试连接：返回模型的回复 */
  ping(target: LlmTarget): Promise<string>
}
