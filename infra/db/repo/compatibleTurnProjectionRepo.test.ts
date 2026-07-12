import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CompatibleDisplayAssembler, CompatibleTurnProjector, projectCompatiblePersistedHistory, type CompatibleDurableChoiceProjection } from '../../../src/shared/provider/openai-chat-compatible/display'
import { CompatibleTurnProjectionRepo } from './compatibleTurnProjectionRepo'
import { CompatibleDiagnosticsRepo } from './compatibleDiagnosticsRepo'

const routeProvenanceId = 'ocp_route_12345678'

describe('CompatibleTurnProjectionRepo', () => {
  let db: BetterSqlite3.Database
  let repo: CompatibleTurnProjectionRepo

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
    db.pragma('foreign_keys = OFF')
    db.exec(`DROP TRIGGER trg_compatible_route_pin_consistent;`)
    db.exec(`
      INSERT INTO convo (id, title, created_at, updated_at) VALUES ('c1', 'Chat', 1, 1);
      INSERT INTO message (id, convo_id, role, created_at, seq, status) VALUES
        ('u1', 'c1', 'user', 1, 1, 'final'), ('a1', 'c1', 'assistant', 2, 2, 'streaming'), ('a2', 'c1', 'assistant', 2, 3, 'streaming');
      INSERT INTO compatible_route_provenance (
        route_provenance_id, request_id, request_message_id, protocol_key, provider_instance_id, model_id,
        endpoint_revision_id, credential_version_ref, request_profile_id, request_profile_version,
        response_profile_id, response_profile_version, reasoning_mapping_id, reasoning_mapping_version,
        reasoning_mode, inline_policy_id, inline_policy_version, state, created_at_ms, updated_at_ms, terminal_at_ms
      ) VALUES (
        '${routeProvenanceId}', 'request-1', 'u1', 'openai_chat_compatible', 'ocp_provider_12345678', 'model-a',
        'ocp_endpoint_12345678', 'ocp_credential_12345678', 'ocp_request_profile_12345678', 1,
        'ocp_response_profile_12345678', 1, 'ocp_reasoning_mapping_12345678', 1,
        'custom_only', 'ocp_inline_policy_12345678', 1, 'prepared', 2, 2, NULL
      );
      INSERT INTO compatible_route_choices (route_provenance_id, choice_index, message_id, created_at_ms) VALUES
        ('${routeProvenanceId}', 0, 'a1', 2), ('${routeProvenanceId}', 1, 'a2', 2);
      UPDATE compatible_route_provenance SET state = 'streaming', updated_at_ms = 2 WHERE route_provenance_id = '${routeProvenanceId}';
    `)
    db.pragma('foreign_keys = ON')
    repo = new CompatibleTurnProjectionRepo(db)
  })

  afterEach(() => db.close())

  function projection(choiceIndex: number, status: CompatibleDurableChoiceProjection['status'] = 'streaming') {
    const value = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: `a${choiceIndex + 1}`, choiceIndex, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    value.appendContent(`choice-${choiceIndex}`, 1)
    return status === 'streaming' ? value.snapshot() : value.terminate(status)
  }

  it('round-trips the provider-neutral streaming projection without current settings', () => {
    const saved = repo.saveStreaming(projection(0), 3)
    expect(repo.loadChoice(routeProvenanceId, 0)).toEqual(saved)
    expect(saved).toMatchObject({ choiceIndex: 0, status: 'streaming', checkpointVersion: 1, blocks: [expect.objectContaining({ text: 'choice-0' })] })
    expect(repo.loadBundle(routeProvenanceId)).toMatchObject({ route: { routeProvenanceId, modelId: 'model-a', reasoningMappingId: 'ocp_reasoning_mapping_12345678' }, choices: [saved] })
    const { checkpointVersion: _version, updatedAtMs: _updated, terminalAtMs: _terminal, ...reloadedProjection } = saved
    expect(reloadedProjection).toEqual(projection(0))
  })

  it('is idempotent at the same sequence and rejects changed duplicate or rollback', () => {
    const first = projection(0)
    repo.saveStreaming(first, 3)
    expect(repo.saveStreaming(first, 3)).toEqual(repo.loadChoice(routeProvenanceId, 0))
    expect(() => repo.saveStreaming({ ...first, finishReason: 'changed' }, 4)).toThrow(/same_sequence_conflict/)
    const earlier = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    earlier.appendContent('earlier', 0)
    expect(() => repo.saveStreaming(earlier.snapshot(), 4)).toThrow(/sequence_rollback/)
  })

  it('enforces one response-scoped usage owner across every route choice', () => {
    const first = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    const second = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a2', choiceIndex: 1, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    first.setUsage({ total_tokens: 1 }, 'provider_reported', 1, 'response', 0)
    second.setUsage({ total_tokens: 1 }, 'provider_reported', 1, 'response', 1)
    repo.saveStreaming(first.snapshot(), 3)
    expect(() => repo.saveStreaming(second.snapshot(), 3)).toThrow()
  })

  it('rejects direct-SQL projection identity drift', () => {
    const value = projection(0)
    expect(() => db.prepare(`INSERT INTO compatible_choice_display_projections (route_provenance_id, message_id, choice_index, checkpoint_version, status, last_sequence, projection_json, updated_at_ms, terminal_at_ms) VALUES (?, ?, ?, 1, 'streaming', 1, ?, 3, NULL)`).run(routeProvenanceId, 'a1', 0, JSON.stringify({ ...value, messageId: 'a2' }))).toThrow()
  })

  it('atomically finalizes every choice, route and message status', () => {
    const result = repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [projection(0, 'completed'), projection(1, 'completed')] })
    expect(result).toHaveLength(2)
    expect(repo.loadRoute(routeProvenanceId).map((choice) => choice.status)).toEqual(['completed', 'completed'])
    expect(db.prepare(`SELECT state, terminal_at_ms FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(routeProvenanceId)).toEqual({ state: 'completed', terminal_at_ms: 5 })
    expect(db.prepare(`SELECT id, status FROM message WHERE id IN ('a1','a2') ORDER BY id`).all()).toEqual([{ id: 'a1', status: 'final' }, { id: 'a2', status: 'final' }])
    expect(repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [projection(0, 'completed'), projection(1, 'completed')] })).toEqual(result)
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 6, choices: [projection(0, 'completed'), projection(1, 'completed')] })).toThrow(/immutable|conflict/)
  })

  it('rolls the complete terminal checkpoint back on any child write failure', () => {
    db.exec(`CREATE TRIGGER fail_choice_one BEFORE INSERT ON compatible_choice_display_projections WHEN new.choice_index = 1 BEGIN SELECT RAISE(ABORT, 'injected projection failure'); END;`)
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [projection(0, 'completed'), projection(1, 'completed')] })).toThrow(/injected/)
    expect(repo.loadRoute(routeProvenanceId)).toEqual([])
    expect(db.prepare(`SELECT state FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(routeProvenanceId)).toEqual({ state: 'streaming' })
    expect(db.prepare(`SELECT id, status FROM message WHERE id IN ('a1','a2') ORDER BY id`).all()).toEqual([{ id: 'a1', status: 'streaming' }, { id: 'a2', status: 'streaming' }])
  })

  it('rejects incomplete choice checkpoints before changing durable terminal state', () => {
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [projection(0, 'completed')] })).toThrow(/choice_set_incomplete/)
    expect(repo.loadRoute(routeProvenanceId)).toEqual([])
  })

  it('refuses terminal success when a referenced tool child was not durably flushed', () => {
    const withTool = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    withTool.upsertToolCall({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, toolIndex: 0, toolCallId: 'call-1', toolType: 'function', functionName: 'lookup', argumentsText: '{}', argumentsObserved: true, argumentsJson: '{}', status: 'complete', diagnosticCode: null, executionState: 'not_executed', sequenceStart: 1, sequenceEnd: 1 })
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [withTool.terminate('completed'), projection(1, 'completed')] })).toThrow(/tool_checkpoint_set_mismatch/)
    expect(db.prepare(`SELECT state FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(routeProvenanceId)).toEqual({ state: 'streaming' })
  })

  it('refuses terminal success when the projection omits a persisted child row', () => {
    db.prepare(`
      INSERT INTO compatible_tool_calls (route_provenance_id, message_id, choice_index, tool_index, tool_call_id, tool_type, function_name, arguments_text, arguments_observed, arguments_json, status, parse_error_code, execution_state, sequence_start, sequence_end, created_at_ms, updated_at_ms)
      VALUES (?, 'a1', 0, 0, 'call-hidden', 'function', 'lookup', '{}', 1, '{}', 'complete', NULL, 'not_executed', 1, 1, 2, 3)
    `).run(routeProvenanceId)
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [projection(0, 'completed'), projection(1, 'completed')] })).toThrow(/tool_checkpoint_set_mismatch/)
  })

  it('refuses terminal success when reasoning or raw-extension child rows are missing', () => {
    const withReasoning = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    withReasoning.upsertReasoning({
      blockId: 'reasoning-1', segmentId: 'segment-1', text: 'why', sequenceStart: 1, sequenceEnd: 1,
      state: { context: { routeProvenanceId, messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [] }, choiceIndex: 0, mode: 'custom_only', status: 'terminal', lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think', value: 'why', selectedSegmentIds: ['segment-1'], conflicts: [] },
    })
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [withReasoning.terminate('completed'), projection(1, 'completed')] })).toThrow(/reasoning_checkpoint_missing/)

    const withRaw = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    withRaw.setRawExtensionRecordIds(['ocp_raw_extension_12345678'])
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 5, choices: [withRaw.terminate('completed'), projection(1, 'completed')] })).toThrow(/raw_checkpoint_set_mismatch/)
  })

  it('preserves coherent failed and interrupted partial transcripts', () => {
    const failedAssembler = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    failedAssembler.appendContent('partial', 1)
    const failed = failedAssembler.terminate('failed', { network: { code: 'compatible_timeout', stage: 'stream', safeMessage: 'The provider request timed out.', retryable: true }, diagnostic: { category: 'lifecycle' } })
    const completed = projection(1, 'completed')
    repo.finalizeRoute({ routeProvenanceId, status: 'failed', atMs: 5, choices: [failed, completed] })
    expect(repo.loadChoice(routeProvenanceId, 0)).toMatchObject({ status: 'failed', blocks: [expect.objectContaining({ text: 'partial' })], error: { network: { code: 'compatible_timeout' } } })
    expect(db.prepare(`SELECT id, status FROM message WHERE id IN ('a1','a2') ORDER BY id`).all()).toEqual([{ id: 'a1', status: 'error' }, { id: 'a2', status: 'final' }])
  })

  it('round-trips a complete content, reasoning, tool/result, usage and raw terminal projection', () => {
    const value = new CompatibleDisplayAssembler({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    value.appendContent('answer', 1)
    value.upsertReasoning({
      blockId: 'reasoning-1', segmentId: 'segment-1', text: 'why', sequenceStart: 2, sequenceEnd: 2,
      state: { context: { routeProvenanceId, messageId: 'a1', providerInstanceId: 'ocp_provider_12345678', responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1, allowedMappings: [] }, choiceIndex: 0, mode: 'custom_only', status: 'terminal', lockedSource: 'inline', lockedSourceKey: 'inline:canonical_think', value: 'why', selectedSegmentIds: ['segment-1'], conflicts: [] },
    })
    value.upsertToolCall({ routeProvenanceId, messageId: 'a1', choiceIndex: 0, toolIndex: 0, toolCallId: 'call-1', toolType: 'function', functionName: 'lookup', argumentsText: '{}', argumentsObserved: true, argumentsJson: '{}', status: 'complete', diagnosticCode: null, executionState: 'not_executed', sequenceStart: 3, sequenceEnd: 3 })
    value.setUsage({ prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }, 'provider_reported', 4)
    value.setRawExtensionRecordIds(['ocp_raw_extension_complete1'])
    value.setToolResultMessageIds(['tool-result-1'])
    value.setFinishReason('tool_calls', 5)

    db.pragma('foreign_keys = OFF')
    db.exec(`
      INSERT INTO compatible_reasoning_mappings (mapping_id, version, mode, schema_version, config_json, created_at_ms)
      VALUES ('ocp_reasoning_mapping_12345678', 1, 'custom_only', 1, '{"schemaVersion":1,"mode":"custom_only","rules":[],"replay":{"format":"assistant_field","field":"reasoning_content","scope":"tool_call_chain_only"}}', 1);
      INSERT INTO message (id, convo_id, role, created_at, seq, status, parent_id) VALUES ('tool-result-1', 'c1', 'tool', 3, 4, 'final', 'a1');
      INSERT INTO message_body (message_id, body) VALUES ('tool-result-1', 'ok');
      INSERT INTO compatible_tool_calls (route_provenance_id, message_id, choice_index, tool_index, tool_call_id, tool_type, function_name, arguments_text, arguments_observed, arguments_json, status, parse_error_code, execution_state, sequence_start, sequence_end, created_at_ms, updated_at_ms)
      VALUES ('${routeProvenanceId}', 'a1', 0, 0, 'call-1', 'function', 'lookup', '{}', 1, '{}', 'complete', NULL, 'not_executed', 3, 3, 2, 4);
      INSERT INTO compatible_tool_results (tool_result_message_id, route_provenance_id, tool_call_id, content_json, created_at_ms)
      VALUES ('tool-result-1', '${routeProvenanceId}', 'call-1', '"ok"', 3);
      INSERT INTO compatible_reasoning_choice_state (route_provenance_id, message_id, choice_index, reasoning_mapping_id, reasoning_mapping_version, mode, status, locked_source, locked_source_key, reasoning_text, segment_ids_json, conflicts_json, updated_at_ms)
      VALUES ('${routeProvenanceId}', 'a1', 0, 'ocp_reasoning_mapping_12345678', 1, 'custom_only', 'terminal', 'inline', 'inline:canonical_think', 'why', '["segment-1"]', '[]', 4);
      INSERT INTO compatible_raw_extension_records (record_id, route_provenance_id, message_id, choice_index, response_profile_id, response_profile_version, source_path, sequence_start, sequence_end, extension_kind, semantic, value_json, value_bytes, redaction_state, created_at_ms)
      VALUES ('ocp_raw_extension_complete1', '${routeProvenanceId}', 'a1', 0, 'ocp_response_profile_12345678', 1, 'vendor.safe', 4, 4, 'snapshot', 'diagnostic', '{"value":"[redacted]"}', 22, 'redacted', 4);
    `)
    db.pragma('foreign_keys = ON')

    const terminal = value.terminate('completed')
    repo.finalizeRoute({ routeProvenanceId, status: 'completed', atMs: 6, choices: [terminal, projection(1, 'completed')] })
    const loaded = repo.loadChoice(routeProvenanceId, 0)!
    const { checkpointVersion: _version, updatedAtMs: _updated, terminalAtMs: _terminal, ...loadedProjection } = loaded
    expect(loadedProjection).toEqual(terminal)
    expect(new CompatibleDiagnosticsRepo(db).purgeExpiredRawExtensionRecords({ beforeMs: 10, limit: 10 })).toEqual({ deleted: 0, recordIds: [] })
    expect(repo.loadChoice(routeProvenanceId, 0)?.rawExtensionRecordIds).toEqual(['ocp_raw_extension_complete1'])
    const bundle = repo.loadBundle(routeProvenanceId)!
    expect(projectCompatiblePersistedHistory(bundle)[0]?.assistantField).toEqual({ name: 'reasoning_content', value: 'why' })
  })

  it.each([
    ['eof_without_done', 'interrupted'],
    ['aborted', 'aborted'],
  ] as const)('round-trips real wire %s projector output through SQLite reload', (outcome, routeStatus) => {
    const projector = new CompatibleTurnProjector({ routeProvenanceId, choices: [{ choiceIndex: 0, messageId: 'a1' }, { choiceIndex: 1, messageId: 'a2' }], reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1, reasoningMode: 'custom_only' })
    projector.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence: 1, choiceIndex: 0, content: 'partial' })
    projector.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 2, choiceIndex: 0, finishReason: null })
    projector.applyWireEvent({ kind: 'choice_finish', source: 'stream', sequence: 3, choiceIndex: 1, finishReason: null })
    projector.applyWireEvent({ kind: 'usage', source: 'stream', sequence: 4, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    const terminal = projector.applyWireEvent({ kind: 'terminal', source: 'stream', sequence: 5, outcome })
    repo.finalizeRoute({ routeProvenanceId, status: routeStatus, atMs: 6, choices: terminal })
    const reloaded = repo.loadRoute(routeProvenanceId).map(({ checkpointVersion: _version, updatedAtMs: _updated, terminalAtMs: _terminal, ...choice }) => choice)
    expect(reloaded).toEqual(terminal)
  })

  it('recovers a complete set of streaming checkpoints as an explicit interrupted terminal', () => {
    repo.saveStreaming(projection(0), 3)
    repo.saveStreaming(projection(1), 3)
    expect(repo.recoverIncomplete(6)).toEqual([routeProvenanceId])
    expect(repo.loadRoute(routeProvenanceId).map((choice) => [choice.status, choice.terminalAtMs])).toEqual([['interrupted', 6], ['interrupted', 6]])
    expect(db.prepare(`SELECT state FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(routeProvenanceId)).toEqual({ state: 'interrupted' })
  })

  it('recovers partial-choice checkpoint drift without leaving streaming projection rows', () => {
    repo.saveStreaming(projection(0), 3)
    expect(repo.recoverIncomplete(6)).toEqual([routeProvenanceId])
    expect(repo.loadRoute(routeProvenanceId)).toMatchObject([
      { choiceIndex: 0, status: 'interrupted', terminalCause: 'recovered_after_crash', checkpointCompleteness: 'recovered_incomplete', blocks: [expect.objectContaining({ text: 'choice-0' })] },
      { choiceIndex: 1, status: 'interrupted', terminalCause: 'recovered_after_crash', checkpointCompleteness: 'recovered_incomplete', blocks: [] },
    ])
  })

  it('creates explicit empty interrupted projections after a zero-checkpoint crash', () => {
    expect(repo.recoverIncomplete(6)).toEqual([routeProvenanceId])
    expect(repo.loadRoute(routeProvenanceId)).toMatchObject([
      { choiceIndex: 0, status: 'interrupted', checkpointCompleteness: 'recovered_incomplete', blocks: [] },
      { choiceIndex: 1, status: 'interrupted', checkpointCompleteness: 'recovered_incomplete', blocks: [] },
    ])
  })

  it('rejects renderer-facing recovery-shaped terminal projections', () => {
    const recovered = { ...projection(0), status: 'interrupted' as const, terminalCause: 'recovered_after_crash' as const, checkpointCompleteness: 'recovered_incomplete' as const }
    expect(() => repo.finalizeRoute({ routeProvenanceId, status: 'interrupted', atMs: 6, choices: [recovered, { ...projection(1), status: 'interrupted', terminalCause: 'recovered_after_crash', checkpointCompleteness: 'recovered_incomplete' }] })).toThrow(/worker_only/)
  })
})
