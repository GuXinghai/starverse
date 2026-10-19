import type BetterSqlite3 from 'better-sqlite3'

export type GenerationNativeCompletionReceiptKeyV2 = Readonly<{
  operationId: string
  requestSequence: number
  attempt: number
}>

export type GenerationNativeCompletionReceiptCursorV2 = Readonly<{
  receivedAtMs: number
  operationId: string
  requestSequence: number
  attempt: number
}>

export type GenerationNativeCompletionPendingSummaryV2 = GenerationNativeCompletionReceiptKeyV2 & Readonly<{
  contractId: string
  receivedAtMs: number
}>

export type GenerationNativeCompletionReceiptV2 = GenerationNativeCompletionReceiptKeyV2 & Readonly<{
  providerId: string
  contractId: string
  answerRootId: string
  nativeResultJson: string
  nativeResultSha256: string
  preparedRequestJson: string
  preparedRequestSha256: string
  receivedAtMs: number
  materializationState: 'pending' | 'materialized'
  materializationErrorCode: string | null
  materializationErrorMessage: string | null
  materializedAtMs: number | null
}>

export type NewGenerationNativeCompletionReceiptV2 = GenerationNativeCompletionReceiptKeyV2 & Readonly<{
  providerId: string
  contractId: string
  answerRootId: string
  nativeResultJson: string
  nativeResultSha256: string
  preparedRequestJson: string
  preparedRequestSha256: string
  receivedAtMs: number
}>

export class GenerationNativeCompletionReceiptV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID'
    | 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_CONFLICT'
    | 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_NOT_FOUND') {
    super(code)
    this.name = 'GenerationNativeCompletionReceiptV2RepoError'
  }
}

type ReceiptRow = Readonly<Record<string, unknown>>

function safeText(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 &&
    new TextEncoder().encode(value).byteLength <= maxBytes && !value.includes('\u0000')
}

function safeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function decodeRow(row: ReceiptRow): GenerationNativeCompletionReceiptV2 {
  const requiredText = ['operation_id', 'provider_id', 'contract_id', 'answer_root_id',
    'native_result_json', 'native_result_sha256', 'prepared_request_json', 'prepared_request_sha256'] as const
  if (requiredText.some((key) => typeof row[key] !== 'string') ||
      !Number.isSafeInteger(row.request_sequence) || (row.request_sequence as number) < 1 ||
      row.attempt !== 1 || !safeTime(row.received_at_ms) ||
      !['pending', 'materialized'].includes(row.materialization_state as string) ||
      (row.materialization_error_code !== null && typeof row.materialization_error_code !== 'string') ||
      (row.materialization_error_message !== null && typeof row.materialization_error_message !== 'string') ||
      (row.materialized_at_ms !== null && !safeTime(row.materialized_at_ms)) ||
      !/^[0-9a-f]{64}$/u.test(row.native_result_sha256 as string) ||
      !/^[0-9a-f]{64}$/u.test(row.prepared_request_sha256 as string) ||
      !safeText(row.native_result_json, Number.MAX_SAFE_INTEGER) ||
      !safeText(row.prepared_request_json, Number.MAX_SAFE_INTEGER)) {
    throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
  }
  const state = row.materialization_state as 'pending' | 'materialized'
  if ((state === 'pending') !== (row.materialized_at_ms === null) ||
      (state === 'materialized' && (row.materialization_error_code !== null || row.materialization_error_message !== null))) {
    throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
  }
  return Object.freeze({
    operationId: row.operation_id as string,
    requestSequence: row.request_sequence as number,
    attempt: row.attempt as number,
    providerId: row.provider_id as string,
    contractId: row.contract_id as string,
    answerRootId: row.answer_root_id as string,
    nativeResultJson: row.native_result_json as string,
    nativeResultSha256: row.native_result_sha256 as string,
    preparedRequestJson: row.prepared_request_json as string,
    preparedRequestSha256: row.prepared_request_sha256 as string,
    receivedAtMs: row.received_at_ms as number,
    materializationState: state,
    materializationErrorCode: row.materialization_error_code as string | null,
    materializationErrorMessage: row.materialization_error_message as string | null,
    materializedAtMs: row.materialized_at_ms as number | null,
  })
}

function sameImmutable(left: GenerationNativeCompletionReceiptV2, right: NewGenerationNativeCompletionReceiptV2): boolean {
  return left.operationId === right.operationId && left.requestSequence === right.requestSequence &&
    left.attempt === right.attempt && left.providerId === right.providerId &&
    left.contractId === right.contractId && left.answerRootId === right.answerRootId &&
    left.nativeResultJson === right.nativeResultJson && left.nativeResultSha256 === right.nativeResultSha256 &&
    left.preparedRequestJson === right.preparedRequestJson &&
    left.preparedRequestSha256 === right.preparedRequestSha256 && left.receivedAtMs === right.receivedAtMs
}

export class GenerationNativeCompletionReceiptV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  insertPending(input: NewGenerationNativeCompletionReceiptV2): GenerationNativeCompletionReceiptV2 {
    if (!safeText(input.operationId, 512) || !Number.isSafeInteger(input.requestSequence) || input.requestSequence < 1 ||
        input.attempt !== 1 || !safeText(input.providerId, 512) || !safeText(input.contractId, 512) ||
        !safeText(input.answerRootId, 512) || !safeTime(input.receivedAtMs) ||
        !safeText(input.nativeResultJson, Number.MAX_SAFE_INTEGER) ||
        !safeText(input.preparedRequestJson, Number.MAX_SAFE_INTEGER) ||
        !/^[0-9a-f]{64}$/u.test(input.nativeResultSha256) ||
        !/^[0-9a-f]{64}$/u.test(input.preparedRequestSha256)) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    }
    this.db.prepare(`INSERT INTO generation_native_completion_receipt_v2 (
      operation_id,request_sequence,attempt,provider_id,contract_id,answer_root_id,
      native_result_json,native_result_sha256,prepared_request_json,prepared_request_sha256,
      received_at_ms,materialization_state,materialization_error_code,materialization_error_message,materialized_at_ms
    ) VALUES (?,?,?,?,?,?,?,?,?, ?,?,'pending',NULL,NULL,NULL)
    ON CONFLICT(operation_id,request_sequence,attempt) DO NOTHING`).run(
      input.operationId, input.requestSequence, input.attempt, input.providerId, input.contractId,
      input.answerRootId, input.nativeResultJson, input.nativeResultSha256,
      input.preparedRequestJson, input.preparedRequestSha256, input.receivedAtMs,
    )
    const receipt = this.get(input)
    if (!sameImmutable(receipt, input)) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_CONFLICT')
    }
    return receipt
  }

  get(key: GenerationNativeCompletionReceiptKeyV2): GenerationNativeCompletionReceiptV2 {
    const row = this.db.prepare(`SELECT operation_id,request_sequence,attempt,provider_id,contract_id,answer_root_id,
      native_result_json,native_result_sha256,prepared_request_json,prepared_request_sha256,received_at_ms,
      materialization_state,materialization_error_code,materialization_error_message,materialized_at_ms
      FROM generation_native_completion_receipt_v2 WHERE operation_id=? AND request_sequence=? AND attempt=?`).get(
      key.operationId, key.requestSequence, key.attempt,
    ) as ReceiptRow | undefined
    if (!row) throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_NOT_FOUND')
    return decodeRow(row)
  }

  listPending(limit = 100): readonly GenerationNativeCompletionReceiptV2[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    }
    const rows = this.db.prepare(`SELECT operation_id,request_sequence,attempt,provider_id,contract_id,answer_root_id,
      native_result_json,native_result_sha256,prepared_request_json,prepared_request_sha256,received_at_ms,
      materialization_state,materialization_error_code,materialization_error_message,materialized_at_ms
      FROM generation_native_completion_receipt_v2 WHERE materialization_state='pending'
      ORDER BY received_at_ms,operation_id,request_sequence,attempt LIMIT ?`).all(limit) as ReceiptRow[]
    return Object.freeze(rows.map(decodeRow))
  }

  listPendingPage(
    limit = 100,
    after: GenerationNativeCompletionReceiptCursorV2 | null = null,
  ): readonly GenerationNativeCompletionReceiptV2[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    }
    const rows = after
      ? this.db.prepare(`SELECT operation_id,request_sequence,attempt,provider_id,contract_id,answer_root_id,
          native_result_json,native_result_sha256,prepared_request_json,prepared_request_sha256,received_at_ms,
          materialization_state,materialization_error_code,materialization_error_message,materialized_at_ms
          FROM generation_native_completion_receipt_v2 WHERE materialization_state='pending'
            AND (received_at_ms>? OR (received_at_ms=? AND operation_id>?)
              OR (received_at_ms=? AND operation_id=? AND request_sequence>?)
              OR (received_at_ms=? AND operation_id=? AND request_sequence=? AND attempt>?))
          ORDER BY received_at_ms,operation_id,request_sequence,attempt LIMIT ?`).all(
        after.receivedAtMs, after.receivedAtMs, after.operationId,
        after.receivedAtMs, after.operationId, after.requestSequence,
        after.receivedAtMs, after.operationId, after.requestSequence, after.attempt, limit,
      ) as ReceiptRow[]
      : this.db.prepare(`SELECT operation_id,request_sequence,attempt,provider_id,contract_id,answer_root_id,
          native_result_json,native_result_sha256,prepared_request_json,prepared_request_sha256,received_at_ms,
          materialization_state,materialization_error_code,materialization_error_message,materialized_at_ms
          FROM generation_native_completion_receipt_v2 WHERE materialization_state='pending'
          ORDER BY received_at_ms,operation_id,request_sequence,attempt LIMIT ?`).all(limit) as ReceiptRow[]
    return Object.freeze(rows.map(decodeRow))
  }

  listPendingSummaryPage(
    limit = 100,
    after: GenerationNativeCompletionReceiptCursorV2 | null = null,
  ): readonly GenerationNativeCompletionPendingSummaryV2[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    }
    const rows = after
      ? this.db.prepare(`SELECT operation_id,request_sequence,attempt,contract_id,received_at_ms
          FROM generation_native_completion_receipt_v2 WHERE materialization_state='pending'
            AND (received_at_ms>? OR (received_at_ms=? AND operation_id>?)
              OR (received_at_ms=? AND operation_id=? AND request_sequence>?)
              OR (received_at_ms=? AND operation_id=? AND request_sequence=? AND attempt>?))
          ORDER BY received_at_ms,operation_id,request_sequence,attempt LIMIT ?`).all(
        after.receivedAtMs, after.receivedAtMs, after.operationId,
        after.receivedAtMs, after.operationId, after.requestSequence,
        after.receivedAtMs, after.operationId, after.requestSequence, after.attempt, limit,
      ) as ReceiptRow[]
      : this.db.prepare(`SELECT operation_id,request_sequence,attempt,contract_id,received_at_ms
          FROM generation_native_completion_receipt_v2 WHERE materialization_state='pending'
          ORDER BY received_at_ms,operation_id,request_sequence,attempt LIMIT ?`).all(limit) as ReceiptRow[]
    return Object.freeze(rows.map((row) => {
      if (typeof row.operation_id !== 'string' || !Number.isSafeInteger(row.request_sequence) ||
          (row.request_sequence as number) < 1 || row.attempt !== 1 || typeof row.contract_id !== 'string' ||
          !safeTime(row.received_at_ms)) {
        throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
      }
      return Object.freeze({ operationId: row.operation_id, requestSequence: row.request_sequence as number,
        attempt: 1, contractId: row.contract_id, receivedAtMs: row.received_at_ms as number })
    }))
  }

  hasPendingForOperation(operationId: string): boolean {
    const row = this.db.prepare(`SELECT 1 AS present FROM generation_native_completion_receipt_v2
      WHERE operation_id=? AND materialization_state='pending' LIMIT 1`).get(operationId) as
      { present?: unknown } | undefined
    return row?.present === 1
  }

  markMaterialized(key: GenerationNativeCompletionReceiptKeyV2, atMs: number): GenerationNativeCompletionReceiptV2 {
    if (!safeTime(atMs)) throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    const existing = this.get(key)
    if (existing.materializationState === 'materialized') return existing
    const result = this.db.prepare(`UPDATE generation_native_completion_receipt_v2 SET
      materialization_state='materialized',materialization_error_code=NULL,materialization_error_message=NULL,
      materialized_at_ms=? WHERE operation_id=? AND request_sequence=? AND attempt=? AND materialization_state='pending'`).run(
      atMs, key.operationId, key.requestSequence, key.attempt,
    )
    if (result.changes !== 1) throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_CONFLICT')
    return this.get(key)
  }

  recordMaterializationError(
    key: GenerationNativeCompletionReceiptKeyV2,
    code: string,
    message: string,
  ): GenerationNativeCompletionReceiptV2 {
    if (!safeText(code, 512) || !safeText(message, 8_192)) {
      throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_INVALID')
    }
    const result = this.db.prepare(`UPDATE generation_native_completion_receipt_v2 SET
      materialization_error_code=?,materialization_error_message=?
      WHERE operation_id=? AND request_sequence=? AND attempt=? AND materialization_state='pending'`).run(
      code, message, key.operationId, key.requestSequence, key.attempt,
    )
    if (result.changes !== 1 && this.get(key).materializationState !== 'pending') {
      return this.get(key)
    }
    if (result.changes !== 1) throw new GenerationNativeCompletionReceiptV2RepoError('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_CONFLICT')
    return this.get(key)
  }
}
