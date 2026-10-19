import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { authorizeResolvedCapabilityV2 } from '../../src/core/generation-v2/capability/resolvedCapabilityV2'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { decodeProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import { decodeGenerationIntentLayerV2 } from '../../src/core/generation-v2/domain/generationIntentV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { resolveGoal3ModelFactsForBindingV1 } from './goal3ModelFactsCapabilityV1'
import { OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2 } from '../../src/core/generation-v2/capability-rules/openAIResponsesThinkingRulesV2'
import { resolveOpenAIResponsesRequestIntentV2 } from '../../src/core/generation-v2/providers/openai-responses/thinkingPolicyV2'
import { initializeBundledOpenAIResponsesThinkingRulesV2 } from './bundledOpenAIResponsesThinkingRulesV2'

const modelIds = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol'] as const

describe('bundled OpenAI Responses thinking rules through persisted Goal 3 authority', () => {
  it('publishes exact effort facts and resolves on/off policy without inventing Astra default', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    const subjects = buildAuthoritativeModelSubjectSetV1(modelIds.map(nativeModelId => ({ subject: {
      providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', nativeModelId,
    }, proof: {
      kind: 'provider_native_catalog' as const, providerKey: 'openai_responses' as const,
      scopeId: 'scope:test:openai', credentialScopeId: 'credential:test', credentialRevision: 1,
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', catalogCategory: '',
      activeSnapshotDigest: 'c'.repeat(64),
    } })))
    const bindingFor = (modelId: string) => {
      const contract = listReviewedProviderContractDefinitionsV2().find(definition =>
        definition.protocolContractId.value === 'openai-responses-v1')!
      return decodeProviderBindingRecordV2({ providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
        credentialScopeId: 'credential:test', modelId, protocolContractId: contract.protocolContractId.value,
        contractRevision: contract.contractRevision.value, contractDefinitionDigest: contract.definitionDigest.value,
        registryRevision: contract.registryRevision.value, operation: 'text', endpointBinding: { kind: 'provider_managed_set',
          endpointSetRevision: 'set:test', descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:test' }] } })
    }
    const resolve = (modelId: string) => {
      const binding = bindingFor(modelId)
      return { binding, modelFacts: resolveGoal3ModelFactsForBindingV1({ db, binding, credentialRevision: 1 }).modelFacts }
    }
    try {
      await initializeBundledOpenAIResponsesThinkingRulesV2(db, { readCurrent: async () => subjects })
      const repo = new CapabilityRuleCoreV1Repo(db)
      const initialRevision = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2 })!
        .projected.snapshotRevision
      await initializeBundledOpenAIResponsesThinkingRulesV2(db, { readCurrent: async () => subjects })
      expect(repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: OPENAI_RESPONSES_THINKING_BUNDLED_OWNER_V2 })!
        .projected.snapshotRevision).toBe(initialRevision)

      const luna = resolve(modelIds[0]).modelFacts.fields
      expect(luna.find(field => field.path === 'reasoning.mode')).toMatchObject({
        domain: { kind: 'enum', values: ['disabled', 'enabled'] }, defaultValue: 'enabled',
      })
      expect(luna.find(field => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'max', 'medium', 'none', 'xhigh'] }, defaultValue: 'medium',
      })
      expect(luna.find(field => field.path === 'generation.temperature')).toMatchObject({ state: 'supported' })
      const astra = resolve(modelIds[2]).modelFacts.fields
      expect(astra.find(field => field.path === 'reasoning.effort')).toMatchObject({
        domain: { kind: 'enum', values: ['high', 'low', 'max', 'medium', 'xhigh'] },
      })
      expect(astra.find(field => field.path === 'reasoning.effort')?.defaultValue).toBeUndefined()

      const continuation = { kind: 'unavailable' as const, evidenceIds: [] as const }
      const lunaResolved = resolve(modelIds[0])
      const lunaCapability = authorizeResolvedCapabilityV2({ modelFacts: lunaResolved.modelFacts,
        binding: lunaResolved.binding, continuation })
      const requestedOff = decodeGenerationIntentLayerV2({ schemaVersion: 2,
        generation: { temperature: 0.4, topP: 0.8 }, reasoning: { mode: 'disabled', effort: 'high' },
        providerExtension: { kind: 'openai_responses' } })
      const off = resolveOpenAIResponsesRequestIntentV2(requestedOff, lunaCapability)
      expect(off.reasoning).toEqual({ mode: 'disabled', effort: 'none' })
      expect(off.generation).toEqual({ temperature: 0.4, topP: 0.8 })

      const requestedOn = decodeGenerationIntentLayerV2({ schemaVersion: 2,
        generation: { temperature: 0.4 }, reasoning: { mode: 'enabled', effort: 'high' },
        providerExtension: { kind: 'openai_responses' } })
      const on = resolveOpenAIResponsesRequestIntentV2(requestedOn, lunaCapability)
      expect(on.generation).toEqual({})
      expect(on.decisions).toContainEqual(expect.objectContaining({
        path: 'generation.temperature', outcome: 'deferred',
        reason: 'openai_sampling_unavailable_with_non_none_reasoning_effort',
      }))

      const astraResolved = resolve(modelIds[2])
      const astraCapability = authorizeResolvedCapabilityV2({ modelFacts: astraResolved.modelFacts,
        binding: astraResolved.binding, continuation })
      const astraRequestedOff = decodeGenerationIntentLayerV2({ schemaVersion: 2,
        generation: { temperature: 0.4, topP: 0.8 }, reasoning: { mode: 'disabled', effort: 'none' },
        providerExtension: { kind: 'openai_responses' } })
      const required = resolveOpenAIResponsesRequestIntentV2(astraRequestedOff, astraCapability)
      expect(required.reasoning).toEqual({ mode: 'enabled' })
      expect(required.generation).toEqual({})
      expect(required.decisions).toContainEqual(expect.objectContaining({
        path: 'reasoning.effort', reason: 'openai_required_reasoning_effort_uses_provider_default',
      }))
    } finally { db.close() }
  })
})
