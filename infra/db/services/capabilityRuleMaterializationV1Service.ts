import type BetterSqlite3 from 'better-sqlite3'
import type { CapabilityRuleDefaultActivationPoliciesV1,
  PreparedCapabilityRuleMaterializationV1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { prepareCapabilityRuleMaterializationV1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { projectCapabilityRuleDefinitionSetV1 } from
  '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import type { AuthoritativeModelSubjectSetV1 } from
  '../../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import { CapabilityRuleCoreV1Repo } from '../repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo,
  type CapabilityRuleMaterializationStageResultV1 } from
  '../repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo,
  type CanonicalModelFactStagedSourcePromotionResultV1 } from
  '../repo/canonicalModelFactSourceV1Repo'

export interface AuthoritativeModelSubjectSetReaderV1 {
  readCurrent(): Promise<AuthoritativeModelSubjectSetV1>
}

/**
 * Slice 3 preparation is intentionally pure/heavy work outside the SQLite write transaction.
 * stagePrepared performs only revision revalidation plus immutable writes and pointer replacement.
 */
export class CapabilityRuleMaterializationV1Service {
  readonly #ruleRepo: CapabilityRuleCoreV1Repo
  readonly #stageRepo: CapabilityRuleMaterializationV1Repo
  readonly #sourceRepo: CanonicalModelFactSourceV1Repo

  constructor(
    db: BetterSqlite3.Database,
    private readonly subjectSetReader: AuthoritativeModelSubjectSetReaderV1,
    nowMs: () => number = Date.now,
  ) {
    this.#ruleRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#stageRepo = new CapabilityRuleMaterializationV1Repo(db, nowMs)
    this.#sourceRepo = new CanonicalModelFactSourceV1Repo(db, nowMs)
  }

  async prepareCurrent(input: Readonly<{
    ruleStoreId: string
    defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
  }>): Promise<PreparedCapabilityRuleMaterializationV1 | null> {
    const subjectSet = await this.subjectSetReader.readCurrent()
    const ownershipSnapshots = this.#ruleRepo.listOwnershipSnapshots().map((snapshot) => snapshot.projected)
    const sourceScopeId = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: input.ruleStoreId })
    const definitionSet = projectCapabilityRuleDefinitionSetV1({ ownershipSnapshots,
      defaultActivationPolicies: input.defaultActivationPolicies })
    if (!this.#stageRepo.requiresMaterialization({ sourceScopeId,
      ruleDefinitionRevision: definitionSet.ruleDefinitionRevision,
      authoritativeSubjectSetRevision: subjectSet.subjectSetRevision })) return null
    return prepareCapabilityRuleMaterializationV1({
      sourceScopeId,
      subjectSet,
      ownershipSnapshots,
      defaultActivationPolicies: input.defaultActivationPolicies,
    })
  }

  async stagePrepared(input: Readonly<{
    prepared: PreparedCapabilityRuleMaterializationV1
    expectedMaterializationRevision: string | null
  }>): Promise<CapabilityRuleMaterializationStageResultV1> {
    const currentSubjectSet = await this.subjectSetReader.readCurrent()
    return this.#stageRepo.stagePrepared({ ...input,
      currentAuthoritativeSubjectSetRevision: currentSubjectSet.subjectSetRevision })
  }

  async activateCurrent(input: Readonly<{
    ruleStoreId: string
    defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
    expectedActiveSourceRevision: string | null
    fetchedAtMs: number
    lastAttemptedAtMs?: number
  }>): Promise<CanonicalModelFactStagedSourcePromotionResultV1> {
    const sourceScopeId = buildCapabilityRuleSourceScopeIdV1({ ruleStoreId: input.ruleStoreId })
    const expectedMaterializationRevision = this.#stageRepo.readStage(sourceScopeId)
      ?.materializationRevision ?? null
    const prepared = await this.prepareCurrent(input)
    if (prepared === null) {
      const currentStage = this.#stageRepo.readStage(sourceScopeId)
      if (!currentStage) {
        throw new Error('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_STALE_CURRENT')
      }
      return this.#sourceRepo.promoteStagedCompleteSourceRevision({ sourceKind: 'capability_rule',
        sourceScopeId, canonicalSourceRevision: currentStage.canonicalSourceRevision,
        expectedCurrentRevision: input.expectedActiveSourceRevision,
        fetchedAtMs: input.fetchedAtMs,
        ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
      })
    }
    const staged = await this.stagePrepared({ prepared, expectedMaterializationRevision })
    return this.#sourceRepo.promoteStagedCompleteSourceRevision({ sourceKind: 'capability_rule',
      sourceScopeId, canonicalSourceRevision: staged.stage.canonicalSourceRevision,
      expectedCurrentRevision: input.expectedActiveSourceRevision,
      fetchedAtMs: input.fetchedAtMs,
      ...(input.lastAttemptedAtMs === undefined ? {} : { lastAttemptedAtMs: input.lastAttemptedAtMs }),
    })
  }
}
