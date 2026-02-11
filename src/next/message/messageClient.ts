import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { sanitizeErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import {
  decodeAppendReasoningDetailSegmentsResponse,
  decodeMessageAppendResponse,
  decodeMessageFinalizeReasoningDetailsResponse,
  decodeMessageListResponse,
  decodeMessageSetStatusResponse,
} from '@/next/ipc/contracts/dbBridgeContracts'

export type PersistedMessageRole = 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter' | string

export type PersistedMessage = Readonly<{
  id: string
  convoId: string
  role: PersistedMessageRole
  seq: number
  createdAt: number
  body: string
  meta: unknown
}>

export type PersistedMessageError = Readonly<{
  messageId: string
  envelopeJson: string
  envelopeBytes: number
  isTruncated: boolean
  createdAt: number
  updatedAt: number
}>

export type AppendableMessageRole = 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'

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

export async function listMessages(
  convoId: string,
  params?: Readonly<{ fromSeq?: number; limit?: number; direction?: 'asc' | 'desc' }>
): Promise<PersistedMessage[]> {
  const bridge = getDbBridge()
  if (!bridge) return []

  const cid = String(convoId ?? '').trim()
  if (!cid) return []

  const rows = await bridge.invoke('message.list', { convoId: cid, ...(params ?? {}) })
  const decoded = decodeMessageListResponse(rows)
  return decoded.sort((a, b) => a.seq - b.seq)
}

// eslint-disable-next-line complexity
export async function appendMessage(input: Readonly<{
  convoId: string
  role: AppendableMessageRole
  body: string
  meta?: unknown
  createdAt?: number
  seq?: number
  parentId?: string | null
  status?: 'streaming' | 'final' | 'error'
  answerRootId?: string | null
  questionId?: string | null
}>): Promise<PersistedMessage> {
  const bridge = requireDbBridge()

  const convoId = String(input.convoId ?? '').trim()
  if (!convoId) throw new Error('Missing convoId')

  const role = String(input.role ?? '').trim() as AppendableMessageRole
  if (role !== 'user' && role !== 'assistant' && role !== 'tool' && role !== 'notice' && role !== 'openrouter') {
    throw new Error(`Invalid role: ${role}`)
  }

  const body = typeof input.body === 'string' ? input.body : String(input.body ?? '')
  const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : undefined
  const seq = typeof input.seq === 'number' && Number.isFinite(input.seq) ? input.seq : undefined

  const params: any = { convoId, role, body }
  if (createdAt !== undefined) params.createdAt = createdAt
  if (seq !== undefined) params.seq = seq
  if (input.meta !== undefined) params.meta = input.meta
  if (input.parentId !== undefined) params.parentId = input.parentId
  if (input.status !== undefined) params.status = input.status
  if (input.answerRootId !== undefined) params.answerRootId = input.answerRootId
  if (input.questionId !== undefined) params.questionId = input.questionId

  const raw = await bridge.invoke('message.append', params)
  return decodeMessageAppendResponse(raw)
}

export async function appendMessageDelta(input: Readonly<{ convoId: string; seq: number; appendBody: string }>): Promise<boolean> {
  const bridge = requireDbBridge()

  const convoId = String(input.convoId ?? '').trim()
  if (!convoId) throw new Error('Missing convoId')

  const seq = Number(input.seq)
  if (!Number.isFinite(seq) || seq <= 0) throw new Error('Invalid seq')

  const appendBody = typeof input.appendBody === 'string' ? input.appendBody : String(input.appendBody ?? '')
  if (!appendBody) return true

  const result = await bridge.invoke('message.appendDelta', { convoId, seq, appendBody })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function setMessageStatus(input: Readonly<{
  messageId: string
  status: 'streaming' | 'final' | 'error'
  reasoningDurationMs?: number | null
  reasoningEndReason?: string | null
  reasoningDurationIsFallback?: boolean
  metaPatch?: Record<string, unknown> | null
}>): Promise<boolean> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')

  const status = input.status
  if (status !== 'streaming' && status !== 'final' && status !== 'error') throw new Error('Invalid status')

  if (import.meta.env?.DEV) {
    console.log('[messageClient] setMessageStatus: calling DB', { messageId: messageId.slice(0, 8), status })
  }
  const result = await bridge.invoke('message.setStatus', {
    messageId,
    status,
    reasoningDurationMs: input.reasoningDurationMs ?? null,
    reasoningEndReason: input.reasoningEndReason ?? null,
    reasoningDurationIsFallback: input.reasoningDurationIsFallback ?? false,
    ...(input.metaPatch && typeof input.metaPatch === 'object' ? { metaPatch: input.metaPatch } : {}),
  })
  const success = decodeMessageSetStatusResponse(result)
  if (import.meta.env?.DEV) {
    console.log('[messageClient] setMessageStatus: DB returned', { messageId: messageId.slice(0, 8), status, success, result })
  }
  return success
}

/** DB 写入统计 */
export interface AppendReasoningDetailSegmentsResult {
  ok: boolean
  received: number
  inserted: number
  skipped: number
  ignored: number
  sumDeltaLenInserted: number
}

export async function appendReasoningDetailSegments(input: Readonly<{ messageId: string; details: unknown[] }>): Promise<AppendReasoningDetailSegmentsResult> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')

  const details = Array.isArray(input.details) ? input.details : []
  if (details.length === 0) return { ok: true, received: 0, inserted: 0, skipped: 0, ignored: 0, sumDeltaLenInserted: 0 }

  const result = await bridge.invoke('message.appendReasoningDetailSegments', { messageId, details })
  return decodeAppendReasoningDetailSegmentsResponse(result)
}

export async function finalizeReasoningDetails(input: Readonly<{ messageId: string }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')
  const result = await bridge.invoke('message.finalizeReasoningDetails', { messageId })
  return decodeMessageFinalizeReasoningDetailsResponse(result)
}

export async function setMessageReasoningRequestConfig(input: Readonly<{ messageId: string; value: unknown }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')
  const result = await bridge.invoke('message.setReasoningRequestConfig', { messageId, value: input.value ?? null })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

/** 获取消息的推理段统计，用于诊断对照 */
export interface ReasoningSegmentsStats {
  cnt: number
  sumLen: number
}

export async function getReasoningSegmentsStats(messageId: string): Promise<ReasoningSegmentsStats | null> {
  const bridge = getDbBridge()
  if (!bridge) {
    console.warn('[messageClient] getReasoningSegmentsStats: dbBridge not available')
    return null
  }
  const id = String(messageId ?? '').trim()
  if (!id) {
    console.warn('[messageClient] getReasoningSegmentsStats: empty messageId')
    return null
  }
  try {
    const result = await bridge.invoke('message.getReasoningSegmentsStats', { messageId: id })
    if (result && typeof result === 'object' && 'cnt' in result) {
      return { cnt: Number(result.cnt) || 0, sumLen: Number(result.sumLen) || 0 }
    }
    console.warn('[messageClient] getReasoningSegmentsStats: unexpected result format', result)
    return null
  } catch (err) {
    console.warn('[messageClient] getReasoningSegmentsStats: invoke failed', err)
    return null
  }
}

const MAX_MESSAGE_ERROR_IDS = 200

function computeUtf8Bytes(text: string): number {
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length
  }
}

function getErrorProvider(envelope: ErrorEnvelope): string | undefined {
  const direct = envelope.openrouter?.provider
  if (typeof direct === 'string' && direct.trim().length > 0) return direct
  const meta = envelope.openrouter?.metadata as any
  const name = meta && typeof meta === 'object' ? meta.provider_name : undefined
  return typeof name === 'string' && name.trim().length > 0 ? name : undefined
}

function buildErrorSummary(envelope: ErrorEnvelope): Record<string, unknown> {
  return {
    completionClass: envelope.completionClass,
    phase: envelope.phase,
    code: envelope.openrouter?.code,
    message: envelope.openrouter?.message,
    provider: getErrorProvider(envelope),
  }
}

export async function upsertMessageErrorEnvelope(input: Readonly<{ messageId: string; envelope: ErrorEnvelope }>): Promise<boolean> {
  const bridge = getDbBridge()
  if (!bridge) return false

  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')

  const sanitized = sanitizeErrorEnvelope(input.envelope)
  const envelopeJson = JSON.stringify(sanitized)
  const envelopeBytes = computeUtf8Bytes(envelopeJson)
  const summary = buildErrorSummary(sanitized)

  const now = Date.now()
  const result = await bridge.invoke('messageError.upsert', {
    messageId,
    envelopeJson,
    envelopeBytes,
    isTruncated: sanitized.truncated === true,
    createdAt: now,
    updatedAt: now,
    metaPatch: {
      error_ref: true,
      error_summary: summary,
    },
  })

  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
}

export async function listMessageErrorEnvelopes(messageIds: ReadonlyArray<string>): Promise<Map<string, ErrorEnvelope>> {
  const bridge = getDbBridge()
  if (!bridge) return new Map()

  const unique = Array.from(new Set(messageIds.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0)))
  if (unique.length === 0) return new Map()

  const out = new Map<string, ErrorEnvelope>()
  for (let i = 0; i < unique.length; i += MAX_MESSAGE_ERROR_IDS) {
    const chunk = unique.slice(i, i + MAX_MESSAGE_ERROR_IDS)
    let rows: any[] | null = null
    try {
      const result = await bridge.invoke('messageError.listByMessageIds', { messageIds: chunk })
      rows = Array.isArray(result) ? result : null
    } catch {
      rows = null
    }
    if (!rows) continue

    for (const row of rows) {
      const messageId = String(row?.messageId ?? row?.message_id ?? '').trim()
      const envelopeJson = typeof row?.envelopeJson === 'string' ? row.envelopeJson : String(row?.envelope_json ?? '')
      if (!messageId || !envelopeJson) continue
      try {
        const parsed = JSON.parse(envelopeJson)
        if (!parsed || typeof parsed !== 'object') continue
        if (!('completionClass' in parsed) || !('phase' in parsed) || !('openrouter' in parsed)) continue
        const sanitized = sanitizeErrorEnvelope(parsed as ErrorEnvelope)
        out.set(messageId, sanitized)
      } catch {
        // ignore parse errors
      }
    }
  }

  return out
}
