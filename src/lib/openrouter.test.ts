import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenRouterError, createChatCompletion, fetchKeyInfo, parseModels } from './openrouter'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('parseModels', () => {
  it('maps catalog rows and skips malformed or non-text ones', () => {
    const models = parseModels({
      data: [
        {
          id: 'a/strict',
          name: 'Strict',
          context_length: 128000,
          pricing: { prompt: '0.000001', completion: '0.000002' },
          supported_parameters: ['structured_outputs', 'response_format'],
          architecture: { output_modalities: ['text'] },
        },
        { id: 'b/json', supported_parameters: ['response_format'], pricing: { prompt: '-1', completion: '-1' } },
        { id: 'c/image', architecture: { output_modalities: ['image'] } },
        { name: 'no id' },
        'garbage',
      ],
    })

    expect(models).toEqual([
      { id: 'a/strict', name: 'Strict', contextLength: 128000, promptPrice: 1, completionPrice: 2, structured: 'json_schema' },
      { id: 'b/json', name: 'b/json', contextLength: null, promptPrice: null, completionPrice: null, structured: 'json_object' },
    ])
  })

  it('returns an empty list for unexpected payloads', () => {
    expect(parseModels(null)).toEqual([])
    expect(parseModels({ data: 'nope' })).toEqual([])
  })
})

describe('createChatCompletion', () => {
  const payload = { model: 'a/b', messages: [{ role: 'user' as const, content: 'hi' }] }

  it('posts the payload with the key and returns the first message', async () => {
    const fetchMock = stubFetch(200, { choices: [{ message: { content: '{"response":"ok"}' } }] })
    await expect(createChatCompletion('sk-test', payload)).resolves.toBe('{"response":"ok"}')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it('joins content parts', async () => {
    stubFetch(200, { choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] })
    await expect(createChatCompletion('k', payload)).resolves.toBe('ab')
  })

  it('surfaces the API error message and status', async () => {
    stubFetch(401, { error: { message: 'No auth credentials found', code: 401 } })
    const error = await createChatCompletion('bad', payload).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OpenRouterError)
    expect(error).toMatchObject({ message: 'No auth credentials found', status: 401 })
  })

  it('treats an inline error or empty reply as a failure', async () => {
    stubFetch(200, { error: { message: 'Provider returned error' } })
    await expect(createChatCompletion('k', payload)).rejects.toThrow('Provider returned error')

    stubFetch(200, { choices: [{ message: { content: '' } }] })
    await expect(createChatCompletion('k', payload)).rejects.toThrow('empty reply')
  })
})

it('fetchKeyInfo reads usage and limits', async () => {
  stubFetch(200, { data: { label: 'sk-or-v1-abc...', usage: 1.5, limit: null, limit_remaining: null } })
  await expect(fetchKeyInfo('k')).resolves.toEqual({ label: 'sk-or-v1-abc...', usage: 1.5, limit: null, limitRemaining: null })
})
