import { decodePreviewPayloadResponse, type DecodedPreviewPayload } from '@/next/ipc/contracts/dbBridgeContracts'

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

export async function getLatestReadyPreview(assetId: string): Promise<DecodedPreviewPayload> {
  const raw = await requireDbBridge().invoke('preview.getLatestReady', { assetId })
  return decodePreviewPayloadResponse('preview.getLatestReady', raw)
}

export async function ensurePreview(input: Readonly<{
  assetId: string
  generator?: string
  maxEdge?: number
}>): Promise<DecodedPreviewPayload> {
  const raw = await requireDbBridge().invoke('preview.ensure', input)
  return decodePreviewPayloadResponse('preview.ensure', raw)
}
