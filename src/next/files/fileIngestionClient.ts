import { decodeFileIngestionResultResponse, type DecodedFileIngestionResult } from '@/next/ipc/contracts/dbBridgeContracts'

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

export async function ingestLocalFile(input: Readonly<{
  filePath: string
  selectionGrantToken?: string
  mimeType?: string | null
  sourceKind?: 'local_upload' | 'generated'
}>): Promise<DecodedFileIngestionResult> {
  const raw = await requireDbBridge().invoke('fileIngestion.ingestLocalFile', input)
  return decodeFileIngestionResultResponse('fileIngestion.ingestLocalFile', raw)
}

export async function ingestUrl(input: Readonly<{
  url: string
  retentionMode: 'link_only' | 'link_and_file'
}>): Promise<DecodedFileIngestionResult> {
  const raw = await requireDbBridge().invoke('fileIngestion.ingestUrl', input)
  return decodeFileIngestionResultResponse('fileIngestion.ingestUrl', raw)
}
