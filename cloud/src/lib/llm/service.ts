import type { z } from 'zod'
import type { ChatMessage, LlmTarget } from './client'
import type { ChatJsonOptions } from './json'

/** LLM capabilities used by the cloud functions; tests can swap in a fake implementation */
export interface LlmService {
  chatJson<S extends z.ZodType>(
    target: LlmTarget,
    messages: ChatMessage[],
    schema: S,
    options: Pick<ChatJsonOptions, 'deadline' | 'maxTokens' | 'temperature'>,
  ): Promise<z.infer<S>>
  /** Connection test: returns the model's reply */
  ping(target: LlmTarget): Promise<string>
}
