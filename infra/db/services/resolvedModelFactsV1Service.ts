import type BetterSqlite3 from 'better-sqlite3'
import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
  type CanonicalSourceKindV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  resolveModelFactsV1,
} from '../../../src/next/generation-v2/model-facts/resolveModelFactsV1'
import {
  RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1,
} from '../../../src/next/generation-v2/model-facts/resolvedModelFactsV1'
import {
  CanonicalModelFactSourceV1Repo,
} from '../repo/canonicalModelFactSourceV1Repo'
import {
  ResolvedModelFactsV1Repo,
  type ResolvedModelFactsCurrentV1,
  type ResolvedModelFactsSourceScopeSelectionV1,
} from '../repo/resolvedModelFactsV1Repo'
import { SourcePriorityConfigV1Repo } from '../repo/sourcePriorityConfigV1Repo'

export const MODEL_FACTS_RESOLVER_REVISION_V1 = 'model-facts-resolver-v1:three-source-priority-2026-09-22'
export const MODEL_FACTS_ONTOLOGY_REVISION_V1 = `resolved-model-facts-ontology-v1:${RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1}`

function boundedScope(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || value.trim() !== value) {
    throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_INPUT_INVALID')
  }
  return value
}

type ResolvedModelFactsSourceInputV1 = Readonly<{
  kind: 'present'
  ref: CanonicalSubjectFactRefV1
  payload: CanonicalSubjectFactPayloadV1
}> | Readonly<{ kind: 'absent'; reason: 'not_available' | 'not_configured' | 'no_exact_subject' | 'not_eligible' }>

function sourceInput(
  repo: CanonicalModelFactSourceV1Repo,
  kind: CanonicalSourceKindV1,
  scope: string,
  subject: CanonicalModelSubjectV1,
): ResolvedModelFactsSourceInputV1 {
  const state = repo.readSourceState(kind, scope)
  if (!state || state.currentSourceRevision === null) return Object.freeze({ kind: 'absent', reason: 'not_available' })
  const source = repo.readSourceRevision(state.currentSourceRevision)
  if (!source) throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_STATE_INVALID')
  const subjectFact = repo.readSubjectFact({ canonicalSourceRevision: state.currentSourceRevision, subject })
  if (subjectFact) return Object.freeze({ kind: 'present', ref: subjectFact.ref, payload: subjectFact.payload })
  return Object.freeze({ kind: 'absent', reason: source.rawSnapshot.recordSetCompleteness === 'complete'
    ? 'no_exact_subject' as const : 'not_eligible' as const })
}

export class ResolvedModelFactsV1Service {
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  readonly #priorityRepo: SourcePriorityConfigV1Repo
  readonly #resolvedRepo: ResolvedModelFactsV1Repo

  constructor(private readonly db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
    this.#priorityRepo = new SourcePriorityConfigV1Repo(db, nowMs)
    this.#resolvedRepo = new ResolvedModelFactsV1Repo(db, nowMs)
  }

  resolveAndPublish(input: Readonly<{
    subject: CanonicalModelSubjectV1
    sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
    resolverRevision?: string
    ontologyRevision?: string
  }>): ResolvedModelFactsCurrentV1 {
    const transaction = this.db.transaction(() => this.resolveAndPublishInActiveTransaction(input))
    return transaction.immediate()
  }

  resolveAndPublishInActiveTransaction(input: Readonly<{
    subject: CanonicalModelSubjectV1
    sourceScopeSelection: ResolvedModelFactsSourceScopeSelectionV1
    resolverRevision?: string
    ontologyRevision?: string
  }>): ResolvedModelFactsCurrentV1 {
    if (!this.db.inTransaction) throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_TRANSACTION_REQUIRED')
    const subject = canonicalizeCanonicalModelSubjectV1(input.subject)
    const sourceScopeSelection = Object.freeze({
      providerNative: boundedScope(input.sourceScopeSelection.providerNative),
      modelsDev: boundedScope(input.sourceScopeSelection.modelsDev),
      capabilityRules: boundedScope(input.sourceScopeSelection.capabilityRules),
    })
    const resolverRevision = input.resolverRevision ?? MODEL_FACTS_RESOLVER_REVISION_V1
    const ontologyRevision = input.ontologyRevision ?? MODEL_FACTS_ONTOLOGY_REVISION_V1
    if (resolverRevision.length < 1 || resolverRevision.length > 256 || ontologyRevision.length < 1 || ontologyRevision.length > 256) {
      throw new Error('GENERATION_V2_RESOLVED_MODEL_FACTS_INPUT_INVALID')
    }
    const configFact = this.#priorityRepo.get()
    const resolutionInput = {
      schemaVersion: 1 as const,
      subject,
      sources: {
        providerNative: sourceInput(this.#sourceRepo, 'provider_native', sourceScopeSelection.providerNative, subject),
        modelsDev: sourceInput(this.#sourceRepo, 'models_dev', sourceScopeSelection.modelsDev, subject),
        capabilityRules: sourceInput(this.#sourceRepo, 'capability_rule', sourceScopeSelection.capabilityRules, subject),
      },
      sourcePriorityConfigRevision: configFact.config.sourcePriorityConfigRevision,
      resolverRevision,
      ontologyRevision,
    }
    const resolvedFacts = resolveModelFactsV1({
      resolutionInput,
      sourcePriorityConfig: configFact.config,
    })
    const previous = (() => {
      try { return this.#resolvedRepo.readCurrent(subject) } catch { return null }
    })()
    const current = this.#resolvedRepo.publishInActiveTransaction({ subject, sourceScopeSelection, resolvedFacts })
    const snapshotOwner = current.snapshot.resolvedSnapshotRevision
    const currentOwner = `resolved-model-facts-current-v1:${canonicalSourceFactDigestV1(subject)}`
    const presentSources = [resolvedFacts.input.sources.providerNative, resolvedFacts.input.sources.modelsDev,
      resolvedFacts.input.sources.capabilityRules]
    if (previous?.snapshot.resolvedSnapshotRevision !== current.snapshot.resolvedSnapshotRevision) {
      this.#sourceRepo.releaseRetentionPins('resolved_model_facts_current_v1', currentOwner)
    }
    for (const source of presentSources) {
      if (source.kind !== 'present') continue
      this.#sourceRepo.pinRetention({ ownerKind: 'resolved_model_facts_snapshot_v1', ownerId: snapshotOwner,
        target: { kind: 'source_revision', canonicalSourceRevision: source.ref.sourceRevision.canonicalSourceRevision } })
      this.#sourceRepo.pinRetention({ ownerKind: 'resolved_model_facts_snapshot_v1', ownerId: snapshotOwner,
        target: { kind: 'subject_fact', canonicalSubjectFactRevision: source.ref.canonicalSubjectFactRevision } })
      this.#sourceRepo.pinRetention({ ownerKind: 'resolved_model_facts_current_v1', ownerId: currentOwner,
        target: { kind: 'source_revision', canonicalSourceRevision: source.ref.sourceRevision.canonicalSourceRevision } })
      this.#sourceRepo.pinRetention({ ownerKind: 'resolved_model_facts_current_v1', ownerId: currentOwner,
        target: { kind: 'subject_fact', canonicalSubjectFactRevision: source.ref.canonicalSubjectFactRevision } })
    }
    return current
  }

  readCurrent(subject: CanonicalModelSubjectV1): ResolvedModelFactsCurrentV1 {
    return this.#resolvedRepo.readCurrent(subject)
  }

}
