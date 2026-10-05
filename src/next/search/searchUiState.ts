import type { SearchHit, SearchScope } from './searchTypes'

export const DEFAULT_SEARCH_SCOPE: SearchScope = Object.freeze({
  projectName: true,
  convoName: true,
  userMessages: true,
  assistantMessages: true,
})

const SCOPE_KEYS = ['projectName', 'convoName', 'userMessages', 'assistantMessages'] as const

export function hasSearchScope(scope: SearchScope): boolean {
  return SCOPE_KEYS.some((key) => scope[key])
}

/** Decodes a persisted default scope; anything malformed or empty falls back to the built-in default. */
export function decodeSearchScopeDefault(raw: unknown): SearchScope {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SEARCH_SCOPE }
  const value = raw as Record<string, unknown>
  if (Object.keys(value).length !== SCOPE_KEYS.length || SCOPE_KEYS.some((key) => typeof value[key] !== 'boolean')) {
    return { ...DEFAULT_SEARCH_SCOPE }
  }
  const scope = Object.fromEntries(SCOPE_KEYS.map((key) => [key, value[key] as boolean])) as SearchScope
  return hasSearchScope(scope) ? scope : { ...DEFAULT_SEARCH_SCOPE }
}

/** Cyclic step over `count` items: 1/n + previous -> n/n, n/n + next -> 1/n. Returns a zero-based index. */
export function cycleMatchIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0
  return (((index + delta) % count) + count) % count
}

export function matchNavLabel(index: number, count: number): string {
  return `${index + 1}/${count}`
}

/** Entity ids whose own name/title matched, taken only from project and convo hits (never message hits). */
export function collectNameMatchIds(hits: readonly SearchHit[]): Readonly<{ projectIds: string[]; convoIds: string[] }> {
  return {
    projectIds: hits.filter((hit) => hit.entityType === 'project').map((hit) => hit.entityId),
    convoIds: hits.filter((hit) => hit.entityType === 'convo').map((hit) => hit.entityId),
  }
}
