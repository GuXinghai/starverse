import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  catalogSnapshotIdSchema,
  compatibleBoundedJsonValueSchema,
  compatibleCatalogSyncDiagnosticsSchema,
  compatibleModelIdSchema,
  compatibleModelMetadataSchema,
  providerInstanceIdSchema,
  type CompatibleCatalogSnapshot,
  type CompatibleCatalogApplyResult,
  type CompatibleCatalogSyncState,
  type CompatibleMergedModel,
  type CompatibleModelRecord,
} from '../../../src/shared/provider/openai-chat-compatible'
import { mergeCompatibleModelRecords } from '../../../src/shared/modelCatalog/providers/openai-chat-compatible/compatibleCatalogMerge'

const timestampSchema = z.number().int().nonnegative()
const compatibleSnapshotMetadataSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const result = compatibleBoundedJsonValueSchema.safeParse(value)
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message })
    }
  }
})

export const CreateCompatibleCatalogSnapshotInputSchema = z.object({
  snapshotId: catalogSnapshotIdSchema,
  providerInstanceId: providerInstanceIdSchema,
  snapshotSequence: z.number().int().positive(),
  observedAtMs: timestampSchema,
  checksum: z.string().trim().min(1).max(256).nullable(),
  metadata: compatibleSnapshotMetadataSchema.nullable(),
}).strict()

export const CompatibleRemoteModelInputSchema = z.object({
  modelId: compatibleModelIdSchema,
  metadata: compatibleModelMetadataSchema,
}).strict()

export const ApplyCompatibleRemoteSyncSuccessInputSchema = z.object({
  snapshot: CreateCompatibleCatalogSnapshotInputSchema,
  models: z.array(CompatibleRemoteModelInputSchema).max(100_000),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>()
  value.models.forEach((model, index) => {
    if (seen.has(model.modelId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['models', index, 'modelId'], message: 'Duplicate remote model ID.' })
    }
    seen.add(model.modelId)
  })
})

export const RecordCompatibleCatalogSyncFailureInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  attemptedAtMs: timestampSchema,
  backoffUntilMs: timestampSchema.nullable(),
  diagnostics: compatibleCatalogSyncDiagnosticsSchema,
}).strict()

export const UpsertCompatibleManualModelInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
  metadata: compatibleModelMetadataSchema,
  updatedAtMs: timestampSchema,
}).strict()

export const UpsertCompatibleCatalogSyncStateInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  status: z.enum(['never', 'syncing', 'success', 'empty_success', 'failed', 'backoff']),
  lastAttemptAtMs: timestampSchema.nullable(),
  lastSuccessAtMs: timestampSchema.nullable(),
  lastSuccessSnapshotId: catalogSnapshotIdSchema.nullable(),
  failureCount: z.number().int().nonnegative(),
  backoffUntilMs: timestampSchema.nullable(),
  diagnostics: compatibleCatalogSyncDiagnosticsSchema.nullable(),
  updatedAtMs: timestampSchema,
}).strict().superRefine((value, ctx) => {
  if ((value.status === 'success' || value.status === 'empty_success') && !value.lastSuccessSnapshotId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lastSuccessSnapshotId'], message: 'Successful sync requires a snapshot.' })
  }
  if (value.status === 'backoff' && value.backoffUntilMs === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['backoffUntilMs'], message: 'Backoff status requires an expiry.' })
  }
})

export type ApplyCompatibleRemoteSyncSuccessInput = z.input<typeof ApplyCompatibleRemoteSyncSuccessInputSchema>
export type RecordCompatibleCatalogSyncFailureInput = z.input<typeof RecordCompatibleCatalogSyncFailureInputSchema>
export type UpsertCompatibleManualModelInput = z.input<typeof UpsertCompatibleManualModelInputSchema>
export type UpsertCompatibleCatalogSyncStateInput = z.input<typeof UpsertCompatibleCatalogSyncStateInputSchema>

type ModelRow = {
  provider_instance_id: string
  model_id: string
  source: CompatibleModelRecord['source']
  record_state: CompatibleModelRecord['state']
  snapshot_id: string | null
  metadata_json: string
  created_at_ms: number
  updated_at_ms: number
}

function mapModel(row: ModelRow): CompatibleModelRecord {
  return {
    providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
    modelId: compatibleModelIdSchema.parse(row.model_id),
    source: row.source,
    state: row.record_state,
    snapshotId: row.snapshot_id ? catalogSnapshotIdSchema.parse(row.snapshot_id) : null,
    metadata: compatibleModelMetadataSchema.parse(JSON.parse(row.metadata_json)),
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  }
}

export class CompatibleCatalogRepo {
  private readonly applyRemoteSyncSuccessTransaction: (input: ApplyCompatibleRemoteSyncSuccessInput) => CompatibleCatalogApplyResult

  constructor(private readonly db: BetterSqlite3.Database) {
    this.applyRemoteSyncSuccessTransaction = db.transaction((raw: ApplyCompatibleRemoteSyncSuccessInput) => {
      const value = ApplyCompatibleRemoteSyncSuccessInputSchema.parse(raw)
      const { snapshot } = value
      this.assertProviderActive(snapshot.providerInstanceId)
      this.db.prepare(`
        INSERT INTO compatible_catalog_snapshots (
          snapshot_id, provider_instance_id, snapshot_sequence, observed_at_ms,
          model_count, checksum, metadata_json
        ) VALUES (
          @snapshotId, @providerInstanceId, @snapshotSequence, @observedAtMs,
          @modelCount, @checksum, @metadataJson
        )
      `).run({
        ...snapshot,
        modelCount: value.models.length,
        metadataJson: snapshot.metadata === null ? null : JSON.stringify(snapshot.metadata),
      })
      this.db.prepare(`
        UPDATE compatible_model_records
        SET record_state = 'stale', updated_at_ms = @observedAtMs
        WHERE provider_instance_id = @providerInstanceId AND source = 'remote_sync'
      `).run(snapshot)
      const insert = this.db.prepare(`
        INSERT INTO compatible_model_records (
          provider_instance_id, model_id, source, record_state, snapshot_id,
          metadata_json, created_at_ms, updated_at_ms
        ) VALUES (?, ?, 'remote_sync', 'active', ?, ?, ?, ?)
        ON CONFLICT(provider_instance_id, model_id, source) DO UPDATE SET
          record_state = 'active',
          snapshot_id = excluded.snapshot_id,
          metadata_json = excluded.metadata_json,
          updated_at_ms = excluded.updated_at_ms
      `)
      for (const model of value.models) {
        insert.run(
          snapshot.providerInstanceId,
          model.modelId,
          snapshot.snapshotId,
          JSON.stringify(model.metadata),
          snapshot.observedAtMs,
          snapshot.observedAtMs,
        )
      }
      this.writeSyncState({
        providerInstanceId: snapshot.providerInstanceId,
        status: value.models.length === 0 ? 'empty_success' : 'success',
        lastAttemptAtMs: snapshot.observedAtMs,
        lastSuccessAtMs: snapshot.observedAtMs,
        lastSuccessSnapshotId: snapshot.snapshotId,
        failureCount: 0,
        backoffUntilMs: null,
        diagnostics: null,
        updatedAtMs: snapshot.observedAtMs,
      })
      this.pruneCatalogHistory(snapshot.providerInstanceId)
      return Object.freeze({
        snapshot: this.getSnapshot(snapshot.snapshotId)!,
        syncState: this.getSyncState(snapshot.providerInstanceId)!,
        models: this.listMergedModels(snapshot.providerInstanceId),
      })
    })
  }

  applyRemoteSyncSuccess(input: ApplyCompatibleRemoteSyncSuccessInput): CompatibleCatalogApplyResult {
    return this.applyRemoteSyncSuccessTransaction(input)
  }

  getSnapshot(snapshotId: unknown): CompatibleCatalogSnapshot | null {
    const id = catalogSnapshotIdSchema.parse(snapshotId)
    const row = this.db.prepare(`
      SELECT * FROM compatible_catalog_snapshots WHERE snapshot_id = ?
    `).get(id) as {
      snapshot_id: string
      provider_instance_id: string
      snapshot_sequence: number
      observed_at_ms: number
      model_count: number
      checksum: string | null
      metadata_json: string | null
    } | undefined
    return row ? {
      snapshotId: catalogSnapshotIdSchema.parse(row.snapshot_id),
      providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
      snapshotSequence: row.snapshot_sequence,
      observedAtMs: row.observed_at_ms,
      modelCount: row.model_count,
      checksum: row.checksum,
      metadata: row.metadata_json ? compatibleSnapshotMetadataSchema.parse(JSON.parse(row.metadata_json)) : null,
    } : null
  }

  upsertManualModel(input: UpsertCompatibleManualModelInput): CompatibleModelRecord {
    const value = UpsertCompatibleManualModelInputSchema.parse(input)
    this.assertProviderActive(value.providerInstanceId)
    const existing = this.db.prepare(`
      SELECT 1 FROM compatible_model_records
      WHERE provider_instance_id = ? AND model_id = ? AND source = 'manual'
    `).get(value.providerInstanceId, value.modelId)
    if (!existing) {
      const row = this.db.prepare(`
        SELECT COUNT(*) AS count FROM compatible_model_records
        WHERE provider_instance_id = ? AND source = 'manual'
      `).get(value.providerInstanceId) as { count: number }
      if (row.count >= 10_000) throw new Error('compatible_catalog_manual_limit')
    }
    this.db.prepare(`
      INSERT INTO compatible_model_records (
          provider_instance_id, model_id, source, record_state, snapshot_id,
        metadata_json, created_at_ms, updated_at_ms
      ) VALUES (
          @providerInstanceId, @modelId, 'manual', 'active', NULL,
        @metadataJson, @updatedAtMs, @updatedAtMs
      )
      ON CONFLICT(provider_instance_id, model_id, source) DO UPDATE SET
        metadata_json = excluded.metadata_json,
        updated_at_ms = excluded.updated_at_ms
    `).run({ ...value, metadataJson: JSON.stringify(value.metadata) })
    return this.listModelRecords(value.providerInstanceId, value.modelId).find((row) => row.source === 'manual')!
  }

  deleteManualModel(providerInstanceId: unknown, modelId: unknown): boolean {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const parsedModelId = compatibleModelIdSchema.parse(modelId)
    this.assertProviderActive(providerId)
    return this.db.prepare(`
      DELETE FROM compatible_model_records
      WHERE provider_instance_id = ? AND model_id = ? AND source = 'manual'
    `).run(providerId, parsedModelId).changes === 1
  }

  listModelRecords(providerInstanceId: unknown, modelId?: unknown): CompatibleModelRecord[] {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const parsedModelId = modelId === undefined ? null : compatibleModelIdSchema.parse(modelId)
    const rows = this.db.prepare(`
      SELECT * FROM compatible_model_records
      WHERE provider_instance_id = @providerInstanceId
        AND (@modelId IS NULL OR model_id = @modelId)
      ORDER BY model_id, source
    `).all({ providerInstanceId: providerId, modelId: parsedModelId }) as ModelRow[]
    return rows.map(mapModel)
  }

  listMergedModels(providerInstanceId: unknown): readonly CompatibleMergedModel[] {
    return mergeCompatibleModelRecords(this.listModelRecords(providerInstanceId))
  }

  getNextSnapshotSequence(providerInstanceId: unknown): number {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const row = this.db.prepare(`
      SELECT COALESCE(MAX(snapshot_sequence), 0) + 1 AS next_sequence
      FROM compatible_catalog_snapshots
      WHERE provider_instance_id = ?
    `).get(providerId) as { next_sequence: number }
    return z.number().int().positive().parse(row.next_sequence)
  }

  markSyncing(providerInstanceId: unknown, attemptedAtMs: unknown): CompatibleCatalogSyncState {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const atMs = timestampSchema.parse(attemptedAtMs)
    this.assertProviderActive(providerId)
    const current = this.getSyncState(providerId)
    return this.upsertSyncState({
      providerInstanceId: providerId,
      status: 'syncing',
      lastAttemptAtMs: atMs,
      lastSuccessAtMs: current?.lastSuccessAtMs ?? null,
      lastSuccessSnapshotId: current?.lastSuccessSnapshotId ?? null,
      failureCount: current?.failureCount ?? 0,
      backoffUntilMs: null,
      diagnostics: null,
      updatedAtMs: atMs,
    })
  }

  recordSyncFailure(input: RecordCompatibleCatalogSyncFailureInput): CompatibleCatalogSyncState {
    const value = RecordCompatibleCatalogSyncFailureInputSchema.parse(input)
    const current = this.getSyncState(value.providerInstanceId)
    return this.upsertSyncState({
      providerInstanceId: value.providerInstanceId,
      status: value.backoffUntilMs === null ? 'failed' : 'backoff',
      lastAttemptAtMs: value.attemptedAtMs,
      lastSuccessAtMs: current?.lastSuccessAtMs ?? null,
      lastSuccessSnapshotId: current?.lastSuccessSnapshotId ?? null,
      failureCount: (current?.failureCount ?? 0) + 1,
      backoffUntilMs: value.backoffUntilMs,
      diagnostics: value.diagnostics,
      updatedAtMs: value.attemptedAtMs,
    })
  }

  recoverInterruptedSyncs(atMs: unknown): number {
    const recoveredAtMs = timestampSchema.parse(atMs)
    const diagnostics = compatibleCatalogSyncDiagnosticsSchema.parse({
      schemaVersion: 1,
      code: 'compatible_catalog_interrupted',
      messageKey: 'compatible.catalog.interrupted',
      retryable: true,
      httpStatus: null,
    })
    return this.db.prepare(`
      UPDATE compatible_catalog_sync_state
      SET status = 'failed',
          failure_count = failure_count + 1,
          backoff_until_ms = NULL,
          diagnostics_json = @diagnosticsJson,
          updated_at_ms = @recoveredAtMs
      WHERE status = 'syncing'
    `).run({ recoveredAtMs, diagnosticsJson: JSON.stringify(diagnostics) }).changes
  }

  upsertSyncState(input: UpsertCompatibleCatalogSyncStateInput): CompatibleCatalogSyncState {
    const value = UpsertCompatibleCatalogSyncStateInputSchema.parse(input)
    this.writeSyncState(value)
    return this.getSyncState(value.providerInstanceId)!
  }

  private writeSyncState(value: UpsertCompatibleCatalogSyncStateInput): void {
    this.db.prepare(`
      INSERT INTO compatible_catalog_sync_state (
        provider_instance_id, status, last_attempt_at_ms, last_success_at_ms,
        last_success_snapshot_id, failure_count, backoff_until_ms,
        diagnostics_json, updated_at_ms
      ) VALUES (
        @providerInstanceId, @status, @lastAttemptAtMs, @lastSuccessAtMs,
        @lastSuccessSnapshotId, @failureCount, @backoffUntilMs,
        @diagnosticsJson, @updatedAtMs
      )
      ON CONFLICT(provider_instance_id) DO UPDATE SET
        status = excluded.status,
        last_attempt_at_ms = excluded.last_attempt_at_ms,
        last_success_at_ms = excluded.last_success_at_ms,
        last_success_snapshot_id = excluded.last_success_snapshot_id,
        failure_count = excluded.failure_count,
        backoff_until_ms = excluded.backoff_until_ms,
        diagnostics_json = excluded.diagnostics_json,
        updated_at_ms = excluded.updated_at_ms
    `).run({ ...value, diagnosticsJson: value.diagnostics ? JSON.stringify(value.diagnostics) : null })
  }

  private assertProviderActive(providerInstanceId: string): void {
    const row = this.db.prepare(`
      SELECT status FROM compatible_provider_instances WHERE provider_instance_id = ?
    `).get(providerInstanceId) as { status: string } | undefined
    if (!row || row.status !== 'active') throw new Error('compatible_provider_inactive')
  }

  private pruneCatalogHistory(providerInstanceId: string): void {
    this.db.prepare(`
      DELETE FROM compatible_model_records
      WHERE provider_instance_id = @providerInstanceId
        AND source = 'remote_sync'
        AND record_state = 'stale'
        AND snapshot_id NOT IN (
          SELECT snapshot_id FROM compatible_catalog_snapshots
          WHERE provider_instance_id = @providerInstanceId
          ORDER BY snapshot_sequence DESC
          LIMIT 20
        )
    `).run({ providerInstanceId })
    this.db.prepare(`
      DELETE FROM compatible_model_records
      WHERE rowid IN (
        SELECT rowid FROM compatible_model_records
        WHERE provider_instance_id = @providerInstanceId
          AND source = 'remote_sync'
          AND record_state = 'stale'
        ORDER BY updated_at_ms DESC, model_id
        LIMIT -1 OFFSET 10000
      )
    `).run({ providerInstanceId })
    this.db.prepare(`
      DELETE FROM compatible_catalog_snapshots
      WHERE provider_instance_id = @providerInstanceId
        AND snapshot_id NOT IN (
          SELECT snapshot_id FROM compatible_catalog_snapshots
          WHERE provider_instance_id = @providerInstanceId
          ORDER BY snapshot_sequence DESC
          LIMIT 20
        )
        AND snapshot_id NOT IN (
          SELECT snapshot_id FROM compatible_model_records
          WHERE provider_instance_id = @providerInstanceId AND snapshot_id IS NOT NULL
        )
        AND snapshot_id NOT IN (
          SELECT last_success_snapshot_id FROM compatible_catalog_sync_state
          WHERE provider_instance_id = @providerInstanceId AND last_success_snapshot_id IS NOT NULL
        )
    `).run({ providerInstanceId })
  }

  getSyncState(providerInstanceId: unknown): CompatibleCatalogSyncState | null {
    const providerId = providerInstanceIdSchema.parse(providerInstanceId)
    const row = this.db.prepare(`
      SELECT * FROM compatible_catalog_sync_state WHERE provider_instance_id = ?
    `).get(providerId) as {
      provider_instance_id: string
      status: CompatibleCatalogSyncState['status']
      last_attempt_at_ms: number | null
      last_success_at_ms: number | null
      last_success_snapshot_id: string | null
      failure_count: number
      backoff_until_ms: number | null
      diagnostics_json: string | null
      updated_at_ms: number
    } | undefined
    return row ? {
      providerInstanceId: providerInstanceIdSchema.parse(row.provider_instance_id),
      status: row.status,
      lastAttemptAtMs: row.last_attempt_at_ms,
      lastSuccessAtMs: row.last_success_at_ms,
      lastSuccessSnapshotId: row.last_success_snapshot_id ? catalogSnapshotIdSchema.parse(row.last_success_snapshot_id) : null,
      failureCount: row.failure_count,
      backoffUntilMs: row.backoff_until_ms,
      diagnostics: row.diagnostics_json ? compatibleCatalogSyncDiagnosticsSchema.parse(JSON.parse(row.diagnostics_json)) : null,
      updatedAtMs: row.updated_at_ms,
    } : null
  }
}
