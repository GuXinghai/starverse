import BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database

export type ReasoningModelIndexRow = Readonly<{
  modelId: string
  name: string
  status: 'visible' | 'hidden'
  lastSyncedSnapshot: string
  createdAtMs: number
  updatedAtMs: number
}>

export class ReasoningModelIndexRepo {
  private upsertStmt: BetterSqlite3.Statement
  private hideStmt: BetterSqlite3.Statement
  private listStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO reasoning_model_index (
        model_id,
        name,
        status,
        last_synced_snapshot,
        created_at_ms,
        updated_at_ms
      )
      VALUES (
        @modelId,
        @name,
        @status,
        @lastSyncedSnapshot,
        @nowMs,
        @nowMs
      )
      ON CONFLICT(model_id) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        last_synced_snapshot = excluded.last_synced_snapshot,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.hideStmt = this.db.prepare(`
      UPDATE reasoning_model_index
      SET status = 'hidden',
          last_synced_snapshot = @lastSyncedSnapshot,
          updated_at_ms = @nowMs
      WHERE model_id = @modelId
    `)

    this.listStmt = this.db.prepare(`
      SELECT
        model_id AS modelId,
        name,
        status,
        last_synced_snapshot AS lastSyncedSnapshot,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM reasoning_model_index
      ORDER BY
        CASE status WHEN 'visible' THEN 0 ELSE 1 END,
        name COLLATE NOCASE,
        model_id
    `)
  }

  listAll(): ReasoningModelIndexRow[] {
    return (this.listStmt.all() as any[]).map((row) => ({
      modelId: String(row.modelId),
      name: String(row.name),
      status: row.status === 'visible' ? 'visible' : 'hidden',
      lastSyncedSnapshot: String(row.lastSyncedSnapshot),
      createdAtMs: Number(row.createdAtMs),
      updatedAtMs: Number(row.updatedAtMs),
    }))
  }

  /**
   * Build/sync reasoning_model_index from model_catalog.
   *
   * Rules:
   * - The input source of truth is SQLite model_catalog.
   * - Determine the most recent successful snapshot as MAX(last_seen_snapshot_id).
   * - A model is "reasoning-capable" iff supported_parameters includes 'reasoning'.
   * - Sync writes id/name/status only.
   * - Hidden models are still synced (status='hidden'), never filtered out.
   * - If an index entry no longer belongs to the reasoning set, mark it hidden (never delete).
   */
  syncFromCatalog(routerSource: string): { snapshotId: string | null } {
    const row = this.db
      .prepare(
        `
        SELECT MAX(last_seen_snapshot_id) AS snapshotId
        FROM model_catalog
        WHERE router_source = ?
          AND last_seen_snapshot_id IS NOT NULL
      `
      )
      .get(routerSource) as { snapshotId?: string | null } | undefined

    const snapshotId = row?.snapshotId ? String(row.snapshotId) : null
    if (!snapshotId) {
      // No successful catalog sync exists yet; do not mutate index.
      return { snapshotId: null }
    }

    const nowMs = Date.now()

    const catalogRows = this.db
      .prepare(
        `
        SELECT
          model_id AS modelId,
          name,
          supported_parameters_json AS supportedParametersJson,
          is_hidden AS isHidden
        FROM model_catalog
        WHERE router_source = ?
      `
      )
      .all(routerSource) as Array<{
      modelId: string
      name: string
      supportedParametersJson: string | null
      isHidden: number
    }>

    const reasoningSet = new Set<string>()
    const upserts: Array<{ modelId: string; name: string; status: 'visible' | 'hidden' }> = []

    for (const r of catalogRows) {
      const modelId = String(r.modelId)
      const name = String(r.name)
      const supported = safeParseStringArray(r.supportedParametersJson)
      const hasReasoning = supported.includes('reasoning')
      if (!hasReasoning) continue

      reasoningSet.add(modelId)
      const status: 'visible' | 'hidden' = r.isHidden === 1 ? 'hidden' : 'visible'
      upserts.push({ modelId, name, status })
    }

    const existingIndexIds = this.db
      .prepare(`SELECT model_id AS modelId FROM reasoning_model_index`)
      .all() as Array<{ modelId: string }>

    const tx = this.db.transaction(() => {
      for (const u of upserts) {
        this.upsertStmt.run({
          modelId: u.modelId,
          name: u.name,
          status: u.status,
          lastSyncedSnapshot: snapshotId,
          nowMs,
        })
      }

      for (const e of existingIndexIds) {
        const modelId = String(e.modelId)
        if (!reasoningSet.has(modelId)) {
          this.hideStmt.run({ modelId, lastSyncedSnapshot: snapshotId, nowMs })
        }
      }
    })

    tx()
    return { snapshotId }
  }
}

function safeParseStringArray(input: string | null): string[] {
  if (!input) return []
  try {
    const parsed = JSON.parse(input)
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x)).filter((x) => x.length > 0)
  } catch {
    return []
  }
}

