import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'

const nodeRequire = createRequire(import.meta.url)
let BetterSqlite3Constructor: typeof BetterSqlite3 | null = null

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
    } catch (error) {
      this.lastCaptureError = { code: 'RAW_DEBUG_CAPTURE_FAILED', atMs: Date.now() }
      console.warn('[raw-generation] request capture failed (non-fatal)', error instanceof Error ? error.message : String(error))
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
    } catch (error) {
      console.warn('[raw-generation] request query failed (non-fatal)', error instanceof Error ? error.message : String(error))
      throw new Error('RAW_DEBUG_QUERY_FAILED')
    }
  }

  getStatus(): RawGenerationRequestStoreStatus {
    try {
      this.open()
      return { available: true, dbPath: this.dbPath, schemaReady: true, lastCaptureError: this.lastCaptureError }
    } catch (error) {
      console.warn('[raw-generation] store health check failed (non-fatal)', error instanceof Error ? error.message : String(error))
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
    `)
    this.db = db
    return db
  }
}
