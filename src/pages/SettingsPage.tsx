import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { STRUCTURED_LABELS, formatContext, formatPrice } from '../lib/format'
import { fetchKeyInfo, fetchModels, type KeyInfo, type ModelInfo } from '../lib/openrouter'
import { clearStored, useApiKey, useSelectedModels } from '../lib/storage'

export default function SettingsPage() {
  return (
    <main className="page settings">
      <ApiKeySection />
      <ModelsSection />
      <DataSection />
    </main>
  )
}

type KeyStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; text: string }
  | { kind: 'error'; text: string }

function ApiKeySection() {
  const [apiKey, setApiKey] = useApiKey()
  const [draft, setDraft] = useState(apiKey)
  const [reveal, setReveal] = useState(false)
  const [status, setStatus] = useState<KeyStatus>({ kind: 'idle' })

  // Follow external changes (another tab, "Forget everything").
  useEffect(() => setDraft(apiKey), [apiKey])

  async function save(event: FormEvent) {
    event.preventDefault()
    const key = draft.trim()
    setApiKey(key)
    if (!key) return setStatus({ kind: 'idle' })

    setStatus({ kind: 'checking' })
    try {
      setStatus({ kind: 'ok', text: describeKey(await fetchKeyInfo(key)) })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', text: `Saved, but OpenRouter rejected it: ${reason}` })
    }
  }

  function remove() {
    setApiKey('')
    setStatus({ kind: 'idle' })
  }

  return (
    <section className="card">
      <h2>OpenRouter API key</h2>
      <p className="hint">
        Stored only in this browser's local storage and sent only to openrouter.ai.{' '}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
          Get a key
        </a>
      </p>
      <form className="row" onSubmit={save}>
        <input
          type={reveal ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-or-v1-…"
          autoComplete="off"
          spellCheck={false}
          aria-label="API key"
        />
        <button type="button" className="ghost" onClick={() => setReveal((r) => !r)}>
          {reveal ? 'Hide' : 'Show'}
        </button>
        <button type="submit" className="primary" disabled={status.kind === 'checking'}>
          Save
        </button>
        {apiKey && (
          <button type="button" className="ghost danger" onClick={remove}>
            Remove
          </button>
        )}
      </form>
      {status.kind === 'checking' && <p className="status">Checking key…</p>}
      {status.kind === 'ok' && <p className="status ok">{status.text}</p>}
      {status.kind === 'error' && <p className="status error">{status.text}</p>}
    </section>
  )
}

function describeKey(info: KeyInfo): string {
  const parts = ['Key works']
  if (info.label) parts.push(info.label)
  if (info.usage !== null) parts.push(`$${info.usage.toFixed(2)} used`)
  parts.push(info.limitRemaining !== null ? `$${info.limitRemaining.toFixed(2)} remaining` : 'no spend limit')
  return parts.join(' · ')
}

// One catalog fetch per page load, shared across visits to Settings; cleared on failure so Retry refetches.
let catalogRequest: Promise<ModelInfo[]> | null = null
function loadCatalog(): Promise<ModelInfo[]> {
  catalogRequest ??= fetchModels().catch((err: unknown) => {
    catalogRequest = null
    throw err
  })
  return catalogRequest
}

function ModelsSection() {
  const [selected, setSelected] = useSelectedModels()
  const [catalog, setCatalog] = useState<ModelInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [structuredOnly, setStructuredOnly] = useState(true)
  const [customId, setCustomId] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadCatalog().then(
      (models) => {
        if (cancelled) return
        setCatalog(models)
        // Refresh stored capabilities and pricing for models already chosen.
        const byId = new Map(models.map((m) => [m.id, m]))
        setSelected((prev) => {
          const next = prev.map((m) => byId.get(m.id) ?? m)
          return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
        })
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt, setSelected])

  const selectedIds = useMemo(() => new Set(selected.map((m) => m.id)), [selected])

  const visible = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (m) =>
        (!structuredOnly || m.structured === 'json_schema') &&
        (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
    )
  }, [catalog, query, structuredOnly])

  function toggle(model: ModelInfo) {
    setSelected((prev) =>
      prev.some((m) => m.id === model.id) ? prev.filter((m) => m.id !== model.id) : [...prev, model],
    )
  }

  function addCustom(event: FormEvent) {
    event.preventDefault()
    const id = customId.trim()
    if (!id || selectedIds.has(id)) return
    const known = catalog?.find((m) => m.id === id)
    toggle(
      known ?? { id, name: id, contextLength: null, maxCompletionTokens: null, promptPrice: null, completionPrice: null, structured: 'none' },
    )
    setCustomId('')
  }

  return (
    <section className="card">
      <h2>Models</h2>
      <p className="hint">Pick the set you want to switch between in chat. The first one is the default.</p>

      {selected.length === 0 ? (
        <p className="status">No models chosen yet.</p>
      ) : (
        <ul className="selected-models">
          {selected.map((m) => (
            <li key={m.id} className="chip static">
              <span title={m.id}>{m.name}</span>
              <button type="button" className="remove" onClick={() => toggle(m)} aria-label={`Remove ${m.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row catalog-controls">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          aria-label="Search models"
        />
        <label className="check" title={STRUCTURED_LABELS.json_schema.title}>
          <input type="checkbox" checked={structuredOnly} onChange={(e) => setStructuredOnly(e.target.checked)} />
          Structured output only
        </label>
      </div>

      {loadError ? (
        <p className="status error">
          Couldn't load the model catalog: {loadError}{' '}
          <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : !catalog ? (
        <p className="status">Loading models…</p>
      ) : (
        <>
          <p className="status">
            {visible.length} of {catalog.length} models
          </p>
          <ul className="model-list">
            {visible.map((m) => (
              <li key={m.id}>
                <label>
                  <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggle(m)} />
                  <span className="model-main">
                    <span className="model-name">{m.name}</span>
                    <code>{m.id}</code>
                  </span>
                  <span className="model-meta">
                    <span className={`badge ${m.structured}`} title={STRUCTURED_LABELS[m.structured].title}>
                      {STRUCTURED_LABELS[m.structured].short}
                    </span>
                    <span>{formatContext(m.contextLength)}</span>
                    <span>{formatPrice(m)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <form className="row" onSubmit={addCustom}>
        <input
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          placeholder="Not listed? Add a model id, e.g. vendor/model-name"
          spellCheck={false}
          aria-label="Custom model id"
        />
        <button type="submit" disabled={!customId.trim()}>
          Add
        </button>
      </form>
    </section>
  )
}

function DataSection() {
  function forget() {
    if (window.confirm('Delete your API key, model choices and chat history from this browser?')) clearStored()
  }

  return (
    <section className="card">
      <h2>Local data</h2>
      <p className="hint">Your key, model set and current chat live only in this browser.</p>
      <button type="button" className="danger" onClick={forget}>
        Forget everything
      </button>
    </section>
  )
}
