import { toRaw } from 'vue'
import type { SearchHit, SearchQueryParams } from './searchTypes'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

export async function runSearchQuery(params: SearchQueryParams): Promise<SearchHit[]> {
  const bridge = requireDbBridge()
  const result = await bridge.invoke('search.query', sanitizeForIpc(params))
  if (!Array.isArray(result)) return []

  return result
    .map((raw: any) => {
      const entityType = String(raw?.entityType ?? '').trim()
      const entityId = String(raw?.entityId ?? '').trim()
      if (!entityType || !entityId) return null
      const projectId = raw?.projectId != null ? String(raw.projectId ?? '').trim() : null
      const convoId = raw?.convoId != null ? String(raw.convoId ?? '').trim() : null
      const createdAtSec = typeof raw?.createdAtSec === 'number' ? raw.createdAtSec : 0
      const snippet = typeof raw?.snippet === 'string' ? raw.snippet : ''
      const score = typeof raw?.score === 'number' ? raw.score : 0
      return {
        entityType: entityType as SearchHit['entityType'],
        entityId,
        projectId: projectId && projectId.length > 0 ? projectId : null,
        convoId: convoId && convoId.length > 0 ? convoId : null,
        createdAtSec,
        snippet,
        score,
      } satisfies SearchHit
    })
    .filter((x): x is SearchHit => !!x)
}

export async function rebuildSearchIndex(): Promise<boolean> {
  const bridge = requireDbBridge()
  const result = await bridge.invoke('search.rebuildIndex', undefined)
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

function sanitizeForIpc<T>(input: T): T {
  return deepToRaw(input) as T
}

function deepToRaw(input: unknown): unknown {
  if (input === null || input === undefined || typeof input !== 'object') return input
  const raw = toRaw(input as any)
  if (Array.isArray(raw)) return raw.map((item) => deepToRaw(item))
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    out[key] = deepToRaw((raw as Record<string, unknown>)[key])
  }
  return out
}
