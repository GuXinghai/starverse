import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { createOpenAICompatibleCatalogV2Service } from './openAICompatibleCatalogV2Service'

function configuration() {
  return Object.freeze({
    requestProfile: Object.freeze({ id: 'ocp_request_profile_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const,
      unsupportedFieldPolicy: 'error_before_fetch' as const, defaults: Object.freeze({}),
      extraBody: Object.freeze({ enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 }),
    }) }),
    requestMappings: Object.freeze([]),
    reasoningMapping: Object.freeze({ id: 'ocp_reasoning_mapping_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, mode: 'custom_only' as const, rules: Object.freeze([]),
      replay: Object.freeze({ format: 'disabled' as const, scope: 'never' as const }),
    }) }),
    inlinePolicy: Object.freeze({ id: 'ocp_inline_policy_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, canonicalThinkTags: true as const, customTags: Object.freeze([]),
    }) }),
    responseProfile: Object.freeze({ id: 'ocp_response_profile_12345678', version: 1, config: Object.freeze({
      schemaVersion: 1 as const, choicePolicy: 'preserve_all' as const,
      unknownFieldPolicy: 'bounded_diagnostics' as const,
      reasoningMapping: Object.freeze({ mappingId: 'ocp_reasoning_mapping_12345678', version: 1 }),
      inlinePolicy: Object.freeze({ inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 }),
    }) }),
  })
}

describe('OpenAI-compatible catalog acquisition binding', () => {
  let db: BetterSqlite3.Database
  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  })
  afterEach(() => db.close())

  it('persists remote models against the exact endpoint acquisition revision', async () => {
    const repo = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [], query: [],
      configuration: configuration() })
    const service = createOpenAICompatibleCatalogV2Service({ db, credentialService: {} as never,
      fetchImpl: async () => new Response(JSON.stringify({ object: 'list', data: [{ id: 'remote-model' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }), proxyMode: () => 'direct',
      nowMs: () => 200 })
    await expect(service.sync(provider.providerInstanceId, 'request:1')).resolves.toMatchObject({ ok: true })
    const row = db.prepare(`SELECT state, acquisition_endpoint_revision_id, acquisition_endpoint_digest,
      acquisition_credential_scope_id, acquisition_credential_revision, acquisition_snapshot_digest
      FROM openai_compatible_model_v2 WHERE provider_instance_id=? AND model_id=? AND source='remote_sync'`)
      .get(provider.providerInstanceId, 'remote-model') as Record<string, unknown>
    expect(row).toMatchObject({ state: 'active', acquisition_endpoint_revision_id: 'ocp_endpoint_12345678',
      acquisition_credential_scope_id: 'compatible-credential-none', acquisition_credential_revision: 0 })
    expect(row.acquisition_endpoint_digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(row.acquisition_snapshot_digest).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('does not publish a remote acquisition when the credential scope changes during fetch', async () => {
    const repo = new OpenAICompatibleV2Repo(db, () => 100)
    const provider = repo.create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible',
      endpointRevisionId: 'ocp_endpoint_12345678', baseUrl: 'https://example.test/',
      securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
      ordinaryHeaders: [], query: [], configuration: configuration() })
    let statusReads = 0
    const credentialService = {
      getStatus: async () => {
        statusReads += 1
        return { configured: true, credentialScopeId: statusReads < 3
          ? `credential-scope-v2:${'a'.repeat(64)}` : `credential-scope-v2:${'b'.repeat(64)}`,
        revision: statusReads < 3 ? 1 : 2 }
      },
      withCredential: async (input: { consume: (lease: unknown) => unknown }) => input.consume({
        credential: { mode: 'bearer', token: 'redacted-test-token' },
      }),
    }
    const service = createOpenAICompatibleCatalogV2Service({ db, credentialService: credentialService as never,
      fetchImpl: async () => new Response(JSON.stringify({ object: 'list', data: [{ id: 'must-not-publish' }] }),
        { status: 200 }), proxyMode: () => 'direct', nowMs: () => 200 })
    await expect(service.sync(provider.providerInstanceId, 'request:stale'))
      .rejects.toThrow('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_STALE')
    expect(repo.listMergedModels(provider.providerInstanceId, false)).toEqual([])
  })
})
