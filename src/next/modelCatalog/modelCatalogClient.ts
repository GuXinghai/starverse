import type { ModelCatalogItem } from './modelCatalogTypes'
import { CatalogQueryService, type CatalogQueryCursor, type CatalogQueryResult } from './catalogQueryService'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function safeJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x)).filter((x) => x.length > 0)
  } catch {
    return []
  }
}

export async function listModelCatalog(routerSource: string = 'openrouter'): Promise<ModelCatalogItem[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  const rows = await bridge.invoke('modelCatalog.list', { routerSource })
  if (!Array.isArray(rows)) return []

  return rows
    .map((r: any) => {
      const modelId = String(r.modelId ?? '').trim()
      const name = String(r.name ?? '').trim()
      const vendor = String(r.vendor ?? '').trim()
      const lastSeenSnapshotId = String(r.lastSeenSnapshotId ?? '').trim()
      const isHidden = r.isHidden === 1
      const supportedParameters = safeJsonArray(r.supportedParametersJson)

      const item: ModelCatalogItem = {
        modelId,
        name,
        vendor,
        status: isHidden ? 'hidden' : 'visible',
        supportedParameters,
        lastSeenSnapshotId,
      }
      return item
    })
    .filter((x) => x.modelId.length > 0 && x.name.length > 0 && x.vendor.length > 0)
}

export type ScopedCurrentModelCatalogListResult = Readonly<{
  items: ModelCatalogItem[]
  status?: CatalogQueryResult['status']
  notice?: string | null
  catalogRevision?: string | null
  modelCount?: number
  lastSyncAtMs?: number
}>

function mapScopedQueryItemToCatalogItem(item: CatalogQueryResult['items'][number], catalogRevision: string | null): ModelCatalogItem {
  const modelId = String(item.modelId ?? '').trim()
  const name = String(item.displayName ?? '').trim()
  const vendor = String(item.vendor ?? item.providerKey ?? '').trim()
  const isHidden = String(item.visibility ?? item.status ?? '').trim().toLowerCase() === 'hidden'
  return {
    modelId,
    name,
    vendor,
    status: isHidden ? 'hidden' : 'visible',
    supportedParameters: Array.isArray(item.supportedParameters) ? [...item.supportedParameters] : [],
    lastSeenSnapshotId: catalogRevision ?? '',
  }
}

export async function listScopedCurrentModelCatalog(
  sourceProviderKey: string = 'openrouter',
): Promise<ScopedCurrentModelCatalogListResult> {
  const items: ModelCatalogItem[] = []
  let cursor: CatalogQueryCursor | null = null
  let status: CatalogQueryResult['status'] | undefined
  let notice: string | null | undefined
  let catalogRevision: string | null = null
  let modelCount: number | undefined
  let lastSyncAtMs: number | undefined

  for (let page = 0; page < 50; page += 1) {
    const result = await CatalogQueryService.query({
      sourceProviderKey,
      sort: { by: 'name', order: 'asc' },
      page: { limit: 100, cursor },
    })
    status = result.status
    notice = result.notice ?? null
    catalogRevision = result.catalogRevision ?? catalogRevision
    modelCount = result.modelCount ?? modelCount
    lastSyncAtMs = result.lastSyncAtMs ?? lastSyncAtMs

    for (const item of result.items) {
      const mapped = mapScopedQueryItemToCatalogItem(item, catalogRevision)
      if (mapped.modelId.length > 0 && mapped.name.length > 0 && mapped.vendor.length > 0) {
        items.push(mapped)
      }
    }

    if (!result.nextCursor) break
    cursor = result.nextCursor
  }

  return {
    items,
    status,
    notice,
    catalogRevision,
    ...(modelCount !== undefined ? { modelCount } : {}),
    ...(lastSyncAtMs !== undefined ? { lastSyncAtMs } : {}),
  }
}

