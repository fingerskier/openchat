import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ChatMessage } from './chat'
import type { ModelInfo } from './openrouter'

// Everything lives in this browser's localStorage under one prefix. Values are
// JSON; hooks re-render on writes from this tab and from other tabs.

const PREFIX = 'openchat.'
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

window.addEventListener('storage', (event) => {
  if (event.key === null || event.key.startsWith(PREFIX)) notify()
})

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function readStored<T>(key: string, fallback: T): T {
  return parse(localStorage.getItem(PREFIX + key), fallback)
}

export function writeStored<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
  notify()
}

export function clearStored(): void {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .forEach((key) => localStorage.removeItem(key))
  notify()
}

type Setter<T> = (next: T | ((prev: T) => T)) => void

/** `fallback` must be referentially stable (a module constant). */
function useStored<T>(key: string, fallback: T): [T, Setter<T>] {
  // Snapshot the raw string: it is stable between writes, parsed objects are not.
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(PREFIX + key))
  const value = useMemo(() => parse(raw, fallback), [raw, fallback])
  const set = useCallback<Setter<T>>(
    // Resolve updaters against storage, not the render snapshot, so back-to-back
    // updates (e.g. from an async reply) compose.
    (next) => {
      const prev = readStored(key, fallback)
      const value = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next
      if (value !== prev) writeStored(key, value)
    },
    [key, fallback],
  )
  return [value, set]
}

const NO_MODELS: ModelInfo[] = []
const NO_MESSAGES: ChatMessage[] = []

export const useApiKey = () => useStored('apiKey', '')
export const useSelectedModels = () => useStored('models', NO_MODELS)
export const useActiveModelId = () => useStored('activeModel', '')
export const useMessages = () => useStored('messages', NO_MESSAGES)
