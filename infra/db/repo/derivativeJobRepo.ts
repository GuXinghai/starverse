import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  CancelDerivativeJobInput,
  CreateDerivativeJobInput,
  DerivativeErrorCode,
  DerivativeJobRecord,
  GetDerivativeJobByIdInput,
  ListDerivativeJobsByAssetIdInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type DerivativeJobRow = Readonly<{
  id: string
  asset_id: string
  derivative_kind: DerivativeJobRecord['derivativeKind']
  task_family: DerivativeJobRecord['taskFamily']
  status: DerivativeJobRecord['status']
  generator: string
  provider: string | null
  model_id: string | null
  input_snapshot_json: string | null
  config_json: string | null
  output_derivative_id: string | null
  error_code: DerivativeErrorCode | null
  error_message: string | null
  attempt_count: number
  created_at: number
  updated_at: number
  started_at: number | null
  finished_at: number | null
}>

const mapDerivativeJobRow = (row: DerivativeJobRow): DerivativeJobRecord => ({
  id: row.id,
  assetId: row.asset_id,
  derivativeKind: row.derivative_kind,
  taskFamily: row.task_family,
  status: row.status,
  generator: row.generator,
  provider: row.provider ?? null,
  modelId: row.model_id ?? null,
  inputSnapshotJson: row.input_snapshot_json ? safeParseJson(row.input_snapshot_json) : null,
  configJson: row.config_json ? safeParseJson(row.config_json) : null,
  outputDerivativeId: row.output_derivative_id ?? null,
  errorCode: row.error_code ?? null,
  errorMessage: row.error_message ?? null,
  attemptCount: row.attempt_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
})

export class DerivativeJobRepo {
  private insertStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement
  private listByAssetStmt: BetterSqlite3.Statement
  private markRunningStmt: BetterSqlite3.Statement
  private markReadyStmt: BetterSqlite3.Statement
  private markFailedStmt: BetterSqlite3.Statement
  private markCancelledStmt: BetterSqlite3.Statement
  private resetForRetryStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO derivative_jobs(
        id,
        asset_id,
        derivative_kind,
        task_family,
        status,
        generator,
        provider,
        model_id,
        input_snapshot_json,
        config_json,
        output_derivative_id,
        error_code,
        error_message,
        attempt_count,
        created_at,
        updated_at,
        started_at,
        finished_at
      )
      VALUES (
        @id,
        @assetId,
        @derivativeKind,
        @taskFamily,
        @status,
        @generator,
        @provider,
        @modelId,
        @inputSnapshotJson,
        @configJson,
        @outputDerivativeId,
        @errorCode,
        @errorMessage,
        @attemptCount,
        @createdAt,
        @updatedAt,
        @startedAt,
        @finishedAt
      )
    `)

    this.getByIdStmt = this.db.prepare(`
      SELECT *
      FROM derivative_jobs
      WHERE id = @id
      LIMIT 1
    `)

    this.listByAssetStmt = this.db.prepare(`
      SELECT *
      FROM derivative_jobs
      WHERE asset_id = @assetId
      ORDER BY created_at DESC, id DESC
    `)

    this.markRunningStmt = this.db.prepare(`
      UPDATE derivative_jobs
      SET status = 'running',
          attempt_count = @attemptCount,
          error_code = NULL,
          error_message = NULL,
          started_at = @startedAt,
          finished_at = NULL,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markReadyStmt = this.db.prepare(`
      UPDATE derivative_jobs
      SET status = 'ready',
          output_derivative_id = @outputDerivativeId,
          error_code = NULL,
          error_message = NULL,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markFailedStmt = this.db.prepare(`
      UPDATE derivative_jobs
      SET status = 'failed',
          error_code = @errorCode,
          error_message = @errorMessage,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markCancelledStmt = this.db.prepare(`
      UPDATE derivative_jobs
      SET status = 'cancelled',
          error_code = @errorCode,
          error_message = @errorMessage,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.resetForRetryStmt = this.db.prepare(`
      UPDATE derivative_jobs
      SET status = 'pending',
          error_code = NULL,
          error_message = NULL,
          finished_at = NULL,
          updated_at = @updatedAt
      WHERE id = @id
    `)
  }

  create(input: CreateDerivativeJobInput): DerivativeJobRecord {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? createdAt
    const row: DerivativeJobRecord = {
      id: input.id ?? randomUUID(),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      derivativeKind: input.derivativeKind,
      taskFamily: input.taskFamily,
      status: input.status ?? 'pending',
      generator: requireNonEmpty(input.generator, 'generator'),
      provider: normalizeNullable(input.provider),
      modelId: normalizeNullable(input.modelId),
      inputSnapshotJson: input.inputSnapshotJson ?? null,
      configJson: input.configJson ?? null,
      outputDerivativeId: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: input.attemptCount ?? 0,
      createdAt,
      updatedAt,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
    }
    this.insertStmt.run({
      ...row,
      inputSnapshotJson: row.inputSnapshotJson ? JSON.stringify(row.inputSnapshotJson) : null,
      configJson: row.configJson ? JSON.stringify(row.configJson) : null,
    })
    return row
  }

  getById(input: GetDerivativeJobByIdInput | string): DerivativeJobRecord | null {
    const id = typeof input === 'string' ? input : input.id
    const row = this.getByIdStmt.get({ id: requireNonEmpty(id, 'id') }) as DerivativeJobRow | undefined
    return row ? mapDerivativeJobRow(row) : null
  }

  listByAssetId(input: ListDerivativeJobsByAssetIdInput): DerivativeJobRecord[] {
    return (this.listByAssetStmt.all({ assetId: requireNonEmpty(input.assetId, 'assetId') }) as DerivativeJobRow[])
      .map(mapDerivativeJobRow)
  }

  markRunning(jobId: string, attemptCount: number, startedAt = Date.now()): DerivativeJobRecord {
    this.markRunningStmt.run({
      id: requireNonEmpty(jobId, 'jobId'),
      attemptCount,
      startedAt,
      updatedAt: startedAt,
    })
    const record = this.getById(jobId)
    if (!record) throw new Error(`derivative job not found after markRunning: ${jobId}`)
    return record
  }

  markReady(jobId: string, outputDerivativeId: string, finishedAt = Date.now()): DerivativeJobRecord {
    this.markReadyStmt.run({
      id: requireNonEmpty(jobId, 'jobId'),
      outputDerivativeId: requireNonEmpty(outputDerivativeId, 'outputDerivativeId'),
      finishedAt,
      updatedAt: finishedAt,
    })
    const record = this.getById(jobId)
    if (!record) throw new Error(`derivative job not found after markReady: ${jobId}`)
    return record
  }

  markFailed(jobId: string, errorCode: DerivativeErrorCode, errorMessage: string, finishedAt = Date.now()): DerivativeJobRecord {
    this.markFailedStmt.run({
      id: requireNonEmpty(jobId, 'jobId'),
      errorCode,
      errorMessage: String(errorMessage ?? '').trim() || errorCode,
      finishedAt,
      updatedAt: finishedAt,
    })
    const record = this.getById(jobId)
    if (!record) throw new Error(`derivative job not found after markFailed: ${jobId}`)
    return record
  }

  markCancelled(input: CancelDerivativeJobInput): DerivativeJobRecord {
    const now = Date.now()
    this.markCancelledStmt.run({
      id: requireNonEmpty(input.jobId, 'jobId'),
      errorCode: 'derivative_task_cancelled',
      errorMessage: String(input.reason ?? '').trim() || 'Cancelled by caller',
      finishedAt: now,
      updatedAt: now,
    })
    const record = this.getById(input.jobId)
    if (!record) throw new Error(`derivative job not found after markCancelled: ${input.jobId}`)
    return record
  }

  resetForRetry(jobId: string, updatedAt = Date.now()): DerivativeJobRecord {
    this.resetForRetryStmt.run({
      id: requireNonEmpty(jobId, 'jobId'),
      updatedAt,
    })
    const record = this.getById(jobId)
    if (!record) throw new Error(`derivative job not found after resetForRetry: ${jobId}`)
    return record
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}
