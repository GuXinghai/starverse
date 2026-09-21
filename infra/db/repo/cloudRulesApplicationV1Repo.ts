import type BetterSqlite3 from 'better-sqlite3'
import {
  canonicalSourceFactDigestV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import { stableSerializeProviderRequestV2 } from
  '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  decodeCloudRulesReleaseDocumentV1,
  decodeCloudRulesReleaseMetadataV1,
  type CloudRulesReleaseDocumentV1,
  type CloudRulesReleaseMetadataV1,
} from '../../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import type { CloudRulesActivationOverrideV1 } from
  '../../../src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV1'

export const CLOUD_RULES_DEFAULT_HISTORY_LIMIT_V1 = 4
export const CLOUD_RULES_MIN_HISTORY_LIMIT_V1 = 0
export const CLOUD_RULES_MAX_HISTORY_LIMIT_V1 = 20

export type CloudRulesStoredSnapshotV1 = Readonly<{
  appliedRecordRevision: number
  releaseVersion: string
  contentRevision: string
  releaseMetadata: CloudRulesReleaseMetadataV1
  document: CloudRulesReleaseDocumentV1
  documentSha256: string
  rawAssetSha256: string
  appliedAtMs: number
  appliedEventId: number
}>

export type CloudRulesApplicationPolicyV1 = Readonly<{
  policyRevision: number
  historyLimit: number
  pin: Readonly<{ releaseVersion: string; contentRevision: string }> | null
  updatedAtMs: number
}>

export type CloudRulesActivationOverrideStateV1 = Readonly<{
  revision: number
  overrides: readonly CloudRulesActivationOverrideV1[]
  updatedAtMs: number
}>

export type CloudRulesApplicationStateV1 = Readonly<{
  applied: CloudRulesStoredSnapshotV1 | null
  appliedIntegrity: 'missing' | 'valid' | 'invalid'
  appliedRecordRevision: number | null
  policy: CloudRulesApplicationPolicyV1
  overrides: CloudRulesActivationOverrideStateV1
}>

export type CloudRulesInstallTargetV1 = Readonly<{
  releaseVersion: string
  contentRevision: string
  releaseMetadata: CloudRulesReleaseMetadataV1
  document: CloudRulesReleaseDocumentV1
  documentSha256: string
  rawAssetSha256: string
}>

export class CloudRulesApplicationV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_INVALID'
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_STALE'
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_LKG_CORRUPT'
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_HISTORY_NOT_FOUND') {
    super(code)
    this.name = 'CloudRulesApplicationV1RepoError'
  }
}

function invalid(): never {
  throw new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_INVALID')
}

function safeInteger(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid()
  return value as number
}

function json(value: unknown): unknown {
  if (typeof value !== 'string') invalid()
  try { return JSON.parse(value) as unknown } catch { return invalid() }
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

function contentRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

function decodeTarget(value: CloudRulesInstallTargetV1): CloudRulesInstallTargetV1 {
  const document = decodeCloudRulesReleaseDocumentV1(value.document, value.releaseVersion)
  const releaseMetadata = decodeCloudRulesReleaseMetadataV1(value.releaseMetadata)
  const documentSha256 = digest(value.documentSha256)
  const rawAssetSha256 = digest(value.rawAssetSha256)
  if (releaseMetadata.releaseVersion !== document.releaseVersion ||
      document.contentRevision !== contentRevision(value.contentRevision) ||
      canonicalSourceFactDigestV1(document) !== documentSha256) invalid()
  return Object.freeze({ releaseVersion: document.releaseVersion,
    contentRevision: document.contentRevision, releaseMetadata, document,
    documentSha256, rawAssetSha256 })
}

function decodeSnapshotRow(row: Record<string, unknown>): CloudRulesStoredSnapshotV1 {
  const target = decodeTarget({
    releaseVersion: String(row.release_version),
    contentRevision: String(row.content_revision),
    releaseMetadata: json(row.release_metadata_json) as CloudRulesReleaseMetadataV1,
    document: json(row.document_json) as CloudRulesReleaseDocumentV1,
    documentSha256: String(row.document_sha256),
    rawAssetSha256: String(row.raw_asset_sha256),
  })
  return Object.freeze({ ...target,
    appliedRecordRevision: safeInteger(row.applied_record_revision, 1),
    appliedAtMs: safeInteger(row.applied_at_ms),
    appliedEventId: safeInteger(row.applied_event_id, 1) })
}

function normalizeOverrides(values: readonly CloudRulesActivationOverrideV1[]): readonly CloudRulesActivationOverrideV1[] {
  if (!Array.isArray(values) || values.length > 100_000) invalid()
  const keys = new Set<string>()
  const normalized = values.map((value) => {
    if (!value || typeof value !== 'object') return invalid()
    if (value.kind === 'pack') {
      if (typeof value.packId !== 'string' || value.packId.length < 1 || value.packId.length > 256 ||
          (value.mode === undefined && value.target === undefined) ||
          (value.mode !== undefined && value.mode !== 'override' && value.mode !== 'default_only' &&
            value.mode !== 'no_control') ||
          (value.target !== undefined && value.target !== 'enabled' && value.target !== 'disabled')) invalid()
      const entry = Object.freeze({ kind: 'pack' as const, packId: value.packId,
        ...(value.mode === undefined ? {} : { mode: value.mode }),
        ...(value.target === undefined ? {} : { target: value.target }) })
      const key = `pack\0${entry.packId}`
      if (keys.has(key)) invalid()
      keys.add(key)
      return entry
    }
    if (value.kind !== 'rule' || typeof value.ruleId !== 'string' || value.ruleId.length < 1 ||
        value.ruleId.length > 256 || (value.configured !== 'default' && value.configured !== 'on' &&
          value.configured !== 'off')) invalid()
    const entry = Object.freeze({ kind: 'rule' as const, ruleId: value.ruleId,
      configured: value.configured })
    const key = `rule\0${entry.ruleId}`
    if (keys.has(key)) invalid()
    keys.add(key)
    return entry
  }).sort((left, right) => {
    const leftId = left.kind === 'pack' ? left.packId : left.ruleId
    const rightId = right.kind === 'pack' ? right.packId : right.ruleId
    return `${left.kind}\0${leftId}`.localeCompare(`${right.kind}\0${rightId}`, 'en')
  })
  return Object.freeze(normalized)
}

export class CloudRulesApplicationV1Repo {
  private savepointSequence = 0

  constructor(private readonly db: BetterSqlite3.Database, private readonly nowMs: () => number = Date.now) {}

  readState(): CloudRulesApplicationStateV1 {
    let applied: CloudRulesStoredSnapshotV1 | null = null
    let appliedIntegrity: CloudRulesApplicationStateV1['appliedIntegrity'] = 'missing'
    const row = this.db.prepare(`SELECT applied_record_revision, release_version, content_revision,
      release_metadata_json, document_json, document_sha256, raw_asset_sha256, applied_at_ms,
      applied_event_id FROM cloud_rules_applied_snapshot_v1 WHERE singleton_id=1`).get() as
      Record<string, unknown> | undefined
    if (row) {
      try { applied = decodeSnapshotRow(row); appliedIntegrity = 'valid' } catch {
        appliedIntegrity = 'invalid'
      }
    }
    const appliedRecordRevision = row && Number.isSafeInteger(row.applied_record_revision) &&
      (row.applied_record_revision as number) >= 1 ? row.applied_record_revision as number : null
    return Object.freeze({ applied, appliedIntegrity, appliedRecordRevision, policy: this.readPolicy(),
      overrides: this.readOverrides() })
  }

  readAppliedOrThrow(): CloudRulesStoredSnapshotV1 | null {
    const state = this.readState()
    if (state.appliedIntegrity === 'invalid') {
      throw new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_LKG_CORRUPT')
    }
    return state.applied
  }

  listHistory(): readonly CloudRulesStoredSnapshotV1[] {
    const rows = this.db.prepare(`SELECT applied_record_revision, release_version, content_revision,
      release_metadata_json, document_json, document_sha256, raw_asset_sha256, applied_at_ms,
      applied_event_id FROM cloud_rules_applied_history_v1
      ORDER BY applied_record_revision DESC, history_id DESC`).all() as Record<string, unknown>[]
    return Object.freeze(rows.map(decodeSnapshotRow))
  }

  readPolicy(): CloudRulesApplicationPolicyV1 {
    const row = this.db.prepare(`SELECT policy_revision, history_limit, pinned_release_version,
      pinned_content_revision, updated_at_ms FROM cloud_rules_application_policy_v1
      WHERE singleton_id=1`).get() as Record<string, unknown> | undefined
    if (!row) return Object.freeze({ policyRevision: 0, historyLimit: CLOUD_RULES_DEFAULT_HISTORY_LIMIT_V1,
      pin: null, updatedAtMs: 0 })
    const policyRevision = safeInteger(row.policy_revision)
    const historyLimit = safeInteger(row.history_limit)
    if (historyLimit > CLOUD_RULES_MAX_HISTORY_LIMIT_V1) invalid()
    const releaseVersion = row.pinned_release_version
    const pinnedRevision = row.pinned_content_revision
    if ((releaseVersion === null) !== (pinnedRevision === null)) invalid()
    const pin = releaseVersion === null ? null : Object.freeze({ releaseVersion: String(releaseVersion),
      contentRevision: contentRevision(pinnedRevision) })
    return Object.freeze({ policyRevision, historyLimit, pin, updatedAtMs: safeInteger(row.updated_at_ms) })
  }

  readOverrides(): CloudRulesActivationOverrideStateV1 {
    const state = this.db.prepare(`SELECT override_revision, updated_at_ms
      FROM cloud_rules_activation_override_state_v1 WHERE singleton_id=1`).get() as
      Record<string, unknown> | undefined
    const rows = this.db.prepare(`SELECT identity_kind, identity_id, field_name, field_value
      FROM cloud_rules_activation_override_v1 ORDER BY identity_kind, identity_id, field_name`).all() as
      Record<string, unknown>[]
    const packs = new Map<string, { mode?: 'override' | 'default_only' | 'no_control'; target?: 'enabled' | 'disabled' }>()
    const rules: CloudRulesActivationOverrideV1[] = []
    for (const row of rows) {
      if (row.identity_kind === 'pack') {
        const entry = packs.get(String(row.identity_id)) ?? {}
        if (row.field_name === 'mode' && (row.field_value === 'override' ||
            row.field_value === 'default_only' || row.field_value === 'no_control')) entry.mode = row.field_value
        else if (row.field_name === 'target' && (row.field_value === 'enabled' || row.field_value === 'disabled')) {
          entry.target = row.field_value
        } else invalid()
        packs.set(String(row.identity_id), entry)
      } else if (row.identity_kind === 'rule' && row.field_name === 'configured' &&
          (row.field_value === 'default' || row.field_value === 'on' || row.field_value === 'off')) {
        rules.push(Object.freeze({ kind: 'rule', ruleId: String(row.identity_id), configured: row.field_value }))
      } else invalid()
    }
    const overrides = normalizeOverrides([
      ...[...packs.entries()].map(([packId, value]) => Object.freeze({ kind: 'pack' as const, packId, ...value })),
      ...rules,
    ])
    if (!state && overrides.length > 0) invalid()
    return Object.freeze({ revision: state ? safeInteger(state.override_revision) : 0, overrides,
      updatedAtMs: state ? safeInteger(state.updated_at_ms) : 0 })
  }

  replaceOverrides(input: Readonly<{
    expectedRevision: number
    overrides: readonly CloudRulesActivationOverrideV1[]
  }>): CloudRulesActivationOverrideStateV1 {
    const expected = safeInteger(input.expectedRevision)
    const overrides = normalizeOverrides(input.overrides)
    return this.runImmediate(() => this.writeOverrides(expected, overrides))
  }

  setHistoryLimit(input: Readonly<{ expectedPolicyRevision: number; historyLimit: number }>): CloudRulesApplicationPolicyV1 {
    const expected = safeInteger(input.expectedPolicyRevision)
    const historyLimit = safeInteger(input.historyLimit)
    if (historyLimit > CLOUD_RULES_MAX_HISTORY_LIMIT_V1) invalid()
    return this.runImmediate(() => {
      const current = this.readPolicy()
      if (current.policyRevision !== expected) this.stale()
      this.writePolicy({ policyRevision: current.policyRevision + 1, historyLimit,
        pin: current.pin, updatedAtMs: Math.max(safeInteger(this.nowMs()), current.updatedAtMs) })
      this.pruneHistory(historyLimit)
      return this.readPolicy()
    })
  }

  resumeUpdates(input: Readonly<{ expectedPolicyRevision: number }>): CloudRulesApplicationPolicyV1 {
    const expected = safeInteger(input.expectedPolicyRevision)
    return this.runImmediate(() => {
      const current = this.readPolicy()
      if (current.policyRevision !== expected) this.stale()
      this.writePolicy({ ...current, policyRevision: current.policyRevision + 1, pin: null,
        updatedAtMs: Math.max(safeInteger(this.nowMs()), current.updatedAtMs) })
      return this.readPolicy()
    })
  }

  commitInstall(input: Readonly<{
    expectedAppliedRecordRevision: number | null
    target: CloudRulesInstallTargetV1
    eventKind: 'apply' | 'rollback'
    expectedHistoryTargetRecordRevision?: number
    retainedOverrides: readonly CloudRulesActivationOverrideV1[]
    pinTarget: boolean
    eventMetadata?: Readonly<Record<string, unknown>>
  }>): CloudRulesStoredSnapshotV1 {
    const target = decodeTarget(input.target)
    const overrides = normalizeOverrides(input.retainedOverrides)
    return this.runImmediate(() => {
      const applicationState = this.readState()
      const current = applicationState.appliedIntegrity === 'valid' ? applicationState.applied : null
      if (applicationState.appliedIntegrity === 'invalid' && applicationState.appliedRecordRevision === null) {
        throw new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_LKG_CORRUPT')
      }
      if (applicationState.appliedRecordRevision !== input.expectedAppliedRecordRevision) this.stale()
      let rollbackTarget: CloudRulesStoredSnapshotV1 | null = null
      if (input.eventKind === 'rollback') {
        const expected = input.expectedHistoryTargetRecordRevision
        if (!Number.isSafeInteger(expected) || (expected as number) < 1) invalid()
        rollbackTarget = this.listHistory().find((entry) => entry.appliedRecordRevision === expected) ?? null
        if (!rollbackTarget) {
          throw new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_HISTORY_NOT_FOUND')
        }
        if (rollbackTarget.contentRevision !== target.contentRevision ||
            rollbackTarget.releaseVersion !== target.releaseVersion) this.stale()
      } else if (input.expectedHistoryTargetRecordRevision !== undefined) invalid()

      const nextRevision = (applicationState.appliedRecordRevision ?? 0) + 1
      if (!Number.isSafeInteger(nextRevision)) invalid()
      const now = safeInteger(this.nowMs())
      const metadataJson = stableSerializeProviderRequestV2(input.eventMetadata ?? {})
      const event = this.db.prepare(`INSERT INTO cloud_rules_apply_event_v1 (
        event_kind, release_version, content_revision, previous_content_revision,
        event_metadata_json, occurred_at_ms, applied_record_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.eventKind, target.releaseVersion,
        target.contentRevision, current?.contentRevision ?? null, metadataJson, now, nextRevision)
      const eventId = safeInteger(event.lastInsertRowid, 1)
      if (rollbackTarget) {
        this.db.prepare(`DELETE FROM cloud_rules_applied_history_v1
          WHERE applied_record_revision=?`).run(rollbackTarget.appliedRecordRevision)
      }
      if (current) this.insertHistory(current)
      this.db.prepare(`INSERT INTO cloud_rules_applied_snapshot_v1 (
        singleton_id, applied_record_revision, release_version, content_revision,
        release_metadata_json, document_json, document_sha256, raw_asset_sha256,
        applied_at_ms, applied_event_id
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET
        applied_record_revision=excluded.applied_record_revision,
        release_version=excluded.release_version,
        content_revision=excluded.content_revision,
        release_metadata_json=excluded.release_metadata_json,
        document_json=excluded.document_json,
        document_sha256=excluded.document_sha256,
        raw_asset_sha256=excluded.raw_asset_sha256,
        applied_at_ms=excluded.applied_at_ms,
        applied_event_id=excluded.applied_event_id`).run(nextRevision, target.releaseVersion,
        target.contentRevision, stableSerializeProviderRequestV2(target.releaseMetadata),
        stableSerializeProviderRequestV2(target.document), target.documentSha256,
        target.rawAssetSha256, now, eventId)
      const overrideState = this.readOverrides()
      this.writeOverrides(overrideState.revision, overrides)
      const policy = this.readPolicy()
      this.writePolicy({ ...policy, policyRevision: policy.policyRevision + 1,
        pin: input.pinTarget ? Object.freeze({ releaseVersion: target.releaseVersion,
          contentRevision: target.contentRevision }) : null,
        updatedAtMs: Math.max(now, policy.updatedAtMs) })
      this.pruneHistory(policy.historyLimit)
      return this.readAppliedOrThrow()!
    })
  }

  private writeOverrides(expectedRevision: number,
    overrides: readonly CloudRulesActivationOverrideV1[]): CloudRulesActivationOverrideStateV1 {
    const current = this.readOverrides()
    if (current.revision !== expectedRevision) this.stale()
    const now = Math.max(safeInteger(this.nowMs()), current.updatedAtMs)
    this.db.prepare('DELETE FROM cloud_rules_activation_override_v1').run()
    const insert = this.db.prepare(`INSERT INTO cloud_rules_activation_override_v1 (
      identity_kind, identity_id, field_name, field_value, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?)`)
    for (const override of overrides) {
      if (override.kind === 'pack') {
        if (override.mode !== undefined) insert.run('pack', override.packId, 'mode', override.mode, now)
        if (override.target !== undefined) insert.run('pack', override.packId, 'target', override.target, now)
      } else insert.run('rule', override.ruleId, 'configured', override.configured, now)
    }
    this.db.prepare(`INSERT INTO cloud_rules_activation_override_state_v1 (
      singleton_id, override_revision, updated_at_ms
    ) VALUES (1, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET
      override_revision=excluded.override_revision, updated_at_ms=excluded.updated_at_ms`).run(
      current.revision + 1, now)
    return this.readOverrides()
  }

  private insertHistory(snapshot: CloudRulesStoredSnapshotV1): void {
    this.db.prepare(`INSERT INTO cloud_rules_applied_history_v1 (
      applied_record_revision, release_version, content_revision, release_metadata_json,
      document_json, document_sha256, raw_asset_sha256, applied_at_ms, applied_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(snapshot.appliedRecordRevision,
      snapshot.releaseVersion, snapshot.contentRevision,
      stableSerializeProviderRequestV2(snapshot.releaseMetadata),
      stableSerializeProviderRequestV2(snapshot.document), snapshot.documentSha256,
      snapshot.rawAssetSha256, snapshot.appliedAtMs, snapshot.appliedEventId)
  }

  private pruneHistory(limit: number): void {
    this.db.prepare(`DELETE FROM cloud_rules_applied_history_v1 WHERE history_id IN (
      SELECT history_id FROM cloud_rules_applied_history_v1
      ORDER BY applied_record_revision DESC, history_id DESC LIMIT -1 OFFSET ?
    )`).run(limit)
  }

  private writePolicy(policy: CloudRulesApplicationPolicyV1): void {
    this.db.prepare(`INSERT INTO cloud_rules_application_policy_v1 (
      singleton_id, policy_revision, history_limit, pinned_release_version,
      pinned_content_revision, updated_at_ms
    ) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(singleton_id) DO UPDATE SET
      policy_revision=excluded.policy_revision, history_limit=excluded.history_limit,
      pinned_release_version=excluded.pinned_release_version,
      pinned_content_revision=excluded.pinned_content_revision,
      updated_at_ms=excluded.updated_at_ms`).run(policy.policyRevision, policy.historyLimit,
      policy.pin?.releaseVersion ?? null, policy.pin?.contentRevision ?? null, policy.updatedAtMs)
  }

  private stale(): never {
    throw new CloudRulesApplicationV1RepoError('GENERATION_V2_CLOUD_RULES_APPLICATION_STALE')
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.savepointSequence += 1
    const savepoint = `cloud_rules_application_v1_${this.savepointSequence}`
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
