import type BetterSqlite3 from 'better-sqlite3'
import { ModelPreferencesRepo } from '../../infra/db/repo/modelPreferencesRepo'
import type { GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
// Approved Generation V2 main-process persistence boundary: recents are derived from the canonical snapshot.
// eslint-disable-next-line no-restricted-imports
import { decodeAssistantAnswerGenerationSnapshotJsonV2 } from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { runtimeProviderIdForGenerationExecutionProvider } from '../../src/shared/provider/generationExecutionRuntimeProviderAuthority'

type ReconciliationRow = Readonly<{
  operationId: string
  createdAtMs: number
  canonicalJson: string
}>

export class GenerationRecentUsageAuthorityV2 {
  readonly #preferences: ModelPreferencesRepo

  constructor(private readonly db: BetterSqlite3.Database) {
    this.#preferences = new ModelPreferencesRepo(db)
  }

  record(bundle: GenerationExecutionOperationBundleV2): boolean {
    const row = this.db.prepare(`
      SELECT
        operation.operation_id AS operationId,
        operation.created_at_ms AS createdAtMs,
        snapshot.canonical_json AS canonicalJson
      FROM generation_operation_v2 AS operation
      INNER JOIN assistant_generation_snapshot_v2 AS snapshot
        ON snapshot.operation_id = operation.operation_id
      WHERE operation.operation_id = ?
      LIMIT 1
    `).get(bundle.operation.operationId.value) as ReconciliationRow | undefined
    if (!row) throw new Error('MODEL_PREFS_RECENT_OPERATION_NOT_PERSISTED')
    const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(row.canonicalJson)
    if (snapshot.operationId.value !== row.operationId ||
        snapshot.snapshotHash.value !== bundle.snapshot.snapshotHash.value ||
        snapshot.providerBinding.providerId.value !== bundle.snapshot.providerBinding.providerId.value ||
        snapshot.providerBinding.modelId.value !== bundle.snapshot.providerBinding.modelId.value) {
      throw new Error('MODEL_PREFS_RECENT_OPERATION_SNAPSHOT_MISMATCH')
    }
    return this.#record({
      operationId: row.operationId,
      createdAtMs: row.createdAtMs,
      providerId: snapshot.providerBinding.providerId.value,
      modelId: snapshot.providerBinding.modelId.value,
    })
  }

  reconcile(): number {
    const rows = this.db.prepare(`
      SELECT
        operation.operation_id AS operationId,
        operation.created_at_ms AS createdAtMs,
        snapshot.canonical_json AS canonicalJson
      FROM generation_operation_v2 AS operation
      INNER JOIN assistant_generation_snapshot_v2 AS snapshot
        ON snapshot.operation_id = operation.operation_id
      LEFT JOIN model_recent_operation_v2 AS consumed
        ON consumed.operation_id = operation.operation_id
      WHERE consumed.operation_id IS NULL
      ORDER BY operation.created_at_ms ASC, operation.operation_id ASC
    `).all() as ReconciliationRow[]

    let applied = 0
    for (const row of rows) {
      const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(row.canonicalJson)
      if (snapshot.operationId.value !== row.operationId) {
        throw new Error('MODEL_PREFS_RECENT_OPERATION_SNAPSHOT_MISMATCH')
      }
      if (this.#record({
        operationId: row.operationId,
        createdAtMs: row.createdAtMs,
        providerId: snapshot.providerBinding.providerId.value,
        modelId: snapshot.providerBinding.modelId.value,
      })) applied += 1
    }
    return applied
  }

  #record(input: Readonly<{
    operationId: string
    createdAtMs: number
    providerId: GenerationExecutionOperationBundleV2['snapshot']['providerBinding']['providerId']['value']
    modelId: string
  }>): boolean {
    const runtimeProviderId = runtimeProviderIdForGenerationExecutionProvider(input.providerId)
    if (runtimeProviderId === null) return false
    const result = this.#preferences.recordRecentForGenerationOperation({
      operationId: input.operationId,
      providerKey: runtimeProviderId,
      modelId: input.modelId,
      usedAtMs: input.createdAtMs,
    })
    return result.applied
  }
}
