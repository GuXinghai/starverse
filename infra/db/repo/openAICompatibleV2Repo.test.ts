import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { OpenAICompatibleV2Repo } from './openAICompatibleV2Repo'

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
function configuration(version = 1) {
  return Object.freeze({
    requestProfile: Object.freeze({ id: 'ocp_request_profile_12345678', version, config: requestProfile }),
    requestMappings: Object.freeze([Object.freeze({ id: 'ocp_request_mapping_12345678', version, config: Object.freeze({
      schemaVersion: 1 as const, mappingId: 'ocp_request_mapping_12345678', requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: version, sourceField: 'reasoning_effort' as const, targetPath: Object.freeze(['reasoning', 'effort']),
      omission: 'omit_when_unset' as const,
    }) })]),
    reasoningMapping: Object.freeze({ id: 'ocp_reasoning_mapping_12345678', version, config: reasoningMapping }),
    inlinePolicy: Object.freeze({ id: 'ocp_inline_policy_12345678', version, config: inlinePolicy }),
    responseProfile: Object.freeze({ id: 'ocp_response_profile_12345678', version, config: Object.freeze({ ...responseProfile,
      reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version }, inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version },
    }) }),
  })
}

describe('OpenAI-compatible V2 configuration repository', () => {
  let db: BetterSqlite3.Database
  let repo: OpenAICompatibleV2Repo
  beforeEach(() => { db = new BetterSqlite3(':memory:'); applyGenerationV2SchemaForTest(db, root); repo = new OpenAICompatibleV2Repo(db, () => 100) })
  afterEach(() => db.close())

  it('commits a closed immutable configuration bundle and endpoint provenance together', () => {
    const created = repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: configuration() })
    expect(created.protocolContractId).toBe('openai_chat_compatible')
    expect(created.endpointRevisions[0]).toMatchObject({ revision: 1, baseUrl: 'https://example.test', requestProfileVersion: 1, responseProfileVersion: 1 })
    expect(repo.getConfiguration('request_mapping', 'ocp_request_mapping_12345678', 1).payload).toMatchObject({ targetPath: ['reasoning', 'effort'] })
    expect(() => db.prepare("UPDATE openai_compatible_config_revision_v2 SET payload_json='{}'").run())
      .toThrow('GENERATION_V2_OPENAI_COMPATIBLE_CONFIG_IMMUTABLE')
    expect(() => db.prepare("UPDATE openai_compatible_endpoint_revision_v2 SET base_url='https://invalid.test'").run())
      .toThrow('GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_IMMUTABLE')
  })

  it('rejects a mismatched static mapping before it can become an endpoint revision', () => {
    const value = configuration()
    const invalid = Object.freeze({ ...value, requestMappings: Object.freeze([Object.freeze({ ...value.requestMappings[0], config: {
      ...value.requestMappings[0]!.config, requestProfileVersion: 2,
    } })]) })
    expect(() => repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: invalid })).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_INPUT_INVALID')
    expect(db.prepare('SELECT count(*) AS count FROM openai_compatible_provider_v2').get()).toEqual({ count: 0 })
  })

  it('loads configuration by immutable endpoint revision rather than reinterpreting history through latest', () => {
    repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: configuration() })
    const first = configuration()
    const changed = Object.freeze({
      requestProfile: Object.freeze({ id: first.requestProfile.id, version: 2, config: Object.freeze({
        ...requestProfile, defaults: Object.freeze({ temperature: 0.2 }),
      }) }),
      requestMappings: Object.freeze([Object.freeze({ id: first.requestMappings[0]!.id, version: 2, config: Object.freeze({
        ...first.requestMappings[0]!.config, requestProfileVersion: 2,
      }) })]),
      reasoningMapping: first.reasoningMapping,
      inlinePolicy: first.inlinePolicy,
      responseProfile: Object.freeze({ id: 'ocp_response_profile_23456789', version: 1, config: responseProfile }),
    })
    repo.reviseConfiguration({ providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_23456789', configuration: changed })
    const old = repo.getConfigurationForEndpointRevision('ocp_provider_12345678', 'ocp_endpoint_12345678')
    const latest = repo.getActiveConfiguration('ocp_provider_12345678')
    expect(old.requestProfile.version).toBe(1)
    expect(latest.requestProfile.version).toBe(2)
    expect(repo.getEndpointRevision('ocp_provider_12345678', 'ocp_endpoint_12345678').revision).toBe(1)
  })

  it('rejects an endpoint update based on a stale endpoint revision id', () => {
    repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: configuration() })
    repo.updateEndpointWithCredential({ providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_23456789',
      expectedEndpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://first.example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [] })
    expect(() => repo.updateEndpointWithCredential({ providerInstanceId: 'ocp_provider_12345678', endpointRevisionId: 'ocp_endpoint_34567890',
      expectedEndpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://stale.example.test/', securityPolicy: 'strict_ssrf',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [] }))
      .toThrow('GENERATION_V2_OPENAI_COMPATIBLE_STATE_INVALID')
    expect(repo.get('ocp_provider_12345678').endpointRevisions).toHaveLength(2)
  })

  it('persists remote/manual model parity and observation-only discovery in epoch-2', () => {
    repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible endpoint',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/', securityPolicy: 'compatibility_first',
      auth: { mode: 'none' }, ordinaryHeaders: [], query: [], configuration: configuration() })
    const unknown = { schemaVersion: 1, displayName: null, contextLength: null, maxOutputTokens: null,
      capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
      pricing: { prompt: null, completion: null, request: null, image: null }, fieldProvenance: {} }
    repo.replaceRemoteModels('ocp_provider_12345678', [{ modelId: 'same-model', metadata: unknown }])
    const merged = repo.upsertManualModel('ocp_provider_12345678', 'same-model', { ...unknown, displayName: 'Manual name',
      capabilities: { ...unknown.capabilities, reasoning: true } })
    expect(merged).toMatchObject([{ modelId: 'same-model', metadata: { displayName: 'Manual name', capabilities: { reasoning: true } },
      sourcePresence: { remote: 'active', manual: true } }])
    repo.observeDiscovery({ providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1, observations: [{ streamPath: 'choices.*.delta.vendor_reasoning', occurrenceCount: 2,
        aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: { kind: 'redacted', valueType: 'string', originalLength: null }, sampleCount: 2 } }] })
    expect(repo.listDiscovery('ocp_provider_12345678')).toMatchObject([{ streamPath: 'choices.*.delta.vendor_reasoning',
      state: 'candidate', occurrenceCount: 2 }])
  })
})
