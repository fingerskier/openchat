import { describe, expect, it } from 'vitest'
import { MAX_REPLY_TOKENS, appendReply, buildChatRequest, replyBudget, type AssistantMessage, type ChatMessage } from './chat'
import type { ModelInfo } from './openrouter'
import { SYSTEM_PROMPT } from './structured'

const model = (structured: ModelInfo['structured']): ModelInfo => ({
  id: 'vendor/model',
  name: 'Model',
  contextLength: 128000,
  maxCompletionTokens: null,
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

  it('caps the output budget so OpenRouter does not reserve the model maximum', () => {
    expect(buildChatRequest(model('none'), history).max_tokens).toBe(MAX_REPLY_TOKENS)
    expect(buildChatRequest(model('json_schema'), history).max_tokens).toBe(MAX_REPLY_TOKENS)
  })

  it('fits the budget inside a small context window', () => {
    const small = { ...model('none'), contextLength: 1000 }
    const request = buildChatRequest(small, history)
    expect(request.max_tokens).toBeGreaterThan(0)
    expect(request.max_tokens).toBeLessThan(1000)
  })

  it('only constrains providers when a response_format is sent', () => {
    expect(buildChatRequest(model('none'), history)).not.toHaveProperty('provider')
    expect(buildChatRequest(model('json_schema'), history)).toMatchObject({
      response_format: { type: 'json_schema' },
      provider: { require_parameters: true },
    })
  })
})

describe('replyBudget', () => {
  const prompt = [{ role: 'user' as const, content: 'x'.repeat(300) }] // estimated at 104 tokens

  it('leaves room for the prompt inside the context window', () => {
    expect(replyBudget({ ...model('none'), contextLength: 1000 }, prompt)).toBe(896)
  })

  it("respects the provider's completion cap", () => {
    expect(replyBudget({ ...model('none'), maxCompletionTokens: 2048 }, prompt)).toBe(2048)
  })

  it('ignores limits the catalog does not advertise, including on models stored before they existed', () => {
    const legacy = { ...model('none'), contextLength: null } as Partial<ModelInfo>
    delete legacy.maxCompletionTokens
    expect(replyBudget(legacy as ModelInfo, prompt)).toBe(MAX_REPLY_TOKENS)
  })

  it('stays positive when the prompt alone overflows the context', () => {
    expect(replyBudget({ ...model('none'), contextLength: 50 }, prompt)).toBe(1)
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
