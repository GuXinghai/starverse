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

function coerceMessageRecord(raw: any): PersistedMessage | null {
  const id = String(raw?.id ?? '').trim()
  const convoId = String(raw?.convoId ?? '').trim()
  const role = String(raw?.role ?? '').trim()
  const seq = typeof raw?.seq === 'number' ? raw.seq : NaN
  const createdAt = typeof raw?.createdAt === 'number' ? raw.createdAt : 0
  const body = typeof raw?.body === 'string' ? raw.body : String(raw?.body ?? '')
  const meta = raw?.meta ?? null

  if (!id || !convoId || !Number.isFinite(seq)) return null
  return { id, convoId, role, seq, createdAt, body, meta } satisfies PersistedMessage
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
  if (!Array.isArray(rows)) return []

  return rows
    .map(coerceMessageRecord)
    .filter((m): m is PersistedMessage => !!m)
    .sort((a, b) => a.seq - b.seq)
}

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
  const msg = coerceMessageRecord(raw)
  if (!msg) throw new Error('DB did not return a valid message record')
  return msg
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

export async function setMessageStatus(input: Readonly<{ messageId: string; status: 'streaming' | 'final' | 'error' }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')

  const status = input.status
  if (status !== 'streaming' && status !== 'final' && status !== 'error') throw new Error('Invalid status')

  if (import.meta.env?.DEV) {
    console.log('[messageClient] setMessageStatus: calling DB', { messageId: messageId.slice(0, 8), status })
  }
  const result = await bridge.invoke('message.setStatus', { messageId, status })
  const success = !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
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
  // 透传完整 DB 统计
  if (result && typeof result === 'object' && 'ok' in result) {
    const r = result as any
    return {
      ok: !!r.ok,
      received: r.received ?? 0,
      inserted: r.inserted ?? 0,
      skipped: r.skipped ?? 0,
      ignored: r.ignored ?? 0,
      sumDeltaLenInserted: r.sumDeltaLenInserted ?? 0,
    }
  }
  return { ok: true, received: details.length, inserted: 0, skipped: 0, ignored: 0, sumDeltaLenInserted: 0 }
}

export async function finalizeReasoningDetails(input: Readonly<{ messageId: string }>): Promise<boolean> {
  const bridge = requireDbBridge()
  const messageId = String(input.messageId ?? '').trim()
  if (!messageId) throw new Error('Missing messageId')
  const result = await bridge.invoke('message.finalizeReasoningDetails', { messageId })
  return !!(result && typeof result === 'object' && 'ok' in result ? (result as any).ok : true)
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
