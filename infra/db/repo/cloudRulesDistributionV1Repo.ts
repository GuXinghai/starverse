import type BetterSqlite3 from 'better-sqlite3'
import {
  canonicalSourceFactDigestV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  decodeCloudRulesReleaseDocumentV1,
  decodeCloudRulesReleaseMetadataV1,
  projectCloudRulesReleaseMetadataV1,
  type CloudRulesReleaseDocumentV1,
  type CloudRulesReleaseMetadataV1,
  type CloudRulesValidatedPublicationV1,
} from '../../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import { stableSerializeProviderRequestV2 } from
  '../../../src/next/generation-v2/compiler/stableSerialize'

export type CloudRulesCandidateRecordV1 = Readonly<{
  candidateRecordRevision: string
  releaseVersion: string
  contentRevision: string
  releaseMetadata: CloudRulesReleaseMetadataV1
  document: CloudRulesReleaseDocumentV1
  documentSha256: string
  rawAssetSha256: string
  fetchedAtMs: number
}>

export type CloudRulesDistributionStateV1 = Readonly<{
  stateRevision: number
  lastAttemptedAtMs: number | null
  lastSuccessfulCheckAtMs: number | null
  lastFailureCode: string | null
  latestObserved: Readonly<{
    releaseVersion: string
    contentRevision: string
    releaseMetadata: CloudRulesReleaseMetadataV1
  }> | null
  candidate: CloudRulesCandidateRecordV1 | null
  appliedContentRevision: string | null
  updatedAtMs: number
}>

export type PreparedCloudRulesCandidateV1 = Readonly<{
  candidateRecordRevision: string
  releaseVersion: string
  contentRevision: string
  releaseMetadata: CloudRulesReleaseMetadataV1
  releaseMetadataJson: string
  document: CloudRulesReleaseDocumentV1
  documentJson: string
  documentSha256: string
  rawAssetSha256: string
  fetchedAtMs: number
}>

type StateRow = Readonly<{
  state_revision: unknown
  last_attempted_at_ms: unknown
  last_successful_check_at_ms: unknown
  last_failure_code: unknown
  latest_release_version: unknown
  latest_content_revision: unknown
  latest_release_metadata_json: unknown
  candidate_record_revision: unknown
  candidate_release_version: unknown
  candidate_content_revision: unknown
  candidate_release_metadata_json: unknown
  candidate_document_json: unknown
  candidate_document_sha256: unknown
  candidate_raw_asset_sha256: unknown
  candidate_fetched_at_ms: unknown
  applied_content_revision: unknown
  updated_at_ms: unknown
}>

export class CloudRulesDistributionV1RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CLOUD_RULES_DISTRIBUTION_INVALID'
    | 'GENERATION_V2_CLOUD_RULES_RELEASE_VERSION_DRIFT'
    | 'GENERATION_V2_CLOUD_RULES_DISTRIBUTION_STALE') {
    super(code)
    this.name = 'CloudRulesDistributionV1RepoError'
  }
}

function invalid(): never {
  throw new CloudRulesDistributionV1RepoError('GENERATION_V2_CLOUD_RULES_DISTRIBUTION_INVALID')
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid()
  return value as number
}

function nullableTime(value: unknown): number | null {
  return value === null ? null : safeTime(value)
}

function nullableText(value: unknown, max = 16_384): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > max) invalid()
  return value
}

function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

function contentRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) invalid()
  return value
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') invalid()
  try {
    return JSON.parse(value) as unknown
  } catch {
    return invalid()
  }
}

function emptyState(): CloudRulesDistributionStateV1 {
  return Object.freeze({ stateRevision: 0, lastAttemptedAtMs: null,
    lastSuccessfulCheckAtMs: null, lastFailureCode: null, latestObserved: null,
    candidate: null, appliedContentRevision: null, updatedAtMs: 0 })
}

function decodeStateRow(row: StateRow | undefined): CloudRulesDistributionStateV1 {
  if (!row) return emptyState()
  const stateRevision = safeTime(row.state_revision)
  const lastAttemptedAtMs = nullableTime(row.last_attempted_at_ms)
  const lastSuccessfulCheckAtMs = nullableTime(row.last_successful_check_at_ms)
  const lastFailureCode = nullableText(row.last_failure_code, 128)
  const updatedAtMs = safeTime(row.updated_at_ms)
  const appliedContentRevision = row.applied_content_revision === null
    ? null : contentRevision(row.applied_content_revision)

  const latestValues = [row.latest_release_version, row.latest_content_revision,
    row.latest_release_metadata_json]
  const latestObserved = latestValues.every((value) => value === null) ? null : (() => {
    if (latestValues.some((value) => value === null)) return invalid()
    const releaseMetadata = decodeCloudRulesReleaseMetadataV1(parseJson(row.latest_release_metadata_json))
    const releaseVersion = nullableText(row.latest_release_version, 64)!
    const revision = contentRevision(row.latest_content_revision)
    if (releaseMetadata.releaseVersion !== releaseVersion) invalid()
    return Object.freeze({ releaseVersion, contentRevision: revision, releaseMetadata })
  })()

  const candidateValues = [row.candidate_record_revision, row.candidate_release_version,
    row.candidate_content_revision, row.candidate_release_metadata_json, row.candidate_document_json,
    row.candidate_document_sha256, row.candidate_raw_asset_sha256, row.candidate_fetched_at_ms]
  const candidate = candidateValues.every((value) => value === null) ? null : (() => {
    if (candidateValues.some((value) => value === null)) return invalid()
    const candidateRecordRevision = nullableText(row.candidate_record_revision, 128)!
    if (!/^cloud-rules-candidate-v1:[0-9a-f]{64}$/u.test(candidateRecordRevision)) invalid()
    const releaseVersion = nullableText(row.candidate_release_version, 64)!
    const revision = contentRevision(row.candidate_content_revision)
    const releaseMetadata = decodeCloudRulesReleaseMetadataV1(parseJson(row.candidate_release_metadata_json))
    const document = decodeCloudRulesReleaseDocumentV1(parseJson(row.candidate_document_json), releaseVersion)
    const documentSha256 = digest(row.candidate_document_sha256)
    const rawAssetSha256 = digest(row.candidate_raw_asset_sha256)
    const fetchedAtMs = safeTime(row.candidate_fetched_at_ms)
    if (releaseMetadata.releaseVersion !== releaseVersion || document.contentRevision !== revision ||
        canonicalSourceFactDigestV1(document) !== documentSha256 ||
        candidateRevision(revision) !== candidateRecordRevision) {
      invalid()
    }
    return Object.freeze({ candidateRecordRevision, releaseVersion, contentRevision: revision,
      releaseMetadata, document, documentSha256, rawAssetSha256, fetchedAtMs })
  })()
  if (lastSuccessfulCheckAtMs !== null && lastAttemptedAtMs !== null &&
      lastSuccessfulCheckAtMs > lastAttemptedAtMs) invalid()
  return Object.freeze({ stateRevision, lastAttemptedAtMs, lastSuccessfulCheckAtMs, lastFailureCode,
    latestObserved, candidate, appliedContentRevision, updatedAtMs })
}

function candidateRevision(revision: string): string {
  return `cloud-rules-candidate-v1:${contentRevision(revision).slice('sha256:'.length)}`
}

export function prepareCloudRulesCandidateV1(input: Readonly<{
  publication: CloudRulesValidatedPublicationV1
  rawAssetSha256: string
  fetchedAtMs: number
}>): PreparedCloudRulesCandidateV1 {
  const fetchedAtMs = safeTime(input.fetchedAtMs)
  const rawAssetSha256 = digest(input.rawAssetSha256)
  const releaseMetadata = projectCloudRulesReleaseMetadataV1(input.publication)
  const document = decodeCloudRulesReleaseDocumentV1(
    input.publication.document, input.publication.release.releaseVersion)
  const releaseMetadataJson = stableSerializeProviderRequestV2(releaseMetadata)
  const documentJson = stableSerializeProviderRequestV2(document)
  const documentSha256 = canonicalSourceFactDigestV1(document)
  return Object.freeze({
    candidateRecordRevision: candidateRevision(document.contentRevision),
    releaseVersion: document.releaseVersion,
    contentRevision: document.contentRevision,
    releaseMetadata,
    releaseMetadataJson,
    document,
    documentJson,
    documentSha256,
    rawAssetSha256,
    fetchedAtMs,
  })
}

export class CloudRulesDistributionV1Repo {
  private savepointSequence = 0

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {}

  readState(): CloudRulesDistributionStateV1 {
    return decodeStateRow(this.readRow())
  }

  readReleaseVersionBinding(releaseVersion: string): string | null {
    const row = this.db.prepare(`SELECT content_revision FROM cloud_rules_release_version_ledger_v1
      WHERE release_version=?`).get(releaseVersion) as { content_revision: unknown } | undefined
    return row ? contentRevision(row.content_revision) : null
  }

  recordFailure(input: Readonly<{ attemptedAtMs: number; failureCode: string }>): CloudRulesDistributionStateV1 {
    const attemptedAtMs = safeTime(input.attemptedAtMs)
    if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(input.failureCode)) invalid()
    return this.db.transaction(() => {
      const current = decodeStateRow(this.readRow())
      const updatedAtMs = Math.max(safeTime(this.nowMs()), current.updatedAtMs, attemptedAtMs)
      this.writeState({ ...current, stateRevision: current.stateRevision + 1,
        lastAttemptedAtMs: attemptedAtMs, lastFailureCode: input.failureCode, updatedAtMs })
      return decodeStateRow(this.readRow())
    }).immediate()
  }

  publishSuccessfulCheck(input: Readonly<{
    checkedAtMs: number
    candidate: PreparedCloudRulesCandidateV1 | null
    suppressCandidate?: boolean
  }>): CloudRulesDistributionStateV1 {
    const checkedAtMs = safeTime(input.checkedAtMs)
    return this.runImmediate(() => {
      const current = decodeStateRow(this.readRow())
      const prepared = input.candidate
      if (prepared) {
        const existing = this.readReleaseVersionBinding(prepared.releaseVersion)
        if (existing !== null && existing !== prepared.contentRevision) {
          throw new CloudRulesDistributionV1RepoError('GENERATION_V2_CLOUD_RULES_RELEASE_VERSION_DRIFT')
        }
        this.db.prepare(`INSERT INTO cloud_rules_release_version_ledger_v1 (
          release_version, content_revision, first_observed_at_ms, last_observed_at_ms
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(release_version) DO UPDATE SET last_observed_at_ms=excluded.last_observed_at_ms
        WHERE cloud_rules_release_version_ledger_v1.content_revision=excluded.content_revision`).run(
          prepared.releaseVersion, prepared.contentRevision, checkedAtMs, checkedAtMs)
      }
      const nextCandidate = input.suppressCandidate || prepared === null ||
        prepared.contentRevision === current.appliedContentRevision
        ? null
        : current.candidate?.contentRevision === prepared.contentRevision
          ? current.candidate
          : prepared
      const updatedAtMs = Math.max(safeTime(this.nowMs()), current.updatedAtMs, checkedAtMs)
      this.writeState({
        ...current,
        stateRevision: current.stateRevision + 1,
        lastAttemptedAtMs: checkedAtMs,
        lastSuccessfulCheckAtMs: checkedAtMs,
        lastFailureCode: null,
        latestObserved: prepared === null ? null : Object.freeze({
          releaseVersion: prepared.releaseVersion,
          contentRevision: prepared.contentRevision,
          releaseMetadata: prepared.releaseMetadata,
        }),
        candidate: nextCandidate,
        updatedAtMs,
      })
      return decodeStateRow(this.readRow())
    })
  }

  markApplied(input: Readonly<{
    expectedCandidateRecordRevision: string | null
    expectedAppliedContentRevision: string | null
    appliedContentRevision: string
    consumeCandidate: boolean
  }>): CloudRulesDistributionStateV1 {
    const appliedContentRevision = contentRevision(input.appliedContentRevision)
    return this.runImmediate(() => {
      const current = decodeStateRow(this.readRow())
      if ((current.candidate?.candidateRecordRevision ?? null) !== input.expectedCandidateRecordRevision ||
          current.appliedContentRevision !== input.expectedAppliedContentRevision) {
        throw new CloudRulesDistributionV1RepoError('GENERATION_V2_CLOUD_RULES_DISTRIBUTION_STALE')
      }
      const updatedAtMs = Math.max(safeTime(this.nowMs()), current.updatedAtMs)
      this.writeState({ ...current, stateRevision: current.stateRevision + 1,
        candidate: input.consumeCandidate ? null : current.candidate,
        appliedContentRevision, updatedAtMs })
      return decodeStateRow(this.readRow())
    })
  }

  clearCandidateForPin(input: Readonly<{
    expectedCandidateRecordRevision: string | null
    expectedAppliedContentRevision: string | null
  }>): CloudRulesDistributionStateV1 {
    return this.runImmediate(() => {
      const current = decodeStateRow(this.readRow())
      if ((current.candidate?.candidateRecordRevision ?? null) !== input.expectedCandidateRecordRevision ||
          current.appliedContentRevision !== input.expectedAppliedContentRevision) {
        throw new CloudRulesDistributionV1RepoError('GENERATION_V2_CLOUD_RULES_DISTRIBUTION_STALE')
      }
      const updatedAtMs = Math.max(safeTime(this.nowMs()), current.updatedAtMs)
      this.writeState({ ...current, stateRevision: current.stateRevision + 1,
        candidate: null, updatedAtMs })
      return decodeStateRow(this.readRow())
    })
  }

  private readRow(): StateRow | undefined {
    return this.db.prepare(`SELECT state_revision, last_attempted_at_ms, last_successful_check_at_ms,
      last_failure_code, latest_release_version, latest_content_revision,
      latest_release_metadata_json, candidate_record_revision, candidate_release_version,
      candidate_content_revision, candidate_release_metadata_json, candidate_document_json,
      candidate_document_sha256, candidate_raw_asset_sha256, candidate_fetched_at_ms,
      applied_content_revision, updated_at_ms
      FROM cloud_rules_distribution_state_v1 WHERE singleton_id=1`).get() as StateRow | undefined
  }

  private writeState(state: CloudRulesDistributionStateV1): void {
    const latest = state.latestObserved
    const candidate = state.candidate
    this.db.prepare(`INSERT INTO cloud_rules_distribution_state_v1 (
      singleton_id, state_revision, last_attempted_at_ms, last_successful_check_at_ms,
      last_failure_code, latest_release_version, latest_content_revision,
      latest_release_metadata_json, candidate_record_revision, candidate_release_version,
      candidate_content_revision, candidate_release_metadata_json, candidate_document_json,
      candidate_document_sha256, candidate_raw_asset_sha256, candidate_fetched_at_ms,
      applied_content_revision, updated_at_ms
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      state_revision=excluded.state_revision,
      last_attempted_at_ms=excluded.last_attempted_at_ms,
      last_successful_check_at_ms=excluded.last_successful_check_at_ms,
      last_failure_code=excluded.last_failure_code,
      latest_release_version=excluded.latest_release_version,
      latest_content_revision=excluded.latest_content_revision,
      latest_release_metadata_json=excluded.latest_release_metadata_json,
      candidate_record_revision=excluded.candidate_record_revision,
      candidate_release_version=excluded.candidate_release_version,
      candidate_content_revision=excluded.candidate_content_revision,
      candidate_release_metadata_json=excluded.candidate_release_metadata_json,
      candidate_document_json=excluded.candidate_document_json,
      candidate_document_sha256=excluded.candidate_document_sha256,
      candidate_raw_asset_sha256=excluded.candidate_raw_asset_sha256,
      candidate_fetched_at_ms=excluded.candidate_fetched_at_ms,
      applied_content_revision=excluded.applied_content_revision,
      updated_at_ms=excluded.updated_at_ms`).run(
      state.stateRevision, state.lastAttemptedAtMs, state.lastSuccessfulCheckAtMs,
      state.lastFailureCode, latest?.releaseVersion ?? null, latest?.contentRevision ?? null,
      latest ? stableSerializeProviderRequestV2(latest.releaseMetadata) : null,
      candidate?.candidateRecordRevision ?? null, candidate?.releaseVersion ?? null,
      candidate?.contentRevision ?? null,
      candidate ? stableSerializeProviderRequestV2(candidate.releaseMetadata) : null,
      candidate ? stableSerializeProviderRequestV2(candidate.document) : null,
      candidate?.documentSha256 ?? null, candidate?.rawAssetSha256 ?? null,
      candidate?.fetchedAtMs ?? null, state.appliedContentRevision, state.updatedAtMs)
  }

  private runImmediate<T>(run: () => T): T {
    if (!this.db.inTransaction) return this.db.transaction(run).immediate()
    this.savepointSequence += 1
    const savepoint = `cloud_rules_distribution_v1_${this.savepointSequence}`
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
