import type { ReasoningModelIndexItem } from './reasoningModelIndexTypes'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export async function listReasoningModelIndex(): Promise<ReasoningModelIndexItem[]> {
  const bridge = getDbBridge()
  if (!bridge) return []
  const rows = await bridge.invoke('reasoningIndex.list')
  if (!Array.isArray(rows)) return []
  return rows
    .map((r: any) => ({
      modelId: String(r.modelId ?? ''),
      name: String(r.name ?? ''),
      status: r.status === 'visible' ? 'visible' : 'hidden',
      lastSyncedSnapshot: String(r.lastSyncedSnapshot ?? ''),
    }))
    .filter((x) => x.modelId.length > 0 && x.name.length > 0 && x.lastSyncedSnapshot.length > 0)
}

