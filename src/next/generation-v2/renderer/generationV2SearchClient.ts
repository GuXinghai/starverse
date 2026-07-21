import type { SearchHit, SearchQueryParams } from '@/next/search/searchTypes'

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string }>

function searchBridge() {
  const bridge = window.generationV2?.search
  if (!bridge) throw new Error('GENERATION_V2_SEARCH_BRIDGE_UNAVAILABLE')
  return bridge
}

function unwrap<T>(value: unknown): T {
  const result = value as Result<T>
  if (!result || result.ok !== true) throw new Error(result && 'code' in result ? result.code : 'GENERATION_V2_SEARCH_COMMAND_FAILED')
  return result.value
}

export async function runGenerationV2SearchQuery(params: SearchQueryParams): Promise<SearchHit[]> {
  return unwrap<readonly SearchHit[]>(await searchBridge().query(params)).slice()
}

export async function rebuildGenerationV2SearchIndex(): Promise<boolean> {
  return unwrap<boolean>(await searchBridge().rebuild())
}
