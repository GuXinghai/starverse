import { migrateCapabilityRuleOwnershipSnapshotV1ToV2 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { compareCloudRulesStableSemVerV1, computeCloudRulesContentRevisionV2, decodeCloudRulesReleaseDocumentV1 } from '../../src/core/generation-v2/capability-rules/cloudRulesReleaseV1'
import { createReviewedRequestRulePacksV2, firstPartyScopes, type RequestRuleScopeV2 } from './reviewedRequestRulePacksV2'

/** Release authoring only: never imported by application startup or rule application. */
export function createCloudRulesUpgradeV2(source: unknown, releaseVersion: string,
  additionalScopes: readonly RequestRuleScopeV2[]) {
  if (!additionalScopes.length || additionalScopes.some(scope => !scope.nativeModelIds?.length)) {
    throw new Error('CLOUD_RULES_UPGRADE_REQUIRES_CATALOG_SCOPES')
  }
  const previous = decodeCloudRulesReleaseDocumentV1(source)
  if (previous.schemaVersion !== 1 || compareCloudRulesStableSemVerV1(releaseVersion, previous.releaseVersion) <= 0) {
    throw new Error('CLOUD_RULES_UPGRADE_REQUIRES_NEW_V2_RELEASE')
  }
  const migrated = migrateCapabilityRuleOwnershipSnapshotV1ToV2({ schemaVersion: 1,
    ownership: 'cloud', ownerId: 'official', packs: previous.packs })
  const scopes = firstPartyScopes.map(scope => ({ ...scope, nativeModelIds: [...new Set(previous.packs.flatMap(pack =>
    pack.rules.filter(rule => rule.providerAuthorityId === scope.providerAuthorityId && rule.endpointProfileId === scope.endpointProfileId)
      .flatMap(rule => {
        if (rule.selector.kind !== 'exact') throw new Error('CLOUD_RULES_UPGRADE_REQUIRES_EXACT_MODEL_REVIEW')
        return rule.selector.nativeModelIds
      })))].sort() }))
  const policy = createReviewedRequestRulePacksV2([...scopes, ...additionalScopes])
    .find(packet => packet.pack.packId === 'reviewed-request-policy-v2')!.pack
  if (migrated.packs.some(pack => pack.packId === policy.packId)) throw new Error('CLOUD_RULES_UPGRADE_POLICY_ID_CONFLICT')
  const packs = [...migrated.packs, policy]
  return decodeCloudRulesReleaseDocumentV1({ schemaVersion: 2, releaseVersion,
    contentRevision: computeCloudRulesContentRevisionV2(packs), packs })
}
