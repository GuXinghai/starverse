import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from
  '../../../src/next/generation-v2/compiler/stableSerialize'
import { canonicalSourceFactDigestV1 } from
  '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  projectCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleOwnershipSnapshotV1,
  type ProjectedCapabilityRuleOwnershipSnapshotV1,
} from '../../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import { USER_RULES_LOCAL_OWNER_ID_V1, type UserCapabilityRuleNoteV1 } from
  '../../../src/next/generation-v2/capability-rules/userRulePackTransferV1'
import { CapabilityRuleCoreV1Repo } from './capabilityRuleCoreV1Repo'

export type UserCapabilityRuleDraftV1 = Readonly<{
  sessionId: string
  ownerId: string
  baseSnapshotRevision: string | null
  baseContentDigest: string
  draftRevision: number
  projected: ProjectedCapabilityRuleOwnershipSnapshotV1
  notes: readonly UserCapabilityRuleNoteV1[]
  draftContentDigest: string
  dirty: boolean
  createdAtMs: number
  updatedAtMs: number
}>

export type UserCapabilityRuleCommittedNotesV1 = Readonly<{
  revision: number
  notes: readonly UserCapabilityRuleNoteV1[]
  updatedAtMs: number
}>

export class UserCapabilityRuleDraftV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_USER_CAPABILITY_RULE_DRAFT_INVALID'
    | 'GENERATION_V2_USER_CAPABILITY_RULE_DRAFT_STALE') {
    super(code)
    this.name = 'UserCapabilityRuleDraftV1RepoError'
  }
}

function invalid(): never {
  throw new UserCapabilityRuleDraftV1RepoError('GENERATION_V2_USER_CAPABILITY_RULE_DRAFT_INVALID')
}

function safeInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid()
  return value as number
}

function identity(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) invalid()
  return value
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') invalid()
  try { return JSON.parse(value) as unknown } catch { return invalid() }
}

function canonicalNotes(value: unknown, ruleIds: ReadonlySet<string>): readonly UserCapabilityRuleNoteV1[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid()
  const seen = new Set<string>()
  return Object.freeze(value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid()
    const item = entry as Record<string, unknown>
    if (Object.keys(item).sort().join('\0') !== ['note', 'ruleId'].sort().join('\0') ||
        typeof item.ruleId !== 'string' || !ruleIds.has(item.ruleId) || seen.has(item.ruleId) ||
        typeof item.note !== 'string' || item.note.length < 1 || item.note.length > 16_384 ||
        item.note.trim() !== item.note) invalid()
    seen.add(item.ruleId)
    return Object.freeze({ ruleId: item.ruleId, note: item.note })
  }).sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en')))
}

function contentDigest(projected: ProjectedCapabilityRuleOwnershipSnapshotV1,
  notes: readonly UserCapabilityRuleNoteV1[]): string {
  return canonicalSourceFactDigestV1({ snapshotRevision: projected.snapshotRevision, notes })
}

function projectDraft(snapshot: unknown, notesValue: unknown): Readonly<{
  projected: ProjectedCapabilityRuleOwnershipSnapshotV1
  notes: readonly UserCapabilityRuleNoteV1[]
  contentDigest: string
}> {
  const projected = projectCapabilityRuleOwnershipSnapshotV1(snapshot)
  if (projected.definition.ownership !== 'user' ||
      projected.definition.ownerId !== USER_RULES_LOCAL_OWNER_ID_V1) invalid()
  const ruleIds = new Set(projected.definition.packs.flatMap((pack) => pack.rules.map((rule) => rule.ruleId)))
  const notes = canonicalNotes(notesValue, ruleIds)
  return Object.freeze({ projected, notes, contentDigest: contentDigest(projected, notes) })
}

function emptySnapshot(): CapabilityRuleOwnershipSnapshotV1 {
  return Object.freeze({ schemaVersion: 1, ownership: 'user',
    ownerId: USER_RULES_LOCAL_OWNER_ID_V1, packs: Object.freeze([]) })
}

export class UserCapabilityRuleDraftV1Repo {
  readonly #coreRepo: CapabilityRuleCoreV1Repo
  #savepointSequence = 0

  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {
    this.#coreRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
  }

  readDraft(): UserCapabilityRuleDraftV1 | null {
    const row = this.db.prepare(`SELECT session_id, owner_id, base_snapshot_revision, base_content_digest,
      draft_revision, draft_snapshot_revision, draft_content_digest, draft_snapshot_json,
      draft_notes_json, created_at_ms, updated_at_ms
      FROM user_capability_rule_editing_session_v1 WHERE singleton_id=1`).get() as
      Record<string, unknown> | undefined
    if (!row) return null
    const projected = projectDraft(parseJson(row.draft_snapshot_json), parseJson(row.draft_notes_json))
    const draftContentDigest = digest(row.draft_content_digest)
    if (row.owner_id !== USER_RULES_LOCAL_OWNER_ID_V1 ||
        projected.projected.snapshotRevision !== row.draft_snapshot_revision ||
        projected.contentDigest !== draftContentDigest) invalid()
    const baseSnapshotRevision = row.base_snapshot_revision === null ? null : identity(row.base_snapshot_revision)
    const baseContentDigest = digest(row.base_content_digest)
    return Object.freeze({ sessionId: identity(row.session_id), ownerId: USER_RULES_LOCAL_OWNER_ID_V1,
      baseSnapshotRevision, baseContentDigest, draftRevision: safeInteger(row.draft_revision, 1),
      projected: projected.projected, notes: projected.notes, draftContentDigest,
      dirty: draftContentDigest !== baseContentDigest,
      createdAtMs: safeInteger(row.created_at_ms), updatedAtMs: safeInteger(row.updated_at_ms) })
  }

  openOrCreate(input: Readonly<{ sessionId: string }>): UserCapabilityRuleDraftV1 {
    const sessionId = identity(input.sessionId)
    return this.runImmediate(() => {
      const current = this.readDraft()
      if (current) return current
      const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
        ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
      const notes = this.readCommittedNotes().notes
      const projected = projectDraft(committed?.projected.definition ?? emptySnapshot(), notes)
      const now = safeInteger(this.nowMs())
      this.db.prepare(`INSERT INTO user_capability_rule_editing_session_v1 (
        singleton_id, session_id, owner_id, base_snapshot_revision, base_content_digest,
        draft_revision, draft_snapshot_revision, draft_content_digest, draft_snapshot_json,
        draft_notes_json, created_at_ms, updated_at_ms
      ) VALUES (1, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`).run(sessionId,
        USER_RULES_LOCAL_OWNER_ID_V1, committed?.projected.snapshotRevision ?? null,
        projected.contentDigest, projected.projected.snapshotRevision, projected.contentDigest,
        stableSerializeProviderRequestV2(projected.projected.definition),
        stableSerializeProviderRequestV2(projected.notes), now, now)
      return this.readDraft()!
    })
  }

  replaceDraft(input: Readonly<{
    expectedDraftRevision: number
    snapshot: unknown
    notes: readonly UserCapabilityRuleNoteV1[]
  }>): UserCapabilityRuleDraftV1 {
    const expected = safeInteger(input.expectedDraftRevision, 1)
    const prepared = projectDraft(input.snapshot, input.notes)
    return this.runImmediate(() => {
      const current = this.readDraft()
      if (!current || current.draftRevision !== expected) this.stale()
      const now = Math.max(safeInteger(this.nowMs()), current.updatedAtMs)
      this.db.prepare(`UPDATE user_capability_rule_editing_session_v1 SET
        draft_revision=?, draft_snapshot_revision=?, draft_content_digest=?,
        draft_snapshot_json=?, draft_notes_json=?, updated_at_ms=?
        WHERE singleton_id=1`).run(current.draftRevision + 1, prepared.projected.snapshotRevision,
        prepared.contentDigest, stableSerializeProviderRequestV2(prepared.projected.definition),
        stableSerializeProviderRequestV2(prepared.notes), now)
      return this.readDraft()!
    })
  }

  discard(input: Readonly<{ expectedDraftRevision: number }>): void {
    const expected = safeInteger(input.expectedDraftRevision, 1)
    this.runImmediate(() => {
      const current = this.readDraft()
      if (!current || current.draftRevision !== expected) this.stale()
      this.db.prepare('DELETE FROM user_capability_rule_editing_session_v1 WHERE singleton_id=1').run()
    })
  }

  deleteDraftExpected(input: Readonly<{ sessionId: string; expectedDraftRevision: number }>): void {
    const sessionId = identity(input.sessionId)
    const expected = safeInteger(input.expectedDraftRevision, 1)
    const current = this.readDraft()
    if (!current || current.sessionId !== sessionId || current.draftRevision !== expected) this.stale()
    this.db.prepare('DELETE FROM user_capability_rule_editing_session_v1 WHERE singleton_id=1').run()
  }

  readCommittedNotes(): UserCapabilityRuleCommittedNotesV1 {
    const state = this.db.prepare(`SELECT note_revision, updated_at_ms
      FROM user_capability_rule_note_state_v1 WHERE owner_id=?`).get(USER_RULES_LOCAL_OWNER_ID_V1) as
      Record<string, unknown> | undefined
    const rows = this.db.prepare(`SELECT rule_id, note FROM user_capability_rule_note_v1
      WHERE owner_id=? ORDER BY rule_id`).all(USER_RULES_LOCAL_OWNER_ID_V1) as Record<string, unknown>[]
    const committed = this.#coreRepo.readOwnershipSnapshot({ ownership: 'user',
      ownerId: USER_RULES_LOCAL_OWNER_ID_V1 })
    const ruleIds = new Set(committed?.projected.definition.packs.flatMap((pack) =>
      pack.rules.map((rule) => rule.ruleId)) ?? [])
    const notes = canonicalNotes(rows.map((row) => ({ ruleId: row.rule_id, note: row.note })), ruleIds)
    if (!state && notes.length > 0) invalid()
    return Object.freeze({ revision: state ? safeInteger(state.note_revision) : 0, notes,
      updatedAtMs: state ? safeInteger(state.updated_at_ms) : 0 })
  }

  replaceCommittedNotes(input: Readonly<{
    expectedRevision: number
    notes: readonly UserCapabilityRuleNoteV1[]
    committedSnapshot: CapabilityRuleOwnershipSnapshotV1
  }>): UserCapabilityRuleCommittedNotesV1 {
    const expected = safeInteger(input.expectedRevision)
    const projected = projectCapabilityRuleOwnershipSnapshotV1(input.committedSnapshot)
    if (projected.definition.ownership !== 'user' ||
        projected.definition.ownerId !== USER_RULES_LOCAL_OWNER_ID_V1) invalid()
    const ruleIds = new Set(projected.definition.packs.flatMap((pack) => pack.rules.map((rule) => rule.ruleId)))
    const notes = canonicalNotes(input.notes, ruleIds)
    const current = this.readCommittedNotes()
    if (current.revision !== expected) this.stale()
    const now = Math.max(safeInteger(this.nowMs()), current.updatedAtMs)
    this.db.prepare('DELETE FROM user_capability_rule_note_v1 WHERE owner_id=?')
      .run(USER_RULES_LOCAL_OWNER_ID_V1)
    const insert = this.db.prepare(`INSERT INTO user_capability_rule_note_v1 (
      owner_id, rule_id, note, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?)`)
    for (const note of notes) insert.run(USER_RULES_LOCAL_OWNER_ID_V1, note.ruleId, note.note, now, now)
    this.db.prepare(`INSERT INTO user_capability_rule_note_state_v1 (
      owner_id, note_revision, updated_at_ms
    ) VALUES (?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET
      note_revision=excluded.note_revision, updated_at_ms=excluded.updated_at_ms`).run(
      USER_RULES_LOCAL_OWNER_ID_V1, current.revision + 1, now)
    return this.readCommittedNotes()
  }

  private stale(): never {
    throw new UserCapabilityRuleDraftV1RepoError('GENERATION_V2_USER_CAPABILITY_RULE_DRAFT_STALE')
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.#savepointSequence += 1
    const savepoint = `user_capability_rule_draft_v1_${this.#savepointSequence}`
    this.db.exec(`SAVEPOINT ${savepoint}`)
    try {
      const result = run()
      this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      try {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      } catch { return invalid() }
      throw error
    }
  }
}
