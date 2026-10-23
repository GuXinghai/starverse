import BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from '../../../src/core/generation-v2/compiler/stableSerialize'
import {
  projectCapabilityRuleOwnershipSnapshotV2,
  type ProjectedCapabilityRuleOwnershipSnapshotV2,
} from '../../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'

type SnapshotRow = Readonly<{
  ownership: unknown
  owner_id: unknown
  snapshot_revision: unknown
  content_digest: unknown
  snapshot_json: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
}>

export type CapabilityRuleOwnershipSnapshotFactV2 = Readonly<{
  projected: ProjectedCapabilityRuleOwnershipSnapshotV2
  createdAtMs: number
  updatedAtMs: number
}>

export type PreparedCapabilityRuleOwnershipSnapshotWriteV2 = Readonly<{
  projected: ProjectedCapabilityRuleOwnershipSnapshotV2
  snapshotJson: string
}>

export class CapabilityRuleCoreV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_CORE_REPOSITORY_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION') {
    super(code)
    this.name = 'CapabilityRuleCoreV2RepoError'
  }
}

function invalid(): never {
  throw new CapabilityRuleCoreV2RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_REPOSITORY_INVALID')
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid()
  return value as number
}

function snapshotIdentity(value: unknown): Readonly<{ ownership: 'cloud' | 'user'; ownerId: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const snapshot = value as Record<string, unknown>
  if (snapshot.schemaVersion !== 2 || (snapshot.ownership !== 'cloud' && snapshot.ownership !== 'user') ||
      typeof snapshot.ownerId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(snapshot.ownerId)) invalid()
  return Object.freeze({ ownership: snapshot.ownership, ownerId: snapshot.ownerId })
}

function parseSnapshotJson(value: unknown): unknown {
  if (typeof value !== 'string') invalid()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalid()
  }
}

function decodeSnapshotRow(row: SnapshotRow): CapabilityRuleOwnershipSnapshotFactV2 {
  const snapshotValue = parseSnapshotJson(row.snapshot_json)
  const identity = snapshotIdentity(snapshotValue)
  if (row.ownership !== identity.ownership || row.owner_id !== identity.ownerId ||
      typeof row.snapshot_revision !== 'string' || typeof row.content_digest !== 'string' ||
      typeof row.snapshot_json !== 'string') invalid()
  const projected = projectCapabilityRuleOwnershipSnapshotV2(snapshotValue)
  if (projected.snapshotRevision !== row.snapshot_revision || projected.contentDigest !== row.content_digest ||
      stableSerializeProviderRequestV2(projected.definition) !== row.snapshot_json) invalid()
  const createdAtMs = safeTime(row.created_at_ms)
  const updatedAtMs = safeTime(row.updated_at_ms)
  if (updatedAtMs < createdAtMs) invalid()
  return Object.freeze({ projected, createdAtMs, updatedAtMs })
}

export function prepareCapabilityRuleOwnershipSnapshotWriteV2(
  snapshot: unknown,
): PreparedCapabilityRuleOwnershipSnapshotWriteV2 {
  const projected = projectCapabilityRuleOwnershipSnapshotV2(snapshot)
  return Object.freeze({ projected, snapshotJson: stableSerializeProviderRequestV2(projected.definition) })
}

export class CapabilityRuleCoreV2Repo {
  private savepointSequence = 0

  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalid()
  }

  readOwnershipSnapshot(input: Readonly<{ ownership: 'cloud' | 'user'; ownerId: string }>): CapabilityRuleOwnershipSnapshotFactV2 | null {
    const row = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
      snapshot_json, created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v2
      WHERE ownership = ? AND owner_id = ?`).get(input.ownership, input.ownerId) as SnapshotRow | undefined
    return row ? decodeSnapshotRow(row) : null
  }

  listOwnershipSnapshots(): readonly CapabilityRuleOwnershipSnapshotFactV2[] {
    const rows = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
      snapshot_json, created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v2
      ORDER BY ownership, owner_id`).all() as SnapshotRow[]
    return Object.freeze(rows.map(decodeSnapshotRow))
  }

  /**
   * Like listOwnershipSnapshots, but a row that no longer decodes is reported instead of thrown, so one bad owner
   * row cannot block a save that does not touch that owner. The row stays in place; nothing is deleted.
   */
  listReadableOwnershipSnapshots(): Readonly<{
    snapshots: readonly CapabilityRuleOwnershipSnapshotFactV2[]
    unreadable: readonly Readonly<{ ownership: string; ownerId: string }>[]
  }> {
    const rows = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
      snapshot_json, created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v2
      ORDER BY ownership, owner_id`).all() as SnapshotRow[]
    const snapshots: CapabilityRuleOwnershipSnapshotFactV2[] = []
    const unreadable: Array<Readonly<{ ownership: string; ownerId: string }>> = []
    for (const row of rows) {
      try { snapshots.push(decodeSnapshotRow(row)) } catch {
        unreadable.push(Object.freeze({ ownership: String(row.ownership), ownerId: String(row.owner_id) }))
      }
    }
    return Object.freeze({ snapshots: Object.freeze(snapshots), unreadable: Object.freeze(unreadable) })
  }

  replaceOwnershipSnapshot(input: Readonly<{
    expectedSnapshotRevision: string | null
    snapshot: unknown
  }>): CapabilityRuleOwnershipSnapshotFactV2 {
    return this.replacePreparedOwnershipSnapshot({ expectedSnapshotRevision: input.expectedSnapshotRevision,
      prepared: prepareCapabilityRuleOwnershipSnapshotWriteV2(input.snapshot) })
  }

  /** Removes a superseded V2 owner row while preserving compare-and-swap semantics. */
  deleteOwnershipSnapshot(input: Readonly<{
    ownership: 'cloud' | 'user'
    ownerId: string
    expectedSnapshotRevision: string | null
  }>): boolean {
    const ownerId = input.ownerId
    if (typeof ownerId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(ownerId)) invalid()
    return this.runImmediate(() => {
      const current = this.readOwnershipSnapshot({ ownership: input.ownership, ownerId })
      if ((current?.projected.snapshotRevision ?? null) !== input.expectedSnapshotRevision) {
        throw new CapabilityRuleCoreV2RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION')
      }
      if (!current) return false
      this.db.prepare(`DELETE FROM capability_rule_owner_snapshot_v2 WHERE ownership=? AND owner_id=?`)
        .run(input.ownership, ownerId)
      return true
    })
  }

  replacePreparedOwnershipSnapshot(input: Readonly<{
    expectedSnapshotRevision: string | null
    prepared: PreparedCapabilityRuleOwnershipSnapshotWriteV2
  }>): CapabilityRuleOwnershipSnapshotFactV2 {
    const prepared = input.prepared
    const { definition, snapshotRevision, contentDigest } = prepared.projected
    const run = (): CapabilityRuleOwnershipSnapshotFactV2 => {
      const row = this.db.prepare(`SELECT ownership, owner_id, snapshot_revision, content_digest,
        snapshot_json, created_at_ms, updated_at_ms FROM capability_rule_owner_snapshot_v2
        WHERE ownership = ? AND owner_id = ?`).get(definition.ownership, definition.ownerId) as SnapshotRow | undefined
      const current = row ? decodeSnapshotRow(row) : null
      if ((current?.projected.snapshotRevision ?? null) !== input.expectedSnapshotRevision) {
        throw new CapabilityRuleCoreV2RepoError('GENERATION_V2_CAPABILITY_RULE_CORE_STALE_REVISION')
      }
      if (current?.projected.snapshotRevision === snapshotRevision) {
        if (current.projected.contentDigest !== contentDigest ||
            prepared.snapshotJson !== stableSerializeProviderRequestV2(current.projected.definition)) invalid()
        return current
      }
      const now = Math.max(safeTime(this.nowMs()), current?.updatedAtMs ?? 0)
      const createdAtMs = current?.createdAtMs ?? now
      this.db.prepare(`INSERT INTO capability_rule_owner_snapshot_v2 (
        ownership, owner_id, snapshot_revision, content_digest, snapshot_json, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ownership, owner_id) DO UPDATE SET
        snapshot_revision = excluded.snapshot_revision,
        content_digest = excluded.content_digest,
        snapshot_json = excluded.snapshot_json,
        updated_at_ms = excluded.updated_at_ms`).run(definition.ownership, definition.ownerId,
        snapshotRevision, contentDigest, prepared.snapshotJson, createdAtMs, now)
      return Object.freeze({ projected: prepared.projected, createdAtMs, updatedAtMs: now })
    }
    return this.runImmediate(run)
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.savepointSequence += 1
    const savepoint = `capability_rule_core_v2_${this.savepointSequence}`
    this.db.exec(`SAVEPOINT ${savepoint}`)
    try {
      const result = run()
      this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      } catch {
        return invalid()
      }
      throw error
    }
  }
}

/** Lists validated V2 owner snapshots, keeping Cloud and User ownership separate. */
export function listCapabilityRuleOwnershipSnapshotsV2(
  db: BetterSqlite3.Database,
): readonly CapabilityRuleOwnershipSnapshotFactV2[] {
  return new CapabilityRuleCoreV2Repo(db).listOwnershipSnapshots()
}

/**
 * The owner snapshots that still decode. Request-rule publication uses this on both its prepare and write sides, so
 * one owner row that no longer decodes is left out consistently instead of blocking every save (R4-09, P3a-07).
 */
export function listReadableCapabilityRuleOwnershipSnapshotsV2(
  db: BetterSqlite3.Database,
): readonly CapabilityRuleOwnershipSnapshotFactV2[] {
  return new CapabilityRuleCoreV2Repo(db).listReadableOwnershipSnapshots().snapshots
}

/** Returns the validated applied Cloud baseline owned by the official release source, if present. */
export function readAppliedCloudCapabilityRuleOwnershipSnapshotV2(
  db: BetterSqlite3.Database,
): CapabilityRuleOwnershipSnapshotFactV2 | null {
  return new CapabilityRuleCoreV2Repo(db).readOwnershipSnapshot({ ownership: 'cloud', ownerId: 'official' })
}
