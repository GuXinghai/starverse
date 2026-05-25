import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  DfcOptionGenerationStateRecord,
  EnsureDfcOptionGenerationStateInput,
  GetDfcOptionGenerationStateByIdentityInput,
  ListDfcOptionGenerationStatesByAssetInput,
  MarkDfcOptionGenerationFailedInput,
  MarkDfcOptionGenerationBlockedInput,
  MarkDfcOptionGenerationReadyInput,
  MarkDfcOptionGenerationRunningInput,
} from '../types'

type SqlDatabase = BetterSqlite3.Database

type DfcOptionGenerationStateRow = Readonly<{
  id: string
  asset_id: string
  target_kind: DfcOptionGenerationStateRecord['targetKind']
  derived_kind: DfcOptionGenerationStateRecord['derivedKind']
  exposure_mode: DfcOptionGenerationStateRecord['exposureMode']
  generator: string
  conversion_settings_hash: string
  status: DfcOptionGenerationStateRecord['status']
  retryable: number
  derivative_job_id: string | null
  output_derivative_id: string | null
  error_code: DfcOptionGenerationStateRecord['errorCode']
  attempt_count: number
  created_at: number
  updated_at: number
  started_at: number | null
  finished_at: number | null
}>

const mapRow = (row: DfcOptionGenerationStateRow): DfcOptionGenerationStateRecord => ({
  id: row.id,
  assetId: row.asset_id,
  targetKind: row.target_kind,
  derivedKind: row.derived_kind,
  exposureMode: row.exposure_mode,
  generator: row.generator,
  conversionSettingsHash: row.conversion_settings_hash,
  status: row.status,
  retryable: row.retryable === 1,
  derivativeJobId: row.derivative_job_id ?? null,
  outputDerivativeId: row.output_derivative_id ?? null,
  errorCode: row.error_code ?? null,
  attemptCount: row.attempt_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
})

export class DfcOptionGenerationStateRepo {
  private insertOrIgnoreStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement
  private getByIdentityStmt: BetterSqlite3.Statement
  private listByAssetStmt: BetterSqlite3.Statement
  private markRunningStmt: BetterSqlite3.Statement
  private markReadyStmt: BetterSqlite3.Statement
  private markFailedStmt: BetterSqlite3.Statement
  private markBlockedStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.insertOrIgnoreStmt = this.db.prepare(`
      INSERT OR IGNORE INTO dfc_option_generation_states(
        id,
        asset_id,
        target_kind,
        derived_kind,
        exposure_mode,
        generator,
        conversion_settings_hash,
        status,
        retryable,
        derivative_job_id,
        output_derivative_id,
        error_code,
        attempt_count,
        created_at,
        updated_at,
        started_at,
        finished_at
      )
      VALUES (
        @id,
        @assetId,
        @targetKind,
        @derivedKind,
        @exposureMode,
        @generator,
        @conversionSettingsHash,
        'pending',
        1,
        NULL,
        NULL,
        NULL,
        0,
        @createdAt,
        @updatedAt,
        NULL,
        NULL
      )
    `)

    this.getByIdStmt = this.db.prepare(`
      SELECT *
      FROM dfc_option_generation_states
      WHERE id = @id
      LIMIT 1
    `)

    this.getByIdentityStmt = this.db.prepare(`
      SELECT *
      FROM dfc_option_generation_states
      WHERE asset_id = @assetId
        AND target_kind = @targetKind
        AND exposure_mode = @exposureMode
        AND conversion_settings_hash = @conversionSettingsHash
      LIMIT 1
    `)

    this.listByAssetStmt = this.db.prepare(`
      SELECT *
      FROM dfc_option_generation_states
      WHERE asset_id = @assetId
      ORDER BY updated_at DESC, id DESC
    `)

    this.markRunningStmt = this.db.prepare(`
      UPDATE dfc_option_generation_states
      SET status = 'running',
          retryable = 1,
          derivative_job_id = @derivativeJobId,
          output_derivative_id = NULL,
          error_code = NULL,
          attempt_count = @attemptCount,
          started_at = @startedAt,
          finished_at = NULL,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markReadyStmt = this.db.prepare(`
      UPDATE dfc_option_generation_states
      SET status = 'ready',
          retryable = 0,
          output_derivative_id = @outputDerivativeId,
          error_code = NULL,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markFailedStmt = this.db.prepare(`
      UPDATE dfc_option_generation_states
      SET status = 'failed',
          retryable = @retryable,
          output_derivative_id = NULL,
          error_code = @errorCode,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)

    this.markBlockedStmt = this.db.prepare(`
      UPDATE dfc_option_generation_states
      SET status = 'blocked',
          retryable = 0,
          output_derivative_id = NULL,
          error_code = @errorCode,
          finished_at = @finishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `)
  }

  ensure(input: EnsureDfcOptionGenerationStateInput): DfcOptionGenerationStateRecord {
    const now = Date.now()
    const createdAt = input.createdAt ?? now
    const updatedAt = input.updatedAt ?? createdAt
    const row = {
      id: input.id ?? randomUUID(),
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      targetKind: input.targetKind,
      derivedKind: input.derivedKind,
      exposureMode: input.exposureMode ?? 'dfc',
      generator: requireNonEmpty(input.generator, 'generator'),
      conversionSettingsHash: requireNonEmpty(input.conversionSettingsHash, 'conversionSettingsHash'),
      createdAt,
      updatedAt,
    }
    this.insertOrIgnoreStmt.run(row)
    const record = this.getByIdentity(row)
    if (!record) throw new Error(`DFC option generation state not found after ensure: ${row.assetId}`)
    return record
  }

  getById(id: string): DfcOptionGenerationStateRecord | null {
    const row = this.getByIdStmt.get({ id: requireNonEmpty(id, 'id') }) as DfcOptionGenerationStateRow | undefined
    return row ? mapRow(row) : null
  }

  getByIdentity(input: GetDfcOptionGenerationStateByIdentityInput): DfcOptionGenerationStateRecord | null {
    const row = this.getByIdentityStmt.get({
      assetId: requireNonEmpty(input.assetId, 'assetId'),
      targetKind: input.targetKind,
      exposureMode: input.exposureMode ?? 'dfc',
      conversionSettingsHash: requireNonEmpty(input.conversionSettingsHash, 'conversionSettingsHash'),
    }) as DfcOptionGenerationStateRow | undefined
    return row ? mapRow(row) : null
  }

  listByAsset(input: ListDfcOptionGenerationStatesByAssetInput): DfcOptionGenerationStateRecord[] {
    return (this.listByAssetStmt.all({ assetId: requireNonEmpty(input.assetId, 'assetId') }) as DfcOptionGenerationStateRow[])
      .map(mapRow)
  }

  markRunning(input: MarkDfcOptionGenerationRunningInput): DfcOptionGenerationStateRecord {
    const startedAt = input.startedAt ?? Date.now()
    this.markRunningStmt.run({
      id: requireNonEmpty(input.id, 'id'),
      derivativeJobId: requireNonEmpty(input.derivativeJobId, 'derivativeJobId'),
      attemptCount: input.attemptCount,
      startedAt,
      updatedAt: startedAt,
    })
    return this.requireById(input.id, 'markRunning')
  }

  markReady(input: MarkDfcOptionGenerationReadyInput): DfcOptionGenerationStateRecord {
    const finishedAt = input.finishedAt ?? Date.now()
    this.markReadyStmt.run({
      id: requireNonEmpty(input.id, 'id'),
      outputDerivativeId: requireNonEmpty(input.outputDerivativeId, 'outputDerivativeId'),
      finishedAt,
      updatedAt: finishedAt,
    })
    return this.requireById(input.id, 'markReady')
  }

  markFailed(input: MarkDfcOptionGenerationFailedInput): DfcOptionGenerationStateRecord {
    const finishedAt = input.finishedAt ?? Date.now()
    this.markFailedStmt.run({
      id: requireNonEmpty(input.id, 'id'),
      errorCode: input.errorCode,
      retryable: input.retryable === false ? 0 : 1,
      finishedAt,
      updatedAt: finishedAt,
    })
    return this.requireById(input.id, 'markFailed')
  }

  markBlocked(input: MarkDfcOptionGenerationBlockedInput): DfcOptionGenerationStateRecord {
    const finishedAt = input.finishedAt ?? Date.now()
    this.markBlockedStmt.run({
      id: requireNonEmpty(input.id, 'id'),
      errorCode: input.errorCode,
      finishedAt,
      updatedAt: finishedAt,
    })
    return this.requireById(input.id, 'markBlocked')
  }

  private requireById(id: string, operation: string): DfcOptionGenerationStateRecord {
    const record = this.getById(id)
    if (!record) throw new Error(`DFC option generation state not found after ${operation}: ${id}`)
    return record
  }
}

function requireNonEmpty(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${field} is required`)
  return normalized
}
