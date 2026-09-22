import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import { openAICompatibleUnauthenticatedCredentialScopeV2 } from './openAIChatCompatibleGenerationV2Coordinator'
import { createGenerationV2CapabilityResolutionService } from './generationV2CapabilityResolutionService'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/next/modelCatalog/providerCatalogAuthorityRegistryV2'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'
import { providerAuthorityForExecutionBindingV1 } from '../../src/next/generation-v2/model-facts/providerAuthorityRegistryV1'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import type { CapabilityRuleCoreRuleV1, CapabilityRuleOwnershipSnapshotV1 } from '../../src/next/generation-v2/capability-rules/capabilityRuleCoreV1'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

const root = path.resolve(process.cwd())
const requestProfile = Object.freeze({ schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const,
  unsupportedFieldPolicy: 'error_before_fetch' as const, defaults: Object.freeze({}),
  extraBody: Object.freeze({ enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 }) })
const reasoningMapping = Object.freeze({ schemaVersion: 1 as const, mode: 'custom_only' as const, rules: Object.freeze([]),
  replay: Object.freeze({ format: 'disabled' as const, scope: 'never' as const }) })
const inlinePolicy = Object.freeze({ schemaVersion: 1 as const, canonicalThinkTags: true as const, customTags: Object.freeze([]) })
const responseProfile = Object.freeze({ schemaVersion: 1 as const, choicePolicy: 'preserve_all' as const,
  unknownFieldPolicy: 'bounded_diagnostics' as const,
  reasoningMapping: Object.freeze({ mappingId: 'ocp_reasoning_mapping_12345678', version: 1 }),
  inlinePolicy: Object.freeze({ inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 }) })
const cloudScope = `credential-scope-v2:${'b'.repeat(64)}` as never

function cloudCredentialService() {
  return {
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never),
  } as never
}

function seedCloudCatalog(
  db: BetterSqlite3.Database,
  providerKey: ProviderCatalogKnownProviderKey,
  modelIds: readonly string[],
): void {
  const registry = ProviderCatalogAuthorityRegistryV2.get(providerKey)!
  const scope = Object.freeze({ providerKey, credentialScopeId: cloudScope,
    endpointProfileId: registry.endpointProfileId, operationContractId: registry.modelsContractId, category: '' })
  const repo = new ModelCatalogV2Repo(db, () => 100)
  repo.beginSync(scope, `attempt:${providerKey}`)
  repo.commitSync({ scope, attemptId: `attempt:${providerKey}`, responseDigest: 'c'.repeat(64),
    observedAtMs: 100, applyMode: 'automatic', items: modelIds.map((modelId) => {
      const rawProviderRecord = providerKey === 'google_ai_studio'
        ? Object.freeze({ name: `models/${modelId}`, supportedGenerationMethods: Object.freeze(['generateContent']),
          inputTokenLimit: 1_000_000, outputTokenLimit: 65_536, thinking: true })
        : Object.freeze({ id: modelId, max_tokens: 65_536 })
      const observation = Object.freeze({ schemaVersion: 2 as const, providerKey, nativeModelId: modelId,
        endpointId: registry.endpointProfileId, observedAtMs: 100, rawProviderRecord,
        facts: Object.freeze({}), provenance: Object.freeze({ sourceKind: 'provider_api' as const,
          sourceLabel: `${providerKey}_models_api`, observedAtMs: 100, parserVersion: 2 as const }) })
      return { providerKey, nativeModelId: modelId, modelId, modelKey: `${providerKey}::${modelId}`,
        displayName: modelId, raw: { schemaVersion: 1 as const, buckets: [{ source: 'models' as const,
          fetchedAtMs: 100, baseUrl: 'https://example.test', payload: { observation } }] } }
    }) })
}

function configuration() {
  return Object.freeze({
    requestProfile: Object.freeze({ id: 'ocp_request_profile_12345678', version: 1, config: requestProfile }),
    requestMappings: Object.freeze([Object.freeze({ id: 'ocp_request_mapping_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, mappingId: 'ocp_request_mapping_12345678', requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1, sourceField: 'reasoning_effort' as const, targetPath: Object.freeze(['reasoning', 'effort']),
      omission: 'omit_when_unset' as const,
    }) })]),
    reasoningMapping: Object.freeze({ id: 'ocp_reasoning_mapping_12345678', version: 1, config: reasoningMapping }),
    inlinePolicy: Object.freeze({ id: 'ocp_inline_policy_12345678', version: 1, config: inlinePolicy }),
    responseProfile: Object.freeze({ id: 'ocp_response_profile_12345678', version: 1, config: Object.freeze({ ...responseProfile,
      reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 },
      inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 },
    }) }),
  })
}

function exactRule(input: Readonly<{
  ruleId: string
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
}>): CapabilityRuleCoreRuleV1 {
  return {
    ruleId: input.ruleId, label: null, description: null, priority: 0, configured: 'on',
    providerAuthorityId: input.providerAuthorityId, endpointProfileId: input.endpointProfileId,
    selector: { kind: 'exact', nativeModelIds: [input.nativeModelId] },
    assertion: { path: input.path, value: input.value }, evidence: null,
  }
}

function cloudSnapshot(rules: readonly CapabilityRuleCoreRuleV1[]): CapabilityRuleOwnershipSnapshotV1 {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'test:cloud', packs: [{
    schemaVersion: 1, packId: 'pack.test.capability-resolution', displayName: 'Capability resolution test',
    description: null, priority: 0, mode: 'no_control', target: 'enabled', rules,
  }] }
}

function catalogSubjects(providerKey: ProviderCatalogKnownProviderKey, modelIds: readonly string[]) {
  const registry = ProviderCatalogAuthorityRegistryV2.get(providerKey)!
  const authority = providerAuthorityForExecutionBindingV1({
    implementationProviderId: registry.executionProviderId,
    endpointProfileKind: registry.endpointProfileId,
  })
  return modelIds.map((nativeModelId) => ({
    subject: { providerAuthorityId: authority.providerAuthorityId,
      endpointProfileId: registry.endpointProfileId, nativeModelId },
    proof: { kind: 'provider_native_catalog' as const, providerKey, scopeId: `scope:test:${providerKey}`,
      credentialScopeId: cloudScope, credentialRevision: 1, endpointProfileId: registry.endpointProfileId,
      operationContractId: registry.modelsContractId, catalogCategory: '', activeSnapshotDigest: 'c'.repeat(64) },
  }))
}

function resolutionSnapshot(fixture: Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  known: string
  expectedDomain: { kind: 'enum'; values: readonly string[] }
  expectedDefault: string
}>): CapabilityRuleOwnershipSnapshotV1 {
  const registry = ProviderCatalogAuthorityRegistryV2.get(fixture.providerKey)!
  const authority = providerAuthorityForExecutionBindingV1({
    implementationProviderId: registry.executionProviderId,
    endpointProfileKind: registry.endpointProfileId,
  })
  const rules = [exactRule({ ruleId: `${fixture.known}.reasoning.effort.values`,
    providerAuthorityId: authority.providerAuthorityId, endpointProfileId: registry.endpointProfileId,
    nativeModelId: fixture.known, path: 'reasoning.effort.nativeValues',
    value: { kind: 'native_string_set', values: fixture.expectedDomain.values, completeness: 'complete' } }),
  exactRule({ ruleId: `${fixture.known}.reasoning.effort.default`,
    providerAuthorityId: authority.providerAuthorityId, endpointProfileId: registry.endpointProfileId,
    nativeModelId: fixture.known, path: 'reasoning.effort.providerDefault',
    value: { kind: 'native_string', value: fixture.expectedDefault } })]
  if (fixture.providerKey === 'openai_responses') rules.push(exactRule({
    ruleId: `${fixture.known}.reasoning.support`, providerAuthorityId: authority.providerAuthorityId,
    endpointProfileId: registry.endpointProfileId, nativeModelId: fixture.known,
    path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
  }))
  return cloudSnapshot(rules)
}

function anthropicSnapshot(): CapabilityRuleOwnershipSnapshotV1 {
  return cloudSnapshot([exactRule({ ruleId: 'claude-opus-4-6.reasoning.effort.values',
    providerAuthorityId: 'anthropic', endpointProfileId: 'anthropic-developer-api-2023-06-01',
    nativeModelId: 'claude-opus-4-6', path: 'reasoning.effort.nativeValues',
    value: { kind: 'native_string_set', values: ['high', 'low', 'max', 'medium'], completeness: 'complete' } })])
}

describe('Generation V2 capability resolution scope', () => {
  let db: BetterSqlite3.Database

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, root)
  })
  afterEach(() => db.close())

  it('resolves OpenAI-compatible capability with provider identity and endpoint revision binding', async () => {
    const repo = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: configuration() })
    repo.upsertManualModel(provider.providerInstanceId, 'ocp_model_12345678', {
      schemaVersion: 1, displayName: null, contextLength: null, maxOutputTokens: null,
      capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
      pricing: { prompt: null, completion: null, request: null, image: null }, fieldProvenance: {},
    })
    const endpoint = provider.endpointRevisions[0]!
    const providerAuthorityId = `openai-compatible-provider-instance-v1:${provider.providerInstanceId}`
    seedMaterializedCapabilityRulesForTestV1(db, {
      ownershipSnapshots: [cloudSnapshot([exactRule({
        ruleId: 'compatible.reasoning.effort.values', providerAuthorityId,
        endpointProfileId: provider.providerInstanceId, nativeModelId: 'ocp_model_12345678',
        path: 'reasoning.effort.nativeValues',
        value: { kind: 'native_string_set', values: ['high', 'medium'], completeness: 'complete' },
      })])],
      subjectCandidates: [{
        subject: { providerAuthorityId, endpointProfileId: provider.providerInstanceId,
          nativeModelId: 'ocp_model_12345678' },
        proof: { kind: 'compatible_model_binding', providerInstanceId: provider.providerInstanceId,
          endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
          source: 'manual' },
      }],
    })
    const service = createGenerationV2CapabilityResolutionService({
      db, credentialService: {} as never, openAICompatibleCredentialService: {} as never,
    })

    const result = await service.resolve({
      providerId: 'openai_compatible', credentialRevision: 1,
      credentialScopeId: openAICompatibleUnauthenticatedCredentialScopeV2(endpoint.endpointDigest),
      endpointProfileId: provider.providerInstanceId, protocolId: 'openai_chat_compatible',
      modelId: 'ocp_model_12345678', operation: 'text',
    })

    expect(result.resolvedCapability.executionContext.binding).toMatchObject({
      providerId: 'openai_compatible', endpointProfileId: provider.providerInstanceId,
      endpointBinding: {
        kind: 'provider_managed_set', endpointSetRevision: endpoint.endpointRevisionId,
        descriptors: [{ endpointId: provider.providerInstanceId, descriptorRevision: endpoint.endpointRevisionId }],
      },
    })
    expect(result.resolvedCapability.modelFacts.identity).toEqual({
      providerId: 'openai_compatible',
      endpointProfileId: provider.providerInstanceId,
      nativeModelId: 'ocp_model_12345678',
    })
    expect(result.resolvedCapability.modelFacts.capabilityRevision)
      .toBe(result.controlsProjection.capabilityRevision)
    expect(result.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.effort'))
      .toMatchObject({ state: 'supported', domain: { kind: 'enum', values: ['high', 'medium'] } })
    expect(result.resolvedCapability.modelFacts).not.toHaveProperty('operation')
    expect(result.resolvedCapability.modelFacts).not.toHaveProperty('encodingCoverage')
  })

  it('applies exact local-profile Rules through the shared local authority binding', async () => {
    const profile = new LocalEndpointProfileV2Repo(db, () => 100).create({
      endpointProfileId: 'endpoint_profile_lmstudio', providerId: 'lmstudio',
      protocolContractId: 'lmstudio-openresponses', baseUrl: 'http://127.0.0.1:1234/',
      protocolConfig: { modelId: 'local-model' },
    })
    seedMaterializedCapabilityRulesForTestV1(db, {
      ownershipSnapshots: [cloudSnapshot([exactRule({
        ruleId: 'local.reasoning.effort.values', providerAuthorityId: 'lmstudio-local',
        endpointProfileId: profile.endpointProfileId, nativeModelId: 'local-model',
        path: 'reasoning.effort.nativeValues',
        value: { kind: 'native_string_set', values: ['high', 'medium'], completeness: 'complete' },
      })])],
      subjectCandidates: [{
        subject: { providerAuthorityId: 'lmstudio-local', endpointProfileId: profile.endpointProfileId,
          nativeModelId: 'local-model' },
        proof: { kind: 'local_profile_binding', endpointProfileId: profile.endpointProfileId,
          providerId: 'lmstudio', protocolContractId: profile.protocolContractId,
          profileRevision: profile.profileRevision },
      }],
    })
    const service = createGenerationV2CapabilityResolutionService({ db, credentialService: {} as never,
      openAICompatibleCredentialService: {} as never })
    const result = await service.resolve({ providerId: 'lmstudio', credentialRevision: profile.revisionGeneration,
      credentialScopeId: profile.credentialScopeId, endpointProfileId: profile.endpointProfileId,
      protocolId: profile.protocolContractId, modelId: 'local-model', operation: 'text' })
    expect(result.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.effort'))
      .toMatchObject({ state: 'supported', domain: { kind: 'enum', values: ['high', 'medium'] } })
    expect(result.controlsProjection.capabilityRevision).toBe(result.resolvedCapability.modelFacts.capabilityRevision)
  })

  it.each([
    { providerKey: 'google_ai_studio' as const, providerId: 'google_ai_studio', endpointProfileId: 'gemini-developer-api-v1beta',
      protocolId: 'gemini-generate-content-v1beta', known: 'gemini-3.6-flash', path: 'reasoning.effort',
      expectedDomain: { kind: 'enum', values: ['high', 'low', 'medium', 'minimal'] }, expectedDefault: 'medium' },
    { providerKey: 'deepseek' as const, providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
      protocolId: 'deepseek-stable-chat-v1', known: 'deepseek-v4-pro', path: 'reasoning.effort',
      expectedDomain: { kind: 'enum', values: ['high', 'low', 'max'] }, expectedDefault: 'high' },
    { providerKey: 'openai_responses' as const, providerId: 'openai_responses', endpointProfileId: 'openai-api-v1',
      protocolId: 'openai-responses-v1', known: 'gpt-5.4', path: 'reasoning.effort',
      expectedDomain: { kind: 'enum', values: ['high', 'low', 'medium', 'none', 'xhigh'] }, expectedDefault: 'none' },
    { providerKey: 'openrouter' as const, providerId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
      protocolId: 'openrouter-chat-completions-v1', known: 'openrouter/test-model', path: 'reasoning.effort',
       expectedDomain: { kind: 'enum', values: ['high', 'medium'] }, expectedDefault: 'medium',
       expectedUnresolvedState: 'unknown' as const },
  ] as const)('applies exact $providerId rules through authority and leaves unknown models unresolved', async (fixture) => {
    const unknown = `${fixture.known}-future`
    seedCloudCatalog(db, fixture.providerKey, [fixture.known, unknown])
    seedMaterializedCapabilityRulesForTestV1(db, {
      ownershipSnapshots: [resolutionSnapshot(fixture)],
      subjectCandidates: catalogSubjects(fixture.providerKey, [fixture.known, unknown]),
    })
    const service = createGenerationV2CapabilityResolutionService({ db, credentialService: cloudCredentialService(),
      openAICompatibleCredentialService: {} as never })
    const request = (modelId: string) => ({ providerId: fixture.providerId, credentialRevision: 1,
      credentialScopeId: cloudScope, endpointProfileId: fixture.endpointProfileId,
      protocolId: fixture.protocolId, modelId, operation: 'text' as const })

    const known = await service.resolve(request(fixture.known) as never)
    const knownField = known.resolvedCapability.modelFacts.fields.find((field) => field.path === fixture.path)
    expect(knownField).toMatchObject({ state: 'supported', domain: fixture.expectedDomain,
      defaultValue: fixture.expectedDefault })
    if (fixture.providerId === 'openai_responses') {
      const reasoningMode = known.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.mode')
      expect(reasoningMode).toMatchObject({ state: 'supported' })
      expect(reasoningMode?.domain).toBeUndefined()
    }
    expect(known.controlsProjection.capabilityRevision).toBe(known.resolvedCapability.modelFacts.capabilityRevision)

    const unresolved = await service.resolve(request(unknown) as never)
    expect(unresolved.resolvedCapability.modelFacts.fields.find((field) => field.path === fixture.path)?.state)
       .toBe('expectedUnresolvedState' in fixture ? fixture.expectedUnresolvedState : 'unknown')
  })

  it('resolves sparse Anthropic facts only for an archived exact native identity', async () => {
    seedCloudCatalog(db, 'anthropic_messages', ['claude-opus-4-6'])
    seedMaterializedCapabilityRulesForTestV1(db, {
      ownershipSnapshots: [anthropicSnapshot()],
      subjectCandidates: catalogSubjects('anthropic_messages', ['claude-opus-4-6']),
    })
    const service = createGenerationV2CapabilityResolutionService({ db, credentialService: cloudCredentialService(),
      openAICompatibleCredentialService: {} as never })
    const result = await service.resolve({ providerId: 'anthropic', credentialRevision: 1,
      credentialScopeId: cloudScope, endpointProfileId: 'anthropic-developer-api-2023-06-01',
      protocolId: 'anthropic-messages-2023-06-01', modelId: 'claude-opus-4-6', operation: 'text' })
    expect(result.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.effort')?.state)
      .toBe('supported')
    expect(result.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.effort')?.domain)
      .toEqual({ kind: 'enum', values: ['high', 'low', 'max', 'medium'] })
  })
})
