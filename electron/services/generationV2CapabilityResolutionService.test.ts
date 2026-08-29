import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { installBuiltInCapabilityRulesV2 } from '../../infra/db/repo/installBuiltInCapabilityRulesV2'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { openAICompatibleUnauthenticatedCredentialScopeV2 } from './openAIChatCompatibleGenerationV2Coordinator'
import { createGenerationV2CapabilityResolutionService } from './generationV2CapabilityResolutionService'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/next/modelCatalog/providerCatalogAuthorityRegistryV2'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'

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
    expect(result.resolvedCapability.modelFacts).not.toHaveProperty('operation')
    expect(result.resolvedCapability.modelFacts).not.toHaveProperty('encodingCoverage')
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
  ])('applies exact $providerId rules through authority and leaves unknown models unresolved', async (fixture) => {
    installBuiltInCapabilityRulesV2(db)
    const unknown = `${fixture.known}-future`
    seedCloudCatalog(db, fixture.providerKey, [fixture.known, unknown])
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
      expect(known.resolvedCapability.modelFacts.fields.find((field) => field.path === 'reasoning.mode')).toEqual(
        expect.objectContaining({ state: 'supported',
          domain: { kind: 'enum', values: ['disabled', 'enabled'] } }),
      )
    }
    expect(known.controlsProjection.capabilityRevision).toBe(known.resolvedCapability.modelFacts.capabilityRevision)

    const unresolved = await service.resolve(request(unknown) as never)
    expect(unresolved.resolvedCapability.modelFacts.fields.find((field) => field.path === fixture.path)?.state)
      .toBe('missing')
  })

  it('resolves sparse Anthropic facts only for an archived exact native identity', async () => {
    installBuiltInCapabilityRulesV2(db)
    seedCloudCatalog(db, 'anthropic_messages', ['claude-opus-4-6'])
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
