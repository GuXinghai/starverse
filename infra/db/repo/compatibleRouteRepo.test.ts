import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompatibleProfileRepo } from './compatibleProfileRepo'
import { CompatibleProviderRepo } from './compatibleProviderRepo'
import { CompatibleRouteRepo } from './compatibleRouteRepo'

describe('CompatibleRouteRepo', () => {
  let db: BetterSqlite3.Database
  let providerRepo: CompatibleProviderRepo
  let profileRepo: CompatibleProfileRepo
  let routeRepo: CompatibleRouteRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    providerRepo = new CompatibleProviderRepo(db)
    profileRepo = new CompatibleProfileRepo(db)
    routeRepo = new CompatibleRouteRepo(db)
    providerRepo.createProvider({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Example', createdAtMs: 1 })
    providerRepo.createCredentialDescriptor({
      credentialVersionRef: 'ocp_credential_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      version: 1,
      authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: { schemaVersion: 1, authMode: 'bearer', configured: true, maskState: 'configured_masked', sensitiveHeaderNames: [] },
      createdAtMs: 1,
    })
    profileRepo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 1,
      config: {
        schemaVersion: 1,
        standardFieldOwnership: 'builder',
        unsupportedFieldPolicy: 'error_before_fetch',
        extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 },
      },
      createdAtMs: 1,
    })
    profileRepo.createReasoningMapping({
      mappingId: 'ocp_reasoning_mapping_12345678',
      version: 1,
      config: { schemaVersion: 1, mode: 'custom_only', rules: [], replay: { format: 'disabled', scope: 'never' } },
      createdAtMs: 1,
    })
    profileRepo.createInlinePolicy({
      inlinePolicyId: 'ocp_inline_policy_12345678',
      version: 1,
      config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] },
      createdAtMs: 1,
    })
    profileRepo.createResponseProfile({
      responseProfileId: 'ocp_response_profile_12345678',
      version: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678',
      reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678',
      inlinePolicyVersion: 1,
      config: {
        schemaVersion: 1,
        choicePolicy: 'preserve_all',
        unknownFieldPolicy: 'bounded_diagnostics',
        reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 },
        inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 },
      },
      createdAtMs: 1,
    })
    providerRepo.createEndpointRevision({
      endpointRevisionId: 'ocp_endpoint_12345678',
      providerInstanceId: 'ocp_provider_12345678',
      revision: 1,
      baseUrl: 'https://api.example.test/v1',
      allowInsecureHttp: false,
      securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' },
      credentialVersionRef: 'ocp_credential_12345678',
      ordinaryHeaders: [],
      sensitiveHeaderRefs: [],
      query: [],
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      createdAtMs: 1,
    })
    db.prepare(`INSERT INTO convo (id, title, created_at, updated_at) VALUES ('c1', 'Chat', 1, 1)`).run()
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES
        ('u1', 'c1', 'user', 1, 1, 'final'),
        ('a1', 'c1', 'assistant', 2, 2, 'streaming'),
        ('a2', 'c1', 'assistant', 2, 3, 'streaming'),
        ('tool-result-1', 'c1', 'tool', 3, 4, 'final')
    `).run()
  })

  afterEach(() => db.close())

  const route = {
    routeProvenanceId: 'ocp_route_12345678',
    requestId: 'request-1',
    requestMessageId: 'u1',
    protocolKey: 'openai_chat_compatible',
    providerInstanceId: 'ocp_provider_12345678',
    modelId: 'model-a',
    endpointRevisionId: 'ocp_endpoint_12345678',
    credentialVersionRef: 'ocp_credential_12345678',
    requestProfileId: 'ocp_request_profile_12345678',
    requestProfileVersion: 1,
    responseProfileId: 'ocp_response_profile_12345678',
    responseProfileVersion: 1,
    reasoningMappingId: 'ocp_reasoning_mapping_12345678',
    reasoningMappingVersion: 1,
    reasoningMode: 'custom_only',
    inlinePolicyId: 'ocp_inline_policy_12345678',
    inlinePolicyVersion: 1,
    state: 'prepared',
    createdAtMs: 2,
  } as const

  it('atomically binds immutable route provenance and multiple choices', () => {
    expect(routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 2 },
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 1, messageId: 'a2', createdAtMs: 2 },
    ])).toMatchObject({ requestId: 'request-1', providerInstanceId: 'ocp_provider_12345678', modelId: 'model-a' })
    expect(routeRepo.listChoices(route.routeProvenanceId).map((choice) => choice.choiceIndex)).toEqual([0, 1])
    expect(() => db.prepare(`
      UPDATE compatible_route_provenance SET model_id = 'other' WHERE route_provenance_id = ?
    `).run(route.routeProvenanceId)).toThrow(/immutable/i)
    providerRepo.tombstoneProvider({ providerInstanceId: 'ocp_provider_12345678', deletedAtMs: 3 })
    expect(routeRepo.getRoute(route.routeProvenanceId)).not.toBeNull()
  })

  it('rolls back route creation when any choice is invalid or duplicated', () => {
    expect(() => routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'u1', createdAtMs: 2 },
    ])).toThrow(/assistant/i)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()
    expect(() => routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 2 },
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a2', createdAtMs: 2 },
    ])).toThrow(/unique indexes/i)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()
  })

  it('rejects a route whose response profile does not own the pinned mapping versions', () => {
    expect(() => routeRepo.createRouteWithChoices({
      ...route,
      reasoningMappingId: 'ocp_reasoning_mapping_abcdefgh',
    }, [])).toThrow(/must match/i)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()
  })

  it('rejects route credential/profile drift from the immutable endpoint revision', () => {
    expect(() => routeRepo.createRouteWithChoices({
      ...route,
      credentialVersionRef: null,
    }, [])).toThrow(/must match the endpoint revision/i)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()
  })

  it('rejects duplicate request IDs and non-user request message references', () => {
    routeRepo.createRouteWithChoices(route)
    expect(() => routeRepo.createRouteWithChoices({
      ...route,
      routeProvenanceId: 'ocp_route_abcdefgh',
    })).toThrow(/unique/i)
    expect(() => routeRepo.createRouteWithChoices({
      ...route,
      routeProvenanceId: 'ocp_route_ijklmnop',
      requestId: 'request-2',
      requestMessageId: 'a1',
    })).toThrow(/user message/i)
  })

  it('enforces schema-level route pin consistency and monotonic lifecycle state', () => {
    routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 2 },
    ])
    expect(() => db.prepare(`
      UPDATE compatible_route_provenance
      SET state = 'completed', updated_at_ms = 3, terminal_at_ms = 3
      WHERE route_provenance_id = ?
    `).run(route.routeProvenanceId)).toThrow(/state transition/i)
    db.prepare(`
      UPDATE compatible_route_provenance
      SET state = 'streaming', updated_at_ms = 3
      WHERE route_provenance_id = ?
    `).run(route.routeProvenanceId)
    db.prepare(`
      UPDATE compatible_route_provenance
      SET state = 'completed', updated_at_ms = 4, terminal_at_ms = 4
      WHERE route_provenance_id = ?
    `).run(route.routeProvenanceId)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toMatchObject({
      protocolKey: 'openai_chat_compatible',
      reasoningMode: 'custom_only',
      state: 'completed',
      updatedAtMs: 4,
      terminalAtMs: 4,
    })
    expect(() => db.prepare(`
      UPDATE compatible_route_provenance
      SET state = 'failed', updated_at_ms = 5, terminal_at_ms = 5
      WHERE route_provenance_id = ?
    `).run(route.routeProvenanceId)).toThrow(/state transition/i)
  })

  it('cascades the compatible route graph when its conversation is deleted', () => {
    routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 2 },
    ])
    db.prepare(`DELETE FROM convo WHERE id = 'c1'`).run()
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()
    expect(routeRepo.listChoices(route.routeProvenanceId)).toEqual([])
  })

  it('rejects cross-conversation route choices at repository and schema boundaries', () => {
    db.prepare(`INSERT INTO convo (id, title, created_at, updated_at) VALUES ('c2', 'Other', 1, 1)`).run()
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES ('a-other', 'c2', 'assistant', 2, 1, 'streaming')
    `).run()
    expect(() => routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a-other', createdAtMs: 2 },
    ])).toThrow(/request conversation/i)
    expect(routeRepo.getRoute(route.routeProvenanceId)).toBeNull()

    routeRepo.createRouteWithChoices(route)
    expect(() => db.prepare(`
      INSERT INTO compatible_route_choices (route_provenance_id, choice_index, message_id, created_at_ms)
      VALUES (?, 0, 'a-other', 2)
    `).run(route.routeProvenanceId)).toThrow(/request conversation/i)
  })
})
