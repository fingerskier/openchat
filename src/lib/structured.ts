// The reply contract from the README: a brief answer plus three follow-up prompts.

export interface StructuredReply {
  response: string
  flowPrompts: string[]
  /** False when the model ignored the format and we fell back to its raw text. */
  wellFormed: boolean
}

/** How strongly a model can be held to the reply schema. */
export type StructuredMode = 'json_schema' | 'json_object' | 'none'

export const FLOW_PROMPT_COUNT = 3

export const SYSTEM_PROMPT = `You are a helpful assistant inside a chat app.
Always reply with a single JSON object and nothing else, shaped exactly like:
{"response": "...", "flow_prompts": ["...", "...", "..."]}
- response: your answer. Be brief: one or two short paragraphs of plain text, no markdown.
- flow_prompts: exactly ${FLOW_PROMPT_COUNT} short prompts the user might send next, written in the user's voice.`

// Array length is enforced by the prompt and by clamping in parseReply; strict
// schema support for minItems/maxItems varies by provider.
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    response: {
      type: 'string',
      description: 'The answer. Brief: one or two short paragraphs of plain text.',
    },
    flow_prompts: {
      type: 'array',
      items: { type: 'string' },
      description: `Exactly ${FLOW_PROMPT_COUNT} short prompts the user might send next.`,
    },
  },
  required: ['response', 'flow_prompts'],
  additionalProperties: false,
} as const

export function responseFormatFor(mode: StructuredMode): Record<string, unknown> | undefined {
  switch (mode) {
    case 'json_schema':
      return {
        type: 'json_schema',
        json_schema: { name: 'chat_reply', strict: true, schema: REPLY_SCHEMA },
      }
    case 'json_object':
      return { type: 'json_object' }
    case 'none':
      return undefined
  }
}

/** Serialize a reply the way the model is asked to produce it, for replaying history. */
export function serializeReply(reply: Pick<StructuredReply, 'response' | 'flowPrompts'>): string {
  return JSON.stringify({ response: reply.response, flow_prompts: reply.flowPrompts })
}

/**
 * Parse model output into a reply. Tolerates code fences and prose around the
 * JSON; anything unparseable is shown as-is rather than dropped.
 */
export function parseReply(raw: string): StructuredReply {
  const text = raw.trim()
  for (const candidate of jsonCandidates(text)) {
    const reply = coerce(candidate)
    if (reply) return reply
  }
  return { response: text, flowPrompts: [], wellFormed: false }
}

function* jsonCandidates(text: string): Generator<unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const sources = [text, fenced?.[1]]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) sources.push(text.slice(start, end + 1))

  for (const source of sources) {
    if (!source) continue
    try {
      yield JSON.parse(source)
    } catch {
      // try the next candidate
    }
  }
}

function coerce(value: unknown): StructuredReply | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  if (typeof obj.response !== 'string') return null

  const rawPrompts = obj.flow_prompts ?? obj.flowPrompts
  const prompts = Array.isArray(rawPrompts)
    ? rawPrompts.filter((p): p is string => typeof p === 'string').map((p) => p.trim())
    : []

  return {
    response: obj.response.trim(),
    flowPrompts: [...new Set(prompts.filter(Boolean))].slice(0, FLOW_PROMPT_COUNT),
    wellFormed: true,
  }
}
