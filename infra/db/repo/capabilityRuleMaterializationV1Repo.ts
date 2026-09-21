import type BetterSqlite3 from 'better-sqlite3'
import { stableSerializeProviderRequestV2 } from
  '../../../src/next/generation-v2/compiler/stableSerialize'
import type { PreparedCapabilityRuleMaterializationV1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { MATERIALIZED_CAPABILITY_RULE_COVERAGE_MANIFEST_V1 } from
  '../../../src/next/generation-v2/model-facts/sourceCoverageManifestV1'
import { PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 } from
  '../../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import { CapabilityRuleCoreV1Repo } from './capabilityRuleCoreV1Repo'
import {
  CanonicalModelFactSourceV1Repo,
  type CanonicalModelFactStagedSourceResultV1,
} from './canonicalModelFactSourceV1Repo'

export type CapabilityRuleMaterializationStageV1 = Readonly<{
  sourceScopeId: string
  materializationRevision: string
  canonicalSourceRevision: string
  ruleDefinitionRevision: string
  authoritativeSubjectSetRevision: string
  ownerSnapshotRevisions: PreparedCapabilityRuleMaterializationV1['ownerSnapshotRevisions']
  createdAtMs: number
  updatedAtMs: number
}>

export type CapabilityRuleMaterializationStageResultV1 = Readonly<{
  stage: CapabilityRuleMaterializationStageV1
  source: CanonicalModelFactStagedSourceResultV1
}>

export class CapabilityRuleMaterializationV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE') {
    super(code)
    this.name = 'CapabilityRuleMaterializationV1RepoError'
  }
}

function invalid(): never {
  throw new CapabilityRuleMaterializationV1RepoError(
    'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_INVALID')
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid()
  return value as number
}

function bounded(value: unknown, prefix: string, maximum = 256): string {
  if (typeof value !== 'string' || value.length < prefix.length + 64 || value.length > maximum ||
      !value.startsWith(prefix)) invalid()
  return value
}

function parseOwnerSnapshots(value: unknown): PreparedCapabilityRuleMaterializationV1['ownerSnapshotRevisions'] {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1024 * 1024) invalid()
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { return invalid() }
  if (!Array.isArray(parsed)) invalid()
  const entries = parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid()
    const candidate = entry as Record<string, unknown>
    if (Object.keys(candidate).sort().join('\0') !== ['ownerId', 'ownership', 'snapshotRevision'].sort().join('\0') ||
        (candidate.ownership !== 'cloud' && candidate.ownership !== 'user') ||
        typeof candidate.ownerId !== 'string') invalid()
    return Object.freeze({ ownership: candidate.ownership, ownerId: candidate.ownerId,
      snapshotRevision: bounded(candidate.snapshotRevision, 'capability-rule-owner-snapshot-v1:') })
  }).sort((left, right) => `${left.ownership}\0${left.ownerId}`.localeCompare(
    `${right.ownership}\0${right.ownerId}`, 'en'))
  if (new Set(entries.map((entry) => `${entry.ownership}\0${entry.ownerId}`)).size !== entries.length) invalid()
  return Object.freeze(entries)
}

export class CapabilityRuleMaterializationV1Repo {
  readonly #ruleRepo: CapabilityRuleCoreV1Repo
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  #savepointSequence = 0

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.#ruleRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
  }

  readStage(sourceScopeId: string): CapabilityRuleMaterializationStageV1 | null {
    if (!sourceScopeId || sourceScopeId.length > 1024) invalid()
    const row = this.db.prepare(`SELECT source_scope_id, materialization_revision,
      canonical_source_revision, rule_definition_revision, authoritative_subject_set_revision,
      owner_snapshot_revisions_json, created_at_ms, updated_at_ms
      FROM capability_rule_materialization_stage_v1 WHERE source_scope_id=?`).get(sourceScopeId) as
      Record<string, unknown> | undefined
    if (!row) return null
    if (row.source_scope_id !== sourceScopeId || typeof row.canonical_source_revision !== 'string') invalid()
    return Object.freeze({ sourceScopeId,
      materializationRevision: bounded(row.materialization_revision, 'capability-rule-materialization-v1:'),
      canonicalSourceRevision: row.canonical_source_revision,
      ruleDefinitionRevision: bounded(row.rule_definition_revision, 'capability-rule-definition-set-v1:'),
      authoritativeSubjectSetRevision: bounded(row.authoritative_subject_set_revision,
        'authoritative-model-subject-set-v1:'),
      ownerSnapshotRevisions: parseOwnerSnapshots(row.owner_snapshot_revisions_json),
      createdAtMs: safeTime(row.created_at_ms), updatedAtMs: safeTime(row.updated_at_ms) })
  }

  requiresMaterialization(input: Readonly<{
    sourceScopeId: string
    ruleDefinitionRevision: string
    authoritativeSubjectSetRevision: string
  }>): boolean {
    const stage = this.readStage(input.sourceScopeId)
    if (!stage || stage.ruleDefinitionRevision !== input.ruleDefinitionRevision ||
        stage.authoritativeSubjectSetRevision !== input.authoritativeSubjectSetRevision) return true
    const source = this.#sourceRepo.readSourceRevision(stage.canonicalSourceRevision)
    return !source || source.subjectIndexMode !== 'complete' ||
      source.sourceRevision.adapterRevision !== MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1 ||
      source.sourceRevision.coverageManifestRevision !==
        MATERIALIZED_CAPABILITY_RULE_COVERAGE_MANIFEST_V1.manifestRevision ||
      source.sourceRevision.providerAuthorityRegistryRevision !== PROVIDER_AUTHORITY_REGISTRY_REVISION_V1
  }

  stagePrepared(input: Readonly<{
    prepared: PreparedCapabilityRuleMaterializationV1
    expectedMaterializationRevision: string | null
    currentAuthoritativeSubjectSetRevision: string
  }>): CapabilityRuleMaterializationStageResultV1 {
    const prepared = input.prepared
    const expected = input.expectedMaterializationRevision === null ? null
      : bounded(input.expectedMaterializationRevision, 'capability-rule-materialization-v1:')
    const currentSubjectSetRevision = bounded(input.currentAuthoritativeSubjectSetRevision,
      'authoritative-model-subject-set-v1:')
    const serializedOwnerSnapshots = stableSerializeProviderRequestV2(prepared.ownerSnapshotRevisions)
    return this.#runImmediate(() => {
      const current = this.readStage(prepared.sourceScopeId)
      if ((current?.materializationRevision ?? null) !== expected) {
        throw new CapabilityRuleMaterializationV1RepoError(
          'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE')
      }
      if (prepared.authoritativeSubjectSetRevision !== currentSubjectSetRevision) {
        throw new CapabilityRuleMaterializationV1RepoError(
          'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE')
      }
      const currentOwnerSnapshots = this.#ruleRepo.listOwnershipSnapshots().map((snapshot) => Object.freeze({
        ownership: snapshot.projected.definition.ownership,
        ownerId: snapshot.projected.definition.ownerId,
        snapshotRevision: snapshot.projected.snapshotRevision,
      }))
      if (stableSerializeProviderRequestV2(currentOwnerSnapshots) !== serializedOwnerSnapshots) {
        throw new CapabilityRuleMaterializationV1RepoError(
          'GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_STAGE_STALE')
      }
      const source = this.#sourceRepo.stageCompleteSourceRevision({ rawPayloads: [prepared.rawPayload],
        rawSnapshot: prepared.rawSnapshot, sourceRevision: prepared.publication.sourceRevision,
        subjectFacts: prepared.publication.subjectFacts })
      if (source.source.sourceRevision.canonicalSourceRevision !==
          prepared.publication.sourceRevision.canonicalSourceRevision) invalid()
      const now = safeTime(this.nowMs())
      const createdAt = current?.createdAtMs ?? now
      this.db.prepare(`INSERT INTO capability_rule_materialization_stage_v1 (
        source_scope_id, materialization_revision, canonical_source_revision,
        rule_definition_revision, authoritative_subject_set_revision,
        owner_snapshot_revisions_json, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_scope_id) DO UPDATE SET
        materialization_revision=excluded.materialization_revision,
        canonical_source_revision=excluded.canonical_source_revision,
        rule_definition_revision=excluded.rule_definition_revision,
        authoritative_subject_set_revision=excluded.authoritative_subject_set_revision,
        owner_snapshot_revisions_json=excluded.owner_snapshot_revisions_json,
        updated_at_ms=excluded.updated_at_ms`).run(prepared.sourceScopeId,
        prepared.materializationRevision, prepared.publication.sourceRevision.canonicalSourceRevision,
        prepared.ruleDefinitionRevision, prepared.authoritativeSubjectSetRevision,
        serializedOwnerSnapshots, createdAt, now)
      return Object.freeze({ stage: this.readStage(prepared.sourceScopeId)!, source })
    })
  }

  #runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.#savepointSequence += 1
    const savepoint = `capability_rule_materialization_v1_${this.#savepointSequence}`
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
