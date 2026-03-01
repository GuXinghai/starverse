import {
  decodeConvoCreateResponse,
  decodeConvoDeleteManyResponse,
  decodeConvoListResponse,
  decodeConvoSetProjectManyResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'
import { sanitizeForIpc } from '@/next/ipc/sanitizeForIpc'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

export type ConvoSummary = Readonly<{
  id: string
  projectId?: string | null
  title: string
  createdAt: number
  updatedAt: number
  meta?: Record<string, unknown> | null
}>

export async function listConvos(params?: Readonly<{ projectId?: string | null; limit?: number; offset?: number; order?: 'updatedAt' | 'createdAt' }>): Promise<ConvoSummary[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  // 构造查询参数，DB 端会根据 projectId 进行筛选
  const queryParams: Record<string, unknown> = {}
  if (params) {
    if (params.projectId !== undefined) queryParams.projectId = params.projectId
    if (params.limit !== undefined) queryParams.limit = params.limit
    if (params.offset !== undefined) queryParams.offset = params.offset
    if (params.order !== undefined) queryParams.order = params.order
  }

  const rows = await bridge.invoke('convo.list', sanitizeForIpc(queryParams))
  return decodeConvoListResponse(rows)
}

export async function createConvo(input: Readonly<{ title: string; projectId?: string | null }>): Promise<ConvoSummary | null> {
  const bridge = getDbBridge()
  if (!bridge) return null

  const title = String(input.title ?? '').trim()
  if (title.length === 0) return null

  const raw = await bridge.invoke('convo.create', sanitizeForIpc({ title, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) }))
  return decodeConvoCreateResponse(raw)
}

function requireDbBridge(): DbBridge {
  const bridge = getDbBridge()
  if (!bridge) throw new Error('Missing dbBridge')
  return bridge
}

export async function saveConvo(input: Readonly<{ id: string; title: string; projectId?: string | null; meta?: unknown; createdAt?: number; updatedAt?: number }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(input.id ?? '').trim()
  if (!id) throw new Error('Missing convo id')

  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('Missing title')

  const payload: any = { id, title }
  if (input.projectId !== undefined) payload.projectId = input.projectId
  if (input.createdAt !== undefined) payload.createdAt = input.createdAt
  if (input.updatedAt !== undefined) payload.updatedAt = input.updatedAt
  if (input.meta !== undefined) payload.meta = input.meta

  const r = await bridge.invoke('convo.save', sanitizeForIpc(payload))
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

export async function renameConvo(convoId: string, newTitle: string): Promise<boolean> {
  const id = String(convoId ?? '').trim()
  const title = String(newTitle ?? '').trim()
  if (!id) throw new Error('Missing convo id')
  if (!title) throw new Error('Missing title')
  return saveConvo({ id, title })
}

export async function deleteConvo(convoId: string): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(convoId ?? '').trim()
  if (!id) throw new Error('Missing convo id')
  const r = await bridge.invoke('convo.delete', sanitizeForIpc({ id }))
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

export async function archiveConvo(convoId: string): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(convoId ?? '').trim()
  if (!id) throw new Error('Missing convo id')
  const r = await bridge.invoke('convo.archive', sanitizeForIpc({ id }))
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

export async function restoreConvo(convoId: string): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(convoId ?? '').trim()
  if (!id) throw new Error('Missing convo id')
  const r = await bridge.invoke('convo.restore', sanitizeForIpc({ id }))
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

export async function setConvoProject(convoId: string, projectId: string | null): Promise<boolean> {
  const bridge = requireDbBridge()
  const id = String(convoId ?? '').trim()
  if (!id) throw new Error('Missing convo id')
  const pid = projectId === null ? null : String(projectId ?? '').trim()
  const r = await bridge.invoke('convo.setProject', sanitizeForIpc({ id, projectId: pid && pid.length > 0 ? pid : null }))
  return !!(r && typeof r === 'object' && 'ok' in r ? (r as any).ok : true)
}

export async function setConvoProjectMany(convoIds: readonly string[], projectId: string | null): Promise<Readonly<{ moved: number; failed: string[] }>> {
  const bridge = requireDbBridge()
  const ids = (convoIds ?? []).map((v) => String(v ?? '').trim()).filter(Boolean)
  if (ids.length === 0) return { moved: 0, failed: [] }
  const pid = projectId === null ? null : String(projectId ?? '').trim()
  const result = await bridge.invoke('convo.setProjectMany', sanitizeForIpc({ ids, projectId: pid && pid.length > 0 ? pid : null }))
  return decodeConvoSetProjectManyResponse(result)
}

export async function deleteConvos(convoIds: readonly string[]): Promise<number> {
  const bridge = requireDbBridge()
  const ids = (convoIds ?? []).map((v) => String(v ?? '').trim()).filter(Boolean)
  if (ids.length === 0) return 0
  const result = await bridge.invoke('convo.deleteMany', sanitizeForIpc({ ids }))
  return decodeConvoDeleteManyResponse(result)
}
