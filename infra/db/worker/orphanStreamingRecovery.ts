import type BetterSqlite3 from 'better-sqlite3'

const INTERRUPTED_ERROR_CODE = 'stream_interrupted'
const INTERRUPTED_ERROR_MESSAGE = 'Assistant generation was interrupted before completion.'

type RecoverableOperationRow = Readonly<{
  operationId: string
  answerRootId: string
  state: 'committed' | 'streaming'
  updatedAtMs: number
  messageStatus: 'streaming' | 'final' | 'error' | 'cancelled'
  messageMeta: string | null
}>

type RecoverableOperationlessRow = Readonly<{
  answerRootId: string
  state: 'streaming'
  updatedAtMs: number
}>

export type OrphanStreamingRecoveryResult = Readonly<{
  recovered: number
  interrupted: number
  operationless: number
  reconciledCompleted: number
  reconciledFailed: number
  reconciledCancelled: number
}>

function buildInterruptedErrorEnvelope(state: RecoverableOperationRow['state']) {
  const phase = state === 'committed' ? 'pre_stream' : 'mid_stream'
  const envelope = {
    phase,
    completionClass: 'error',
    openrouter: {
      code: INTERRUPTED_ERROR_CODE,
      message: INTERRUPTED_ERROR_MESSAGE,
    },
    truncated: false,
    kind: 'transport_error',
  }
  const summary = {
    completionClass: 'error',
    phase,
    code: INTERRUPTED_ERROR_CODE,
    message: INTERRUPTED_ERROR_MESSAGE,
  }
  return { envelopeJson: JSON.stringify(envelope), summary }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function parseMessageMeta(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    return asRecord(JSON.parse(value)) ?? {}
  } catch {
    return {}
  }
}

function terminalStateForMessage(row: RecoverableOperationRow): Readonly<{
  state: 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}> | null {
  if (row.messageStatus === 'streaming') return null
  const meta = parseMessageMeta(row.messageMeta)
  const declaredState = String(meta.answerGenerationState ?? '')
  const summary = asRecord(meta.error_summary)
  const errorCode = String(meta.answerGenerationErrorCode ?? summary?.code ?? '').trim() || null
  const errorMessage = String(meta.answerGenerationErrorMessage ?? summary?.message ?? '').trim() || null

  if (row.messageStatus === 'error' || declaredState === 'failed') {
    return { state: 'failed', errorCode, errorMessage }
  }
  if (row.messageStatus === 'cancelled' || declaredState === 'cancelled') {
    return { state: 'cancelled', errorCode: null, errorMessage: null }
  }
  return { state: 'completed', errorCode: null, errorMessage: null }
}

export function recoverOrphanAssistantStreaming(
  db: BetterSqlite3.Database,
  requestedAtMs: number,
): OrphanStreamingRecoveryResult {
  if (!Number.isFinite(requestedAtMs) || requestedAtMs < 0) {
    throw new Error('Invalid orphan streaming recovery timestamp.')
  }

  const recover = db.transaction(() => {
    const rows = db.prepare(`
      SELECT operation_id AS operationId,
             result_answer_root_id AS answerRootId,
             operation.state AS state,
             operation.updated_at_ms AS updatedAtMs,
             message.status AS messageStatus,
             message.meta AS messageMeta
      FROM assistant_answer_generation_operations operation
      JOIN message ON message.id=operation.result_answer_root_id
      WHERE operation.state IN ('committed', 'streaming')
      ORDER BY operation.created_at_ms ASC, operation.operation_id ASC
    `).all() as RecoverableOperationRow[]

    const operationlessRows = db.prepare(`
      SELECT message.id AS answerRootId,
             'streaming' AS state,
             message.created_at AS updatedAtMs
      FROM message
      WHERE message.role='assistant'
        AND message.answer_root_id=message.id
        AND message.status='streaming'
        AND NOT EXISTS (
          SELECT 1 FROM assistant_answer_generation_operations operation
          WHERE operation.result_answer_root_id=message.id
        )
      ORDER BY message.created_at ASC, message.id ASC
    `).all() as RecoverableOperationlessRow[]

    if (rows.length === 0 && operationlessRows.length === 0) {
      return {
        recovered: 0,
        interrupted: 0,
        operationless: 0,
        reconciledCompleted: 0,
        reconciledFailed: 0,
        reconciledCancelled: 0,
      }
    }

    const updateOperation = db.prepare(`
      UPDATE assistant_answer_generation_operations
      SET state=@state,
          error_code=@errorCode,
          error_message=@errorMessage,
          updated_at_ms=@terminalAtMs,
          terminal_at_ms=@terminalAtMs
      WHERE operation_id=@operationId AND state=@previousState
    `)
    const updateMessage = db.prepare(`
      UPDATE message
      SET meta=json_patch(COALESCE(meta, '{}'), @metaPatchJson), status='error'
      WHERE id=@answerRootId
    `)
    const upsertMessageError = db.prepare(`
      INSERT INTO message_error(
        message_id, envelope_json, envelope_bytes, is_truncated, created_at, updated_at
      ) VALUES (
        @answerRootId, @envelopeJson, @envelopeBytes, 0, @terminalAtMs, @terminalAtMs
      )
      ON CONFLICT(message_id) DO UPDATE SET
        envelope_json=excluded.envelope_json,
        envelope_bytes=excluded.envelope_bytes,
        is_truncated=excluded.is_truncated,
        updated_at=excluded.updated_at
    `)

    let interrupted = 0
    let reconciledCompleted = 0
    let reconciledFailed = 0
    let reconciledCancelled = 0
    for (const row of rows) {
      const terminalAtMs = Math.max(requestedAtMs, Number(row.updatedAtMs))
      const reconciled = terminalStateForMessage(row)
      if (reconciled) {
        const changed = updateOperation.run({
          operationId: row.operationId,
          previousState: row.state,
          state: reconciled.state,
          errorCode: reconciled.errorCode,
          errorMessage: reconciled.errorMessage,
          terminalAtMs,
        }).changes
        if (changed !== 1) throw new Error('Answer generation operation changed during terminal reconciliation.')
        if (reconciled.state === 'completed') reconciledCompleted += 1
        else if (reconciled.state === 'failed') reconciledFailed += 1
        else reconciledCancelled += 1
        continue
      }

      const { envelopeJson, summary } = buildInterruptedErrorEnvelope(row.state)
      const changed = updateOperation.run({
        operationId: row.operationId,
        previousState: row.state,
        state: 'failed',
        errorCode: INTERRUPTED_ERROR_CODE,
        errorMessage: INTERRUPTED_ERROR_MESSAGE,
        terminalAtMs,
      }).changes
      if (changed !== 1) throw new Error('Orphan streaming operation changed during recovery.')

      upsertMessageError.run({
        answerRootId: row.answerRootId,
        envelopeJson,
        envelopeBytes: Buffer.byteLength(envelopeJson, 'utf8'),
        terminalAtMs,
      })
      const messageChanged = updateMessage.run({
        answerRootId: row.answerRootId,
        metaPatchJson: JSON.stringify({
          answerGenerationState: 'failed',
          answerGenerationErrorCode: INTERRUPTED_ERROR_CODE,
          answerGenerationErrorMessage: INTERRUPTED_ERROR_MESSAGE,
          error_ref: true,
          error_summary: summary,
        }),
      }).changes
      if (messageChanged !== 1) throw new Error('Orphan streaming answer message is unavailable.')

      interrupted += 1
    }

    for (const row of operationlessRows) {
      const terminalAtMs = Math.max(requestedAtMs, Number(row.updatedAtMs))
      const { envelopeJson, summary } = buildInterruptedErrorEnvelope(row.state)
      upsertMessageError.run({
        answerRootId: row.answerRootId,
        envelopeJson,
        envelopeBytes: Buffer.byteLength(envelopeJson, 'utf8'),
        terminalAtMs,
      })
      const messageChanged = updateMessage.run({
        answerRootId: row.answerRootId,
        metaPatchJson: JSON.stringify({
          answerGenerationState: 'failed',
          answerGenerationErrorCode: INTERRUPTED_ERROR_CODE,
          answerGenerationErrorMessage: INTERRUPTED_ERROR_MESSAGE,
          error_ref: true,
          error_summary: summary,
        }),
      }).changes
      if (messageChanged !== 1) throw new Error('Operationless orphan streaming answer is unavailable.')
      interrupted += 1
    }

    return {
      recovered: rows.length + operationlessRows.length,
      interrupted,
      operationless: operationlessRows.length,
      reconciledCompleted,
      reconciledFailed,
      reconciledCancelled,
    }
  })

  return Object.freeze(recover.immediate())
}
