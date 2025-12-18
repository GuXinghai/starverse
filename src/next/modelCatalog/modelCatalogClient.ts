import type { ModelCatalogItem } from './modelCatalogTypes'

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

