import fs from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ModelCatalogV2Repo } from '../repo/modelCatalogV2Repo'
import { OpenAICompatibleV2Repo } from '../repo/openAICompatibleV2Repo'
import { LocalEndpointProfileV2Repo } from '../repo/localEndpointProfileV2Repo'
import { AuthoritativeModelSubjectSetV1Service } from './authoritativeModelSubjectSetV1Service'
import type { ProviderCredentialKey } from '../../../electron/credentials/providerCredentialContract'

const unknownMetadata = Object.freeze({ schemaVersion: 1, displayName: null, contextLength: null,
  maxOutputTokens: null, capabilities: Object.freeze({ text: null, vision: null, tools: null,
    structuredOutputs: null, reasoning: null }), pricing: Object.freeze({ prompt: null, completion: null,
    request: null, image: null }), fieldProvenance: Object.freeze({}) })

function compatibleConfiguration() {
  const requestProfile = Object.freeze({ schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const,
    unsupportedFieldPolicy: 'error_before_fetch' as const, defaults: Object.freeze({}),
    extraBody: Object.freeze({ enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 }) })
  const reasoningMapping = Object.freeze({ schemaVersion: 1 as const, mode: 'custom_only' as const,
    rules: Object.freeze([]), replay: Object.freeze({ format: 'disabled' as const, scope: 'never' as const }) })
  const inlinePolicy = Object.freeze({ schemaVersion: 1 as const, canonicalThinkTags: true as const,
    customTags: Object.freeze([]) })
  const responseProfile = Object.freeze({ schemaVersion: 1 as const, choicePolicy: 'preserve_all' as const,
    unknownFieldPolicy: 'bounded_diagnostics' as const,
    reasoningMapping: Object.freeze({ mappingId: 'ocp_reasoning_mapping_12345678', version: 1 }),
    inlinePolicy: Object.freeze({ inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 }) })
  return Object.freeze({
    requestProfile: Object.freeze({ id: 'ocp_request_profile_12345678', version: 1, config: requestProfile }),
    requestMappings: Object.freeze([]),
    reasoningMapping: Object.freeze({ id: 'ocp_reasoning_mapping_12345678', version: 1,
      config: reasoningMapping }),
    inlinePolicy: Object.freeze({ id: 'ocp_inline_policy_12345678', version: 1, config: inlinePolicy }),
    responseProfile: Object.freeze({ id: 'ocp_response_profile_12345678', version: 1,
      config: responseProfile }),
  })
}

function item(providerKey: string, modelId: string, extra: Record<string, unknown> = {}) {
  return Object.freeze({ providerKey, modelId, modelKey: `${providerKey}::${modelId}`,
    nativeModelId: modelId, ...extra })
}

describe('AuthoritativeModelSubjectSetV1Service', () => {
  let db: BetterSqlite3.Database
  let statuses: Map<ProviderCredentialKey, Readonly<{ configured: boolean; revision: number; credentialScopeId?: string }>>
  let compatibleStatuses: Map<string, Readonly<{ configured: boolean; revision: number; credentialScopeId?: string }>>
  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
    statuses = new Map()
    compatibleStatuses = new Map()
  })
  afterEach(() => db.close())

  function service() {
    return new AuthoritativeModelSubjectSetV1Service(db, { getStatus: async (providerKey) => {
      const status = statuses.get(providerKey) ?? { configured: false, revision: 0 }
      return Object.freeze({ providerKey, ...status })
    } }, { getStatus: async (_providerInstanceId, credentialVersionRef) =>
      compatibleStatuses.get(credentialVersionRef) ?? Object.freeze({ configured: false, revision: 0 }) })
  }

  it('collects only current unfiltered native catalogs plus configured compatible and local exact IDs', async () => {
    const catalog = new ModelCatalogV2Repo(db, () => 100)
    const currentScope = Object.freeze({ providerKey: 'openai_responses', credentialScopeId: 'scope:current',
      endpointProfileId: 'openai-api-v1', operationContractId: 'openai-models-v1', category: '' })
    const oldScope = Object.freeze({ ...currentScope, credentialScopeId: 'scope:old' })
    const filteredScope = Object.freeze({ ...currentScope, category: 'image' })
    for (const [scope, modelId, responseDigest] of [[currentScope, 'current-model', '1'.repeat(64)],
      [oldScope, 'old-model', '2'.repeat(64)], [filteredScope, 'filtered-model', '3'.repeat(64)]] as const) {
      catalog.beginSync(scope, `attempt:${modelId}`)
      catalog.commitSync({ scope, attemptId: `attempt:${modelId}`, responseDigest,
        observedAtMs: 90, applyMode: 'automatic', items: [item('openai_responses', modelId)] })
    }
    statuses.set('openai_responses', Object.freeze({ configured: true, revision: 3,
      credentialScopeId: 'scope:current' }))
    catalog.beginSync(currentScope, 'attempt:pending')
    catalog.commitSync({ scope: currentScope, attemptId: 'attempt:pending', responseDigest: '4'.repeat(64),
      observedAtMs: 95, applyMode: 'manual', items: [item('openai_responses', 'pending-model')] })

    const compatible = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = compatible.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
      configuration: compatibleConfiguration() })
    const endpoint = provider.endpointRevisions[0]!
    compatible.replaceRemoteModels({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
      credentialScopeId: 'compatible-credential-none', credentialRevision: 0,
      models: [{ modelId: 'remote-model', metadata: unknownMetadata }] })
    compatible.upsertManualModel(provider.providerInstanceId, 'manual-model', unknownMetadata)

    const local = new LocalEndpointProfileV2Repo(db, () => 100)
    local.create({ endpointProfileId: 'endpoint_profile_lmstudio', providerId: 'lmstudio',
      protocolContractId: 'lmstudio-openresponses', baseUrl: 'http://127.0.0.1:1234/',
      protocolConfig: { modelId: 'local-model' } })
    local.create({ endpointProfileId: 'endpoint_profile_ollama', providerId: 'ollama',
      protocolContractId: 'ollama-chat-v1', baseUrl: 'http://127.0.0.1:11434/',
      protocolConfig: { modelId: 'local-model', thinkingControl: 'boolean', tools: true } })
    local.create({ endpointProfileId: 'endpoint_profile_generic', providerId: 'generic_local',
      protocolContractId: 'generic-local-openai-chat-completions', baseUrl: 'http://localhost:9876/',
      protocolConfig: { modelId: 'local-model' } })

    const result = await service().readCurrent()
    const identities = result.records.map((record) => record.subject)
    expect(identities).toContainEqual({ providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
      nativeModelId: 'current-model' })
    expect(identities.some((subject) => subject.nativeModelId === 'old-model' ||
      subject.nativeModelId === 'filtered-model' || subject.nativeModelId === 'pending-model')).toBe(false)
    expect(identities).toContainEqual({
      providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_provider_12345678',
      endpointProfileId: 'ocp_provider_12345678', nativeModelId: 'remote-model' })
    expect(identities).toContainEqual({
      providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_provider_12345678',
      endpointProfileId: 'ocp_provider_12345678', nativeModelId: 'manual-model' })
    expect(identities.filter((subject) => subject.nativeModelId === 'local-model').map((subject) =>
      subject.providerAuthorityId).sort()).toEqual(['generic-local', 'lmstudio-local', 'ollama-local'])
    local.delete('endpoint_profile_generic')
    const withoutGeneric = await service().readCurrent()
    expect(withoutGeneric.records.some((record) =>
      record.subject.providerAuthorityId === 'generic-local')).toBe(false)
    expect(withoutGeneric.subjectSetRevision).not.toBe(result.subjectSetRevision)
  })

  it('keeps manual compatible IDs but removes remote currentness after endpoint replacement', async () => {
    const compatible = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = compatible.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
      configuration: compatibleConfiguration() })
    const endpoint = provider.endpointRevisions[0]!
    compatible.replaceRemoteModels({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
      credentialScopeId: 'compatible-credential-none', credentialRevision: 0,
      models: [{ modelId: 'remote-only', metadata: unknownMetadata }] })
    compatible.upsertManualModel(provider.providerInstanceId, 'manual-only', unknownMetadata)
    const before = await service().readCurrent()
    expect(before.records.map((record) => record.subject.nativeModelId).sort())
      .toEqual(['manual-only', 'remote-only'])
    compatible.updateEndpoint({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: 'ocp_endpoint_23456789', baseUrl: 'https://changed.example.test/',
      securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [] })
    const after = await service().readCurrent()
    expect(after.records.map((record) => record.subject.nativeModelId)).toEqual(['manual-only'])
    compatible.updateProvider({ providerInstanceId: provider.providerInstanceId, status: 'disabled' })
    expect((await service().readCurrent()).records).toEqual([])
  })

  it('fails stale when credential authority changes around the coherent database read', async () => {
    let calls = 0
    const changing = new AuthoritativeModelSubjectSetV1Service(db, { getStatus: async (providerKey) => {
      calls += 1
      const pass = calls <= 5 ? 1 : 2
      return Object.freeze({ providerKey, configured: providerKey === 'openai_responses', revision: pass,
        ...(providerKey === 'openai_responses' ? { credentialScopeId: `scope:${pass}` } : {}) })
    } }, { getStatus: async () => Object.freeze({ configured: false, revision: 0 }) })
    await expect(changing.readCurrent()).rejects.toThrow('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE')
  })

  it('excludes stale compatible remote acquisition after credential loss or rotation while retaining manual proof', async () => {
    const compatible = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = compatible.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' }, ordinaryHeaders: [], query: [],
      configuration: compatibleConfiguration() })
    const endpoint = provider.endpointRevisions[0]!
    compatible.replaceRemoteModels({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
      credentialScopeId: 'credential-scope-v2:compatible-a', credentialRevision: 1,
      models: [{ modelId: 'remote-only', metadata: unknownMetadata },
        { modelId: 'remote-and-manual', metadata: unknownMetadata }] })
    compatible.upsertManualModel(provider.providerInstanceId, 'remote-and-manual', unknownMetadata)
    compatibleStatuses.set('ocp_credential_12345678', Object.freeze({ configured: true, revision: 1,
      credentialScopeId: 'credential-scope-v2:compatible-a' }))

    const current = await service().readCurrent()
    expect(current.records.map((record) => record.subject.nativeModelId).sort())
      .toEqual(['remote-and-manual', 'remote-only'])
    const currentInputRevision = current.authorityInputRevision

    compatibleStatuses.set('ocp_credential_12345678', Object.freeze({ configured: false, revision: 0 }))
    const missing = await service().readCurrent()
    expect(missing.records.map((record) => record.subject.nativeModelId)).toEqual(['remote-and-manual'])

    compatibleStatuses.set('ocp_credential_12345678', Object.freeze({ configured: true, revision: 2,
      credentialScopeId: 'credential-scope-v2:compatible-b' }))
    const rotated = await service().readCurrent()
    expect(rotated.records.map((record) => record.subject.nativeModelId)).toEqual(['remote-and-manual'])
    expect(rotated.subjectSetRevision).not.toBe(current.subjectSetRevision)
    expect(rotated.authorityInputRevision).not.toBe(currentInputRevision)
  })

  it('fails stale when compatible credential currentness changes around the coherent database read', async () => {
    const compatible = new OpenAICompatibleV2Repo(db, () => 100)
    compatible.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' }, ordinaryHeaders: [], query: [],
      configuration: compatibleConfiguration() })
    let calls = 0
    const changing = new AuthoritativeModelSubjectSetV1Service(db,
      { getStatus: async (providerKey) => Object.freeze({ providerKey, configured: false, revision: 0 }) },
      { getStatus: async () => {
        calls += 1
        return Object.freeze({ configured: true, revision: calls,
          credentialScopeId: `credential-scope-v2:compatible-${calls}` })
      } })
    await expect(changing.readCurrent()).rejects.toThrow('GENERATION_V2_AUTHORITATIVE_MODEL_SUBJECT_SET_STALE')
  })

  it('changes compatible authority input revision without changing membership when acquisition snapshot changes', async () => {
    const compatible = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = compatible.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
      configuration: compatibleConfiguration() })
    const endpoint = provider.endpointRevisions[0]!
    compatible.replaceRemoteModels({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
      credentialScopeId: 'compatible-credential-none', credentialRevision: 0,
      models: [{ modelId: 'remote-model', metadata: unknownMetadata }] })
    const first = await service().readCurrent()
    compatible.replaceRemoteModels({ providerInstanceId: provider.providerInstanceId,
      endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest,
      credentialScopeId: 'compatible-credential-none', credentialRevision: 0,
      models: [{ modelId: 'remote-model', metadata: { ...unknownMetadata, displayName: 'Changed' } }] })
    const second = await service().readCurrent()
    expect(second.subjectSetRevision).toBe(first.subjectSetRevision)
    expect(second.authorityInputRevision).not.toBe(first.authorityInputRevision)
  })

  it('does not import forbidden model-fact or presentation subject sources', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(),
      'infra/db/services/authoritativeModelSubjectSetV1Service.ts'), 'utf8')
    expect(source).not.toMatch(/modelsDev|capabilityRule|displayName|alias|selector/u)
  })
})
