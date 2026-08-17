import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { openAICompatibleUnauthenticatedCredentialScopeV2 } from './openAIChatCompatibleGenerationV2Coordinator'
import { createGenerationV2CapabilityResolutionService } from './generationV2CapabilityResolutionService'

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

function configuration() {
  return Object.freeze({
    requestProfile: Object.freeze({ id: 'ocp_request_profile_12345678', version: 1, config: requestProfile }),
    requestMappings: Object.freeze([Object.freeze({ id: 'ocp_request_mapping_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, mappingId: 'ocp_request_mapping_12345678', requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1, sourceField: 'reasoning_effort' as const, targetPath: Object.freeze(['reasoning', 'effort']),
      valueKind: 'string' as const, valueMapping: Object.freeze({ low: 'low', medium: 'medium', high: 'high' }), omission: 'omit_when_unset' as const,
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

    expect(result.resolvedCapability.binding).toMatchObject({
      providerId: 'openai_compatible', endpointProfileId: provider.providerInstanceId,
      endpointBinding: {
        kind: 'provider_managed_set', endpointSetRevision: endpoint.endpointRevisionId,
        descriptors: [{ endpointId: provider.providerInstanceId, descriptorRevision: endpoint.endpointRevisionId }],
      },
    })
  })
})
