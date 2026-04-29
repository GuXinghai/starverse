import {
  decodeFileAssetListResponse,
  type DecodedFileAsset,
} from '@/next/ipc/contracts/dbBridgeContracts'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<unknown>
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

function normalizeAssetRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).assets)) return (raw as any).assets
  return []
}

export async function listFileAssetsByIds(assetIds: ReadonlyArray<string>): Promise<DecodedFileAsset[]> {
  const ids = Array.from(new Set(assetIds.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0)))
  if (ids.length === 0) return []

  const raw = await requireDbBridge().invoke('fileAsset.listByIds', { ids })
  return decodeFileAssetListResponse(normalizeAssetRows(raw))
}
