import BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

export type CatalogModelUpsertInput = Readonly<{
  modelId: string
  routerSource: string
  vendor: string
  name: string
  description?: string | null
  contextLength?: number | null
  supportedParametersJson?: string | null
  rawJson?: string | null
}>

export class ModelCatalogRepo {
  private upsertStmt: BetterSqlite3.Statement
  private hideMissingStmt: BetterSqlite3.Statement
  private listByRouterSourceStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO model_catalog(
        model_id,
        router_source,
        vendor,
        name,
        description,
        context_length,
        supported_parameters_json,
        raw_json,
        last_seen_snapshot_id,
        is_hidden,
        created_at_ms,
        updated_at_ms
      )
      VALUES (
        @modelId,
        @routerSource,
        @vendor,
        @name,
        @description,
        @contextLength,
        @supportedParametersJson,
        @rawJson,
        @snapshotId,
        0,
        @nowMs,
        @nowMs
      )
      ON CONFLICT(model_id) DO UPDATE SET
        router_source = excluded.router_source,
        vendor = excluded.vendor,
        name = excluded.name,
        description = excluded.description,
        context_length = excluded.context_length,
        supported_parameters_json = excluded.supported_parameters_json,
        raw_json = excluded.raw_json,
        last_seen_snapshot_id = excluded.last_seen_snapshot_id,
        is_hidden = 0,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.hideMissingStmt = this.db.prepare(`
      UPDATE model_catalog
      SET is_hidden = 1,
          updated_at_ms = @nowMs
      WHERE router_source = @routerSource
        AND (
          last_seen_snapshot_id IS NULL
          OR last_seen_snapshot_id != @snapshotId
        )
    `)

    this.listByRouterSourceStmt = this.db.prepare(`
      SELECT
        model_id AS modelId,
        name,
        vendor,
        description,
        context_length AS contextLength,
        supported_parameters_json AS supportedParametersJson,
        last_seen_snapshot_id AS lastSeenSnapshotId,
        is_hidden AS isHidden,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_catalog
      WHERE router_source = @routerSource
      ORDER BY name COLLATE NOCASE ASC, model_id ASC
    `)
  }

  /**
   * CatalogSyncJob writer (single transaction):
   * 1) UPSERT the snapshot models (full overwrite) and mark is_hidden=0.
   * 2) Mark models missing from this snapshot as is_hidden=1 (soft hidden).
   *
   * Any error will rollback the whole sync (no half-sync).
   */
  syncSnapshot(input: Readonly<{ snapshotId: string; routerSource: string; models: CatalogModelUpsertInput[] }>): void {
    const nowMs = Date.now()
    const tx = this.db.transaction(() => {
      for (const model of input.models) {
        this.upsertStmt.run({
          modelId: model.modelId,
          routerSource: model.routerSource,
          vendor: model.vendor,
          name: model.name,
          description: model.description ?? null,
          contextLength: model.contextLength ?? -1,
          supportedParametersJson: model.supportedParametersJson ?? null,
          rawJson: model.rawJson ?? null,
          snapshotId: input.snapshotId,
          nowMs,
        })
      }

      this.hideMissingStmt.run({
        routerSource: input.routerSource,
        snapshotId: input.snapshotId,
        nowMs,
      })
    })

    tx()
  }

  listByRouterSource(routerSource: string): Array<{
    modelId: string
    name: string
    vendor: string
    description: string | null
    contextLength: number
    supportedParametersJson: string | null
    lastSeenSnapshotId: string | null
    isHidden: 0 | 1
    createdAtMs: number
    updatedAtMs: number
  }> {
    return this.listByRouterSourceStmt.all({ routerSource }) as any
  }
}
