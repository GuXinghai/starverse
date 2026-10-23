import type BetterSqlite3 from 'better-sqlite3'
import type { CapabilityRuleOwnershipSnapshotV2 } from '../../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import type { CapabilityRuleDefaultActivationPoliciesV1 } from '../../../src/core/generation-v2/model-facts/materializedCapabilityRuleSourceV1'
import { projectCapabilityRuleOwnershipSnapshotV2 } from '../../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { bindRequestRulesToSubjectsV2, decodeBoundRequestRulesV2, emptyBoundRequestRulesV2, type BoundRequestRulesV2 } from '../../../src/core/generation-v2/capability-rules/boundRequestRulesV2'
import type { AuthoritativeModelSubjectSetV1 } from '../../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { canonicalSourceFactDigestV1, type CanonicalModelSubjectV1 } from '../../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'
import { stableSerializeProviderRequestV2 } from '../../../src/core/generation-v2/compiler/stableSerialize'
import { listReadableCapabilityRuleOwnershipSnapshotsV2 } from './capabilityRuleCoreV2Repo'

export type PreparedGenerationRequestRulesPublicationV2 = Readonly<{
  bundles: readonly BoundRequestRulesV2[]
  ownerSnapshotRevisions: readonly string[]
  authoritativeSubjectSetRevision: string
  publicationRevision: string
}>

/** Heavy selector evaluation belongs to preparation outside the write transaction. */
export function prepareGenerationRequestRulesPublicationV2(db: BetterSqlite3.Database,
  subjectSet: AuthoritativeModelSubjectSetV1, replacement?: CapabilityRuleOwnershipSnapshotV2,
  excludedOwner?: Readonly<{ ownership: 'cloud' | 'user'; ownerId: string }>,
  defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1 = { cloud: 'enabled', user: 'enabled' }): PreparedGenerationRequestRulesPublicationV2 {
  const snapshots = listReadableCapabilityRuleOwnershipSnapshotsV2(db).map(value => value.projected.definition)
    .filter(value => !replacement || value.ownership !== replacement.ownership || value.ownerId !== replacement.ownerId)
    .filter(value => !excludedOwner || value.ownership !== excludedOwner.ownership || value.ownerId !== excludedOwner.ownerId)
  if (replacement) snapshots.push(replacement)
  const bundles = bindRequestRulesToSubjectsV2({ snapshots, subjects: subjectSet.records.map(record => record.subject),
    defaultActivationPolicies })
  const ownerSnapshotRevisions = snapshots.map(value => projectCapabilityRuleOwnershipSnapshotV2(value).snapshotRevision).sort()
  const payload = { bundles, ownerSnapshotRevisions, authoritativeSubjectSetRevision: subjectSet.subjectSetRevision }
  return Object.freeze({ ...payload, publicationRevision: `request-rule-publication-v2:${canonicalSourceFactDigestV1(payload)}` })
}

/** Caller commits the owner snapshot, fact publication and these indexed rules atomically. */
export function writeGenerationRequestRulesPublicationV2(db: BetterSqlite3.Database,
  prepared: PreparedGenerationRequestRulesPublicationV2): void {
  if (!db.inTransaction) throw new Error('GENERATION_V2_REQUEST_RULE_TRANSACTION_REQUIRED')
  const actualOwners = listReadableCapabilityRuleOwnershipSnapshotsV2(db).map(value => value.projected.snapshotRevision).sort()
  if (stableSerializeProviderRequestV2(actualOwners) !== stableSerializeProviderRequestV2(prepared.ownerSnapshotRevisions)) {
    throw new Error('GENERATION_V2_REQUEST_RULE_PUBLICATION_STALE')
  }
  const { publicationRevision, ...payload } = prepared
  if (publicationRevision !== `request-rule-publication-v2:${canonicalSourceFactDigestV1(payload)}`) throw new Error('GENERATION_V2_REQUEST_RULE_PUBLICATION_INVALID')
  db.prepare(`INSERT OR IGNORE INTO generation_request_rule_publication_v2
    (publication_revision,owner_snapshot_revisions_json,authoritative_subject_set_revision,created_at_ms) VALUES(?,?,?,?)`)
    .run(publicationRevision, stableSerializeProviderRequestV2(prepared.ownerSnapshotRevisions), prepared.authoritativeSubjectSetRevision, Date.now())
  const insert = db.prepare(`INSERT OR IGNORE INTO generation_request_rule_subject_v2
    (publication_revision,provider_authority_id,endpoint_profile_id,native_model_id,bundle_revision,bundle_json) VALUES(?,?,?,?,?,?)`)
  for (const bundle of prepared.bundles) {
    const subject = bundle.subject
    const json = stableSerializeProviderRequestV2(bundle)
    insert.run(publicationRevision, subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId, bundle.bundleRevision, json)
    const row = db.prepare(`SELECT bundle_json FROM generation_request_rule_subject_v2 WHERE publication_revision=?
      AND provider_authority_id=? AND endpoint_profile_id=? AND native_model_id=?`)
      .get(publicationRevision, subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId) as { bundle_json: string }
    if (row.bundle_json !== json) throw new Error('GENERATION_V2_REQUEST_RULE_PUBLICATION_INVALID')
  }
  db.prepare(`INSERT INTO generation_request_rule_current_v2(singleton_id,publication_revision) VALUES(1,?)
    ON CONFLICT(singleton_id) DO UPDATE SET publication_revision=excluded.publication_revision`).run(publicationRevision)
}

/** Exact indexed lookup only. No selector matching or mutable Rule interpretation here. */
export function readGenerationRequestRulesV2(db: BetterSqlite3.Database, subject: CanonicalModelSubjectV1): BoundRequestRulesV2 {
  const row = db.prepare(`SELECT s.bundle_revision,s.bundle_json FROM generation_request_rule_subject_v2 s
    JOIN generation_request_rule_current_v2 c ON c.publication_revision=s.publication_revision
    WHERE c.singleton_id=1 AND s.provider_authority_id=? AND s.endpoint_profile_id=? AND s.native_model_id=?`)
    .get(subject.providerAuthorityId, subject.endpointProfileId, subject.nativeModelId) as { bundle_revision: string; bundle_json: string } | undefined
  if (!row) {
    const current = db.prepare(`SELECT p.owner_snapshot_revisions_json FROM generation_request_rule_current_v2 c
      JOIN generation_request_rule_publication_v2 p ON p.publication_revision=c.publication_revision WHERE c.singleton_id=1`)
      .get() as { owner_snapshot_revisions_json: string } | undefined
    if (current && (JSON.parse(current.owner_snapshot_revisions_json) as unknown[]).length > 0) {
      throw new Error('GENERATION_V2_REQUEST_RULE_SUBJECT_STALE')
    }
    return emptyBoundRequestRulesV2(subject)
  }
  const bundle = decodeBoundRequestRulesV2(JSON.parse(row.bundle_json))
  if (bundle.bundleRevision !== row.bundle_revision || stableSerializeProviderRequestV2(bundle.subject) !== stableSerializeProviderRequestV2(subject)) {
    throw new Error('GENERATION_V2_REQUEST_RULE_PUBLICATION_INVALID')
  }
  return bundle
}
