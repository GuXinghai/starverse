import { describe, expect, it } from 'vitest'
import type { LocalEndpointProfileV2, LocalEndpointProtocolV2 } from '../../../../infra/db/repo/localEndpointProfileV2Repo'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
} from '../model-facts/canonicalSourceFactsV1'
import { buildExplicitAssertionV1, buildObservationProvenanceV1, presentOutcomeV1 } from '../model-facts/sourceAdapterV1'
import { projectMaterializedCapabilityRuleProjectionV2 } from '../capability-rules/materializedCapabilityRuleProjectionV2'
import { createGenericLocalOpenAIChatProviderBindingV2 } from './generic-local-openai-chat/verifiedContractV2'
import {
  composeGenericLocalOpenAIChatCapabilityWithMaterializedRulesV2,
} from './generic-local-openai-chat/runtimeCapabilityV2'
import { createLmStudioOpenResponsesProviderBindingV2 } from './lmstudio-openresponses/verifiedContractV2'
import {
  composeLmStudioOpenResponsesCapabilityWithMaterializedRulesV2,
} from './lmstudio-openresponses/runtimeCapabilityV2'
import { createOllamaChatProviderBindingV2 } from './ollama-chat/verifiedContractV2'
import { composeOllamaChatCapabilityWithMaterializedRulesV2 } from './ollama-chat/runtimeCapabilityV2'
import { createOpenAIChatCompatibleProviderBindingV2 } from './openai-chat-compatible/verifiedContractV2'
import {
  composeOpenAIChatCompatibleCapabilityWithMaterializedRulesV2,
} from './openai-chat-compatible/runtimeCapabilityV2'

const sourceRevision = buildCanonicalSourceRevisionRefV1({
  sourceKind: 'capability_rule', sourceScopeId: 'scope:runtime-capability-tests',
  rawSourceSnapshotRevision: 'raw:runtime-capability-tests', adapterRevision: 'adapter:runtime-capability-tests',
  coverageManifestRevision: 'coverage:runtime-capability-tests',
  providerAuthorityRegistryRevision: 'registry:runtime-capability-tests',
})
const rawPayloadRef = Object.freeze({ storeId: `canonical-raw-v1:${'a'.repeat(64)}`,
  persistedPayloadSha256: 'a'.repeat(64), recordKey: 'runtime-capability-tests', sanitizerRevision: 'sanitizer:test' })

function materializedTemperatureMaximum(input: Readonly<{
  providerId: string
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
}>) {
  const subject = Object.freeze({ providerAuthorityId: input.providerAuthorityId,
    endpointProfileId: input.endpointProfileId, nativeModelId: input.nativeModelId })
  const provenance = buildObservationProvenanceV1({ sourceRevision,
    sourceFieldRefs: [{ rawPayloadRef, sourceRecordIdentity: 'rule.temperature-max',
      sourceFieldPath: 'rule.sampling.temperature.modelMaximum', observedPresence: 'present' }],
    adapterId: 'materialized-rules:runtime-capability-tests', adapterRevision: sourceRevision.adapterRevision,
    mappingId: 'runtime-capability-tests.temperature-max',
  })
  const assertion = buildExplicitAssertionV1({ subject, sourceRevision,
    path: 'sampling.temperature.modelMaximum', value: { kind: 'decimal', value: 1 },
    sourceClaimIdentity: 'rule.temperature-max', evidenceRefs: ['test:materialized-rule'],
    observationProvenance: provenance,
    ruleClaim: { ownerKind: 'user', ownerId: 'user:default', packId: 'pack.runtime',
      ruleId: 'rule.temperature-max', packRevision: 'pack:runtime', ruleRevision: 'rule:temperature-max',
      selectorKind: 'exact', selectorRef: 'exact:model-x', packPriority: 0, rulePriority: 0,
      effectiveRulePriority: 0, prioritySemanticsRevision: 'priority:runtime' },
  })
  const fact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision,
    recordOutcome: 'present', outcomes: [presentOutcomeV1({ assertion,
      observationIdentity: 'observation:rule.temperature-max' })], unmappedSourceFields: [] })
  return projectMaterializedCapabilityRuleProjectionV2({ payload: fact.payload,
    identity: { providerId: input.providerId, endpointProfileId: input.endpointProfileId,
      nativeModelId: input.nativeModelId } })
}

function expectTemperatureMaximum(snapshot: Readonly<{ fields: readonly Readonly<{ path: string; domain?: unknown }>[] }>): void {
  expect(snapshot.fields.find((field) => field.path === 'generation.temperature')).toMatchObject({
    domain: { kind: 'range', min: 0, max: 1 },
  })
}

const localProfile = (input: Readonly<{
  endpointProfileId: string
  providerId: 'generic_local' | 'lmstudio' | 'ollama'
  protocolContractId: LocalEndpointProtocolV2
  modelId: string
  profileDigest: string
  protocolConfig: Record<string, unknown>
}>): LocalEndpointProfileV2 => Object.freeze({
  endpointProfileId: input.endpointProfileId, providerId: input.providerId,
  protocolContractId: input.protocolContractId, baseUrl: 'http://127.0.0.1:8080',
  credentialMode: 'none', credentialScopeId: 'local:none',
  protocolConfig: Object.freeze(input.protocolConfig), revisionGeneration: 1,
  profileRevision: `profile:${input.endpointProfileId}`, profileDigest: input.profileDigest,
  createdAtMs: 1, updatedAtMs: 1,
})

describe('provider runtime capability materialized Rule cutover', () => {
  it('projects exact claims into OpenAI-compatible and local runtime snapshots', () => {
    const compatibleProvider = Object.freeze({ providerInstanceId: 'ocp_runtime_test',
      protocolContractId: 'openai_chat_compatible' as const, displayName: 'Compatible', status: 'active' as const,
      createdAtMs: 1, updatedAtMs: 1, deletedAtMs: null, endpointRevisions: [] })
    const compatibleEndpoint = Object.freeze({ endpointRevisionId: 'endpoint:runtime-test',
      providerInstanceId: compatibleProvider.providerInstanceId, revision: 1, baseUrl: 'https://example.test',
      securityPolicy: 'strict_ssrf' as const, auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
      requestProfileId: 'request:runtime-test', requestProfileVersion: 1,
      responseProfileId: 'response:runtime-test', responseProfileVersion: 1,
      endpointDigest: 'b'.repeat(64), createdAtMs: 1 })
    const compatibleBinding = createOpenAIChatCompatibleProviderBindingV2({ provider: compatibleProvider,
      endpoint: compatibleEndpoint, credentialScopeId: `credential-scope-v2:${'c'.repeat(64)}`, modelId: 'model-x' })
    expectTemperatureMaximum(composeOpenAIChatCompatibleCapabilityWithMaterializedRulesV2({
      binding: compatibleBinding, resolvedAt: '2026-09-21T00:00:00.000Z', mappedReasoningSourceFields: [],
      capabilityRules: materializedTemperatureMaximum({ providerId: 'openai_compatible',
        providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_runtime_test',
        endpointProfileId: 'ocp_runtime_test', nativeModelId: 'model-x' }),
    }))

    const genericProfile = localProfile({ endpointProfileId: 'generic:runtime-test', providerId: 'generic_local',
      protocolContractId: 'generic-local-openai-chat-completions', modelId: 'model-x', profileDigest: 'd'.repeat(64),
      protocolConfig: { modelId: 'model-x' } })
    const genericBinding = createGenericLocalOpenAIChatProviderBindingV2(genericProfile, 'model-x')
    expectTemperatureMaximum(composeGenericLocalOpenAIChatCapabilityWithMaterializedRulesV2({ binding: genericBinding,
      resolvedAt: '2026-09-21T00:00:00.000Z', capabilityRules: materializedTemperatureMaximum({ providerId: 'generic_local',
        providerAuthorityId: 'generic-local', endpointProfileId: genericProfile.endpointProfileId, nativeModelId: 'model-x' }) }))

    const lmStudioProfile = localProfile({ endpointProfileId: 'lmstudio:runtime-test', providerId: 'lmstudio',
      protocolContractId: 'lmstudio-openresponses', modelId: 'model-x', profileDigest: 'e'.repeat(64),
      protocolConfig: { modelId: 'model-x' } })
    const lmStudioBinding = createLmStudioOpenResponsesProviderBindingV2(lmStudioProfile, 'model-x')
    expectTemperatureMaximum(composeLmStudioOpenResponsesCapabilityWithMaterializedRulesV2({ binding: lmStudioBinding,
      resolvedAt: '2026-09-21T00:00:00.000Z', capabilityRules: materializedTemperatureMaximum({ providerId: 'lmstudio',
        providerAuthorityId: 'lmstudio-local', endpointProfileId: lmStudioProfile.endpointProfileId, nativeModelId: 'model-x' }) }))

    const ollamaProfile = localProfile({ endpointProfileId: 'ollama:runtime-test', providerId: 'ollama',
      protocolContractId: 'ollama-chat-v1', modelId: 'model-x', profileDigest: 'f'.repeat(64),
      protocolConfig: { modelId: 'model-x', thinkingControl: 'effort' } })
    const ollamaBinding = createOllamaChatProviderBindingV2(ollamaProfile, 'model-x')
    expectTemperatureMaximum(composeOllamaChatCapabilityWithMaterializedRulesV2({ binding: ollamaBinding,
      profile: ollamaProfile, resolvedAt: '2026-09-21T00:00:00.000Z', capabilityRules: materializedTemperatureMaximum({ providerId: 'ollama',
        providerAuthorityId: 'ollama-local', endpointProfileId: ollamaProfile.endpointProfileId, nativeModelId: 'model-x' }) }))
  })
})
