import type { StructuredMode } from './structured'

const API_BASE = 'https://openrouter.ai/api/v1'

export interface ModelInfo {
  id: string
  name: string
  contextLength: number | null
  /** USD per million tokens. */
  promptPrice: number | null
  completionPrice: number | null
  structured: StructuredMode
}

export interface KeyInfo {
  label: string | null
  usage: number | null
  limit: number | null
  limitRemaining: number | null
}

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ApiMessage[]
  max_tokens?: number
  response_format?: Record<string, unknown>
  provider?: { require_parameters: boolean }
}

export class OpenRouterError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'OpenRouterError'
    this.status = status
  }
}

/** Public catalog; no key required. */
export async function fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  const body = await request('/models', { signal })
  return parseModels(body)
}

export async function fetchKeyInfo(apiKey: string, signal?: AbortSignal): Promise<KeyInfo> {
  const body = await request('/key', { signal, headers: authHeaders(apiKey) })
  const data = asRecord(asRecord(body)?.data) ?? {}
  return {
    label: typeof data.label === 'string' ? data.label : null,
    usage: toNumber(data.usage),
    limit: toNumber(data.limit),
    limitRemaining: toNumber(data.limit_remaining),
  }
}

/** Returns the assistant message text of the first choice. */
export async function createChatCompletion(
  apiKey: string,
  payload: ChatRequest,
  signal?: AbortSignal,
): Promise<string> {
  const body = await request('/chat/completions', {
    method: 'POST',
    signal,
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const root = asRecord(body)
  const inlineError = asRecord(root?.error)
  if (inlineError) throw new OpenRouterError(String(inlineError.message ?? 'Request failed'), 502)

  const choice = asRecord(Array.isArray(root?.choices) ? root.choices[0] : undefined)
  const content = messageText(asRecord(choice?.message)?.content)
  if (!content) {
    throw new OpenRouterError(
      choice?.finish_reason === 'length'
        ? 'The model used up its output budget before replying (likely on reasoning). Try again or pick another model.'
        : 'The model returned an empty reply.',
      502,
    )
  }
  return content
}

/** Tolerant catalog parser: malformed rows are dropped, not fatal. */
export function parseModels(body: unknown): ModelInfo[] {
  const rows = asRecord(body)?.data
  if (!Array.isArray(rows)) return []

  const models: ModelInfo[] = []
  for (const row of rows) {
    const r = asRecord(row)
    if (!r || typeof r.id !== 'string' || !r.id) continue

    const outputs = asRecord(r.architecture)?.output_modalities
    if (Array.isArray(outputs) && !outputs.includes('text')) continue

    const params = Array.isArray(r.supported_parameters) ? r.supported_parameters : []
    const pricing = asRecord(r.pricing)
    models.push({
      id: r.id,
      name: typeof r.name === 'string' && r.name ? r.name : r.id,
      contextLength: toNumber(r.context_length),
      promptPrice: perMillion(pricing?.prompt),
      completionPrice: perMillion(pricing?.completion),
      structured: params.includes('structured_outputs')
        ? 'json_schema'
        : params.includes('response_format')
          ? 'json_object'
          : 'none',
    })
  }
  return models
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(API_BASE + path, init)
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = asRecord(asRecord(body)?.error)?.message
    throw new OpenRouterError(
      typeof message === 'string' && message ? message : `${res.status} ${res.statusText}`.trim(),
      res.status,
    )
  }
  return body
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    // Optional attribution headers, see https://openrouter.ai/docs/api-reference/overview
    'HTTP-Referer': globalThis.location?.origin ?? '',
    'X-Title': 'openchat',
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => asRecord(part)?.text)
      .filter((t): t is string => typeof t === 'string')
      .join('')
  }
  return ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function perMillion(value: unknown): number | null {
  const n = toNumber(value)
  return n === null || n < 0 ? null : n * 1_000_000
}
