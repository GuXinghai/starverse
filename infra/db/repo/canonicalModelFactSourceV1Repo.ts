import type BetterSqlite3 from 'better-sqlite3'
import {
  buildCanonicalSubjectFactV1,
  canonicalSourceFactDigestV1,
  decodeCanonicalSourceRevisionRefV1,
  type CanonicalModelSubjectV1,
  type CanonicalSourceKindV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
  type RawPayloadRefV1,
  type RawSourceSnapshotRefV1,
  type SourceFieldRefV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import type {
  RawPayloadReaderV1,
  SanitizedRawPayloadV1,
} from '../../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import { buildRawSourceSnapshotRefV1 } from '../../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import {
  stableSerializeProviderRequestBoundedV2,
  stableSerializeProviderRequestV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'

const MAX_SAFE_INTEGER = 9_007_199_254_740_991
const DIGEST = /^[0-9a-f]{64}$/u
const RAW_STORE_ID = /^canonical-raw-v1:[0-9a-f]{64}$/u

type SourceRevisionRow = Readonly<{
  canonical_source_revision: unknown
  source_kind: unknown
  source_scope_id: unknown
  raw_source_snapshot_revision: unknown
  adapter_revision: unknown
  coverage_manifest_revision: unknown
  provider_authority_registry_revision: unknown
  previous_lkg_source_revision: unknown
  subject_index_mode: unknown
  subject_fact_count: unknown
  subject_index_digest: unknown
  source_revision_json: unknown
  created_at_ms: unknown
}>

type SubjectFactRow = Readonly<{
  canonical_subject_fact_revision: unknown
  canonical_source_revision: unknown
  source_kind: unknown
  source_scope_id: unknown
  provider_authority_id: unknown
  endpoint_profile_id: unknown
  native_model_id: unknown
  subject_fact_payload_digest: unknown
  previous_subject_fact_revision: unknown
  payload_json: unknown
  created_at_ms: unknown
}>

export type CanonicalModelFactSubjectPublicationV1 = Readonly<{
  payload: CanonicalSubjectFactPayloadV1
  ref: CanonicalSubjectFactRefV1
}>

export type CanonicalModelFactSourceStateV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceScopeId: string
  currentSourceRevision: string | null
  pointerRevision: number
  fetchedAtMs: number | null
  lastSucceededAtMs: number | null
  lastAttemptedAtMs: number | null
  staleReason: string | null
  refreshCadenceMs: number | null
  createdAtMs: number
  updatedAtMs: number
}>

export type CanonicalModelFactStoredSourceRevisionV1 = Readonly<{
  sourceRevision: CanonicalSourceRevisionRefV1
  rawSnapshot: RawSourceSnapshotRefV1
  subjectIndexMode: 'complete' | 'query_bound'
  subjectFactCount: number
  subjectIndexDigest: string | null
  createdAtMs: number
}>

export type CanonicalModelFactSourcePublicationResultV1 = Readonly<{
  source: CanonicalModelFactStoredSourceRevisionV1
  state: CanonicalModelFactSourceStateV1
  subjectFacts: readonly CanonicalModelFactSubjectPublicationV1[]
}>

export type CanonicalModelFactRetentionPinTargetV1 =
  | Readonly<{ kind: 'raw_payload'; storeId: string }>
  | Readonly<{ kind: 'source_revision'; canonicalSourceRevision: string }>
  | Readonly<{ kind: 'subject_fact'; canonicalSubjectFactRevision: string }>

export type CanonicalModelFactRetentionResultV1 = Readonly<{
  deletedSubjectFactCount: number
  deletedSourceRevisionCount: number
  deletedRawSnapshotCount: number
  deletedRawPayloadCount: number
}>

export class CanonicalModelFactSourceV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_INPUT_INVALID'
    | 'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STATE_INVALID'
    | 'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_NOT_FOUND'
    | 'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STALE_CURRENT') {
    super(code)
    this.name = 'CanonicalModelFactSourceV1RepoError'
  }
}

function invalid(): never {
  throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_INPUT_INVALID')
}

function stateInvalid(): never {
  throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STATE_INVALID')
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return stateInvalid()
  return value as number
}

function inputTime(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return invalid()
  return value
}

function boundedInput(value: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) return invalid()
  return value
}

function sourceKind(value: unknown): CanonicalSourceKindV1 {
  if (value !== 'provider_native' && value !== 'models_dev' && value !== 'capability_rule') return stateInvalid()
  return value
}

function inputSourceKind(value: CanonicalSourceKindV1): CanonicalSourceKindV1 {
  if (value !== 'provider_native' && value !== 'models_dev' && value !== 'capability_rule') return invalid()
  return value
}

function parseJson(value: unknown, maxBytes: number): unknown {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxBytes) return stateInvalid()
  try { return JSON.parse(value) } catch { return stateInvalid() }
}

function rawRefKey(ref: RawPayloadRefV1): string {
  return stableSerializeProviderRequestV2(ref)
}

function validateRawRef(value: RawPayloadRefV1): RawPayloadRefV1 {
  if (!value || typeof value !== 'object' || !RAW_STORE_ID.test(value.storeId) ||
      !DIGEST.test(value.persistedPayloadSha256) || value.storeId !== `canonical-raw-v1:${value.persistedPayloadSha256}` ||
      typeof value.recordKey !== 'string' || value.recordKey.length < 1 || value.recordKey.length > 1024 ||
      typeof value.sanitizerRevision !== 'string' || value.sanitizerRevision.length < 1 ||
      value.sanitizerRevision.length > 256 ||
      (value.networkPayloadSha256 !== undefined && !DIGEST.test(value.networkPayloadSha256))) return invalid()
  return value
}

function canonicalRawPayload(payload: SanitizedRawPayloadV1): Readonly<{
  ref: RawPayloadRefV1
  serializedPayload: string
  redactedPathsJson: string
}> {
  const ref = validateRawRef(payload.ref)
  const serializedPayload = stableSerializeProviderRequestBoundedV2(payload.persistedPayload, 16 * 1024 * 1024)
  if (serializedPayload !== payload.serializedPayload || canonicalSourceFactDigestV1(payload.persistedPayload) !== ref.persistedPayloadSha256) {
    return invalid()
  }
  if (!Array.isArray(payload.redactedPaths) || payload.redactedPaths.some((path) =>
    typeof path !== 'string' || path.length > 4096)) return invalid()
  const redactedPaths = [...payload.redactedPaths].sort()
  if (new Set(redactedPaths).size !== redactedPaths.length ||
      stableSerializeProviderRequestV2(redactedPaths) !== stableSerializeProviderRequestV2(payload.redactedPaths)) return invalid()
  return Object.freeze({ ref, serializedPayload,
    redactedPathsJson: stableSerializeProviderRequestBoundedV2(redactedPaths, 1024 * 1024) })
}

function factCandidate(payload: CanonicalSubjectFactPayloadV1) {
  return {
    schemaVersion: payload.schemaVersion,
    subject: payload.subject,
    sourceRevision: payload.sourceRevision,
    recordOutcome: payload.recordOutcome,
    outcomes: payload.outcomes,
    unmappedSourceFields: payload.unmappedSourceFields,
  } as const
}

function hasRetainedLkg(payload: CanonicalSubjectFactPayloadV1): boolean {
  return payload.outcomes.some((outcome) => outcome.disposition === 'lkg_retained_after_invalid')
}

function provenanceFieldRefs(payload: CanonicalSubjectFactPayloadV1): readonly Readonly<{
  canonicalSourceRevision: string
  fieldRef: SourceFieldRefV1
}>[] {
  const refs: Array<{ canonicalSourceRevision: string; fieldRef: SourceFieldRefV1 }> = []
  for (const outcome of payload.outcomes) {
    const current = outcome.currentObservation.kind === 'present_valid'
      ? outcome.currentObservation.assertion.provenance : outcome.currentObservation.provenance
    for (const fieldRef of current.sourceFieldRefs) refs.push({
      canonicalSourceRevision: current.canonicalSourceRevision, fieldRef,
    })
    if (outcome.effectiveAssertion && outcome.effectiveAssertion.provenance !== current) {
      for (const fieldRef of outcome.effectiveAssertion.provenance.sourceFieldRefs) refs.push({
        canonicalSourceRevision: outcome.effectiveAssertion.provenance.canonicalSourceRevision, fieldRef,
      })
    }
  }
  for (const unmapped of payload.unmappedSourceFields) {
    for (const fieldRef of unmapped.sourceFieldRefs) refs.push({
      canonicalSourceRevision: payload.sourceRevision.canonicalSourceRevision, fieldRef,
    })
  }
  return refs
}

function provenanceSourceRevisions(payload: CanonicalSubjectFactPayloadV1): readonly string[] {
  const revisions = new Set<string>([payload.sourceRevision.canonicalSourceRevision])
  for (const outcome of payload.outcomes) {
    const current = outcome.currentObservation.kind === 'present_valid'
      ? outcome.currentObservation.assertion.provenance : outcome.currentObservation.provenance
    revisions.add(current.canonicalSourceRevision)
    if (outcome.effectiveAssertion) revisions.add(outcome.effectiveAssertion.provenance.canonicalSourceRevision)
  }
  return Object.freeze([...revisions].sort())
}

export class CanonicalModelFactSourceV1Repo implements RawPayloadReaderV1 {
  private savepointSequence = 0

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) stateInvalid()
  }

  configureRefresh(input: Readonly<{
    sourceKind: CanonicalSourceKindV1
    sourceScopeId: string
    refreshCadenceMs: number | null
  }>): CanonicalModelFactSourceStateV1 {
    const kind = inputSourceKind(input.sourceKind)
    const scope = boundedInput(input.sourceScopeId, 1024)
    const cadence = input.refreshCadenceMs === null ? null : inputTime(input.refreshCadenceMs)
    if (cadence !== null && cadence < 1000) return invalid()
    const now = inputTime(this.nowMs())
    this.db.prepare(`INSERT INTO canonical_model_fact_source_state_v1 (
      source_kind, source_scope_id, canonical_source_revision, pointer_revision,
      fetched_at_ms, last_succeeded_at_ms, last_attempted_at_ms, stale_reason,
      refresh_cadence_ms, created_at_ms, updated_at_ms
    ) VALUES (?, ?, NULL, 0, NULL, NULL, NULL, NULL, ?, ?, ?)
    ON CONFLICT(source_kind, source_scope_id) DO UPDATE SET
      refresh_cadence_ms=excluded.refresh_cadence_ms,
      updated_at_ms=excluded.updated_at_ms`).run(kind, scope, cadence, now, now)
    return this.readSourceState(kind, scope)!
  }

  recordRefreshFailure(input: Readonly<{
    sourceKind: CanonicalSourceKindV1
    sourceScopeId: string
    attemptedAtMs: number
    staleReason: string
  }>): CanonicalModelFactSourceStateV1 {
    const kind = inputSourceKind(input.sourceKind)
    const scope = boundedInput(input.sourceScopeId, 1024)
    const attemptedAt = inputTime(input.attemptedAtMs)
    const staleReason = boundedInput(input.staleReason, 1024)
    const now = inputTime(this.nowMs())
    const run = () => {
      const current = this.readSourceState(kind, scope)
      if (current && current.lastAttemptedAtMs !== null && attemptedAt < current.lastAttemptedAtMs) return invalid()
      this.db.prepare(`INSERT INTO canonical_model_fact_source_state_v1 (
        source_kind, source_scope_id, canonical_source_revision, pointer_revision,
        fetched_at_ms, last_succeeded_at_ms, last_attempted_at_ms, stale_reason,
        refresh_cadence_ms, created_at_ms, updated_at_ms
      ) VALUES (?, ?, NULL, 0, NULL, NULL, ?, ?, NULL, ?, ?)
      ON CONFLICT(source_kind, source_scope_id) DO UPDATE SET
        last_attempted_at_ms=excluded.last_attempted_at_ms,
        stale_reason=excluded.stale_reason,
        updated_at_ms=excluded.updated_at_ms`).run(kind, scope, attemptedAt, staleReason, now, now)
      return this.readSourceState(kind, scope)!
    }
    return this.runImmediate(run)
  }

  publishSourceRevision(input: Readonly<{
    rawPayloads: readonly SanitizedRawPayloadV1[]
    rawSnapshot: RawSourceSnapshotRefV1
    sourceRevision: CanonicalSourceRevisionRefV1
    subjectIndexMode: 'complete' | 'query_bound'
    subjectFacts?: readonly CanonicalModelFactSubjectPublicationV1[]
    expectedCurrentRevision: string | null
    fetchedAtMs: number
    lastAttemptedAtMs?: number
  }>): CanonicalModelFactSourcePublicationResultV1 {
    const rawPayloads = input.rawPayloads.map(canonicalRawPayload)
    const rawSnapshot = this.validateRawSnapshot(input.rawSnapshot)
    const sourceRevision = decodeCanonicalSourceRevisionRefV1(input.sourceRevision)
    if (sourceRevision.sourceKind !== rawSnapshot.sourceKind ||
        sourceRevision.sourceScopeId !== rawSnapshot.sourceScopeId ||
        sourceRevision.rawSourceSnapshotRevision !== rawSnapshot.rawSourceSnapshotRevision ||
        (input.subjectIndexMode !== 'complete' && input.subjectIndexMode !== 'query_bound') ||
        (sourceRevision.sourceKind === 'capability_rule') !== (input.subjectIndexMode === 'query_bound')) return invalid()
    const expected = input.expectedCurrentRevision === null
      ? null : boundedInput(input.expectedCurrentRevision, 256)
    const fetchedAt = inputTime(input.fetchedAtMs)
    const attemptedAt = inputTime(input.lastAttemptedAtMs ?? fetchedAt)
    if (fetchedAt > attemptedAt) return invalid()
    const suppliedByRef = new Map(rawPayloads.map((payload) => [rawRefKey(payload.ref), payload]))
    if (suppliedByRef.size !== rawPayloads.length || suppliedByRef.size !== rawSnapshot.rawEnvelopeRefs.length ||
        rawSnapshot.rawEnvelopeRefs.some((ref) => !suppliedByRef.has(rawRefKey(ref)))) return invalid()
    const subjectFacts = [...(input.subjectFacts ?? [])]
    if (input.subjectIndexMode === 'query_bound' && subjectFacts.length !== 0) return invalid()
    const subjectIndexDigest = input.subjectIndexMode === 'complete'
      ? canonicalSourceFactDigestV1([...subjectFacts]
        .map((fact) => fact.ref.canonicalSubjectFactRevision).sort())
      : null
    const run = () => {
      const current = this.readSourceState(sourceRevision.sourceKind, sourceRevision.sourceScopeId)
      if ((current?.currentSourceRevision ?? null) !== expected) {
        throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STALE_CURRENT')
      }
      if (current?.lastAttemptedAtMs !== null && current?.lastAttemptedAtMs !== undefined &&
          attemptedAt < current.lastAttemptedAtMs) return invalid()
      if (sourceRevision.previousLkgSourceRevision !== undefined &&
          sourceRevision.previousLkgSourceRevision !== expected) return invalid()
      const now = inputTime(this.nowMs())
      for (const payload of rawPayloads) this.insertRawPayload(payload, now)
      this.insertRawSnapshot(rawSnapshot, suppliedByRef, now)
      this.insertSourceRevision(sourceRevision, input.subjectIndexMode, subjectFacts.length, subjectIndexDigest, now)
      const persistedFacts = subjectFacts.map((fact) => this.insertSubjectFact(fact, sourceRevision, now))
      if (input.subjectIndexMode === 'complete') {
        this.assertCompleteSubjectIndex(sourceRevision.canonicalSourceRevision, subjectFacts.length, subjectIndexDigest!)
      }
      const nextPointer = current?.currentSourceRevision === sourceRevision.canonicalSourceRevision
        ? current.pointerRevision : (current?.pointerRevision ?? 0) + 1
      if (nextPointer > MAX_SAFE_INTEGER) return stateInvalid()
      this.db.prepare(`INSERT INTO canonical_model_fact_source_state_v1 (
        source_kind, source_scope_id, canonical_source_revision, pointer_revision,
        fetched_at_ms, last_succeeded_at_ms, last_attempted_at_ms, stale_reason,
        refresh_cadence_ms, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(source_kind, source_scope_id) DO UPDATE SET
        canonical_source_revision=excluded.canonical_source_revision,
        pointer_revision=excluded.pointer_revision,
        fetched_at_ms=excluded.fetched_at_ms,
        last_succeeded_at_ms=excluded.last_succeeded_at_ms,
        last_attempted_at_ms=excluded.last_attempted_at_ms,
        stale_reason=NULL,
        updated_at_ms=excluded.updated_at_ms`).run(
        sourceRevision.sourceKind, sourceRevision.sourceScopeId,
        sourceRevision.canonicalSourceRevision, nextPointer, fetchedAt, now, attemptedAt, now, now,
      )
      return Object.freeze({ source: this.readSourceRevision(sourceRevision.canonicalSourceRevision)!,
        state: this.readSourceState(sourceRevision.sourceKind, sourceRevision.sourceScopeId)!,
        subjectFacts: Object.freeze(persistedFacts) })
    }
    return this.runImmediate(run)
  }

  refreshCurrentSourceRevision(input: Readonly<{
    canonicalSourceRevision: string
    fetchedAtMs: number
    lastAttemptedAtMs?: number
  }>): CanonicalModelFactSourcePublicationResultV1 {
    const revision = boundedInput(input.canonicalSourceRevision, 256)
    const fetchedAt = inputTime(input.fetchedAtMs)
    const attemptedAt = inputTime(input.lastAttemptedAtMs ?? fetchedAt)
    if (fetchedAt > attemptedAt) return invalid()
    return this.runImmediate(() => {
      const source = this.readSourceRevision(revision)
      if (!source) throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_NOT_FOUND')
      const current = this.readSourceState(source.sourceRevision.sourceKind, source.sourceRevision.sourceScopeId)
      if (!current || current.currentSourceRevision !== revision) {
        throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STALE_CURRENT')
      }
      if (current.lastAttemptedAtMs !== null && attemptedAt < current.lastAttemptedAtMs) return invalid()
      const now = inputTime(this.nowMs())
      this.db.prepare(`UPDATE canonical_model_fact_source_state_v1
        SET fetched_at_ms=?, last_succeeded_at_ms=?, last_attempted_at_ms=?, stale_reason=NULL, updated_at_ms=?
        WHERE source_kind=? AND source_scope_id=? AND canonical_source_revision=?`).run(
        fetchedAt, now, attemptedAt, now, source.sourceRevision.sourceKind,
        source.sourceRevision.sourceScopeId, revision,
      )
      const rows = this.db.prepare(`SELECT canonical_subject_fact_revision
        FROM canonical_model_fact_subject_fact_v1 WHERE canonical_source_revision=?
        ORDER BY provider_authority_id, endpoint_profile_id, native_model_id`).all(revision) as
        Array<{ canonical_subject_fact_revision: unknown }>
      const subjectFacts = rows.map((row) => {
        if (typeof row.canonical_subject_fact_revision !== 'string') return stateInvalid()
        return this.readSubjectFactByRevision(boundedInput(row.canonical_subject_fact_revision, 256))
      }).filter((fact): fact is CanonicalModelFactSubjectPublicationV1 => fact !== null)
      if (subjectFacts.length !== source.subjectFactCount) return stateInvalid()
      return Object.freeze({ source, state: this.readSourceState(source.sourceRevision.sourceKind,
        source.sourceRevision.sourceScopeId)!, subjectFacts: Object.freeze(subjectFacts) })
    })
  }

  materializeSubjectFact(fact: CanonicalModelFactSubjectPublicationV1): CanonicalModelFactSubjectPublicationV1 {
    const sourceRevision = decodeCanonicalSourceRevisionRefV1(fact.payload.sourceRevision)
    const now = inputTime(this.nowMs())
    return this.runImmediate(() => {
      const source = this.readSourceRevision(sourceRevision.canonicalSourceRevision)
      if (!source) throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_NOT_FOUND')
      if (source.subjectIndexMode !== 'query_bound') return invalid()
      return this.insertSubjectFact(fact, sourceRevision, now)
    })
  }

  readSourceState(kindValue: CanonicalSourceKindV1, scopeValue: string): CanonicalModelFactSourceStateV1 | null {
    const kind = inputSourceKind(kindValue)
    const scope = boundedInput(scopeValue, 1024)
    const row = this.db.prepare(`SELECT source_kind, source_scope_id, canonical_source_revision,
      pointer_revision, fetched_at_ms, last_succeeded_at_ms, last_attempted_at_ms, stale_reason,
      refresh_cadence_ms, created_at_ms, updated_at_ms
      FROM canonical_model_fact_source_state_v1 WHERE source_kind=? AND source_scope_id=?`).get(kind, scope) as
      Record<string, unknown> | undefined
    if (!row) return null
    const currentSourceRevision = row.canonical_source_revision === null ? null : String(row.canonical_source_revision)
    const pointerRevision = safeTime(row.pointer_revision)
    const fetchedAtMs = row.fetched_at_ms === null ? null : safeTime(row.fetched_at_ms)
    const lastSucceededAtMs = row.last_succeeded_at_ms === null ? null : safeTime(row.last_succeeded_at_ms)
    const lastAttemptedAtMs = row.last_attempted_at_ms === null ? null : safeTime(row.last_attempted_at_ms)
    const staleReason = row.stale_reason === null ? null : String(row.stale_reason)
    const refreshCadenceMs = row.refresh_cadence_ms === null ? null : safeTime(row.refresh_cadence_ms)
    if (sourceKind(row.source_kind) !== kind || row.source_scope_id !== scope ||
        (currentSourceRevision === null) !== (pointerRevision === 0) ||
        (currentSourceRevision === null) !== (fetchedAtMs === null) ||
        (currentSourceRevision === null) !== (lastSucceededAtMs === null) ||
        (staleReason !== null && (staleReason.length < 1 || staleReason.length > 1024)) ||
        (refreshCadenceMs !== null && refreshCadenceMs < 1000)) return stateInvalid()
    return Object.freeze({ sourceKind: kind, sourceScopeId: scope, currentSourceRevision, pointerRevision,
      fetchedAtMs, lastSucceededAtMs, lastAttemptedAtMs, staleReason, refreshCadenceMs,
      createdAtMs: safeTime(row.created_at_ms), updatedAtMs: safeTime(row.updated_at_ms) })
  }

  readSourceRevision(canonicalSourceRevision: string): CanonicalModelFactStoredSourceRevisionV1 | null {
    const revision = boundedInput(canonicalSourceRevision, 256)
    const row = this.db.prepare(`SELECT canonical_source_revision, source_kind, source_scope_id,
      raw_source_snapshot_revision, adapter_revision, coverage_manifest_revision,
      provider_authority_registry_revision, previous_lkg_source_revision, subject_index_mode,
      subject_fact_count, subject_index_digest,
      source_revision_json, created_at_ms
      FROM canonical_model_fact_source_revision_v1 WHERE canonical_source_revision=?`).get(revision) as
      SourceRevisionRow | undefined
    if (!row) return null
    const parsed = parseJson(row.source_revision_json, 65_536)
    const decoded = decodeCanonicalSourceRevisionRefV1(parsed)
    if (decoded.canonicalSourceRevision !== row.canonical_source_revision || decoded.sourceKind !== row.source_kind ||
        decoded.sourceScopeId !== row.source_scope_id || decoded.rawSourceSnapshotRevision !== row.raw_source_snapshot_revision ||
        decoded.adapterRevision !== row.adapter_revision || decoded.coverageManifestRevision !== row.coverage_manifest_revision ||
        decoded.providerAuthorityRegistryRevision !== row.provider_authority_registry_revision ||
        (decoded.previousLkgSourceRevision ?? null) !== row.previous_lkg_source_revision ||
        stableSerializeProviderRequestV2(decoded) !== row.source_revision_json ||
        (row.subject_index_mode !== 'complete' && row.subject_index_mode !== 'query_bound')) return stateInvalid()
    const subjectFactCount = safeTime(row.subject_fact_count)
    const subjectIndexDigest = row.subject_index_digest === null ? null : String(row.subject_index_digest)
    if ((row.subject_index_mode === 'complete' && (!subjectIndexDigest || !DIGEST.test(subjectIndexDigest))) ||
        (row.subject_index_mode === 'query_bound' && (subjectFactCount !== 0 || subjectIndexDigest !== null))) return stateInvalid()
    const rawSnapshot = this.readRawSnapshot(decoded.rawSourceSnapshotRevision)
    if (!rawSnapshot || rawSnapshot.sourceKind !== decoded.sourceKind || rawSnapshot.sourceScopeId !== decoded.sourceScopeId) {
      return stateInvalid()
    }
    return Object.freeze({ sourceRevision: decoded, rawSnapshot,
      subjectIndexMode: row.subject_index_mode, subjectFactCount, subjectIndexDigest,
      createdAtMs: safeTime(row.created_at_ms) })
  }

  readSubjectFact(input: Readonly<{
    canonicalSourceRevision: string
    subject: CanonicalModelSubjectV1
  }>): CanonicalModelFactSubjectPublicationV1 | null {
    const sourceRevision = boundedInput(input.canonicalSourceRevision, 256)
    const subject = input.subject
    const row = this.db.prepare(`SELECT canonical_subject_fact_revision, canonical_source_revision,
      source_kind, source_scope_id, provider_authority_id, endpoint_profile_id, native_model_id,
      subject_fact_payload_digest, previous_subject_fact_revision, payload_json, created_at_ms
      FROM canonical_model_fact_subject_fact_v1
      WHERE canonical_source_revision=? AND provider_authority_id=? AND endpoint_profile_id=? AND native_model_id=?`).get(
        sourceRevision, boundedInput(subject.providerAuthorityId, 1024), boundedInput(subject.endpointProfileId, 1024),
        boundedInput(subject.nativeModelId, 1024),
      ) as SubjectFactRow | undefined
    return row ? this.decodeSubjectFactRow(row) : null
  }

  readSubjectFactByRevision(canonicalSubjectFactRevision: string): CanonicalModelFactSubjectPublicationV1 | null {
    const revision = boundedInput(canonicalSubjectFactRevision, 256)
    const row = this.db.prepare(`SELECT canonical_subject_fact_revision, canonical_source_revision,
      source_kind, source_scope_id, provider_authority_id, endpoint_profile_id, native_model_id,
      subject_fact_payload_digest, previous_subject_fact_revision, payload_json, created_at_ms
      FROM canonical_model_fact_subject_fact_v1 WHERE canonical_subject_fact_revision=?`).get(revision) as
      SubjectFactRow | undefined
    return row ? this.decodeSubjectFactRow(row) : null
  }

  readRawPayload(refValue: RawPayloadRefV1): unknown {
    const ref = validateRawRef(refValue)
    const row = this.db.prepare(`SELECT persisted_payload_sha256, payload_json
      FROM canonical_model_fact_raw_payload_v1 WHERE store_id=?`).get(ref.storeId) as
      { persisted_payload_sha256: unknown; payload_json: unknown } | undefined
    if (!row) throw new CanonicalModelFactSourceV1RepoError('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_NOT_FOUND')
    const parsed = parseJson(row.payload_json, 16 * 1024 * 1024)
    if (row.persisted_payload_sha256 !== ref.persistedPayloadSha256 ||
        canonicalSourceFactDigestV1(parsed) !== ref.persistedPayloadSha256 ||
        stableSerializeProviderRequestV2(parsed) !== row.payload_json) return stateInvalid()
    return parsed
  }

  pinRetention(input: Readonly<{
    ownerKind: string
    ownerId: string
    target: CanonicalModelFactRetentionPinTargetV1
  }>): string {
    const ownerKind = boundedInput(input.ownerKind, 128)
    const ownerId = boundedInput(input.ownerId, 1024)
    const target = input.target
    const projection = target.kind === 'raw_payload'
      ? { targetKind: target.kind, targetId: boundedInput(target.storeId, 256) }
      : target.kind === 'source_revision'
        ? { targetKind: target.kind, targetId: boundedInput(target.canonicalSourceRevision, 256) }
        : target.kind === 'subject_fact'
          ? { targetKind: target.kind, targetId: boundedInput(target.canonicalSubjectFactRevision, 256) }
          : invalid()
    const pinId = `canonical-fact-pin-v1:${canonicalSourceFactDigestV1({ ownerKind, ownerId, ...projection })}`
    const now = inputTime(this.nowMs())
    const columns = target.kind === 'raw_payload'
      ? [target.storeId, null, null]
      : target.kind === 'source_revision'
        ? [null, target.canonicalSourceRevision, null]
        : [null, null, target.canonicalSubjectFactRevision]
    try {
      this.db.prepare(`INSERT INTO canonical_model_fact_retention_pin_v1 (
        pin_id, owner_kind, owner_id, target_kind, raw_store_id,
        canonical_source_revision, canonical_subject_fact_revision, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pin_id) DO NOTHING`).run(
        pinId, ownerKind, ownerId, target.kind, ...columns, now,
      )
    } catch { return invalid() }
    const row = this.db.prepare(`SELECT owner_kind, owner_id, target_kind, raw_store_id,
      canonical_source_revision, canonical_subject_fact_revision
      FROM canonical_model_fact_retention_pin_v1 WHERE pin_id=?`).get(pinId) as Record<string, unknown> | undefined
    if (!row || row.owner_kind !== ownerKind || row.owner_id !== ownerId || row.target_kind !== target.kind ||
        row.raw_store_id !== columns[0] || row.canonical_source_revision !== columns[1] ||
        row.canonical_subject_fact_revision !== columns[2]) return stateInvalid()
    return pinId
  }

  releaseRetentionPins(ownerKindValue: string, ownerIdValue: string): number {
    const ownerKind = boundedInput(ownerKindValue, 128)
    const ownerId = boundedInput(ownerIdValue, 1024)
    return this.db.prepare(`DELETE FROM canonical_model_fact_retention_pin_v1
      WHERE owner_kind=? AND owner_id=?`).run(ownerKind, ownerId).changes
  }

  pruneRetainedData(beforeMsValue: number): CanonicalModelFactRetentionResultV1 {
    const beforeMs = inputTime(beforeMsValue)
    return this.runImmediate(() => {
      const deletedSubjectFactCount = this.db.prepare(`DELETE FROM canonical_model_fact_subject_fact_v1 AS fact
        WHERE fact.created_at_ms < ?
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_source_state_v1 state
            WHERE state.canonical_source_revision=fact.canonical_source_revision)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_retention_pin_v1 pin
            WHERE pin.canonical_subject_fact_revision=fact.canonical_subject_fact_revision)
          AND NOT EXISTS (
            SELECT 1 FROM canonical_model_fact_source_state_v1 state
            JOIN canonical_model_fact_source_revision_v1 current_revision
              ON current_revision.canonical_source_revision=state.canonical_source_revision
            WHERE current_revision.previous_lkg_source_revision=fact.canonical_source_revision
          )`).run(beforeMs).changes
      const deleteUnreferencedSourceRevisions = this.db.prepare(`DELETE FROM canonical_model_fact_source_revision_v1 AS revision
        WHERE revision.created_at_ms < ?
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_source_state_v1 state
            WHERE state.canonical_source_revision=revision.canonical_source_revision)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_retention_pin_v1 pin
            WHERE pin.canonical_source_revision=revision.canonical_source_revision)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_subject_fact_v1 fact
            WHERE fact.canonical_source_revision=revision.canonical_source_revision)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_subject_fact_source_ref_v1 provenance
            WHERE provenance.canonical_source_revision=revision.canonical_source_revision)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_source_revision_v1 child
            WHERE child.previous_lkg_source_revision=revision.canonical_source_revision)`)
      let deletedSourceRevisionCount = 0
      for (;;) {
        const deleted = deleteUnreferencedSourceRevisions.run(beforeMs).changes
        deletedSourceRevisionCount += deleted
        if (deleted === 0) break
      }
      const deletedRawSnapshotCount = this.db.prepare(`DELETE FROM canonical_model_fact_raw_snapshot_v1 AS snapshot
        WHERE snapshot.created_at_ms < ?
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_source_revision_v1 revision
            WHERE revision.raw_source_snapshot_revision=snapshot.raw_source_snapshot_revision)`).run(beforeMs).changes
      const deletedRawPayloadCount = this.db.prepare(`DELETE FROM canonical_model_fact_raw_payload_v1 AS payload
        WHERE payload.created_at_ms < ?
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_raw_snapshot_payload_ref_v1 ref
            WHERE ref.store_id=payload.store_id)
          AND NOT EXISTS (SELECT 1 FROM canonical_model_fact_retention_pin_v1 pin
            WHERE pin.raw_store_id=payload.store_id)`).run(beforeMs).changes
      return Object.freeze({ deletedSubjectFactCount, deletedSourceRevisionCount,
        deletedRawSnapshotCount, deletedRawPayloadCount })
    })
  }

  private validateRawSnapshot(value: RawSourceSnapshotRefV1): RawSourceSnapshotRefV1 {
    if (!value || typeof value !== 'object' || !Array.isArray(value.rawEnvelopeRefs)) return invalid()
    const refs = value.rawEnvelopeRefs.map(validateRawRef)
    const rebuilt = buildRawSourceSnapshotRefV1({ sourceKind: inputSourceKind(value.sourceKind),
      sourceScopeId: boundedInput(value.sourceScopeId, 1024), recordSetCompleteness: value.recordSetCompleteness,
      rawEnvelopeRefs: refs })
    if (stableSerializeProviderRequestV2(rebuilt) !== stableSerializeProviderRequestV2(value)) return invalid()
    return rebuilt
  }

  private insertRawPayload(payload: ReturnType<typeof canonicalRawPayload>, now: number): void {
    this.db.prepare(`INSERT INTO canonical_model_fact_raw_payload_v1 (
      store_id, persisted_payload_sha256, payload_json, created_at_ms
    ) VALUES (?, ?, ?, ?) ON CONFLICT(store_id) DO NOTHING`).run(
      payload.ref.storeId, payload.ref.persistedPayloadSha256, payload.serializedPayload,
      now,
    )
    const row = this.db.prepare(`SELECT persisted_payload_sha256, payload_json
      FROM canonical_model_fact_raw_payload_v1 WHERE store_id=?`).get(payload.ref.storeId) as
      Record<string, unknown> | undefined
    if (!row || row.persisted_payload_sha256 !== payload.ref.persistedPayloadSha256 ||
        row.payload_json !== payload.serializedPayload) stateInvalid()
  }

  private insertRawSnapshot(
    snapshot: RawSourceSnapshotRefV1,
    suppliedByRef: ReadonlyMap<string, ReturnType<typeof canonicalRawPayload>>,
    now: number,
  ): void {
    const snapshotJson = stableSerializeProviderRequestBoundedV2(snapshot, 1024 * 1024)
    this.db.prepare(`INSERT INTO canonical_model_fact_raw_snapshot_v1 (
      raw_source_snapshot_revision, source_kind, source_scope_id, record_set_completeness,
      snapshot_json, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(raw_source_snapshot_revision) DO NOTHING`).run(
      snapshot.rawSourceSnapshotRevision, snapshot.sourceKind, snapshot.sourceScopeId,
      snapshot.recordSetCompleteness, snapshotJson, now,
    )
    const row = this.db.prepare(`SELECT source_kind, source_scope_id, record_set_completeness, snapshot_json
      FROM canonical_model_fact_raw_snapshot_v1 WHERE raw_source_snapshot_revision=?`).get(
        snapshot.rawSourceSnapshotRevision,
      ) as Record<string, unknown> | undefined
    if (!row || row.source_kind !== snapshot.sourceKind || row.source_scope_id !== snapshot.sourceScopeId ||
        row.record_set_completeness !== snapshot.recordSetCompleteness || row.snapshot_json !== snapshotJson) stateInvalid()
    const insertRef = this.db.prepare(`INSERT INTO canonical_model_fact_raw_snapshot_payload_ref_v1 (
      raw_source_snapshot_revision, ordinal, store_id, persisted_payload_sha256,
      record_key, sanitizer_revision, redacted_paths_json, network_payload_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(raw_source_snapshot_revision, ordinal) DO NOTHING`)
    snapshot.rawEnvelopeRefs.forEach((ref, ordinal) => insertRef.run(snapshot.rawSourceSnapshotRevision, ordinal,
      ref.storeId, ref.persistedPayloadSha256, ref.recordKey, ref.sanitizerRevision,
      suppliedByRef.get(rawRefKey(ref))!.redactedPathsJson,
      ref.networkPayloadSha256 ?? null))
    const persistedRefs = this.db.prepare(`SELECT store_id, persisted_payload_sha256, record_key,
      sanitizer_revision, redacted_paths_json, network_payload_sha256
      FROM canonical_model_fact_raw_snapshot_payload_ref_v1
      WHERE raw_source_snapshot_revision=? ORDER BY ordinal`).all(snapshot.rawSourceSnapshotRevision) as
      Array<Record<string, unknown>>
    const expectedRefs = snapshot.rawEnvelopeRefs.map((ref) => ({ store_id: ref.storeId,
      persisted_payload_sha256: ref.persistedPayloadSha256, record_key: ref.recordKey,
      sanitizer_revision: ref.sanitizerRevision,
      redacted_paths_json: suppliedByRef.get(rawRefKey(ref))!.redactedPathsJson,
      network_payload_sha256: ref.networkPayloadSha256 ?? null }))
    if (stableSerializeProviderRequestV2(persistedRefs) !== stableSerializeProviderRequestV2(expectedRefs)) stateInvalid()
  }

  private insertSourceRevision(
    revision: CanonicalSourceRevisionRefV1,
    subjectIndexMode: 'complete' | 'query_bound',
    subjectFactCount: number,
    subjectIndexDigest: string | null,
    now: number,
  ): void {
    const revisionJson = stableSerializeProviderRequestBoundedV2(revision, 65_536)
    this.db.prepare(`INSERT INTO canonical_model_fact_source_revision_v1 (
      canonical_source_revision, source_kind, source_scope_id, raw_source_snapshot_revision,
      adapter_revision, coverage_manifest_revision, provider_authority_registry_revision,
      previous_lkg_source_revision, subject_index_mode, subject_fact_count, subject_index_digest,
      source_revision_json, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(canonical_source_revision) DO NOTHING`).run(
      revision.canonicalSourceRevision, revision.sourceKind, revision.sourceScopeId,
      revision.rawSourceSnapshotRevision, revision.adapterRevision, revision.coverageManifestRevision,
      revision.providerAuthorityRegistryRevision, revision.previousLkgSourceRevision ?? null,
      subjectIndexMode, subjectFactCount, subjectIndexDigest, revisionJson, now,
    )
    const persisted = this.readSourceRevision(revision.canonicalSourceRevision)
    if (!persisted || persisted.subjectIndexMode !== subjectIndexMode ||
        persisted.subjectFactCount !== subjectFactCount || persisted.subjectIndexDigest !== subjectIndexDigest ||
        stableSerializeProviderRequestV2(persisted.sourceRevision) !== revisionJson) stateInvalid()
  }

  private insertSubjectFact(
    fact: CanonicalModelFactSubjectPublicationV1,
    sourceRevision: CanonicalSourceRevisionRefV1,
    now: number,
  ): CanonicalModelFactSubjectPublicationV1 {
    if (fact.payload.sourceRevision.canonicalSourceRevision !== sourceRevision.canonicalSourceRevision ||
        fact.ref.sourceRevision.canonicalSourceRevision !== sourceRevision.canonicalSourceRevision) return invalid()
    const previous = sourceRevision.previousLkgSourceRevision === undefined ? null : this.readSubjectFact({
      canonicalSourceRevision: sourceRevision.previousLkgSourceRevision,
      subject: fact.payload.subject,
    })
    if (hasRetainedLkg(fact.payload) && !previous) return invalid()
    const rebuilt = buildCanonicalSubjectFactV1(factCandidate(fact.payload), previous?.payload)
    if (stableSerializeProviderRequestV2(rebuilt.payload) !== stableSerializeProviderRequestV2(fact.payload) ||
        stableSerializeProviderRequestV2(rebuilt.ref) !== stableSerializeProviderRequestV2(fact.ref)) return invalid()
    this.assertProvenanceRefs(rebuilt.payload)
    const payloadJson = stableSerializeProviderRequestBoundedV2(rebuilt.payload, 4 * 1024 * 1024)
    this.db.prepare(`INSERT INTO canonical_model_fact_subject_fact_v1 (
      canonical_subject_fact_revision, canonical_source_revision, source_kind, source_scope_id,
      provider_authority_id, endpoint_profile_id, native_model_id, subject_fact_payload_digest,
      previous_subject_fact_revision, payload_json, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(canonical_subject_fact_revision) DO NOTHING`).run(
      rebuilt.ref.canonicalSubjectFactRevision, sourceRevision.canonicalSourceRevision,
      sourceRevision.sourceKind, sourceRevision.sourceScopeId, rebuilt.ref.subject.providerAuthorityId,
      rebuilt.ref.subject.endpointProfileId, rebuilt.ref.subject.nativeModelId,
      rebuilt.ref.subjectFactPayloadDigest, hasRetainedLkg(rebuilt.payload)
        ? previous!.ref.canonicalSubjectFactRevision : null, payloadJson, now,
    )
    const insertSourceRef = this.db.prepare(`INSERT INTO canonical_model_fact_subject_fact_source_ref_v1 (
      canonical_subject_fact_revision, canonical_source_revision
    ) VALUES (?, ?) ON CONFLICT(canonical_subject_fact_revision, canonical_source_revision) DO NOTHING`)
    for (const provenanceSourceRevision of provenanceSourceRevisions(rebuilt.payload)) {
      insertSourceRef.run(rebuilt.ref.canonicalSubjectFactRevision, provenanceSourceRevision)
    }
    const persisted = this.readSubjectFactByRevision(rebuilt.ref.canonicalSubjectFactRevision)
    if (!persisted || stableSerializeProviderRequestV2(persisted) !== stableSerializeProviderRequestV2(rebuilt)) stateInvalid()
    return persisted
  }

  private assertProvenanceRefs(payload: CanonicalSubjectFactPayloadV1): void {
    if (!this.provenanceRefsExist(payload)) return invalid()
  }

  private provenanceRefsExist(payload: CanonicalSubjectFactPayloadV1): boolean {
    const statement = this.db.prepare(`SELECT 1
      FROM canonical_model_fact_source_revision_v1 revision
      JOIN canonical_model_fact_raw_snapshot_payload_ref_v1 ref
        ON ref.raw_source_snapshot_revision=revision.raw_source_snapshot_revision
      WHERE revision.canonical_source_revision=? AND ref.store_id=?
        AND ref.persisted_payload_sha256=? AND ref.record_key=? AND ref.sanitizer_revision=?
        AND ((ref.network_payload_sha256 IS NULL AND ? IS NULL) OR ref.network_payload_sha256=?)`)
    for (const entry of provenanceFieldRefs(payload)) {
      const ref = validateRawRef(entry.fieldRef.rawPayloadRef)
      if (!statement.get(entry.canonicalSourceRevision, ref.storeId, ref.persistedPayloadSha256,
        ref.recordKey, ref.sanitizerRevision, ref.networkPayloadSha256 ?? null,
        ref.networkPayloadSha256 ?? null)) return false
    }
    return true
  }

  private readRawSnapshot(revisionValue: string): RawSourceSnapshotRefV1 | null {
    const revision = boundedInput(revisionValue, 256)
    const row = this.db.prepare(`SELECT source_kind, source_scope_id, record_set_completeness, snapshot_json
      FROM canonical_model_fact_raw_snapshot_v1 WHERE raw_source_snapshot_revision=?`).get(revision) as
      Record<string, unknown> | undefined
    if (!row) return null
    const parsed = parseJson(row.snapshot_json, 1024 * 1024) as RawSourceSnapshotRefV1
    const decoded = this.validateRawSnapshot(parsed)
    if (decoded.rawSourceSnapshotRevision !== revision || decoded.sourceKind !== row.source_kind ||
        decoded.sourceScopeId !== row.source_scope_id || decoded.recordSetCompleteness !== row.record_set_completeness ||
        stableSerializeProviderRequestV2(decoded) !== row.snapshot_json) return stateInvalid()
    const persistedRefs = (this.db.prepare(`SELECT store_id, persisted_payload_sha256, record_key,
      sanitizer_revision, network_payload_sha256
      FROM canonical_model_fact_raw_snapshot_payload_ref_v1
      WHERE raw_source_snapshot_revision=? ORDER BY ordinal`).all(revision) as Array<Record<string, unknown>>)
      .map((ref) => ({ storeId: String(ref.store_id), persistedPayloadSha256: String(ref.persisted_payload_sha256),
        recordKey: String(ref.record_key), sanitizerRevision: String(ref.sanitizer_revision),
        ...(ref.network_payload_sha256 === null ? {} : { networkPayloadSha256: String(ref.network_payload_sha256) }) }))
    if (stableSerializeProviderRequestV2(persistedRefs) !== stableSerializeProviderRequestV2(decoded.rawEnvelopeRefs)) {
      return stateInvalid()
    }
    return decoded
  }

  private assertCompleteSubjectIndex(
    canonicalSourceRevision: string,
    expectedCount: number,
    expectedDigest: string,
  ): void {
    const revisions = (this.db.prepare(`SELECT canonical_subject_fact_revision
      FROM canonical_model_fact_subject_fact_v1 WHERE canonical_source_revision=?
      ORDER BY canonical_subject_fact_revision`).all(canonicalSourceRevision) as
      Array<{ canonical_subject_fact_revision: unknown }>).map((row) => String(row.canonical_subject_fact_revision))
    if (revisions.length !== expectedCount || canonicalSourceFactDigestV1(revisions) !== expectedDigest) stateInvalid()
  }

  private decodeSubjectFactRow(row: SubjectFactRow): CanonicalModelFactSubjectPublicationV1 {
    if (typeof row.payload_json !== 'string') return stateInvalid()
    const payload = parseJson(row.payload_json, 4 * 1024 * 1024) as CanonicalSubjectFactPayloadV1
    const sourceRevision = decodeCanonicalSourceRevisionRefV1(payload.sourceRevision)
    const semanticPayload = { schemaVersion: payload.schemaVersion, subject: payload.subject,
      sourceRevision: payload.sourceRevision, recordOutcome: payload.recordOutcome,
      outcomes: payload.outcomes, unmappedSourceFields: payload.unmappedSourceFields }
    const subjectFactPayloadDigest = canonicalSourceFactDigestV1(semanticPayload)
    const canonicalSubjectFactRevision = `canonical-subject-fact-v1:${canonicalSourceFactDigestV1({
      canonicalSourceRevision: sourceRevision.canonicalSourceRevision,
      subject: payload.subject,
      subjectFactPayloadDigest,
    })}`
    const ref = Object.freeze({ sourceRevision, subject: payload.subject,
      subjectFactPayloadDigest, canonicalSubjectFactRevision })
    if (payload.schemaVersion !== 1 || payload.subjectFactPayloadDigest !== subjectFactPayloadDigest ||
        row.canonical_subject_fact_revision !== ref.canonicalSubjectFactRevision ||
        row.canonical_source_revision !== ref.sourceRevision.canonicalSourceRevision ||
        row.source_kind !== sourceRevision.sourceKind || row.source_scope_id !== sourceRevision.sourceScopeId ||
        row.provider_authority_id !== ref.subject.providerAuthorityId ||
        row.endpoint_profile_id !== ref.subject.endpointProfileId ||
        row.native_model_id !== ref.subject.nativeModelId ||
        row.subject_fact_payload_digest !== ref.subjectFactPayloadDigest ||
        hasRetainedLkg(payload) !== (row.previous_subject_fact_revision !== null) ||
        stableSerializeProviderRequestV2(payload) !== row.payload_json ||
        !Number.isSafeInteger(row.created_at_ms) || !this.provenanceRefsExist(payload)) return stateInvalid()
    const persistedSourceRefs = (this.db.prepare(`SELECT canonical_source_revision
      FROM canonical_model_fact_subject_fact_source_ref_v1
      WHERE canonical_subject_fact_revision=? ORDER BY canonical_source_revision`).all(
        ref.canonicalSubjectFactRevision,
      ) as Array<{ canonical_source_revision: unknown }>).map((entry) => String(entry.canonical_source_revision))
    if (stableSerializeProviderRequestV2(persistedSourceRefs) !==
        stableSerializeProviderRequestV2(provenanceSourceRevisions(payload))) return stateInvalid()
    return Object.freeze({ payload, ref })
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.savepointSequence += 1
    const savepoint = `canonical_model_fact_source_v1_${this.savepointSequence}`
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
        return stateInvalid()
      }
      throw error
    }
  }
}
