import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import { compatibleDurableChoiceProjectionSchema, type CompatibleDurableChoiceProjection } from '../../../src/shared/provider/openai-chat-compatible/display'
import { routeProvenanceIdSchema } from '../../../src/shared/provider/openai-chat-compatible'
import { CompatibleRouteRepo } from './compatibleRouteRepo'
import { CompatibleProfileRepo } from './compatibleProfileRepo'
import { CompatibleToolRepo } from './compatibleToolRepo'

const timestampSchema = z.number().int().nonnegative()
const terminalRouteStatusSchema = z.enum(['completed', 'failed', 'aborted', 'interrupted'])

export type CompatiblePersistedChoiceProjection = CompatibleDurableChoiceProjection & Readonly<{ checkpointVersion: 1; updatedAtMs: number; terminalAtMs: number | null }>

export class CompatibleTurnProjectionRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  saveStreaming(input: unknown, updatedAtMs: unknown): CompatiblePersistedChoiceProjection {
    const projection = compatibleDurableChoiceProjectionSchema.parse(input)
    const atMs = timestampSchema.parse(updatedAtMs)
    if (projection.status !== 'streaming') throw new Error('compatible_projection_streaming_required')
    this.#assertRoutePins(projection, true)
    return this.#save(projection, atMs, null)
  }

  finalizeRoute(input: Readonly<{ routeProvenanceId: unknown; status: unknown; atMs: unknown; choices: readonly unknown[] }>): readonly CompatiblePersistedChoiceProjection[] {
    return this.#finalizeRoute(input, false)
  }

  #finalizeRoute(input: Readonly<{ routeProvenanceId: unknown; status: unknown; atMs: unknown; choices: readonly unknown[] }>, allowRecoveredIncomplete: boolean): readonly CompatiblePersistedChoiceProjection[] {
    const routeProvenanceId = routeProvenanceIdSchema.parse(input.routeProvenanceId)
    const status = terminalRouteStatusSchema.parse(input.status)
    const atMs = timestampSchema.parse(input.atMs)
    const choices = input.choices.map((choice) => compatibleDurableChoiceProjectionSchema.parse(choice))
    if (!allowRecoveredIncomplete && choices.some((choice) => choice.checkpointCompleteness === 'recovered_incomplete')) throw new Error('compatible_projection_recovery_worker_only')
    if (choices.some((choice) => choice.routeProvenanceId !== routeProvenanceId || choice.status === 'streaming')) throw new Error('compatible_projection_terminal_identity_invalid')
    if (status === 'completed' && choices.some((choice) => choice.status !== 'completed')) throw new Error('compatible_projection_terminal_status_invalid')
    if ((status === 'aborted' || status === 'interrupted') && choices.some((choice) => choice.status !== status)) throw new Error('compatible_projection_terminal_status_invalid')
    if (status === 'failed' && (!choices.some((choice) => choice.status === 'failed') || choices.some((choice) => !['completed', 'failed'].includes(choice.status)))) throw new Error('compatible_projection_terminal_status_invalid')
    if (choices.filter((choice) => choice.usage?.scope === 'response').length > 1) throw new Error('compatible_projection_response_usage_duplicate')

    const transaction = this.db.transaction(() => {
      const route = this.db.prepare(`SELECT state, updated_at_ms, terminal_at_ms FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(routeProvenanceId) as { state: string; updated_at_ms: number; terminal_at_ms: number | null } | undefined
      if (!route) throw new Error('compatible_projection_route_missing')
      const expected = this.db.prepare(`SELECT choice_index, message_id FROM compatible_route_choices WHERE route_provenance_id = ? ORDER BY choice_index`).all(routeProvenanceId) as Array<{ choice_index: number; message_id: string }>
      const actual = [...choices].sort((left, right) => left.choiceIndex - right.choiceIndex)
      if (expected.length !== actual.length || expected.some((row, index) => row.choice_index !== actual[index]?.choiceIndex || row.message_id !== actual[index]?.messageId)) throw new Error('compatible_projection_choice_set_incomplete')
      if (atMs < route.updated_at_ms) throw new Error('compatible_projection_time_invalid')

      for (const choice of actual) {
        this.#assertRoutePins(choice, false)
        this.#assertTerminalChildren(choice)
      }
      const stored = actual.map((choice) => this.#save(choice, atMs, atMs))
      if (route.terminal_at_ms === null) {
        const allowed = route.state === 'streaming' || ((status === 'aborted' || status === 'interrupted') && route.state === 'prepared')
        if (!allowed) throw new Error('compatible_projection_route_state_invalid')
        this.db.prepare(`UPDATE compatible_route_provenance SET state = ?, updated_at_ms = ?, terminal_at_ms = ? WHERE route_provenance_id = ?`).run(status, atMs, atMs, routeProvenanceId)
        const updateMessage = this.db.prepare(`UPDATE message SET status = ? WHERE id = ?`)
        for (const choice of actual) updateMessage.run(choice.status === 'completed' ? 'final' : 'error', choice.messageId)
      } else if (route.state !== status || route.updated_at_ms !== atMs) {
        throw new Error('compatible_projection_terminal_conflict')
      }
      return Object.freeze(stored)
    })
    return transaction()
  }

  loadChoice(routeProvenanceId: unknown, choiceIndex: unknown): CompatiblePersistedChoiceProjection | null {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const index = z.number().int().nonnegative().max(1024).parse(choiceIndex)
    const row = this.db.prepare(`SELECT * FROM compatible_choice_display_projections WHERE route_provenance_id = ? AND choice_index = ?`).get(routeId, index) as Record<string, unknown> | undefined
    return row ? this.#decode(row) : null
  }

  loadRoute(routeProvenanceId: unknown): readonly CompatiblePersistedChoiceProjection[] {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const rows = this.db.prepare(`SELECT * FROM compatible_choice_display_projections WHERE route_provenance_id = ? ORDER BY choice_index`).all(routeId) as Array<Record<string, unknown>>
    return Object.freeze(rows.map((row) => this.#decode(row)))
  }

  loadBundle(routeProvenanceId: unknown) {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const route = new CompatibleRouteRepo(this.db).getRoute(routeId)
    if (!route) return null
    const reasoningMapping = new CompatibleProfileRepo(this.db).getReasoningMapping(route.reasoningMappingId, route.reasoningMappingVersion)
    const toolRepo = new CompatibleToolRepo(this.db)
    const toolChains = new CompatibleRouteRepo(this.db).listChoices(routeId).map((choice) => Object.freeze({ choiceIndex: choice.choiceIndex, ...toolRepo.loadChoiceChain(routeId, choice.choiceIndex) }))
    return Object.freeze({ route, reasoningMapping, choices: this.loadRoute(routeId), toolChains: Object.freeze(toolChains) })
  }

  recoverIncomplete(atMs: unknown): readonly string[] {
    const timestamp = timestampSchema.parse(atMs)
    const routeIds = this.db.prepare(`
      SELECT route.route_provenance_id, route.reasoning_mapping_id, route.reasoning_mapping_version, route.reasoning_mode
      FROM compatible_route_provenance route
      WHERE route.state IN ('prepared', 'streaming')
        AND (SELECT count(*) FROM compatible_route_choices choice_record WHERE choice_record.route_provenance_id = route.route_provenance_id) > 0
      ORDER BY route.route_provenance_id
    `).all() as Array<{ route_provenance_id: string; reasoning_mapping_id: string; reasoning_mapping_version: number; reasoning_mode: 'custom_preferred_with_builtin_fallback' | 'custom_only' }>
    for (const row of routeIds) {
      const existing = new Map(this.loadRoute(row.route_provenance_id).map((choice) => [choice.choiceIndex, choice]))
      const choiceRows = this.db.prepare(`SELECT choice_index, message_id FROM compatible_route_choices WHERE route_provenance_id = ? ORDER BY choice_index`).all(row.route_provenance_id) as Array<{ choice_index: number; message_id: string }>
      const choices = choiceRows.map((choice) => {
        const current = existing.get(choice.choice_index)
        const base = current ? stripPersistence(current) : {
          routeProvenanceId: row.route_provenance_id, messageId: choice.message_id, choiceIndex: choice.choice_index,
          status: 'streaming' as const, terminalCause: 'none' as const, checkpointCompleteness: 'complete' as const, lastSequence: 0, blocks: [],
          reasoning: { mappingId: row.reasoning_mapping_id, mappingVersion: row.reasoning_mapping_version, mode: row.reasoning_mode, lockedSource: null, lockedSourceKey: null, selectedSegmentIds: [], conflicts: [] },
          finishReason: null, usage: null, error: null, rawExtensionRecordIds: [], toolResultMessageIds: [],
        }
        return compatibleDurableChoiceProjectionSchema.parse({ ...base, status: 'interrupted', terminalCause: 'recovered_after_crash', checkpointCompleteness: 'recovered_incomplete', error: null })
      })
      this.#finalizeRoute({ routeProvenanceId: row.route_provenance_id, status: 'interrupted', atMs: timestamp, choices }, true)
    }
    return Object.freeze(routeIds.map((row) => row.route_provenance_id))
  }

  #save(projection: CompatibleDurableChoiceProjection, updatedAtMs: number, terminalAtMs: number | null): CompatiblePersistedChoiceProjection {
    const existing = this.loadChoice(projection.routeProvenanceId, projection.choiceIndex)
    const projectionJson = JSON.stringify(projection)
    if (new TextEncoder().encode(projectionJson).byteLength > 32 * 1024 * 1024) throw new Error('compatible_projection_overflow')
    if (existing?.status !== 'streaming') {
      if (existing && JSON.stringify(stripPersistence(existing)) === projectionJson && existing.updatedAtMs === updatedAtMs && existing.terminalAtMs === terminalAtMs) return existing
      if (existing) throw new Error('compatible_projection_terminal_immutable')
    }
    if (existing && projection.lastSequence < existing.lastSequence) throw new Error('compatible_projection_sequence_rollback')
    if (existing && projection.status === 'streaming' && projection.lastSequence === existing.lastSequence && JSON.stringify(stripPersistence(existing)) !== projectionJson) throw new Error('compatible_projection_same_sequence_conflict')
    this.db.prepare(`
      INSERT INTO compatible_choice_display_projections (route_provenance_id, message_id, choice_index, checkpoint_version, status, last_sequence, projection_json, updated_at_ms, terminal_at_ms)
      VALUES (@routeProvenanceId, @messageId, @choiceIndex, 1, @status, @lastSequence, @projectionJson, @updatedAtMs, @terminalAtMs)
      ON CONFLICT(route_provenance_id, choice_index) DO UPDATE SET
        status = excluded.status, last_sequence = excluded.last_sequence, projection_json = excluded.projection_json,
        updated_at_ms = excluded.updated_at_ms, terminal_at_ms = excluded.terminal_at_ms
    `).run({ ...projection, projectionJson, updatedAtMs, terminalAtMs })
    return this.loadChoice(projection.routeProvenanceId, projection.choiceIndex)!
  }

  #assertRoutePins(projection: CompatibleDurableChoiceProjection, requireStreaming: boolean): void {
    const row = this.db.prepare(`
      SELECT route.reasoning_mapping_id, route.reasoning_mapping_version, route.reasoning_mode, route.state
      FROM compatible_route_provenance route
      JOIN compatible_route_choices choice_record ON choice_record.route_provenance_id = route.route_provenance_id
      WHERE route.route_provenance_id = ? AND choice_record.choice_index = ? AND choice_record.message_id = ?
    `).get(projection.routeProvenanceId, projection.choiceIndex, projection.messageId) as { reasoning_mapping_id: string; reasoning_mapping_version: number; reasoning_mode: string; state: string } | undefined
    if (!row || row.reasoning_mapping_id !== projection.reasoning.mappingId || row.reasoning_mapping_version !== projection.reasoning.mappingVersion || row.reasoning_mode !== projection.reasoning.mode || (requireStreaming && row.state !== 'streaming')) throw new Error('compatible_projection_route_pin_mismatch')
  }

  #decode(row: Record<string, unknown>): CompatiblePersistedChoiceProjection {
    const projection = compatibleDurableChoiceProjectionSchema.parse(JSON.parse(String(row.projection_json)))
    if (projection.routeProvenanceId !== row.route_provenance_id || projection.messageId !== row.message_id || projection.choiceIndex !== row.choice_index || projection.status !== row.status || projection.lastSequence !== row.last_sequence) throw new Error('compatible_projection_row_mismatch')
    return Object.freeze({ ...projection, checkpointVersion: 1, updatedAtMs: Number(row.updated_at_ms), terminalAtMs: row.terminal_at_ms === null ? null : Number(row.terminal_at_ms) })
  }

  #assertTerminalChildren(projection: CompatibleDurableChoiceProjection): void {
    if (projection.checkpointCompleteness === 'recovered_incomplete') return
    const persistedToolIndexes = (this.db.prepare(`SELECT tool_index FROM compatible_tool_calls WHERE route_provenance_id = ? AND message_id = ? AND choice_index = ? ORDER BY tool_index`).all(projection.routeProvenanceId, projection.messageId, projection.choiceIndex) as Array<{ tool_index: number }>).map((row) => row.tool_index)
    const projectedToolIndexes = projection.blocks.filter((block) => block.kind === 'tool_call').map((block) => block.toolIndex).sort((left, right) => left - right)
    if (JSON.stringify(persistedToolIndexes) !== JSON.stringify(projectedToolIndexes)) throw new Error('compatible_projection_tool_checkpoint_set_mismatch')
    for (const block of projection.blocks) {
      if (block.kind !== 'tool_call') continue
      const row = this.db.prepare(`SELECT tool_call_id, function_name, arguments_text, status, parse_error_code, sequence_start, sequence_end FROM compatible_tool_calls WHERE route_provenance_id = ? AND message_id = ? AND choice_index = ? AND tool_index = ?`).get(projection.routeProvenanceId, projection.messageId, projection.choiceIndex, block.toolIndex) as Record<string, unknown> | undefined
      if (!row || row.tool_call_id !== block.toolCallId || row.function_name !== block.functionName || row.arguments_text !== block.argumentsText || row.status !== block.status || row.parse_error_code !== block.parseErrorCode || row.sequence_start !== block.sequenceStart || row.sequence_end !== block.sequenceEnd) throw new Error('compatible_projection_tool_checkpoint_missing')
    }
    const reasoningRow = this.db.prepare(`SELECT reasoning_mapping_id, reasoning_mapping_version, mode, status, locked_source, locked_source_key, reasoning_text, segment_ids_json, conflicts_json FROM compatible_reasoning_choice_state WHERE route_provenance_id = ? AND message_id = ? AND choice_index = ?`).get(projection.routeProvenanceId, projection.messageId, projection.choiceIndex) as Record<string, unknown> | undefined
    if (projection.reasoning.lockedSource) {
      const row = reasoningRow
      const reasoningText = projection.blocks.filter((block) => block.kind === 'reasoning').map((block) => block.text).join('')
      if (!row || row.reasoning_mapping_id !== projection.reasoning.mappingId || row.reasoning_mapping_version !== projection.reasoning.mappingVersion || row.mode !== projection.reasoning.mode || row.status !== 'terminal' || row.locked_source !== projection.reasoning.lockedSource || row.locked_source_key !== projection.reasoning.lockedSourceKey || row.reasoning_text !== reasoningText || row.segment_ids_json !== JSON.stringify(projection.reasoning.selectedSegmentIds) || row.conflicts_json !== JSON.stringify(projection.reasoning.conflicts)) throw new Error('compatible_projection_reasoning_checkpoint_missing')
    } else if (reasoningRow) throw new Error('compatible_projection_reasoning_checkpoint_set_mismatch')
    const persistedRawIds = (this.db.prepare(`SELECT record_id FROM compatible_raw_extension_records WHERE route_provenance_id = ? AND message_id = ? AND choice_index = ? ORDER BY record_id`).all(projection.routeProvenanceId, projection.messageId, projection.choiceIndex) as Array<{ record_id: string }>).map((row) => row.record_id)
    const projectedRawIds = [...projection.rawExtensionRecordIds].sort()
    if (JSON.stringify(persistedRawIds) !== JSON.stringify(projectedRawIds)) throw new Error('compatible_projection_raw_checkpoint_set_mismatch')
    for (const recordId of projection.rawExtensionRecordIds) {
      const row = this.db.prepare(`SELECT 1 FROM compatible_raw_extension_records WHERE record_id = ? AND route_provenance_id = ? AND message_id = ? AND choice_index = ?`).get(recordId, projection.routeProvenanceId, projection.messageId, projection.choiceIndex)
      if (!row) throw new Error('compatible_projection_raw_checkpoint_missing')
    }
    const persistedToolResultIds = (this.db.prepare(`
      SELECT result.tool_result_message_id
      FROM compatible_tool_results result
      JOIN compatible_tool_calls call ON call.route_provenance_id = result.route_provenance_id AND call.tool_call_id = result.tool_call_id
      WHERE result.route_provenance_id = ? AND call.message_id = ? AND call.choice_index = ?
      ORDER BY result.tool_result_message_id
    `).all(projection.routeProvenanceId, projection.messageId, projection.choiceIndex) as Array<{ tool_result_message_id: string }>).map((row) => row.tool_result_message_id)
    if (JSON.stringify(persistedToolResultIds) !== JSON.stringify([...projection.toolResultMessageIds].sort())) throw new Error('compatible_projection_tool_result_checkpoint_set_mismatch')
  }
}

function stripPersistence(value: CompatiblePersistedChoiceProjection): CompatibleDurableChoiceProjection {
  const { checkpointVersion: _checkpointVersion, updatedAtMs: _updatedAtMs, terminalAtMs: _terminalAtMs, ...projection } = value
  return projection
}
