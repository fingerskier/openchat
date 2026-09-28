import { useSyncExternalStore } from 'react'

// Hash routing: two pages don't need a router library, and hashes work on any static host.

export type Route = 'chat' | 'settings'

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return hash.startsWith('#/settings') ? 'settings' : 'chat'
}
