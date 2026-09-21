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

  constructor(
    db: BetterSqlite3.Database,
    private readonly subjectSetReader: AuthoritativeModelSubjectSetReaderV1,
    nowMs: () => number = Date.now,
  ) {
    this.#ruleRepo = new CapabilityRuleCoreV1Repo(db, nowMs)
    this.#stageRepo = new CapabilityRuleMaterializationV1Repo(db, nowMs)
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
}
