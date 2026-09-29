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

/**
 * Output budget per reply. Without it OpenRouter prices each request at the
 * model's full output ceiling (often 32k+ tokens) and answers 402 when the
 * key's remaining limit or the account balance can't cover that worst case.
 * A brief reply needs a few hundred tokens; the rest is headroom for reasoning.
 */
export const MAX_REPLY_TOKENS = 4096

export function newId(): string {
  // randomUUID only exists in secure contexts; plain-http LAN dev servers lack it.
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Append a reply only while the message it answers is still in the chat, so a
 * late reply can't resurrect a conversation that was cleared or forgotten.
 */
export function appendReply(
  messages: ChatMessage[],
  answering: string | undefined,
  reply: AssistantMessage,
): ChatMessage[] {
  return messages.some((m) => m.id === answering) ? [...messages, reply] : messages
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
    max_tokens: MAX_REPLY_TOKENS,
    ...(responseFormat && {
      response_format: responseFormat,
      // Route only to providers that honor response_format for this model.
      provider: { require_parameters: true },
    }),
  }
}
