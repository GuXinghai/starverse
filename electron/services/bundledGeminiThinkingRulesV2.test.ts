import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { initializeBundledGeminiThinkingRulesV2 } from './bundledGeminiThinkingRulesV2'
import { resolveGoal3ModelFactsForBindingV1 } from './goal3ModelFactsCapabilityV1'
import { CapabilityRuleCoreV1Repo } from '../../infra/db/repo/capabilityRuleCoreV1Repo'
import { GEMINI_THINKING_BUNDLED_OWNER_V2 } from '../../src/core/generation-v2/capability-rules/geminiThinkingRulesV2'
import { decodeProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'

describe('bundled Gemini documentation rules through persisted Goal 3 authority', () => {
  it('initializes existing profiles idempotently and resolves API-scoped Budget/Level facts', async () => {
    const db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, process.cwd())
    const models = ['gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-image']
    const subjects = buildAuthoritativeModelSubjectSetV1(models.map(nativeModelId => ({ subject: {
      providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId }, proof: {
      kind: 'provider_native_catalog', providerKey: 'google_ai_studio', scopeId: 'scope:test', credentialScopeId: 'credential:test', credentialRevision: 1,
      endpointProfileId: 'gemini-developer-api-v1beta', operationContractId: 'gemini-generate-content-v1beta', catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) } })))
    const readCurrent = async () => subjects
    const resolve = (model: string, image = false) => {
      const protocol = image ? 'gemini-interactions-v1beta' : 'gemini-generate-content-v1beta'
      const contract = listReviewedProviderContractDefinitionsV2().find(definition => definition.protocolContractId.value === protocol)!
      const binding = decodeProviderBindingRecordV2({ providerId: 'google_ai_studio', endpointProfileId: 'gemini-developer-api-v1beta', credentialScopeId: 'credential:test', modelId: model,
        protocolContractId: protocol, contractRevision: contract.contractRevision.value, contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
        operation: image ? 'image_generate' : 'text', endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'set:test', descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:test' }] } })
      return resolveGoal3ModelFactsForBindingV1({ db, binding, credentialRevision: 1 }).modelFacts.fields
    }
    try {
      await initializeBundledGeminiThinkingRulesV2(db, { readCurrent })
      const repo = new CapabilityRuleCoreV1Repo(db)
      const before = repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: GEMINI_THINKING_BUNDLED_OWNER_V2 })!.projected.snapshotRevision
      await initializeBundledGeminiThinkingRulesV2(db, { readCurrent })
      expect(repo.readOwnershipSnapshot({ ownership: 'cloud', ownerId: GEMINI_THINKING_BUNDLED_OWNER_V2 })!.projected.snapshotRevision).toBe(before)
      expect(resolve(models[0]!).find(field => field.path === 'reasoning.mode')).toMatchObject({ domain: { values: ['enabled'] }, defaultValue: 'enabled' })
      expect(resolve(models[1]!).find(field => field.path === 'providerExtension.thinkingBudget')).toMatchObject({ domain: { min: 512, max: 24576, includedValues: [-1, 0] }, defaultValue: 0 })
      expect(resolve(models[2]!).find(field => field.path === 'providerExtension.thinkingLevel')).toMatchObject({ defaultValue: 'high' })
      expect(resolve(models[3]!, true).find(field => field.path === 'providerExtension.thinkingLevel')).toMatchObject({ defaultValue: 'minimal' })
      expect(resolve(models[1]!, true).find(field => field.path === 'providerExtension.thinkingBudget')?.state).toBe('unknown')
    } finally { db.close() }
  })
})
