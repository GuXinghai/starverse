import type BetterSqlite3 from 'better-sqlite3'
import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  decodeResolvedModelFactsV1,
  type ResolvedModelFactsV1,
} from '../../../src/next/generation-v2/model-facts/resolvedModelFactsV1'
import {
  stableSerializeProviderRequestBoundedV2,
  stableSerializeProviderRequestV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'

const REVISION = /^resolved-model-facts-snapshot-v1:[0-9a-f]{64}$/u
const CAPABILITY_REVISION = /^capability-revision-v1:[0-9a-f]{64}$/u
const MAX_JSON_BYTES = 16 * 1024 * 1024

export type ResolvedModelFactsSourceScopeSelectionV1 = Readonly<{
  providerNative: string
  modelsDev: string
  capabilityRules: string
}>

export type ResolvedModelFactsSnapshotV1 = Readonly<{
  resolvedSnapshotRevision: string
  subject: CanonicalModelSubjectV1
  sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
  resolvedFacts: ResolvedModelFactsV1
  createdAtMs: number
}>

export type ResolvedModelFactsCurrentV1 = Readonly<{
  subject: CanonicalModelSubjectV1
  pointerRevision: number
  updatedAtMs: number
  snapshot: ResolvedModelFactsSnapshotV1
}>

type SnapshotRow = Readonly<{
  resolved_snapshot_revision: unknown
  provider_authority_id: unknown
  endpoint_profile_id: unknown
  native_model_id: unknown
  source_scope_selection_json: unknown
  source_priority_config_revision: unknown
  resolver_revision: unknown
  ontology_revision: unknown
  capability_revision: unknown
  resolved_json: unknown
  created_at_ms: unknown
}>

type CurrentRow = Readonly<{
  provider_authority_id: unknown
  endpoint_profile_id: unknown
  native_model_id: unknown
  resolved_snapshot_revision: unknown
  pointer_revision: unknown
  updated_at_ms: unknown
}>

export class ResolvedModelFactsV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_RESOLVED_MODEL_FACTS_INPUT_INVALID'
    | 'GENERATION_V2_RESOLVED_MODEL_FACTS_STATE_INVALID'
    | 'GENERATION_V2_RESOLVED_MODEL_FACTS_NOT_FOUND'
    | 'GENERATION_V2_RESOLVED_MODEL_FACTS_STALE_POINTER'
    | 'GENERATION_V2_RESOLVED_MODEL_FACTS_CLOCK_INVALID') {
    super(code)
    this.name = 'ResolvedModelFactsV1RepoError'
  }
}

function inputInvalid(): never {
  throw new ResolvedModelFactsV1RepoError('GENERATION_V2_RESOLVED_MODEL_FACTS_INPUT_INVALID')
}

function stateInvalid(): never {
  throw new ResolvedModelFactsV1RepoError('GENERATION_V2_RESOLVED_MODEL_FACTS_STATE_INVALID')
}

function safeTime(value: unknown, code: 'state' | 'clock'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ResolvedModelFactsV1RepoError(code === 'state'
      ? 'GENERATION_V2_RESOLVED_MODEL_FACTS_STATE_INVALID'
      : 'GENERATION_V2_RESOLVED_MODEL_FACTS_CLOCK_INVALID')
  }
  return value as number
}

function bounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) return stateInvalid()
  return value
}

function inputBounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value) return inputInvalid()
  return value
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], failure: () => never): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) failure()
}

function selection(value: unknown, failure: () => never): ResolvedModelFactsSourceScopeSelectionV1 {
  if (!plainObject(value)) return failure()
  exactKeys(value, ['providerNative', 'modelsDev', 'capabilityRules'], failure)
  return Object.freeze({ providerNative: bounded(value.providerNative, 1024),
    modelsDev: bounded(value.modelsDev, 1024), capabilityRules: bounded(value.capabilityRules, 1024) })
}

function inputSelection(value: unknown): ResolvedModelFactsSourceScopeSelectionV1 {
  if (!plainObject(value)) return inputInvalid()
  exactKeys(value, ['providerNative', 'modelsDev', 'capabilityRules'], inputInvalid)
  return Object.freeze({ providerNative: inputBounded(value.providerNative, 1024),
    modelsDev: inputBounded(value.modelsDev, 1024), capabilityRules: inputBounded(value.capabilityRules, 1024) })
}

export function resolvedModelFactsSnapshotRevisionV1(input: Readonly<{
  subject: CanonicalModelSubjectV1
  sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
  resolvedFacts: ResolvedModelFactsV1
}>): string {
  return `resolved-model-facts-snapshot-v1:${canonicalSourceFactDigestV1({
    subject: input.subject,
    sourceScopeSelection: input.sourceScopeSelection,
    sourcePriorityConfigRevision: input.resolvedFacts.input.sourcePriorityConfigRevision,
    resolverRevision: input.resolvedFacts.input.resolverRevision,
    ontologyRevision: input.resolvedFacts.input.ontologyRevision,
    capabilityRevision: input.resolvedFacts.capabilityRevision,
  })}`
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_JSON_BYTES) return stateInvalid()
  try { return JSON.parse(value) } catch { return stateInvalid() }
}

function sameSubject(left: CanonicalModelSubjectV1, right: CanonicalModelSubjectV1): boolean {
  return stableSerializeProviderRequestV2(left) === stableSerializeProviderRequestV2(right)
}

export class ResolvedModelFactsV1Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) stateInvalid()
  }

  readSnapshot(resolvedSnapshotRevision: string): ResolvedModelFactsSnapshotV1 {
    if (typeof resolvedSnapshotRevision !== 'string' || !REVISION.test(resolvedSnapshotRevision)) return inputInvalid()
    const row = this.#db.prepare(`SELECT resolved_snapshot_revision, provider_authority_id,
      endpoint_profile_id, native_model_id, source_scope_selection_json, source_priority_config_revision,
      resolver_revision, ontology_revision, capability_revision, resolved_json, created_at_ms
      FROM resolved_model_facts_snapshot_v1 WHERE resolved_snapshot_revision = ?`).get(resolvedSnapshotRevision) as
      SnapshotRow | undefined
    return this.decodeSnapshotRow(row)
  }

  readCurrent(subjectValue: CanonicalModelSubjectV1): ResolvedModelFactsCurrentV1 {
    const subject = canonicalizeCanonicalModelSubjectV1(subjectValue)
    const row = this.#db.prepare(`SELECT provider_authority_id, endpoint_profile_id, native_model_id,
      resolved_snapshot_revision, pointer_revision, updated_at_ms
      FROM resolved_model_facts_current_v1 WHERE provider_authority_id = ? AND endpoint_profile_id = ? AND native_model_id = ?`)
      .get(subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId) as CurrentRow | undefined
    if (!row) throw new ResolvedModelFactsV1RepoError('GENERATION_V2_RESOLVED_MODEL_FACTS_NOT_FOUND')
    if (row.provider_authority_id !== subject.providerAuthorityId || row.endpoint_profile_id !== subject.endpointProfileId ||
        row.native_model_id !== subject.nativeModelId || !Number.isSafeInteger(row.pointer_revision) ||
        (row.pointer_revision as number) < 1) return stateInvalid()
    const snapshot = this.readSnapshot(bounded(row.resolved_snapshot_revision, 128))
    if (!sameSubject(snapshot.subject, subject)) return stateInvalid()
    return Object.freeze({ subject, pointerRevision: row.pointer_revision as number,
      updatedAtMs: safeTime(row.updated_at_ms, 'state'), snapshot })
  }

  publishInActiveTransaction(input: Readonly<{
    subject: CanonicalModelSubjectV1
    sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
    resolvedFacts: ResolvedModelFactsV1
  }>): ResolvedModelFactsCurrentV1 {
    if (!this.#db.inTransaction) return this.#db.transaction(() => this.publishInActiveTransaction(input)).immediate()
    const subject = canonicalizeCanonicalModelSubjectV1(input.subject)
    const sourceScopeSelection = inputSelection(input.sourceScopeSelection)
    let resolvedFacts: ResolvedModelFactsV1
    try { resolvedFacts = decodeResolvedModelFactsV1(input.resolvedFacts) } catch { return inputInvalid() }
    if (!sameSubject(resolvedFacts.input.subject, subject)) return inputInvalid()
    const resolvedSnapshotRevision = resolvedModelFactsSnapshotRevisionV1({ subject, sourceScopeSelection, resolvedFacts })
    const resolvedJson = stableSerializeProviderRequestBoundedV2(resolvedFacts, MAX_JSON_BYTES)
    const createdAtMs = safeTime(this.#nowMs(), 'clock')
    const sourceScopeSelectionJson = stableSerializeProviderRequestV2(sourceScopeSelection)
    const existing = this.#db.prepare(`SELECT resolved_snapshot_revision, provider_authority_id,
      endpoint_profile_id, native_model_id, source_scope_selection_json, source_priority_config_revision,
      resolver_revision, ontology_revision, capability_revision, resolved_json, created_at_ms
      FROM resolved_model_facts_snapshot_v1 WHERE resolved_snapshot_revision = ?`).get(resolvedSnapshotRevision) as SnapshotRow | undefined
    if (!existing) {
      this.#db.prepare(`INSERT INTO resolved_model_facts_snapshot_v1 (
        resolved_snapshot_revision, provider_authority_id, endpoint_profile_id, native_model_id,
        source_scope_selection_json, source_priority_config_revision, resolver_revision, ontology_revision,
        capability_revision, resolved_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        resolvedSnapshotRevision, subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId,
        sourceScopeSelectionJson, resolvedFacts.input.sourcePriorityConfigRevision, resolvedFacts.input.resolverRevision,
        resolvedFacts.input.ontologyRevision, resolvedFacts.capabilityRevision, resolvedJson, createdAtMs,
      )
    } else if (this.decodeSnapshotRow(existing).resolvedFacts.capabilityRevision !== resolvedFacts.capabilityRevision ||
        existing.resolved_json !== resolvedJson || existing.source_scope_selection_json !== sourceScopeSelectionJson) {
      return stateInvalid()
    }
    const current = this.#db.prepare(`SELECT provider_authority_id, endpoint_profile_id, native_model_id,
      resolved_snapshot_revision, pointer_revision, updated_at_ms
      FROM resolved_model_facts_current_v1 WHERE provider_authority_id = ? AND endpoint_profile_id = ? AND native_model_id = ?`)
      .get(subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId) as CurrentRow | undefined
    const now = Math.max(createdAtMs, current ? safeTime(current.updated_at_ms, 'state') : 0)
    if (!current) {
      this.#db.prepare(`INSERT INTO resolved_model_facts_current_v1 (
        provider_authority_id, endpoint_profile_id, native_model_id, resolved_snapshot_revision,
        pointer_revision, updated_at_ms
      ) VALUES (?, ?, ?, ?, 1, ?)`).run(subject.providerAuthorityId, subject.endpointProfileId,
        subject.nativeModelId, resolvedSnapshotRevision, now)
    } else if (current.resolved_snapshot_revision !== resolvedSnapshotRevision) {
      const pointerRevision = safeTime(current.pointer_revision, 'state')
      if (pointerRevision >= Number.MAX_SAFE_INTEGER) return stateInvalid()
      const result = this.#db.prepare(`UPDATE resolved_model_facts_current_v1 SET
        resolved_snapshot_revision = ?, pointer_revision = ?, updated_at_ms = ?
        WHERE provider_authority_id = ? AND endpoint_profile_id = ? AND native_model_id = ?
          AND pointer_revision = ?`).run(resolvedSnapshotRevision, pointerRevision + 1, now,
            subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId, pointerRevision)
      if (result.changes !== 1) throw new ResolvedModelFactsV1RepoError('GENERATION_V2_RESOLVED_MODEL_FACTS_STALE_POINTER')
    }
    return this.readCurrent(subject)
  }

  private decodeSnapshotRow(row: SnapshotRow | undefined): ResolvedModelFactsSnapshotV1 {
    if (!row || typeof row.resolved_snapshot_revision !== 'string' || !REVISION.test(row.resolved_snapshot_revision) ||
        typeof row.provider_authority_id !== 'string' || typeof row.endpoint_profile_id !== 'string' ||
        typeof row.native_model_id !== 'string' || typeof row.source_scope_selection_json !== 'string' ||
        typeof row.source_priority_config_revision !== 'string' || typeof row.resolver_revision !== 'string' ||
        typeof row.ontology_revision !== 'string' || typeof row.capability_revision !== 'string' ||
        !CAPABILITY_REVISION.test(row.capability_revision) || typeof row.resolved_json !== 'string') return stateInvalid()
    let subject: CanonicalModelSubjectV1
    let sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
    let resolvedFacts: ResolvedModelFactsV1
    try {
      subject = canonicalizeCanonicalModelSubjectV1({ providerAuthorityId: row.provider_authority_id,
        endpointProfileId: row.endpoint_profile_id, nativeModelId: row.native_model_id })
      sourceScopeSelection = selection(parseJson(row.source_scope_selection_json), stateInvalid)
      resolvedFacts = decodeResolvedModelFactsV1(parseJson(row.resolved_json))
    } catch { return stateInvalid() }
    if (!sameSubject(resolvedFacts.input.subject, subject) ||
        resolvedFacts.input.sourcePriorityConfigRevision !== row.source_priority_config_revision ||
        resolvedFacts.input.resolverRevision !== row.resolver_revision ||
        resolvedFacts.input.ontologyRevision !== row.ontology_revision ||
        resolvedFacts.capabilityRevision !== row.capability_revision ||
        resolvedModelFactsSnapshotRevisionV1({ subject, sourceScopeSelection, resolvedFacts }) !== row.resolved_snapshot_revision ||
        stableSerializeProviderRequestV2(resolvedFacts) !== row.resolved_json) return stateInvalid()
    return Object.freeze({ resolvedSnapshotRevision: row.resolved_snapshot_revision, subject,
      sourceScopeSelection, resolvedFacts, createdAtMs: safeTime(row.created_at_ms, 'state') })
  }
}
