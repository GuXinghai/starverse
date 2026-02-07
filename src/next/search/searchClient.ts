import { toRaw } from 'vue'
import type { SearchHit, SearchQueryParams } from './searchTypes'
import { decodeBooleanAck, decodeSearchQueryResponse } from '@/next/ipc/contracts/dbBridgeContracts'

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
  return decodeSearchQueryResponse(result)
}

export async function rebuildSearchIndex(): Promise<boolean> {
  const bridge = requireDbBridge()
  const result = await bridge.invoke('search.rebuildIndex', undefined)
  return decodeBooleanAck('search.rebuildIndex', result)
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
