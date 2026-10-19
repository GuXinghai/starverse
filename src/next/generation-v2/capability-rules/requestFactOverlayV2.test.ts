import { expect, it } from 'vitest'
import { buildCanonicalSourceRevisionRefV1, buildCanonicalSubjectFactV1 } from '../../../core/generation-v2/model-facts/canonicalSourceFactsV1'
import { buildExplicitAssertionV1, presentOutcomeV1 } from '../../../core/generation-v2/model-facts/sourceAdapterV1'
import { resolveModelFactsV1 } from '../../../core/generation-v2/model-facts/resolveModelFactsV1'
import { DEFAULT_SOURCE_PRIORITY_CONFIG_V1 } from '../../../core/generation-v2/model-facts/sourcePriorityConfigV1'
import { canonicalizeResolvedCapabilityV2 } from '../../../core/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../core/generation-v2/capability/modelCapabilitySchemaV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../../core/generation-v2/contracts/providerContractRegistryV2'
import { bindRequestRulesToSubjectsV2 } from '../../../core/generation-v2/capability-rules/boundRequestRulesV2'
import { projectRequestFactOverlayV2 } from '../../../core/generation-v2/capability-rules/requestFactOverlayV2'
import { createReviewedRequestRulePacksV2 } from '../../../../scripts/rules/reviewedRequestRulePacksV2'

it.each([false, true])('attributes a conditional rejection to its winning Rule, with base provenance=%s', withBase => {
  const subject = { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId: 'gpt-6-luna' }
  const revision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'models_dev', sourceScopeId: 'scope:test', rawSourceSnapshotRevision: 'raw:test',
    adapterRevision: 'adapter:test', coverageManifestRevision: 'manifest:test', providerAuthorityRegistryRevision: 'registry:test' })
  const assertion = buildExplicitAssertionV1({ subject, sourceRevision: revision, path: 'sampling.temperature.support', value: { kind: 'support', value: 'supported' },
    sourceClaimIdentity: 'models-dev-temperature', evidenceRefs: ['models-dev-evidence'], observationProvenance: { sourceKind: 'models_dev',
      canonicalSourceRevision: revision.canonicalSourceRevision, sourceFieldRefs: [], adapterId: 'adapter:test', adapterRevision: revision.adapterRevision, mappingId: 'mapping:test' } })
  const source = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision: revision, recordOutcome: 'present',
    outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] })
  const absent = { kind: 'absent' as const, reason: 'not_available' as const }
  const base = resolveModelFactsV1({ sourcePriorityConfig: DEFAULT_SOURCE_PRIORITY_CONFIG_V1, resolutionInput: { schemaVersion: 1, subject,
    sourcePriorityConfigRevision: DEFAULT_SOURCE_PRIORITY_CONFIG_V1.sourcePriorityConfigRevision, resolverRevision: 'resolver:test', ontologyRevision: 'ontology:test',
    sources: { providerNative: absent, capabilityRules: absent, modelsDev: withBase ? { kind: 'present', ref: source.ref, payload: source.payload } : absent } } })
  const definition = listReviewedProviderContractDefinitionsV2().find(value => value.protocolContractId.value === 'openai-responses-v1')!
  const capability = canonicalizeResolvedCapabilityV2({ binding: { providerId: definition.providerId.value, endpointProfileId: subject.endpointProfileId,
    modelId: subject.nativeModelId, credentialScopeId: 'scope:test', operation: 'text', protocolContractId: definition.protocolContractId.value,
    contractRevision: definition.contractRevision.value, contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:test', descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:test' }] } },
    fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'unknown', evidenceIds: ['unknown'], constraints: [] })),
    evidence: [{ evidenceId: 'unknown', kind: 'contract_invariant', effect: 'unknown', sourceRef: 'test:unknown', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'a'.repeat(64) },
      { evidenceId: 'continuation', kind: 'contract_invariant', effect: 'supports', sourceRef: 'test:continuation', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'b'.repeat(64) }],
    continuation: { kind: 'none', evidenceIds: ['continuation'] } })
  const packs = createReviewedRequestRulePacksV2().map(value => value.pack)
  const bundle = bindRequestRulesToSubjectsV2({ snapshots: [{ schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs }], subjects: [subject],
    defaultActivationPolicies: { user: 'enabled', cloud: 'enabled' } })[0]!
  const rule = bundle.rules.find(entry => entry.definition.effect.kind === 'fact_assertion' &&
    entry.definition.effect.path === 'sampling.temperature.support' && entry.definition.effect.value.kind === 'support' && entry.definition.effect.value.value === 'unsupported')!
  const before = JSON.stringify(base)
  const overlay = projectRequestFactOverlayV2({ base, capability, sourcePriority: DEFAULT_SOURCE_PRIORITY_CONFIG_V1, claims: [rule] })
  const field = overlay.fields.find(value => value.path === 'generation.temperature')!
  expect(field.state).toBe('unsupported')
  expect(field.evidenceIds).toHaveLength(1)
  const evidence = overlay.evidence.find(value => value.evidenceId === field.evidenceIds[0])!
  expect(evidence.kind).toBe('capability_rule')
  expect(evidence.effect).toBe('rejects')
  expect(evidence.sourceRef).toContain(rule.ruleRevision)
  expect(evidence.sourceRef).not.toContain('models-dev')
  expect(JSON.stringify(base)).toBe(before)
})
