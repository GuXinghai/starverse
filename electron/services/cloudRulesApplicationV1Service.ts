import type BetterSqlite3 from 'better-sqlite3'
import {
  CLOUD_RULES_OFFICIAL_OWNER_ID_V1,
  type CloudRulesReleaseDocumentV1,
  type CloudRulesReleaseMetadataV1,
} from '../../src/next/generation-v2/capability-rules/cloudRulesReleaseV1'
import { applyCloudRulesActivationOverridesV1,
  CLOUD_RULES_LKG_INTEGRITY_STALE_REASON_V1 } from
  '../../src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV1'
import { prepareCapabilityRuleMaterializationV1 } from
  '../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import type { AuthoritativeModelSubjectSetV1 } from
  '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../src/next/generation-v2/model-facts/sourceScopeV1'
import {
  CapabilityRuleCoreV1Repo,
  prepareCapabilityRuleOwnershipSnapshotWriteV1,
} from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo } from
  '../../infra/db/repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from
  '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import {
  CloudRulesDistributionV1Repo,
  type CloudRulesCandidateRecordV1,
} from '../../infra/db/repo/cloudRulesDistributionV1Repo'
import {
  CloudRulesApplicationV1Repo,
  type CloudRulesInstallTargetV1,
  type CloudRulesStoredSnapshotV1,
} from '../../infra/db/repo/cloudRulesApplicationV1Repo'
import {
  CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1,
  CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
} from './capabilityRuleMaterializationSchedulerV1Service'

export interface CloudRulesAuthoritativeSubjectSetReaderV1 {
  readCurrent(): Promise<AuthoritativeModelSubjectSetV1>
}

export type CloudRulesApplicationResultV1 = Readonly<{
  applied: CloudRulesStoredSnapshotV1
  canonicalSourceRevision: string
}>

export class CloudRulesApplicationV1ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_CANDIDATE_NOT_FOUND'
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_STALE'
    | 'GENERATION_V2_CLOUD_RULES_APPLICATION_SUBJECT_SET_STALE') {
    super(code)
    this.name = 'CloudRulesApplicationV1ServiceError'
  }
}

type PreparedInstallV1 = Readonly<{
  target: CloudRulesInstallTargetV1
  expectedCandidateRecordRevision: string | null
  expectedAppliedRecordRevision: number | null
  expectedAppliedContentRevision: string | null
  expectedCloudCoreRevision: string | null
  expectedOverrideRevision: number
  expectedMaterializationRevision: string | null
  expectedActiveSourceRevision: string | null
  expectedHistoryTargetRecordRevision?: number
  eventKind: 'apply' | 'rollback'
  consumeCandidate: boolean
  pinTarget: boolean
  retainedOverrides: ReturnType<typeof applyCloudRulesActivationOverridesV1>['retainedOverrides']
  coreWrite: ReturnType<typeof prepareCapabilityRuleOwnershipSnapshotWriteV1>
  materialization: ReturnType<typeof prepareCapabilityRuleMaterializationV1>
}>

function targetFromSnapshot(value: Readonly<{
  releaseVersion: string
  contentRevision: string
  releaseMetadata: CloudRulesReleaseMetadataV1
  document: CloudRulesReleaseDocumentV1
  documentSha256: string
  rawAssetSha256: string
}>): CloudRulesInstallTargetV1 {
  return Object.freeze({ releaseVersion: value.releaseVersion, contentRevision: value.contentRevision,
    releaseMetadata: value.releaseMetadata, document: value.document,
    documentSha256: value.documentSha256, rawAssetSha256: value.rawAssetSha256 })
}

export class CloudRulesApplicationV1Service {
  readonly #distributionRepo: CloudRulesDistributionV1Repo
  readonly #applicationRepo: CloudRulesApplicationV1Repo
  readonly #coreRepo: CapabilityRuleCoreV1Repo
  readonly #materializationRepo: CapabilityRuleMaterializationV1Repo
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo
  readonly #sourceScopeId = buildCapabilityRuleSourceScopeIdV1({
    ruleStoreId: CAPABILITY_RULE_MATERIALIZATION_RULE_STORE_ID_V1,
  })

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly subjectSetReader: CloudRulesAuthoritativeSubjectSetReaderV1,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.#distributionRepo = new CloudRulesDistributionV1Repo(db, nowMs)
    this.#applicationRepo = new CloudRulesApplicationV1Repo(db, nowMs)
    this.#coreRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#materializationRepo = new CapabilityRuleMaterializationV1Repo(db, nowMs)
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
  }

  ensureCurrentLkgHealth(): void {
    if (this.#applicationRepo.readState().appliedIntegrity === 'invalid') {
      this.#markLkgUnavailable()
    }
  }

  async applyCandidate(input: Readonly<{
    expectedCandidateRecordRevision: string
    expectedAppliedRecordRevision: number | null
  }>): Promise<CloudRulesApplicationResultV1> {
    const distribution = this.#distributionRepo.readState()
    const candidate = distribution.candidate
    if (!candidate) {
      throw new CloudRulesApplicationV1ServiceError(
        'GENERATION_V2_CLOUD_RULES_APPLICATION_CANDIDATE_NOT_FOUND')
    }
    if (candidate.candidateRecordRevision !== input.expectedCandidateRecordRevision) this.#stale()
    const prepared = await this.#prepare({ target: candidate,
      expectedCandidateRecordRevision: input.expectedCandidateRecordRevision,
      expectedAppliedRecordRevision: input.expectedAppliedRecordRevision,
      eventKind: 'apply', consumeCandidate: true, pinTarget: false, allowCorruptRecovery: true })
    return this.#commit(prepared)
  }

  async applyBootstrapCandidate(): Promise<CloudRulesApplicationResultV1 | null> {
    const distribution = this.#distributionRepo.readState()
    const application = this.#applicationRepo.readState()
    if (application.appliedIntegrity === 'invalid') {
      this.#markLkgUnavailable()
      this.#stale()
    }
    if (application.applied || !distribution.candidate) return null
    const prepared = await this.#prepare({ target: distribution.candidate,
      expectedCandidateRecordRevision: distribution.candidate.candidateRecordRevision,
      expectedAppliedRecordRevision: null, eventKind: 'apply', consumeCandidate: true,
      pinTarget: false, allowCorruptRecovery: false })
    return this.#commit(prepared)
  }

  async rollback(input: Readonly<{
    expectedAppliedRecordRevision: number
    expectedHistoryTargetRecordRevision: number
    pinTarget: boolean
  }>): Promise<CloudRulesApplicationResultV1> {
    const target = this.#applicationRepo.listHistory().find((entry) =>
      entry.appliedRecordRevision === input.expectedHistoryTargetRecordRevision)
    if (!target) this.#stale()
    const distribution = this.#distributionRepo.readState()
    const prepared = await this.#prepare({ target,
      expectedCandidateRecordRevision: distribution.candidate?.candidateRecordRevision ?? null,
      expectedAppliedRecordRevision: input.expectedAppliedRecordRevision,
      expectedHistoryTargetRecordRevision: input.expectedHistoryTargetRecordRevision,
      eventKind: 'rollback', consumeCandidate: input.pinTarget, pinTarget: input.pinTarget,
      allowCorruptRecovery: true })
    return this.#commit(prepared)
  }

  async #prepare(input: Readonly<{
    target: CloudRulesCandidateRecordV1 | CloudRulesStoredSnapshotV1
    expectedCandidateRecordRevision: string | null
    expectedAppliedRecordRevision: number | null
    expectedHistoryTargetRecordRevision?: number
    eventKind: 'apply' | 'rollback'
    consumeCandidate: boolean
    pinTarget: boolean
    allowCorruptRecovery: boolean
  }>): Promise<PreparedInstallV1> {
    const application = this.#applicationRepo.readState()
    if (application.appliedIntegrity === 'invalid' && !input.allowCorruptRecovery) this.#stale()
    if (application.appliedRecordRevision !== input.expectedAppliedRecordRevision) this.#stale()
    const distribution = this.#distributionRepo.readState()
    if ((distribution.candidate?.candidateRecordRevision ?? null) !== input.expectedCandidateRecordRevision ||
        distribution.appliedContentRevision !== (application.applied?.contentRevision ??
          (application.appliedIntegrity === 'invalid' ? distribution.appliedContentRevision : null))) this.#stale()

    const target = targetFromSnapshot(input.target)
    const overlay = applyCloudRulesActivationOverridesV1({ document: target.document,
      overrides: application.overrides.overrides })
    const coreWrite = prepareCapabilityRuleOwnershipSnapshotWriteV1(overlay.ownershipSnapshot)
    const currentCloud = this.#coreRepo.readOwnershipSnapshot({ ownership: 'cloud',
      ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1 })
    const ownershipSnapshots = this.#coreRepo.listOwnershipSnapshots()
      .filter((snapshot) => !(snapshot.projected.definition.ownership === 'cloud' &&
        snapshot.projected.definition.ownerId === CLOUD_RULES_OFFICIAL_OWNER_ID_V1))
      .map((snapshot) => snapshot.projected)
    ownershipSnapshots.push(coreWrite.projected)
    const subjectSet = await this.subjectSetReader.readCurrent()
    const materialization = prepareCapabilityRuleMaterializationV1({
      sourceScopeId: this.#sourceScopeId,
      subjectSet,
      ownershipSnapshots,
      defaultActivationPolicies: CAPABILITY_RULE_MATERIALIZATION_DEFAULT_ACTIVATION_POLICIES_V1,
    })
    return Object.freeze({ target, expectedCandidateRecordRevision: input.expectedCandidateRecordRevision,
      expectedAppliedRecordRevision: input.expectedAppliedRecordRevision,
      expectedAppliedContentRevision: distribution.appliedContentRevision,
      expectedCloudCoreRevision: currentCloud?.projected.snapshotRevision ?? null,
      expectedOverrideRevision: application.overrides.revision,
      expectedMaterializationRevision: this.#materializationRepo.readStage(this.#sourceScopeId)
        ?.materializationRevision ?? null,
      expectedActiveSourceRevision: this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
        ?.currentSourceRevision ?? null,
      ...(input.expectedHistoryTargetRecordRevision === undefined ? {} : {
        expectedHistoryTargetRecordRevision: input.expectedHistoryTargetRecordRevision,
      }),
      eventKind: input.eventKind, consumeCandidate: input.consumeCandidate,
      pinTarget: input.pinTarget, retainedOverrides: overlay.retainedOverrides,
      coreWrite, materialization })
  }

  async #commit(prepared: PreparedInstallV1): Promise<CloudRulesApplicationResultV1> {
    // The second coherent read is immediately followed by the synchronous SQLite transaction;
    // no main-process mutation callback can interleave between these two operations.
    const currentSubjectSet = await this.subjectSetReader.readCurrent()
    if (currentSubjectSet.subjectSetRevision !== prepared.materialization.authoritativeSubjectSetRevision) {
      throw new CloudRulesApplicationV1ServiceError(
        'GENERATION_V2_CLOUD_RULES_APPLICATION_SUBJECT_SET_STALE')
    }
    return this.db.transaction(() => {
      const distribution = this.#distributionRepo.readState()
      const application = this.#applicationRepo.readState()
      const currentCloud = this.#coreRepo.readOwnershipSnapshot({ ownership: 'cloud',
        ownerId: CLOUD_RULES_OFFICIAL_OWNER_ID_V1 })
      const currentStage = this.#materializationRepo.readStage(this.#sourceScopeId)
      const currentSource = this.#sourceRepo.readSourceState('capability_rule', this.#sourceScopeId)
      if ((distribution.candidate?.candidateRecordRevision ?? null) !==
            prepared.expectedCandidateRecordRevision ||
          distribution.appliedContentRevision !== prepared.expectedAppliedContentRevision ||
          application.appliedRecordRevision !== prepared.expectedAppliedRecordRevision ||
          application.overrides.revision !== prepared.expectedOverrideRevision ||
          (currentCloud?.projected.snapshotRevision ?? null) !== prepared.expectedCloudCoreRevision ||
          (currentStage?.materializationRevision ?? null) !== prepared.expectedMaterializationRevision ||
          (currentSource?.currentSourceRevision ?? null) !== prepared.expectedActiveSourceRevision) this.#stale()

      this.#coreRepo.replacePreparedOwnershipSnapshot({
        expectedSnapshotRevision: prepared.expectedCloudCoreRevision,
        prepared: prepared.coreWrite,
      })
      const staged = this.#materializationRepo.stagePrepared({
        prepared: prepared.materialization,
        expectedMaterializationRevision: prepared.expectedMaterializationRevision,
        currentAuthoritativeSubjectSetRevision: currentSubjectSet.subjectSetRevision,
      })
      const timestamp = this.nowMs()
      const promoted = this.#sourceRepo.promoteStagedCompleteSourceRevision({
        sourceKind: 'capability_rule', sourceScopeId: this.#sourceScopeId,
        canonicalSourceRevision: staged.stage.canonicalSourceRevision,
        expectedCurrentRevision: prepared.expectedActiveSourceRevision,
        fetchedAtMs: timestamp, lastAttemptedAtMs: timestamp,
      })
      const applied = this.#applicationRepo.commitInstall({
        expectedAppliedRecordRevision: prepared.expectedAppliedRecordRevision,
        target: prepared.target, eventKind: prepared.eventKind,
        ...(prepared.expectedHistoryTargetRecordRevision === undefined ? {} : {
          expectedHistoryTargetRecordRevision: prepared.expectedHistoryTargetRecordRevision,
        }),
        retainedOverrides: prepared.retainedOverrides, pinTarget: prepared.pinTarget,
        eventMetadata: { canonicalSourceRevision: promoted.source.sourceRevision.canonicalSourceRevision },
      })
      this.#distributionRepo.markApplied({
        expectedCandidateRecordRevision: prepared.expectedCandidateRecordRevision,
        expectedAppliedContentRevision: prepared.expectedAppliedContentRevision,
        appliedContentRevision: prepared.target.contentRevision,
        consumeCandidate: prepared.consumeCandidate,
      })
      return Object.freeze({ applied,
        canonicalSourceRevision: promoted.source.sourceRevision.canonicalSourceRevision })
    }).immediate()
  }

  #stale(): never {
    throw new CloudRulesApplicationV1ServiceError('GENERATION_V2_CLOUD_RULES_APPLICATION_STALE')
  }

  #markLkgUnavailable(): void {
    this.#sourceRepo.recordRefreshFailure({ sourceKind: 'capability_rule',
      sourceScopeId: this.#sourceScopeId, attemptedAtMs: this.nowMs(),
      staleReason: CLOUD_RULES_LKG_INTEGRITY_STALE_REASON_V1 })
  }
}
