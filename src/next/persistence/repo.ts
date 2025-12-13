import type { MessageState, RootState, SessionState } from '../state/types'

type BetterSqliteStatement = {
  run(params?: any): any
  get(params?: any): any
}

type BetterSqliteDatabase = {
  prepare(sql: string): BetterSqliteStatement
}

export type SessionSnapshot = Readonly<{
  schemaVersion: 1
  session: SessionState
  messages: MessageState[]
}>

export function toSessionSnapshot(state: RootState, sessionId: string): SessionSnapshot {
  const session = state.sessions[sessionId]
  if (!session) throw new Error(`session not found: ${sessionId}`)
  const ids = state.sessionMessageIds[sessionId] || []
  const messages = ids.map((id) => state.messages[id]).filter((m): m is MessageState => !!m)

  const snapshot: SessionSnapshot = {
    schemaVersion: 1,
    session,
    messages,
  }

  // Ensure the snapshot is JSON-serializable and stable for round-trip equality checks.
  // This does not infer business semantics; it only removes non-serializable shapes (e.g. `undefined` fields).
  return JSON.parse(JSON.stringify(snapshot)) as SessionSnapshot
}

export class NextSessionSnapshotRepo {
  private readonly db: BetterSqliteDatabase
  private readonly upsertStmt: BetterSqliteStatement
  private readonly getStmt: BetterSqliteStatement

  constructor(db: BetterSqliteDatabase) {
    this.db = db
    this.upsertStmt = db.prepare(
      `INSERT INTO next_session_snapshots (session_id, snapshot_json, schema_version, updated_at_ms)
       VALUES (@sessionId, @snapshotJson, @schemaVersion, @updatedAtMs)
       ON CONFLICT(session_id) DO UPDATE SET
         snapshot_json=excluded.snapshot_json,
         schema_version=excluded.schema_version,
         updated_at_ms=excluded.updated_at_ms`
    )
    this.getStmt = db.prepare(`SELECT snapshot_json AS snapshotJson FROM next_session_snapshots WHERE session_id = ?`)
  }

  save(sessionId: string, snapshot: SessionSnapshot): { upserted: number } {
    const result = this.upsertStmt.run({
      sessionId,
      snapshotJson: JSON.stringify(snapshot),
      schemaVersion: snapshot.schemaVersion,
      updatedAtMs: Date.now(),
    })
    const changes = typeof result?.changes === 'number' ? result.changes : 1
    return { upserted: changes }
  }

  get(sessionId: string): SessionSnapshot | null {
    const row = this.getStmt.get(sessionId) as { snapshotJson?: string } | undefined
    const raw = row?.snapshotJson
    if (!raw) return null
    return JSON.parse(raw) as SessionSnapshot
  }
}
