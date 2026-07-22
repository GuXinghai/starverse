import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import {
  isImmutablePreparedBodyV2,
  type ImmutablePreparedBodyV2,
} from '../../src/next/generation-v2/compiler/stableSerialize'

const nodeRequire = createRequire(import.meta.url)
let BetterSqlite3Constructor: typeof BetterSqlite3 | null = null

const RAW_GENERATION_STORE_LOG = Object.freeze({
  captureFailed: '[raw-generation] RAW_DEBUG_CAPTURE_FAILED (non-fatal)',
  queryFailed: '[raw-generation] RAW_DEBUG_QUERY_FAILED (non-fatal)',
  healthCheckFailed: '[raw-generation] RAW_DEBUG_STORE_OPEN_FAILED (non-fatal)',
})

function loadBetterSqlite3(): typeof BetterSqlite3 {
  if (!BetterSqlite3Constructor) {
    BetterSqlite3Constructor = nodeRequire('better-sqlite3') as typeof BetterSqlite3
  }
  return BetterSqlite3Constructor
}

export type RawGenerationRequestContext = Readonly<{
  operationId: string
  answerRootId: string
  requestSequence: number
  providerId: string
  modelId: string
  conversationId?: string | null
  branchId?: string | null
  questionId?: string | null
  actionKind?: string | null
}>

export type RawGenerationRequestRecord = RawGenerationRequestContext & Readonly<{
  id: string
  serializedBody: string
  bodyBytes: number
  bodySha256: string
  capturedAtMs: number
}>

export type RawProviderErrorRecord = RawGenerationRequestContext & Readonly<{
  id: string
  phase: 'http_response' | 'sse_event'
  httpStatus: number
  contentType: string | null
  providerRequestId: string | null
  payloadBase64: string
  payloadText: string | null
  payloadBytes: number
  payloadSha256: string
  capturedAtMs: number
}>

const MAX_RAW_PROVIDER_ERROR_BYTES = 8 * 1024 * 1024
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

export type RawGenerationRequestStoreStatus = Readonly<{
  available: boolean
  dbPath: string
  schemaReady: boolean
  lastCaptureError?: Readonly<{ code: 'RAW_DEBUG_CAPTURE_FAILED'; atMs: number }> | null
  errorCode?: 'RAW_DEBUG_STORE_OPEN_FAILED'
}>

export class RawGenerationRequestStore {
  private db: BetterSqlite3.Database | null = null
  private lastCaptureError: RawGenerationRequestStoreStatus['lastCaptureError'] = null
  constructor(private readonly dbPath: string) {}

  tryPersist(context: RawGenerationRequestContext, serializedBody: string): void {
    try {
      const db = this.open()
      const bodyBytes = Buffer.byteLength(serializedBody, 'utf8')
      const bodySha256 = createHash('sha256').update(serializedBody, 'utf8').digest('hex')
      const existing = db.prepare(`SELECT body_sha256 AS bodySha256 FROM raw_generation_requests WHERE operation_id=? AND request_sequence=?`)
        .get(context.operationId, context.requestSequence) as { bodySha256?: string } | undefined
      if (existing) {
        if (existing.bodySha256 !== bodySha256) console.warn('[raw-generation] request sequence conflict', { operationId: context.operationId, requestSequence: context.requestSequence })
        return
      }
      db.prepare(`
        INSERT INTO raw_generation_requests (
          id, operation_id, answer_root_id, request_sequence, conversation_id, branch_id, question_id,
          action_kind, provider_id, model_id, serialized_body, body_bytes, body_sha256, captured_at_ms
        ) VALUES (@id, @operationId, @answerRootId, @requestSequence, @conversationId, @branchId, @questionId,
          @actionKind, @providerId, @modelId, @serializedBody, @bodyBytes, @bodySha256, @capturedAtMs)
      `).run({ id: randomUUID(), ...context, conversationId: context.conversationId ?? null, branchId: context.branchId ?? null,
        questionId: context.questionId ?? null, actionKind: context.actionKind ?? null, serializedBody, bodyBytes, bodySha256, capturedAtMs: Date.now() })
    } catch {
      this.lastCaptureError = { code: 'RAW_DEBUG_CAPTURE_FAILED', atMs: Date.now() }
      console.warn(RAW_GENERATION_STORE_LOG.captureFailed)
    }
  }

  tryPersistPreparedV2(context: RawGenerationRequestContext, body: ImmutablePreparedBodyV2): void {
    if (!isImmutablePreparedBodyV2(body)) {
      this.lastCaptureError = { code: 'RAW_DEBUG_CAPTURE_FAILED', atMs: Date.now() }
      return
    }
    this.tryPersist(context, body.copyUtf8Text())
  }

  tryPersistProviderError(context: RawGenerationRequestContext, input: Readonly<{
    phase: 'http_response' | 'sse_event'
    httpStatus: number
    contentType?: string | null
    providerRequestId?: string | null
    payload: Uint8Array
  }>): void {
    let owned: Buffer | undefined
    try {
      if (!ArrayBuffer.isView(input.payload) ||
          (input.payload as Uint8Array & { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT !== 1 ||
          input.payload.byteLength > MAX_RAW_PROVIDER_ERROR_BYTES ||
          !Number.isSafeInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) {
        throw new Error('RAW_DEBUG_PROVIDER_ERROR_INVALID')
      }
      owned = Buffer.from(input.payload)
      const payloadSha256 = createHash('sha256').update(owned).digest('hex')
      this.open().prepare(`
        INSERT OR IGNORE INTO raw_provider_errors (
          id, operation_id, answer_root_id, request_sequence, conversation_id, branch_id, question_id,
          action_kind, provider_id, model_id, phase, http_status, content_type, provider_request_id,
          payload_bytes_blob, payload_bytes, payload_sha256, captured_at_ms
        ) VALUES (@id, @operationId, @answerRootId, @requestSequence, @conversationId, @branchId, @questionId,
          @actionKind, @providerId, @modelId, @phase, @httpStatus, @contentType, @providerRequestId,
          @payload, @payloadBytes, @payloadSha256, @capturedAtMs)
      `).run({ id: randomUUID(), ...context, conversationId: context.conversationId ?? null,
        branchId: context.branchId ?? null, questionId: context.questionId ?? null,
        actionKind: context.actionKind ?? null, phase: input.phase, httpStatus: input.httpStatus,
        contentType: input.contentType ?? null, providerRequestId: input.providerRequestId ?? null,
        payload: owned, payloadBytes: owned.byteLength, payloadSha256, capturedAtMs: Date.now() })
    } catch {
      this.lastCaptureError = { code: 'RAW_DEBUG_CAPTURE_FAILED', atMs: Date.now() }
      console.warn(RAW_GENERATION_STORE_LOG.captureFailed)
    } finally {
      owned?.fill(0)
    }
  }

  listByAnswerRootId(answerRootId: string): RawGenerationRequestRecord[] {
    try {
      return this.open().prepare(`
        SELECT id, operation_id AS operationId, answer_root_id AS answerRootId, request_sequence AS requestSequence,
          conversation_id AS conversationId, branch_id AS branchId, question_id AS questionId, action_kind AS actionKind,
          provider_id AS providerId, model_id AS modelId, serialized_body AS serializedBody,
          body_bytes AS bodyBytes, body_sha256 AS bodySha256, captured_at_ms AS capturedAtMs
        FROM raw_generation_requests WHERE answer_root_id=? ORDER BY request_sequence, captured_at_ms
      `).all(answerRootId) as RawGenerationRequestRecord[]
    } catch {
      console.warn(RAW_GENERATION_STORE_LOG.queryFailed)
      throw new Error('RAW_DEBUG_QUERY_FAILED')
    }
  }

  listProviderErrorsByAnswerRootId(answerRootId: string): RawProviderErrorRecord[] {
    try {
      const rows = this.open().prepare(`
        SELECT id, operation_id AS operationId, answer_root_id AS answerRootId, request_sequence AS requestSequence,
          conversation_id AS conversationId, branch_id AS branchId, question_id AS questionId, action_kind AS actionKind,
          provider_id AS providerId, model_id AS modelId, phase, http_status AS httpStatus,
          content_type AS contentType, provider_request_id AS providerRequestId,
          payload_bytes_blob AS payload, payload_bytes AS payloadBytes,
          payload_sha256 AS payloadSha256, captured_at_ms AS capturedAtMs
        FROM raw_provider_errors WHERE answer_root_id=? ORDER BY request_sequence, captured_at_ms
      `).all(answerRootId) as Array<Omit<RawProviderErrorRecord, 'payloadBase64' | 'payloadText'> & { payload: unknown }>
      return rows.map(({ payload, ...row }) => {
        if (!Buffer.isBuffer(payload)) throw new Error('RAW_DEBUG_PROVIDER_ERROR_INVALID')
        let payloadText: string | null = null
        try { payloadText = fatalUtf8Decoder.decode(payload) } catch { /* binary error payload */ }
        return Object.freeze({ ...row, payloadBase64: payload.toString('base64'), payloadText })
      })
    } catch {
      console.warn(RAW_GENERATION_STORE_LOG.queryFailed)
      throw new Error('RAW_DEBUG_QUERY_FAILED')
    }
  }

  getStatus(): RawGenerationRequestStoreStatus {
    try {
      this.open()
      return { available: true, dbPath: this.dbPath, schemaReady: true, lastCaptureError: this.lastCaptureError }
    } catch {
      console.warn(RAW_GENERATION_STORE_LOG.healthCheckFailed)
      return {
        available: false,
        dbPath: this.dbPath,
        schemaReady: false,
        lastCaptureError: this.lastCaptureError,
        errorCode: 'RAW_DEBUG_STORE_OPEN_FAILED',
      }
    }
  }

  close(): void { this.db?.close(); this.db = null }

  private open(): BetterSqlite3.Database {
    if (this.db) return this.db
    mkdirSync(path.dirname(this.dbPath), { recursive: true })
    const Database = loadBetterSqlite3()
    const db = new Database(this.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE IF NOT EXISTS raw_generation_requests (
        id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, answer_root_id TEXT NOT NULL,
        request_sequence INTEGER NOT NULL CHECK(request_sequence >= 1), conversation_id TEXT, branch_id TEXT,
        question_id TEXT, action_kind TEXT, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        serialized_body TEXT NOT NULL, body_bytes INTEGER NOT NULL, body_sha256 TEXT NOT NULL,
        captured_at_ms INTEGER NOT NULL, UNIQUE(operation_id, request_sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_raw_generation_answer ON raw_generation_requests(answer_root_id, request_sequence);
      CREATE TABLE IF NOT EXISTS raw_provider_errors (
        id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, answer_root_id TEXT NOT NULL,
        request_sequence INTEGER NOT NULL CHECK(request_sequence >= 1), conversation_id TEXT, branch_id TEXT,
        question_id TEXT, action_kind TEXT, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('http_response','sse_event')),
        http_status INTEGER NOT NULL CHECK(http_status BETWEEN 100 AND 599), content_type TEXT,
        provider_request_id TEXT, payload_bytes_blob BLOB NOT NULL, payload_bytes INTEGER NOT NULL,
        payload_sha256 TEXT NOT NULL, captured_at_ms INTEGER NOT NULL,
        UNIQUE(operation_id, request_sequence, phase, payload_sha256)
      );
      CREATE INDEX IF NOT EXISTS idx_raw_provider_error_answer ON raw_provider_errors(answer_root_id, request_sequence);
    `)
    this.db = db
    return db
  }
}
