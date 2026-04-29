import {
  decodeDerivativeJobListResponse,
  decodeDerivativeJobResponse,
  decodeNullableDerivativeJobResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

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

export async function createDerivativeJob(params: Record<string, unknown>) {
  return decodeDerivativeJobResponse(await requireDbBridge().invoke('derivativeJob.create', params))
}

export async function getDerivativeJobById(jobId: string) {
  return decodeNullableDerivativeJobResponse(await requireDbBridge().invoke('derivativeJob.getById', { id: jobId }))
}

export async function listDerivativeJobsByAssetId(assetId: string) {
  return decodeDerivativeJobListResponse(await requireDbBridge().invoke('derivativeJob.listByAssetId', { assetId }))
}

export async function runDerivativeJob(params: Record<string, unknown>) {
  return await requireDbBridge().invoke('derivativeJob.run', params)
}

export async function retryDerivativeJob(params: Record<string, unknown>) {
  return await requireDbBridge().invoke('derivativeJob.retry', params)
}

export async function cancelDerivativeJob(jobId: string, reason?: string | null) {
  return decodeDerivativeJobResponse(await requireDbBridge().invoke('derivativeJob.cancel', { jobId, ...(reason !== undefined ? { reason } : {}) }))
}

export async function capturePdfAnnotationDerivatives(params: Readonly<{ messageId: string; assetIds: string[]; generator?: string }>) {
  return await requireDbBridge().invoke('derivativeJob.capturePdfAnnotations', params)
}
