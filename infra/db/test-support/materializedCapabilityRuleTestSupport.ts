import type BetterSqlite3 from 'better-sqlite3'
import {
  buildAuthoritativeModelSubjectSetV1,
  type AuthoritativeModelSubjectCandidateV1,
  type AuthoritativeModelSubjectSetV1,
} from '../../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import {
  prepareCapabilityRuleMaterializationV1,
  type CapabilityRuleDefaultActivationPoliciesV1,
} from '../../../src/next/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { buildCapabilityRuleSourceScopeIdV1 } from
  '../../../src/next/generation-v2/model-facts/sourceScopeV1'
import type { CapabilityRuleOwnershipSnapshotV1 } from
  '../../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'
import { CapabilityRuleCoreV1Repo } from '../repo/capabilityRuleCoreV1Repo'
import { CapabilityRuleMaterializationV1Repo } from '../repo/capabilityRuleMaterializationV1Repo'
import { CanonicalModelFactSourceV1Repo } from '../repo/canonicalModelFactSourceV1Repo'

export type MaterializedCapabilityRuleTestInputV1 = Readonly<{
  ownershipSnapshots: readonly CapabilityRuleOwnershipSnapshotV1[]
  subjectCandidates: readonly AuthoritativeModelSubjectCandidateV1[]
  ruleStoreId?: string
  defaultActivationPolicies?: CapabilityRuleDefaultActivationPoliciesV1
  nowMs?: () => number
  fetchedAtMs?: number
}>

/**
 * Test-only setup for the shared Pack/Rule core and its complete materialized source.
 * Callers must provide every exact claim and every authoritative subject explicitly.
 */
export function seedMaterializedCapabilityRulesForTestV1(
  db: BetterSqlite3.Database,
  input: MaterializedCapabilityRuleTestInputV1,
): Readonly<{ subjectSet: AuthoritativeModelSubjectSetV1 }> {
  const nowMs = input.nowMs ?? (() => 1)
  const sourceScopeId = buildCapabilityRuleSourceScopeIdV1({
    ruleStoreId: input.ruleStoreId ?? 'epoch-2-capability-rules',
  })
  const policies = input.defaultActivationPolicies ?? { cloud: 'enabled', user: 'enabled' }
  const core = new CapabilityRuleCoreV1Repo(db, nowMs)
  for (const snapshot of input.ownershipSnapshots) {
    const current = core.readOwnershipSnapshot({ ownership: snapshot.ownership, ownerId: snapshot.ownerId })
    core.replaceOwnershipSnapshot({
      expectedSnapshotRevision: current?.projected.snapshotRevision ?? null,
      snapshot,
    })
  }

  const subjectSet = buildAuthoritativeModelSubjectSetV1(input.subjectCandidates)
  const prepared = prepareCapabilityRuleMaterializationV1({
    sourceScopeId,
    subjectSet,
    ownershipSnapshots: core.listOwnershipSnapshots().map((entry) => entry.projected),
    defaultActivationPolicies: policies,
  })
  const staged = new CapabilityRuleMaterializationV1Repo(db, nowMs).stagePrepared({
    prepared,
    expectedMaterializationRevision: null,
    currentAuthoritativeSubjectSetRevision: subjectSet.subjectSetRevision,
  })
  new CanonicalModelFactSourceV1Repo(db, nowMs).promoteStagedCompleteSourceRevision({
    sourceKind: 'capability_rule',
    sourceScopeId,
    canonicalSourceRevision: staged.stage.canonicalSourceRevision,
    expectedCurrentRevision: null,
    fetchedAtMs: input.fetchedAtMs ?? nowMs(),
  })
  return Object.freeze({ subjectSet })
}
