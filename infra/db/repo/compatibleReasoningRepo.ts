import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import { compatibleChoiceIndexSchema, compatibleMessageIdSchema, compatibleProfileVersionSchema, parseCompatibleExtensionPath, reasoningMappingIdSchema, routeProvenanceIdSchema } from '../../../src/shared/provider/openai-chat-compatible'
import type { CompatibleReasoningChoiceState, CompatibleReasoningConflict } from '../../../src/shared/provider/openai-chat-compatible/reasoning'

const conflictSchema = z.object({
  kind: z.enum(['multiple_sources_in_same_event', 'duplicate_equivalent_source', 'different_value_source', 'late_higher_priority_source', 'late_lower_priority_source', 'final_source_mismatch', 'custom_and_builtin_overlap', 'structured_and_inline_overlap']),
  source: z.enum(['custom', 'reasoning', 'reasoning_content', 'thinking', 'inline']),
  sequence: z.number().int().nonnegative(),
}).strict()

export const SaveCompatibleReasoningChoiceInputSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  messageId: compatibleMessageIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  reasoningMappingId: reasoningMappingIdSchema,
  reasoningMappingVersion: compatibleProfileVersionSchema,
  mode: z.enum(['custom_preferred_with_builtin_fallback', 'custom_only']),
  status: z.enum(['unselected', 'locked', 'terminal']),
  lockedSource: z.enum(['custom', 'reasoning', 'reasoning_content', 'thinking', 'inline']).nullable(),
  lockedSourceKey: z.string().min(1).max(1280).nullable(),
  reasoningText: z.string().max(1_048_576).refine((value) => new TextEncoder().encode(value).byteLength <= 1024 * 1024, 'Reasoning text exceeds UTF-8 byte limit.'),
  selectedSegmentIds: z.array(z.string().min(1).max(512)).max(4096),
  conflicts: z.array(conflictSchema).max(64),
  updatedAtMs: z.number().int().nonnegative(),
}).strict()

export type SaveCompatibleReasoningChoiceInput = z.input<typeof SaveCompatibleReasoningChoiceInputSchema>
export type CompatiblePersistedReasoningChoice = Omit<CompatibleReasoningChoiceState, 'context' | 'value'> & Readonly<{
  routeProvenanceId: string
  messageId: string
  reasoningMappingId: string
  reasoningMappingVersion: number
  reasoningText: string
  updatedAtMs: number
}>

export class CompatibleReasoningRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  save(input: SaveCompatibleReasoningChoiceInput): CompatiblePersistedReasoningChoice {
    const value = SaveCompatibleReasoningChoiceInputSchema.parse(input)
    const existing = this.get(value.routeProvenanceId, value.choiceIndex)
    if (existing?.status === 'terminal') {
      const equivalent = existing.messageId === value.messageId && existing.reasoningMappingId === value.reasoningMappingId && existing.reasoningMappingVersion === value.reasoningMappingVersion && existing.mode === value.mode && existing.lockedSource === value.lockedSource && existing.lockedSourceKey === value.lockedSourceKey && existing.reasoningText === value.reasoningText && JSON.stringify(existing.selectedSegmentIds) === JSON.stringify(value.selectedSegmentIds) && existing.updatedAtMs === value.updatedAtMs && JSON.stringify(existing.conflicts) === JSON.stringify(value.conflicts)
      if (!equivalent) throw new Error('Terminal reasoning choice state is immutable.')
      return existing
    }
    const route = this.db.prepare(`SELECT reasoning_mapping_id, reasoning_mapping_version, reasoning_mode FROM compatible_route_provenance WHERE route_provenance_id = ?`).get(value.routeProvenanceId) as { reasoning_mapping_id: string; reasoning_mapping_version: number; reasoning_mode: string } | undefined
    if (!route || route.reasoning_mapping_id !== value.reasoningMappingId || route.reasoning_mapping_version !== value.reasoningMappingVersion || route.reasoning_mode !== value.mode) throw new Error('Reasoning choice must match immutable route mapping pin.')
    const expectedPrefix = `custom:${value.reasoningMappingId}:${value.reasoningMappingVersion}:`
    if (value.lockedSource === 'custom') {
      if (!value.lockedSourceKey?.startsWith(expectedPrefix)) throw new Error('Reasoning locked source key does not match its route mapping pin.')
      try { parseCompatibleExtensionPath(value.lockedSourceKey.slice(expectedPrefix.length)) } catch { throw new Error('Reasoning locked source key has an invalid source path.') }
    } else if (value.lockedSource === 'inline') {
      if (!value.lockedSourceKey?.startsWith('inline:') || value.lockedSourceKey.length <= 'inline:'.length) throw new Error('Reasoning locked source key does not match inline tag identity.')
    } else if (value.lockedSource !== null && value.lockedSourceKey !== value.lockedSource) throw new Error('Reasoning locked source key does not match its route mapping pin.')
    this.db.prepare(`
      INSERT INTO compatible_reasoning_choice_state (
        route_provenance_id, message_id, choice_index, reasoning_mapping_id, reasoning_mapping_version,
        mode, status, locked_source, locked_source_key, reasoning_text, segment_ids_json, conflicts_json, updated_at_ms
      ) VALUES (@routeProvenanceId, @messageId, @choiceIndex, @reasoningMappingId, @reasoningMappingVersion,
        @mode, @status, @lockedSource, @lockedSourceKey, @reasoningText, @segmentIdsJson, @conflictsJson, @updatedAtMs)
      ON CONFLICT(route_provenance_id, choice_index) DO UPDATE SET
        status = excluded.status, locked_source = excluded.locked_source, locked_source_key = excluded.locked_source_key, reasoning_text = excluded.reasoning_text, segment_ids_json = excluded.segment_ids_json,
        conflicts_json = excluded.conflicts_json, updated_at_ms = excluded.updated_at_ms
    `).run({ ...value, segmentIdsJson: JSON.stringify(value.selectedSegmentIds), conflictsJson: JSON.stringify(value.conflicts) })
    return this.get(value.routeProvenanceId, value.choiceIndex)!
  }

  get(routeProvenanceId: unknown, choiceIndex: unknown): CompatiblePersistedReasoningChoice | null {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const index = compatibleChoiceIndexSchema.parse(choiceIndex)
    const row = this.db.prepare(`SELECT * FROM compatible_reasoning_choice_state WHERE route_provenance_id = ? AND choice_index = ?`).get(routeId, index) as Record<string, unknown> | undefined
    if (!row) return null
    return Object.freeze({
      routeProvenanceId: String(row.route_provenance_id), messageId: String(row.message_id), choiceIndex: Number(row.choice_index),
      reasoningMappingId: String(row.reasoning_mapping_id), reasoningMappingVersion: Number(row.reasoning_mapping_version),
      mode: row.mode as CompatiblePersistedReasoningChoice['mode'], status: row.status as CompatiblePersistedReasoningChoice['status'],
      lockedSource: row.locked_source as CompatiblePersistedReasoningChoice['lockedSource'], reasoningText: String(row.reasoning_text),
      lockedSourceKey: row.locked_source_key as CompatiblePersistedReasoningChoice['lockedSourceKey'],
      selectedSegmentIds: Object.freeze(z.array(z.string()).max(4096).parse(JSON.parse(String(row.segment_ids_json)))),
      conflicts: Object.freeze(z.array(conflictSchema).max(64).parse(JSON.parse(String(row.conflicts_json))) as CompatibleReasoningConflict[]), updatedAtMs: Number(row.updated_at_ms),
    })
  }
}
