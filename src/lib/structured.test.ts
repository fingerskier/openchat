import { describe, expect, it } from 'vitest'
import { parseReply, responseFormatFor, serializeReply } from './structured'

describe('parseReply', () => {
  it('parses a clean reply', () => {
    const raw = JSON.stringify({ response: 'Hi there.', flow_prompts: ['a', 'b', 'c'] })
    expect(parseReply(raw)).toEqual({ response: 'Hi there.', flowPrompts: ['a', 'b', 'c'], wellFormed: true })
  })

  it('unwraps code fences', () => {
    const raw = '```json\n{"response": "Fenced", "flow_prompts": ["x"]}\n```'
    expect(parseReply(raw)).toMatchObject({ response: 'Fenced', flowPrompts: ['x'], wellFormed: true })
  })

  it('finds the object inside surrounding prose', () => {
    const raw = 'Sure! Here you go: {"response": "Inner", "flow_prompts": []} Hope that helps.'
    expect(parseReply(raw)).toMatchObject({ response: 'Inner', wellFormed: true })
  })

  it('clamps, trims, dedupes and drops non-string prompts', () => {
    const raw = JSON.stringify({ response: ' ok ', flow_prompts: [' one ', 'one', 2, '', 'two', 'three', 'four'] })
    expect(parseReply(raw)).toEqual({ response: 'ok', flowPrompts: ['one', 'two', 'three'], wellFormed: true })
  })

  it('accepts camelCase flowPrompts and a missing prompt list', () => {
    expect(parseReply('{"response":"r","flowPrompts":["p"]}').flowPrompts).toEqual(['p'])
    expect(parseReply('{"response":"r"}')).toEqual({ response: 'r', flowPrompts: [], wellFormed: true })
  })

  it('falls back to raw text when the model ignores the format', () => {
    expect(parseReply('  Just prose.  ')).toEqual({ response: 'Just prose.', flowPrompts: [], wellFormed: false })
    expect(parseReply('{"answer": "wrong key"}').wellFormed).toBe(false)
    expect(parseReply('{broken json').wellFormed).toBe(false)
  })
})

describe('responseFormatFor', () => {
  it('uses a strict schema when the model supports structured outputs', () => {
    const format = responseFormatFor('json_schema') as { type: string; json_schema: { strict: boolean } }
    expect(format.type).toBe('json_schema')
    expect(format.json_schema.strict).toBe(true)
  })

  it('degrades to json_object, then to prompt-only', () => {
    expect(responseFormatFor('json_object')).toEqual({ type: 'json_object' })
    expect(responseFormatFor('none')).toBeUndefined()
  })
})

it('serializeReply round-trips through parseReply', () => {
  const reply = { response: 'Round trip', flowPrompts: ['a', 'b', 'c'] }
  expect(parseReply(serializeReply(reply))).toEqual({ ...reply, wellFormed: true })
})
