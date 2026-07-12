import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CompatibleToolAggregate } from '../../../src/shared/provider/openai-chat-compatible'
import { CompatibleToolAccumulator, reconstructCompatibleToolMessages } from '../../../src/shared/provider/openai-chat-compatible'
import { CompatibleProfileRepo } from './compatibleProfileRepo'
import { CompatibleProviderRepo } from './compatibleProviderRepo'
import { CompatibleRouteRepo } from './compatibleRouteRepo'
import { CompatibleToolRepo, type SaveCompatibleToolCallInput } from './compatibleToolRepo'

type ToolIdentity = Readonly<{ routeProvenanceId: string; messageId: string; choiceIndex: number }>
const DEFAULT_TOOL_IDENTITY: ToolIdentity = Object.freeze({ routeProvenanceId: 'ocp_route_12345678', messageId: 'a1', choiceIndex: 0 })
type BoundApplyInput = Omit<Parameters<CompatibleToolAccumulator['apply']>[0], keyof ToolIdentity>

function createAccumulator(identity: Partial<ToolIdentity> = {}) {
  const bound = { ...DEFAULT_TOOL_IDENTITY, ...identity }
  const accumulator = new CompatibleToolAccumulator(bound)
  return {
    apply: (input: BoundApplyInput) => accumulator.apply({ ...bound, ...input }),
    finalize: (finishReason: string | null) => accumulator.finalize(finishReason),
    list: () => accumulator.list(),
  }
}

describe('CompatibleToolRepo', () => {
  let db: BetterSqlite3.Database
  let routeRepo: CompatibleRouteRepo
  let toolRepo: CompatibleToolRepo

  const route = {
    routeProvenanceId: 'ocp_route_12345678', requestId: 'request-1', requestMessageId: 'u1', protocolKey: 'openai_chat_compatible',
    providerInstanceId: 'ocp_provider_12345678', modelId: 'model-a', endpointRevisionId: 'ocp_endpoint_12345678',
    credentialVersionRef: 'ocp_credential_12345678', requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
    responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, reasoningMappingId: 'ocp_reasoning_mapping_12345678',
    reasoningMappingVersion: 1, reasoningMode: 'custom_only', inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
    state: 'prepared', createdAtMs: 2,
  } as const

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    const providerRepo = new CompatibleProviderRepo(db)
    const profileRepo = new CompatibleProfileRepo(db)
    routeRepo = new CompatibleRouteRepo(db)
    toolRepo = new CompatibleToolRepo(db)
    providerRepo.createProvider({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Example', createdAtMs: 1 })
    providerRepo.createCredentialDescriptor({
      credentialVersionRef: 'ocp_credential_12345678', providerInstanceId: 'ocp_provider_12345678', version: 1, authMode: 'bearer',
      backend: 'electron_safe_storage',
      maskedSummary: { schemaVersion: 1, authMode: 'bearer', configured: true, maskState: 'configured_masked', sensitiveHeaderNames: [] },
      createdAtMs: 1,
    })
    profileRepo.createRequestProfile({
      requestProfileId: 'ocp_request_profile_12345678', version: 1,
      config: { schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch', extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 } },
      createdAtMs: 1,
    })
    profileRepo.createReasoningMapping({ mappingId: 'ocp_reasoning_mapping_12345678', version: 1, config: { schemaVersion: 1, mode: 'custom_only', rules: [], replay: { format: 'disabled', scope: 'never' } }, createdAtMs: 1 })
    profileRepo.createInlinePolicy({ inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] }, createdAtMs: 1 })
    profileRepo.createResponseProfile({
      responseProfileId: 'ocp_response_profile_12345678', version: 1, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
      config: { schemaVersion: 1, choicePolicy: 'preserve_all', unknownFieldPolicy: 'bounded_diagnostics', reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 }, inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 } },
      createdAtMs: 1,
    })
    providerRepo.createEndpointRevision({
      endpointRevisionId: 'ocp_endpoint_12345678', providerInstanceId: 'ocp_provider_12345678', revision: 1,
      baseUrl: 'https://api.example.test/v1', allowInsecureHttp: false, securityPolicy: 'compatibility_first',
      auth: { mode: 'bearer', credentialVersionRef: 'ocp_credential_12345678' }, credentialVersionRef: 'ocp_credential_12345678',
      ordinaryHeaders: [], sensitiveHeaderRefs: [], query: [], requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, createdAtMs: 1,
    })
    db.prepare("INSERT INTO convo (id, title, created_at, updated_at) VALUES ('c1', 'Chat', 1, 1), ('c2', 'Other', 1, 1)").run()
    db.prepare(`
      INSERT INTO message (id, convo_id, role, created_at, seq, status)
      VALUES ('u1','c1','user',1,1,'final'), ('a1','c1','assistant',2,2,'streaming'), ('a2','c1','assistant',2,3,'streaming'),
             ('tool-result-1','c1','tool',3,4,'final'), ('tool-result-2','c1','tool',4,5,'final'),
             ('wrong-role','c1','assistant',4,6,'final'), ('sibling-tool','c1','tool',4,7,'final'),
             ('other-convo-tool','c2','tool',4,1,'final')
    `).run()
    db.prepare(`UPDATE message SET parent_id = CASE id
      WHEN 'tool-result-1' THEN 'a1' WHEN 'tool-result-2' THEN 'a1' WHEN 'wrong-role' THEN 'a1'
      WHEN 'sibling-tool' THEN 'a2' WHEN 'other-convo-tool' THEN 'a1' ELSE parent_id END`).run()
    db.prepare(`INSERT INTO message_body (message_id, body) VALUES
      ('tool-result-1','{"temperature":20}'), ('tool-result-2','sunny'), ('wrong-role','sunny'), ('sibling-tool','sunny'), ('other-convo-tool','sunny')`).run()
    routeRepo.createRouteWithChoices(route, [
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 0, messageId: 'a1', createdAtMs: 2 },
      { routeProvenanceId: route.routeProvenanceId, choiceIndex: 1, messageId: 'a2', createdAtMs: 2 },
    ])
  })

  afterEach(() => db.close())

  const persisted = (aggregate: CompatibleToolAggregate, overrides: Partial<SaveCompatibleToolCallInput> = {}): SaveCompatibleToolCallInput => ({
    routeProvenanceId: aggregate.routeProvenanceId as SaveCompatibleToolCallInput['routeProvenanceId'],
    messageId: aggregate.messageId,
    choiceIndex: aggregate.choiceIndex,
    toolIndex: aggregate.toolIndex,
    toolCallId: aggregate.toolCallId,
    toolType: aggregate.toolType,
    functionName: aggregate.functionName,
    argumentsText: aggregate.argumentsText,
    argumentsObserved: aggregate.argumentsObserved,
    argumentsJson: aggregate.argumentsJson,
    status: aggregate.status,
    parseErrorCode: aggregate.diagnosticCode,
    executionState: aggregate.executionState,
    sequenceStart: aggregate.sequenceStart,
    sequenceEnd: aggregate.sequenceEnd,
    createdAtMs: 2,
    updatedAtMs: 2 + aggregate.sequenceEnd,
    ...overrides,
  })

  it('persists incremental raw arguments and reloads parsed final state byte-for-byte', () => {
    const accumulator = createAccumulator()
    const first = accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'call-', type: 'function', functionName: 'look', argumentsFragment: '{ "q":' } })
    expect(toolRepo.saveCall(persisted(first))).toMatchObject({ argumentsText: '{ "q":', argumentsJson: null, status: 'streaming' })
    accumulator.apply({ sequence: 3, fragment: { toolIndex: 0, id: '1', functionName: 'up', argumentsFragment: ' "weather" }' } })
    const final = accumulator.finalize('tool_calls')[0]
    const saved = toolRepo.saveCall(persisted(final))
    expect(saved).toMatchObject({ toolCallId: 'call-1', functionName: 'lookup', argumentsText: '{ "q": "weather" }', argumentsJson: '{ "q": "weather" }', status: 'complete', executionState: 'not_executed' })
    expect(toolRepo.getCall('a1', 0, 0)).toEqual(saved)
    expect(toolRepo.saveCall(persisted(final))).toEqual(saved)
  })

  it('persists malformed and incomplete calls without parsed arguments', () => {
    const malformed = createAccumulator()
    malformed.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'bad', type: 'function', functionName: 'f', argumentsFragment: '{' } })
    expect(toolRepo.saveCall(persisted(malformed.finalize('tool_calls')[0]))).toMatchObject({
      argumentsText: '{', argumentsJson: null, status: 'malformed', parseErrorCode: 'tool_arguments_malformed',
    })
    const incomplete = createAccumulator()
    incomplete.apply({ sequence: 2, fragment: { toolIndex: 1, id: 'partial' } })
    expect(toolRepo.saveCall(persisted(incomplete.finalize('stop')[0], { toolIndex: 1 }))).toMatchObject({ status: 'incomplete', parseErrorCode: 'tool_finish_reason_mismatch' })
  })

  it('rejects raw/parsed argument drift and structurally unbounded complete JSON in repository and SQLite', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'f', argumentsFragment: '{ "a": 1 }' } })
    const final = accumulator.finalize('tool_calls')[0]
    expect(() => toolRepo.saveCall(persisted(final, { argumentsJson: '{"other":2}' }))).toThrow(/same exact validated payload/)
    expect(() => db.prepare(`
      INSERT INTO compatible_tool_calls (
        route_provenance_id,message_id,choice_index,tool_index,tool_call_id,tool_type,function_name,
        arguments_text,arguments_observed,arguments_json,status,parse_error_code,execution_state,
        sequence_start,sequence_end,created_at_ms,updated_at_ms
      ) VALUES (?, 'a1', 0, 4, 'drift', 'function', 'f', '{}', 1, '{"other":2}', 'complete', NULL, 'not_executed', 1, 1, 2, 2)
    `).run(route.routeProvenanceId)).toThrow()
    const insertNonObject = db.prepare(`
      INSERT INTO compatible_tool_calls (
        route_provenance_id,message_id,choice_index,tool_index,tool_call_id,tool_type,function_name,
        arguments_text,arguments_observed,arguments_json,status,parse_error_code,execution_state,
        sequence_start,sequence_end,created_at_ms,updated_at_ms
      ) VALUES (?, 'a1', 0, ?, ?, 'function', 'f', ?, 1, ?, 'complete', NULL, 'not_executed', 1, 1, 2, 2)
    `)
    for (const [offset, nonObject] of ['[]', '1', 'null', '"text"'].entries()) {
      expect(() => insertNonObject.run(route.routeProvenanceId, 10 + offset, `non-object-${offset}`, nonObject, nonObject)).toThrow()
    }

    let deep: unknown = true
    for (let index = 0; index < 70; index += 1) deep = { nested: deep }
    const deepText = JSON.stringify(deep)
    expect(() => db.prepare(`
      INSERT INTO compatible_tool_calls (
        route_provenance_id,message_id,choice_index,tool_index,tool_call_id,tool_type,function_name,
        arguments_text,arguments_observed,arguments_json,status,parse_error_code,execution_state,
        sequence_start,sequence_end,created_at_ms,updated_at_ms
      ) VALUES (?, 'a1', 0, 5, 'deep', 'function', 'f', ?, 1, ?, 'complete', NULL, 'not_executed', 1, 1, 2, 2)
    `).run(route.routeProvenanceId, deepText, deepText)).toThrow(/structural limits/)
  })

  it('rejects sequence rollback, changed duplicate snapshots and post-terminal mutation', () => {
    const accumulator = createAccumulator()
    const streaming = accumulator.apply({ sequence: 2, fragment: { toolIndex: 0, id: 'c', type: 'function', functionName: 'f', argumentsFragment: '{}' } })
    toolRepo.saveCall(persisted(streaming))
    expect(() => toolRepo.saveCall(persisted({ ...streaming, argumentsText: '{"changed":1}' }))).toThrow(/idempotency_conflict/)
    expect(() => toolRepo.saveCall(persisted({ ...streaming, sequenceEnd: 1 }))).toThrow(/range|out_of_order/)
    const final = accumulator.finalize('tool_calls')[0]
    toolRepo.saveCall(persisted(final))
    expect(() => toolRepo.saveCall(persisted({ ...final, sequenceEnd: 4 }, { updatedAtMs: 6 }))).toThrow(/terminal_immutable/)
  })

  it('saves a batch transactionally and keeps choice/index identity isolated', () => {
    const first = createAccumulator()
    first.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'c0', type: 'function', functionName: 'a', argumentsFragment: '{}' } })
    const second = createAccumulator({ messageId: 'a2', choiceIndex: 1 })
    second.apply({ sequence: 2, fragment: { toolIndex: 1, id: 'c1', type: 'function', functionName: 'b', argumentsFragment: '{}' } })
    expect(toolRepo.saveCalls([
      persisted(first.finalize('tool_calls')[0]),
      persisted(second.finalize('tool_calls')[0], { messageId: 'a2', choiceIndex: 1, toolIndex: 1 }),
    ])).toHaveLength(2)
    expect(toolRepo.listCalls(route.routeProvenanceId, 0).map((call) => call.toolCallId)).toEqual(['c0'])
    expect(toolRepo.listCalls(route.routeProvenanceId, 1).map((call) => call.toolCallId)).toEqual(['c1'])

    const failing = createAccumulator()
    failing.apply({ sequence: 5, fragment: { toolIndex: 2, id: 'rollback', type: 'function', functionName: 'x', argumentsFragment: '{}' } })
    expect(() => toolRepo.saveCalls([
      persisted(failing.finalize('tool_calls')[0], { toolIndex: 2 }),
      persisted({ ...failing.list()[0], toolIndex: 3 }, { messageId: 'a2', choiceIndex: 0, toolIndex: 3 }),
    ])).toThrow()
    expect(toolRepo.getCall('a1', 0, 2)).toBeNull()
  })

  it('binds idempotent results only to a complete call and a later same-conversation role=tool message', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'lookup', argumentsFragment: '{}' } })
    toolRepo.saveCall(persisted(accumulator.finalize('tool_calls')[0]))
    const result = toolRepo.createResult({ toolResultMessageId: 'tool-result-1', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: { temperature: 20 }, createdAtMs: 4 })
    expect(result).toMatchObject({ toolCallId: 'call-1', contentJson: '{"temperature":20}', messageSequence: 4 })
    expect(toolRepo.createResult({ toolResultMessageId: 'tool-result-1', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: { temperature: 20 }, createdAtMs: 4 })).toEqual(result)
    expect(() => toolRepo.createResult({ toolResultMessageId: 'wrong-role', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: 'sunny', createdAtMs: 5 })).toThrow(/binding_invalid/)
    expect(() => toolRepo.createResult({ toolResultMessageId: 'sibling-tool', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: 'sunny', createdAtMs: 5 })).toThrow(/binding_invalid/)
    expect(() => toolRepo.createResult({ toolResultMessageId: 'other-convo-tool', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: 'sunny', createdAtMs: 5 })).toThrow(/binding_invalid/)
  })

  it('reloads a structured chain suitable for exact historical request reconstruction', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'lookup', argumentsFragment: '{ "q": "weather" }' } })
    toolRepo.saveCall(persisted(accumulator.finalize('tool_calls')[0]))
    toolRepo.createResult({ toolResultMessageId: 'tool-result-2', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: 'sunny', createdAtMs: 5 })
    const chain = toolRepo.loadChoiceChain(route.routeProvenanceId, 0)
    expect(reconstructCompatibleToolMessages(chain)).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{ "q": "weather" }' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'sunny' },
    ])
  })

  it('enforces tool identity, monotonic terminal state and result binding below the repository layer', () => {
    const accumulator = createAccumulator()
    accumulator.apply({ sequence: 1, fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'lookup', argumentsFragment: '{}' } })
    toolRepo.saveCall(persisted(accumulator.finalize('tool_calls')[0]))
    expect(() => db.prepare("UPDATE compatible_tool_calls SET arguments_text = 'changed' WHERE message_id = 'a1'").run()).toThrow(/monotonic|immutable/)
    expect(() => db.prepare("UPDATE compatible_tool_calls SET route_provenance_id = 'ocp_route_other' WHERE message_id = 'a1'").run()).toThrow(/identity|immutable/)
    expect(() => db.prepare(`
      INSERT INTO compatible_tool_results (tool_result_message_id, route_provenance_id, tool_call_id, content_json, created_at_ms)
      VALUES ('wrong-role', ?, 'call-1', '"sunny"', 5)
    `).run(route.routeProvenanceId)).toThrow(/binding is invalid/)
    toolRepo.createResult({ toolResultMessageId: 'tool-result-2', routeProvenanceId: route.routeProvenanceId, toolCallId: 'call-1', content: 'sunny', createdAtMs: 5 })
    expect(() => db.prepare("UPDATE compatible_tool_results SET content_json = '\"changed\"' WHERE tool_result_message_id = 'tool-result-2'").run()).toThrow(/immutable/)
  })
})
