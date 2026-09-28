import type { ApiMessage, ChatRequest, ModelInfo } from './openrouter'
import { SYSTEM_PROMPT, responseFormatFor, serializeReply } from './structured'

export interface UserMessage {
  id: string
  role: 'user'
  content: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  /** Model that produced this turn; models can change mid-chat. */
  model: string
  response: string
  flowPrompts: string[]
  wellFormed: boolean
}

export type ChatMessage = UserMessage | AssistantMessage

export function newId(): string {
  // randomUUID only exists in secure contexts; plain-http LAN dev servers lack it.
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function toApiMessages(messages: ChatMessage[]): ApiMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map((m): ApiMessage =>
      m.role === 'user'
        ? { role: 'user', content: m.content }
        : // Replay replies in the requested shape so whichever model answers next sees the format.
          { role: 'assistant', content: serializeReply(m) },
    ),
  ]
}

export function buildChatRequest(model: ModelInfo, messages: ChatMessage[]): ChatRequest {
  const responseFormat = responseFormatFor(model.structured)
  return {
    model: model.id,
    messages: toApiMessages(messages),
    ...(responseFormat && {
      response_format: responseFormat,
      // Route only to providers that honor response_format for this model.
      provider: { require_parameters: true },
    }),
  }
}
