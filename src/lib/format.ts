import type { ModelInfo } from './openrouter'
import type { StructuredMode } from './structured'

export function formatPrice(model: Pick<ModelInfo, 'promptPrice' | 'completionPrice'>): string {
  const { promptPrice: input, completionPrice: output } = model
  if (input === null || output === null) return 'price varies'
  if (input === 0 && output === 0) return 'free'
  return `$${usd(input)} in · $${usd(output)} out /M`
}

export function formatContext(tokens: number | null): string {
  if (tokens === null) return ''
  if (tokens >= 1_000_000) return `${trim(tokens / 1_000_000)}M ctx`
  return `${Math.round(tokens / 1000)}K ctx`
}

export const STRUCTURED_LABELS: Record<StructuredMode, { short: string; title: string }> = {
  json_schema: { short: 'schema', title: 'Replies are held to the JSON schema by the provider.' },
  json_object: { short: 'json', title: 'Provider guarantees JSON, but not the exact shape.' },
  none: { short: 'prompt-only', title: 'Format is requested by prompt only; replies may come back unstructured.' },
}

function usd(perMillion: number): string {
  return perMillion >= 10 ? perMillion.toFixed(0) : trim(perMillion, perMillion < 0.1 ? 3 : 2)
}

function trim(n: number, digits = 1): string {
  return n.toFixed(digits).replace(/\.?0+$/, '')
}
