import type { MessageState, RootState, RunState } from '../state/types'

type BetterSqliteStatement = {
  run(params?: any): any
  get(params?: any): any
}

type BetterSqliteDatabase = {
  prepare(sql: string): BetterSqliteStatement
}

export type RunSnapshot = Readonly<{
  schemaVersion: 1
  run: RunState
  messages: MessageState[]
}>

export function toRunSnapshot(state: RootState, runId: string): RunSnapshot {
  const run = state.runs[runId]
  if (!run) throw new Error(`run not found: ${runId}`)
  const ids = state.runMessageIds[runId] || []
  const messages = ids.map((id) => state.messages[id]).filter((m): m is MessageState => !!m)

  const snapshot: RunSnapshot = {
    schemaVersion: 1,
    run,
    messages,
  }

  // Ensure the snapshot is JSON-serializable and stable for round-trip equality checks.
  // This does not infer business semantics; it only removes non-serializable shapes (e.g. `undefined` fields).
  return JSON.parse(JSON.stringify(snapshot)) as RunSnapshot
}

export class NextRunSnapshotRepo {
  private readonly db: BetterSqliteDatabase
  private readonly upsertStmt: BetterSqliteStatement
  private readonly getStmt: BetterSqliteStatement

  constructor(db: BetterSqliteDatabase) {
    this.db = db
    this.upsertStmt = db.prepare(
      `INSERT INTO next_run_snapshots (run_id, snapshot_json, schema_version, updated_at_ms)
       VALUES (@runId, @snapshotJson, @schemaVersion, @updatedAtMs)
       ON CONFLICT(run_id) DO UPDATE SET
         snapshot_json=excluded.snapshot_json,
         schema_version=excluded.schema_version,
         updated_at_ms=excluded.updated_at_ms`
    )
    this.getStmt = db.prepare(`SELECT snapshot_json AS snapshotJson FROM next_run_snapshots WHERE run_id = ?`)
  }

  save(runId: string, snapshot: RunSnapshot): { upserted: number } {
    const result = this.upsertStmt.run({
      runId,
      snapshotJson: JSON.stringify(snapshot),
      schemaVersion: snapshot.schemaVersion,
      updatedAtMs: Date.now(),
    })
    const changes = typeof result?.changes === 'number' ? result.changes : 1
    return { upserted: changes }
  }

  get(runId: string): RunSnapshot | null {
    const row = this.getStmt.get(runId) as { snapshotJson?: string } | undefined
    const raw = row?.snapshotJson
    if (!raw) return null
    return JSON.parse(raw) as RunSnapshot
  }
}
