import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompatibleDiagnosticsRepo } from './compatibleDiagnosticsRepo'
import { CompatibleProfileRepo } from './compatibleProfileRepo'
import { CompatibleProviderRepo } from './compatibleProviderRepo'
import { CompatibleRouteRepo } from './compatibleRouteRepo'
import { CompatibleReasoningRepo } from './compatibleReasoningRepo'

describe('CompatibleDiagnosticsRepo', () => {
  let db: BetterSqlite3.Database
  let repo: CompatibleDiagnosticsRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    const providerRepo = new CompatibleProviderRepo(db)
    const profileRepo = new CompatibleProfileRepo(db)
    const routeRepo = new CompatibleRouteRepo(db)
    providerRepo.createProvider({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Example', createdAtMs: 1 })
    profileRepo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678',
      version: 1,
      config: { schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 } },
      createdAtMs: 1,
    })
    profileRepo.createReasoningMapping({ mappingId: 'ocp_reasoning_mapping_12345678', version: 1, config: { schemaVersion: 1, mode: 'custom_preferred_with_builtin_fallback', rules: [], replay: { format: 'disabled', scope: 'never' } }, createdAtMs: 1 })
    profileRepo.createInlinePolicy({ inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] }, createdAtMs: 1 })
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
      auth: { mode: 'none' },
      credentialVersionRef: null,
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
      VALUES ('u1', 'c1', 'user', 1, 1, 'final'), ('a1', 'c1', 'assistant', 2, 2, 'streaming')
    `).run()
    routeRepo.createRouteWithChoices({
      routeProvenanceId: 'ocp_route_12345678',
      requestId: 'request-1',
      requestMessageId: 'u1',
      protocolKey: 'openai_chat_compatible',
      providerInstanceId: 'ocp_provider_12345678',
      modelId: 'model-a',
      endpointRevisionId: 'ocp_endpoint_12345678',
      credentialVersionRef: null,
      requestProfileId: 'ocp_request_profile_12345678',
      requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678',
      reasoningMappingVersion: 1,
      reasoningMode: 'custom_preferred_with_builtin_fallback',
      inlinePolicyId: 'ocp_inline_policy_12345678',
      inlinePolicyVersion: 1,
      state: 'prepared',
      createdAtMs: 2,
    }, [{ routeProvenanceId: 'ocp_route_12345678', choiceIndex: 0, messageId: 'a1', createdAtMs: 2 }])
    repo = new CompatibleDiagnosticsRepo(db)
  })

  afterEach(() => db.close())

  it('upserts bounded discovered-field aggregates without changing profile scope', () => {
    const first = repo.upsertDiscoveredField({
      providerInstanceId: 'ocp_provider_12345678',
      responseProfileId: 'ocp_response_profile_12345678',
      profileVersion: 1,
      streamPath: 'choices[].delta.vendor_reasoning',
      state: 'candidate',
      aggregate: {
        schemaVersion: 1,
        observedShapes: ['string'],
        redactedPreview: { kind: 'redacted', valueType: 'string', originalLength: 6 },
        sampleCount: 1,
      },
      occurrenceCount: 1,
      firstObservedAtMs: 2,
      lastObservedAtMs: 2,
    })
    expect(first).toMatchObject({ state: 'candidate', occurrenceCount: 1 })
    expect(repo.upsertDiscoveredField({
      ...first,
      state: 'confirmed',
      aggregate: { ...first.aggregate, sampleCount: 2 },
      occurrenceCount: 2,
      firstObservedAtMs: 3,
      lastObservedAtMs: 4,
    })).toMatchObject({ state: 'confirmed', occurrenceCount: 2, firstObservedAtMs: 2, lastObservedAtMs: 4 })
    expect(() => repo.upsertDiscoveredField({
      ...first,
      state: 'candidate',
      occurrenceCount: 3,
      lastObservedAtMs: 5,
    })).toThrow(/cannot regress/i)
    expect(() => repo.upsertDiscoveredField({
      ...first,
      state: 'confirmed',
      occurrenceCount: 1,
      lastObservedAtMs: 5,
    })).toThrow(/cannot decrease/i)
  })

  it('lists scoped candidates and persists explicit ignore state without exposing raw values', () => {
    repo.upsertDiscoveredField({
      providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
      streamPath: 'choices.*.delta.thought_process', state: 'candidate',
      aggregate: { schemaVersion: 1, observedShapes: ['string'], redactedPreview: { kind: 'redacted', valueType: 'string', originalLength: 12 }, sampleCount: 2 },
      occurrenceCount: 2, firstObservedAtMs: 2, lastObservedAtMs: 3,
    })
    expect(repo.listDiscoveredFields({ providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1 })).toEqual([
      expect.objectContaining({ streamPath: 'choices.*.delta.thought_process', state: 'candidate', occurrenceCount: 2 }),
    ])
    expect(repo.setDiscoveredFieldState({
      providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1,
      streamPath: 'choices.*.delta.thought_process', state: 'ignored',
    })).toMatchObject({ state: 'ignored', aggregate: { redactedPreview: { kind: 'redacted' } } })
    expect(repo.listDiscoveredFields({ providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', profileVersion: 1, state: 'candidate' })).toEqual([])
  })

  it('stores only bounded redacted raw extension records pinned to route/profile/choice', () => {
    const record = repo.createRawExtensionRecord({
      recordId: 'ocp_raw_extension_12345678',
      routeProvenanceId: 'ocp_route_12345678',
      messageId: 'a1',
      choiceIndex: 0,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      sourcePath: 'choices[0].delta.vendor_trace',
      sequenceStart: 1,
      sequenceEnd: 2,
      extensionKind: 'append',
      semantic: 'reasoning',
      value: { vendor_trace: { phase: '[redacted]' } },
      redactionState: 'redacted',
      createdAtMs: 2,
    })
    expect(record).toMatchObject({
      recordId: 'ocp_raw_extension_12345678',
      messageId: 'a1',
      choiceIndex: 0,
      redactionState: 'redacted',
      extensionKind: 'append',
      semantic: 'reasoning',
    })
    expect(record.valueBytes).toBeGreaterThan(0)
    expect(repo.listRawExtensionRecords('a1')).toHaveLength(1)
  })

  it('rejects secrets and standard response-field duplication before persistence', () => {
    const base = {
      recordId: 'ocp_raw_extension_12345678',
      routeProvenanceId: 'ocp_route_12345678',
      messageId: 'a1',
      choiceIndex: 0,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      sourcePath: 'vendor',
      sequenceStart: 1,
      sequenceEnd: 1,
      redactionState: 'redacted' as const,
      createdAtMs: 2,
    }
    expect(() => repo.createRawExtensionRecord({ ...base, value: { authorization: 'Bearer raw-secret' } })).toThrow(/secret-like/i)
    expect(() => repo.createRawExtensionRecord({ ...base, value: { vendor: 'unredacted diagnostic text' } })).toThrow(/redacted before persistence/i)
    expect(() => repo.createRawExtensionRecord({ ...base, value: { choices: [] } })).toThrow(/standard response/i)
    expect(() => repo.createRawExtensionRecord({ ...base, value: { ['x'.repeat(17 * 1024)]: true } })).toThrow(/byte limit/i)
    expect(repo.listRawExtensionRecords('a1')).toEqual([])
  })

  it('rejects profile drift from immutable route provenance', () => {
    expect(() => repo.createRawExtensionRecord({
      recordId: 'ocp_raw_extension_12345678',
      routeProvenanceId: 'ocp_route_12345678',
      messageId: 'a1',
      choiceIndex: 0,
      responseProfileId: 'ocp_response_profile_abcdefgh',
      responseProfileVersion: 1,
      sourcePath: 'vendor',
      sequenceStart: 1,
      sequenceEnd: 1,
      value: { vendor: '[redacted]' },
      redactionState: 'redacted',
      createdAtMs: 2,
    })).toThrow(/must match/i)
  })

  it('writes response-scoped raw batches atomically', () => {
    const base = {
      routeProvenanceId: 'ocp_route_12345678',
      choiceIndex: 0,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      sourcePath: 'vendor',
      sequenceStart: 1,
      sequenceEnd: 1,
      value: { vendor: '[redacted]' },
      redactionState: 'redacted' as const,
      createdAtMs: 2,
    }
    expect(() => repo.createRawExtensionRecords([
      { ...base, recordId: 'ocp_raw_extension_batch0001', messageId: 'a1' },
      { ...base, recordId: 'ocp_raw_extension_batch0002', messageId: 'missing' },
    ])).toThrow()
    expect(repo.listRawExtensionRecords('a1')).toEqual([])
  })

  it('rejects arbitrary discovered preview text before SQLite', () => {
    expect(() => repo.upsertDiscoveredField({
      providerInstanceId: 'ocp_provider_12345678',
      responseProfileId: 'ocp_response_profile_12345678',
      profileVersion: 1,
      streamPath: 'vendor',
      state: 'candidate',
      aggregate: {
        schemaVersion: 1,
        observedShapes: ['string'],
        redactedPreview: 'hunter2' as never,
        sampleCount: 1,
      },
      occurrenceCount: 1,
      firstObservedAtMs: 2,
      lastObservedAtMs: 2,
    })).toThrow()
  })

  it('purges bounded raw diagnostics only after their route is terminal', () => {
    repo.createRawExtensionRecord({
      recordId: 'ocp_raw_extension_retention1', routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0,
      responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, sourcePath: 'vendor.safe', sequenceStart: 1, sequenceEnd: 1,
      value: { value: '[redacted]' }, redactionState: 'redacted', createdAtMs: 2,
    })
    expect(repo.purgeExpiredRawExtensionRecords({ beforeMs: 10, limit: 10 })).toEqual({ deleted: 0, recordIds: [] })
    db.prepare(`UPDATE compatible_route_provenance SET state = 'interrupted', updated_at_ms = 5, terminal_at_ms = 5 WHERE route_provenance_id = ?`).run('ocp_route_12345678')
    expect(repo.purgeExpiredRawExtensionRecords({ beforeMs: 10, limit: 10 })).toEqual({ deleted: 1, recordIds: ['ocp_raw_extension_retention1'] })
    expect(repo.listRawExtensionRecords('a1')).toEqual([])
  })

  it('enforces the raw record limit across all choices in one response route', () => {
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES ('a2', 'c1', 'assistant', 2, 3, 'streaming')
    `).run()
    db.prepare(`
      INSERT INTO compatible_route_choices (route_provenance_id, choice_index, message_id, created_at_ms)
      VALUES ('ocp_route_12345678', 1, 'a2', 2)
    `).run()
    for (let index = 0; index < 256; index += 1) {
      repo.createRawExtensionRecord({
        recordId: `ocp_raw_extension_${String(index).padStart(8, '0')}`,
        routeProvenanceId: 'ocp_route_12345678',
        messageId: index % 2 === 0 ? 'a1' : 'a2',
        choiceIndex: index % 2,
        responseProfileId: 'ocp_response_profile_12345678',
        responseProfileVersion: 1,
        sourcePath: 'vendor.count',
        sequenceStart: index,
        sequenceEnd: index,
        value: { count: index },
        redactionState: 'redacted',
        createdAtMs: 2,
      })
    }
    expect(() => repo.createRawExtensionRecord({
      recordId: 'ocp_raw_extension_overflow1',
      routeProvenanceId: 'ocp_route_12345678',
      messageId: 'a2',
      choiceIndex: 1,
      responseProfileId: 'ocp_response_profile_12345678',
      responseProfileVersion: 1,
      sourcePath: 'vendor.count',
      sequenceStart: 256,
      sequenceEnd: 256,
      value: { count: 256 },
      redactionState: 'dropped',
      createdAtMs: 2,
    })).toThrow(/response/i)
  })

  it('persists pinned reasoning choice state idempotently and freezes terminal facts', () => {
    const reasoningRepo = new CompatibleReasoningRepo(db)
    const terminal = {
      routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      mode: 'custom_preferred_with_builtin_fallback' as const, status: 'terminal' as const, lockedSource: 'custom' as const,
      lockedSourceKey: 'custom:ocp_reasoning_mapping_12345678:1:vendor',
      reasoningText: 'stable', conflicts: [{ kind: 'late_lower_priority_source' as const, source: 'thinking' as const, sequence: 2 }], updatedAtMs: 3,
      selectedSegmentIds: ['a1:0:inline-reasoning:0'],
    }
    expect(reasoningRepo.save(terminal)).toMatchObject({ status: 'terminal', lockedSource: 'custom', reasoningText: 'stable' })
    expect(reasoningRepo.save(terminal)).toEqual(reasoningRepo.get('ocp_route_12345678', 0))
    expect(() => reasoningRepo.save({ ...terminal, reasoningText: 'rewritten' })).toThrow(/immutable/i)
    expect(() => db.prepare(`UPDATE compatible_reasoning_choice_state SET reasoning_text = 'bypass' WHERE route_provenance_id = ? AND choice_index = 0`).run('ocp_route_12345678')).toThrow(/immutable/i)
  })

  it('rejects reasoning source keys inconsistent with source and route mapping pin', () => {
    const reasoningRepo = new CompatibleReasoningRepo(db)
    const base = {
      routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      mode: 'custom_preferred_with_builtin_fallback' as const, status: 'locked' as const, reasoningText: 'x', selectedSegmentIds: [], conflicts: [], updatedAtMs: 3,
    }
    expect(() => reasoningRepo.save({ ...base, lockedSource: 'custom', lockedSourceKey: 'custom:wrong:1:path' })).toThrow(/source key/i)
    expect(() => reasoningRepo.save({ ...base, lockedSource: 'custom', lockedSourceKey: 'custom:ocp_reasoning_mapping_12345678:1:' })).toThrow(/source path/i)
    expect(() => reasoningRepo.save({ ...base, lockedSource: 'reasoning', lockedSourceKey: 'thinking' })).toThrow(/source key/i)
    expect(() => db.prepare(`INSERT INTO compatible_reasoning_choice_state (route_provenance_id,message_id,choice_index,reasoning_mapping_id,reasoning_mapping_version,mode,status,locked_source,locked_source_key,reasoning_text,segment_ids_json,conflicts_json,updated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('ocp_route_12345678','a1',0,'ocp_reasoning_mapping_12345678',1,'custom_only','locked','reasoning','thinking','x','[]','[]',3)).toThrow()
    expect(() => db.prepare(`INSERT INTO compatible_reasoning_choice_state (route_provenance_id,message_id,choice_index,reasoning_mapping_id,reasoning_mapping_version,mode,status,locked_source,locked_source_key,reasoning_text,segment_ids_json,conflicts_json,updated_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('ocp_route_12345678','a1',0,'ocp_reasoning_mapping_12345678',1,'custom_only','locked','custom','custom:ocpXreasoningXmappingX12345678:1:path','x','[]','[]',3)).toThrow()
  })

  it('round-trips exact inline tag and segment identity', () => {
    const reasoningRepo = new CompatibleReasoningRepo(db)
    expect(reasoningRepo.save({
      routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      mode: 'custom_preferred_with_builtin_fallback', status: 'terminal', lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think',
      reasoningText: 'ab', selectedSegmentIds: ['a1:0:inline-reasoning:0', 'a1:0:inline-reasoning:1'], conflicts: [], updatedAtMs: 3,
    })).toMatchObject({ lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think', selectedSegmentIds: ['a1:0:inline-reasoning:0', 'a1:0:inline-reasoning:1'] })
  })
  it('rejects multibyte reasoning above the SQLite byte boundary before write', () => {
    const reasoningRepo = new CompatibleReasoningRepo(db)
    expect(() => reasoningRepo.save({
      routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      mode: 'custom_preferred_with_builtin_fallback', status: 'terminal', lockedSource: 'reasoning', lockedSourceKey: 'reasoning',
      reasoningText: '界'.repeat(400_000), selectedSegmentIds: [], conflicts: [], updatedAtMs: 3,
    })).toThrow(/UTF-8 byte limit/i)
    expect(reasoningRepo.get('ocp_route_12345678', 0)).toBeNull()
  })
})
