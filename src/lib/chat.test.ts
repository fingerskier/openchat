import { describe, expect, it } from 'vitest'
import { appendReply, buildChatRequest, type AssistantMessage, type ChatMessage } from './chat'
import type { ModelInfo } from './openrouter'
import { SYSTEM_PROMPT } from './structured'

const model = (structured: ModelInfo['structured']): ModelInfo => ({
  id: 'vendor/model',
  name: 'Model',
  contextLength: 1000,
  promptPrice: 1,
  completionPrice: 2,
  structured,
})

const history: ChatMessage[] = [
  { id: '1', role: 'user', content: 'Hello' },
  { id: '2', role: 'assistant', model: 'other/model', response: 'Hi', flowPrompts: ['p'], wellFormed: true },
  { id: '3', role: 'user', content: 'Next' },
]

describe('buildChatRequest', () => {
  it('prepends the system prompt and replays replies in the structured shape', () => {
    const request = buildChatRequest(model('none'), history)
    expect(request.model).toBe('vendor/model')
    expect(request.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '{"response":"Hi","flow_prompts":["p"]}' },
      { role: 'user', content: 'Next' },
    ])
  })

  it('only constrains providers when a response_format is sent', () => {
    expect(buildChatRequest(model('none'), history)).not.toHaveProperty('provider')
    expect(buildChatRequest(model('json_schema'), history)).toMatchObject({
      response_format: { type: 'json_schema' },
      provider: { require_parameters: true },
    })
  })
})

describe('appendReply', () => {
  const reply: AssistantMessage = { id: 'r', role: 'assistant', model: 'm', response: 'late', flowPrompts: [], wellFormed: true }

  it('appends while the answered message is still present', () => {
    expect(appendReply(history, '3', reply)).toEqual([...history, reply])
  })

  it('drops a late reply to a cleared conversation without writing anything new', () => {
    const cleared: ChatMessage[] = []
    expect(appendReply(cleared, '3', reply)).toBe(cleared)
    expect(appendReply(cleared, undefined, reply)).toBe(cleared)
  })
})
