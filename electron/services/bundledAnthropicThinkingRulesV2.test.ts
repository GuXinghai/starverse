import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { decodeProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import { decodeGenerationIntentLayerV2 } from '../../src/core/generation-v2/domain/generationIntentV2'
import { decodeResolvedGenerationIntentV2 } from '../../src/core/generation-v2/domain/resolvedGenerationIntentV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { authorizeResolvedCapabilityV2 } from '../../src/core/generation-v2/capability/resolvedCapabilityV2'
import { compileAnthropicMessagesRequestV1 } from '../../src/core/generation-v2/providers/anthropic/messagesRequestV1'
import { resolveAnthropicRequestIntentV2 } from '../../src/core/generation-v2/providers/anthropic/thinkingPolicyV2'
import { resolveGoal3ModelFactsForBindingV1 } from './goal3ModelFactsCapabilityV1'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { ANTHROPIC_THINKING_BUNDLED_OWNER_V2 } from '../../src/core/generation-v2/capability-rules/anthropicThinkingRulesV2'
import { initializeBundledAnthropicThinkingRulesV2 } from './bundledAnthropicThinkingRulesV2'

describe('bundled Anthropic thinking rules through persisted Goal 3 authority', () => {
  it('publishes exact model-scoped modes, conditional off-effort constraints, and no max-as-default', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    const models = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5',
      'claude-opus-4-5-20251101', 'claude-sonnet-5']
    const subjects = buildAuthoritativeModelSubjectSetV1(models.map(nativeModelId => ({ subject: {
      providerAuthorityId: 'anthropic', endpointProfileId: 'anthropic-developer-api-2023-06-01', nativeModelId }, proof: {
      kind: 'provider_native_catalog', providerKey: 'anthropic', scopeId: 'scope:test', credentialScopeId: 'credential:test', credentialRevision: 1,
      endpointProfileId: 'anthropic-developer-api-2023-06-01', operationContractId: 'anthropic-messages-2023-06-01', catalogCategory: '', activeSnapshotDigest: 'b'.repeat(64) } })))
    const resolve = (model: string) => {
      const contract = listReviewedProviderContractDefinitionsV2().find(definition => definition.protocolContractId.value === 'anthropic-messages-2023-06-01')!
      const binding = decodeProviderBindingRecordV2({ providerId: 'anthropic', endpointProfileId: 'anthropic-developer-api-2023-06-01',
        credentialScopeId: 'credential:test', modelId: model, protocolContractId: 'anthropic-messages-2023-06-01',
        contractRevision: contract.contractRevision.value, contractDefinitionDigest: contract.definitionDigest.value,
        registryRevision: contract.registryRevision.value, operation: 'text', endpointBinding: { kind: 'provider_managed_set',
          endpointSetRevision: 'set:test', descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:test' }] } })
      return { binding, modelFacts: resolveGoal3ModelFactsForBindingV1({ db, binding, credentialRevision: 1 }).modelFacts }
    }
    try {
      await initializeBundledAnthropicThinkingRulesV2(db, { readCurrent: async () => subjects })
      const repo = new CapabilityRuleCoreV1Repo(db)
      const before = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: ANTHROPIC_THINKING_BUNDLED_OWNER_V2 })!.projected.snapshotRevision
      await initializeBundledAnthropicThinkingRulesV2(db, { readCurrent: async () => subjects })
      expect(repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: ANTHROPIC_THINKING_BUNDLED_OWNER_V2 })!.projected.snapshotRevision).toBe(before)

      const opus55 = resolve(models[0]!).modelFacts.fields
      expect(opus55.find(field => field.path === 'reasoning.mode')).toMatchObject({ domain: { values: ['enabled'] }, defaultValue: 'enabled' })
      expect(opus55.find(field => field.path === 'providerExtension.thinkingMode')).toMatchObject({
        domain: { values: expect.arrayContaining(['provider_default', 'adaptive']) }, defaultValue: 'provider_default',
      })
      expect(opus55.find(field => field.path === 'generation.maxOutputTokens')?.defaultValue).toBeUndefined()

      const sonnet55 = resolve(models[1]!).modelFacts.fields
      expect(sonnet55.find(field => field.path === 'providerExtension.thinkingMode')?.domain).toMatchObject({
        values: expect.not.arrayContaining(['disabled']),
      })
      const haiku55 = resolve(models[2]!).modelFacts.fields
      expect(haiku55.find(field => field.path === 'reasoning.mode')?.constraints).toContainEqual({
        kind: 'forbids_value', path: 'reasoning.effort', values: ['max', 'xhigh'], whenValues: ['disabled'],
      })
      expect(resolve(models[3]!).modelFacts.fields.find(field => field.path === 'reasoning.mode')?.constraints).toContainEqual({
        kind: 'forbids_value', path: 'reasoning.effort', values: ['max', 'xhigh'], whenValues: ['disabled'],
      })
      expect(resolve(models[4]!).modelFacts.fields.find(field => field.path === 'providerExtension.manualThinkingBudgetTokens')).toMatchObject({
        state: 'supported',
      })

      const opusBinding = resolve(models[0]!)
      const opusCapability = authorizeResolvedCapabilityV2({ modelFacts: opusBinding.modelFacts,
        binding: opusBinding.binding, continuation: { kind: 'unavailable', evidenceIds: [] } })
      const opusOff = resolveAnthropicRequestIntentV2(decodeGenerationIntentLayerV2({ schemaVersion: 2,
        generation: {}, reasoning: { mode: 'disabled', effort: 'xhigh' },
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'disabled' },
      }), opusCapability)
      expect(opusOff.reasoning.mode).toBe('enabled')
      expect(opusOff.providerExtension.thinkingMode).toBe('provider_default')
      expect(opusOff.decisions).toContainEqual(expect.objectContaining({ reason: 'anthropic_thinking_required_by_model' }))
      expect(opusOff.generation?.maxOutputTokens).toBe(4_096)
      expect(opusOff.decisions).toContainEqual(expect.objectContaining({ path: 'generation.maxOutputTokens', source: {
        value: 4_096, source: 'application_default',
      } }))

      const sonnetBinding = resolve(models[5]!)
      const sonnetCapability = authorizeResolvedCapabilityV2({ modelFacts: sonnetBinding.modelFacts,
        binding: sonnetBinding.binding, continuation: { kind: 'unavailable', evidenceIds: [] } })
      const requestFor = (requested: unknown) => {
        const resolved = resolveAnthropicRequestIntentV2(decodeGenerationIntentLayerV2(requested), sonnetCapability)
        return { resolved, compilation: compileAnthropicMessagesRequestV1({ modelId: 'claude-sonnet-5',
          intent: decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: resolved.generation,
            reasoning: resolved.reasoning, web: { mode: 'disabled' }, image: { mode: 'disabled' },
            tools: { mode: 'disabled' }, attachments: [], providerExtension: resolved.providerExtension }).value,
          messages: [{ role: 'user', content: 'question' }] }) }
      }
      const sonnetOn = requestFor({ schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled', effort: 'high' },
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended' } })
      const sonnetOff = requestFor({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled', effort: 'high' },
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'disabled' } })
      expect(sonnetOn.compilation.issues).toEqual([])
      expect(sonnetOn.compilation.nativeRequest).not.toHaveProperty('thinking')
      expect(sonnetOff.compilation.issues).toEqual([])
      expect(sonnetOff.compilation.nativeRequest?.thinking).toEqual({ type: 'disabled' })
      expect(sonnetOn.compilation.preparedBody?.copyUtf8Text()).not.toBe(sonnetOff.compilation.preparedBody?.copyUtf8Text())
      expect(sonnetOff.resolved.decisions).toContainEqual(expect.objectContaining({
        reason: 'anthropic_effort_preference_omitted_when_disabled', source: 'high',
      }))
    } finally { db.close() }
  })
})
