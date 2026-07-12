import type BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import {
  compatibleBoundedJsonValueSchema,
  compatibleChoiceIndexSchema,
  compatibleMessageIdSchema,
  routeProvenanceIdSchema,
  type CompatibleToolCall,
  type CompatibleToolResult,
} from '../../../src/shared/provider/openai-chat-compatible'

const timestampSchema = z.number().int().nonnegative()
const sequenceSchema = z.number().int().nonnegative()
const toolIndexSchema = z.number().int().nonnegative().max(1024)
const diagnosticCodeSchema = z.enum([
  'tool_sequence_conflict',
  'tool_sequence_out_of_order',
  'tool_fragment_after_final',
  'tool_type_conflict',
  'tool_id_overflow',
  'tool_id_duplicate',
  'tool_name_overflow',
  'tool_arguments_overflow',
  'tool_finish_reason_mismatch',
  'tool_id_missing',
  'tool_type_missing',
  'tool_name_missing',
  'tool_arguments_missing',
  'tool_arguments_malformed',
  'tool_arguments_not_object',
])

export const SaveCompatibleToolCallInputSchema = z.object({
  routeProvenanceId: routeProvenanceIdSchema,
  messageId: compatibleMessageIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  toolIndex: toolIndexSchema,
  toolCallId: z.string().min(1).max(256).nullable(),
  toolType: z.literal('function').nullable(),
  functionName: z.string().min(1).max(256).nullable(),
  argumentsText: z.string().max(1024 * 1024),
  argumentsObserved: z.boolean(),
  argumentsJson: z.string().max(1024 * 1024).nullable(),
  status: z.enum(['streaming', 'complete', 'malformed', 'incomplete']),
  parseErrorCode: diagnosticCodeSchema.nullable(),
  executionState: z.literal('not_executed'),
  sequenceStart: sequenceSchema,
  sequenceEnd: sequenceSchema,
  createdAtMs: timestampSchema,
  updatedAtMs: timestampSchema,
}).strict().superRefine((value, ctx) => {
  if (Buffer.byteLength(value.argumentsText, 'utf8') > 1024 * 1024) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsText'], message: 'Raw tool arguments exceed the byte limit.' })
  if (value.argumentsJson !== null && Buffer.byteLength(value.argumentsJson, 'utf8') > 1024 * 1024) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsJson'], message: 'Parsed tool arguments exceed the byte limit.' })
  if (value.sequenceEnd < value.sequenceStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sequenceEnd'], message: 'Tool sequence range is invalid.' })
  if (value.updatedAtMs < value.createdAtMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['updatedAtMs'], message: 'Tool update time precedes creation.' })
  let parsedArguments: unknown
  let parsedRawArguments: unknown
  if (value.argumentsJson !== null) {
    try { parsedArguments = JSON.parse(value.argumentsJson) } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsJson'], message: 'Parsed tool arguments must be valid JSON.' })
    }
  }
  if (value.status === 'complete') {
    try { parsedRawArguments = JSON.parse(value.argumentsText) } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsText'], message: 'Complete raw tool arguments must be valid JSON.' })
    }
  }
  if (value.status === 'complete') {
    if (!value.toolCallId || value.toolType !== 'function' || !value.functionName || !value.argumentsObserved || value.argumentsJson === null || value.parseErrorCode !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Complete tool calls require full valid identity and arguments.' })
    }
    if (!parsedArguments || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsJson'], message: 'Complete tool arguments must be a JSON object.' })
    }
    if (!parsedRawArguments || typeof parsedRawArguments !== 'object' || Array.isArray(parsedRawArguments) || value.argumentsJson !== value.argumentsText) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsText'], message: 'Raw and parsed tool arguments must represent the same exact validated payload.' })
    }
    if (parsedRawArguments && !isBoundedParsedJson(parsedRawArguments)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['argumentsText'], message: 'Complete tool arguments exceed structural limits.' })
    }
  } else if (value.status === 'streaming') {
    if (value.argumentsJson !== null || value.parseErrorCode !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Streaming calls cannot have final parse state.' })
  } else if (value.argumentsJson !== null || value.parseErrorCode === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'Terminal invalid calls require one diagnostic and no parsed arguments.' })
  }
})

export const CreateCompatibleToolResultInputSchema = z.object({
  toolResultMessageId: compatibleMessageIdSchema,
  routeProvenanceId: routeProvenanceIdSchema,
  toolCallId: z.string().min(1).max(256),
  content: compatibleBoundedJsonValueSchema,
  createdAtMs: timestampSchema,
}).strict()

export const CompatibleToolCallKeySchema = z.object({
  messageId: compatibleMessageIdSchema,
  choiceIndex: compatibleChoiceIndexSchema,
  toolIndex: toolIndexSchema,
}).strict()

export type SaveCompatibleToolCallInput = z.input<typeof SaveCompatibleToolCallInputSchema>
export type CreateCompatibleToolResultInput = z.input<typeof CreateCompatibleToolResultInputSchema>

type ToolCallRow = {
  route_provenance_id: string
  message_id: string
  choice_index: number
  tool_index: number
  tool_call_id: string | null
  tool_type: 'function' | null
  function_name: string | null
  arguments_text: string
  arguments_observed: number
  arguments_json: string | null
  status: CompatibleToolCall['status']
  parse_error_code: CompatibleToolCall['parseErrorCode']
  execution_state: 'not_executed'
  sequence_start: number
  sequence_end: number
  created_at_ms: number
  updated_at_ms: number
}

type ToolResultRow = {
  tool_result_message_id: string
  route_provenance_id: string
  tool_call_id: string
  content_json: string
  created_at_ms: number
  message_sequence: number
}

export class CompatibleToolRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  saveCall(input: SaveCompatibleToolCallInput): CompatibleToolCall {
    const value = SaveCompatibleToolCallInputSchema.parse(input)
    const existing = this.getCall(value.messageId, value.choiceIndex, value.toolIndex)
    if (existing) {
      if (value.sequenceEnd === existing.sequenceEnd) {
        const candidate = toComparable(value)
        if (JSON.stringify(candidate) === JSON.stringify(toComparable(existing))) return existing
        const isTerminalization = existing.status === 'streaming' && value.status !== 'streaming' &&
          JSON.stringify(toFragmentComparable(value)) === JSON.stringify(toFragmentComparable(existing))
        if (!isTerminalization) throw new Error('compatible_tool_idempotency_conflict')
      }
      assertMonotonic(existing, value)
    }
    this.db.prepare(`
      INSERT INTO compatible_tool_calls (
        route_provenance_id, message_id, choice_index, tool_index, tool_call_id, tool_type,
        function_name, arguments_text, arguments_observed, arguments_json, status,
        parse_error_code, execution_state, sequence_start, sequence_end, created_at_ms, updated_at_ms
      ) VALUES (
        @routeProvenanceId, @messageId, @choiceIndex, @toolIndex, @toolCallId, @toolType,
        @functionName, @argumentsText, @argumentsObservedInt, @argumentsJson, @status,
        @parseErrorCode, @executionState, @sequenceStart, @sequenceEnd, @createdAtMs, @updatedAtMs
      )
      ON CONFLICT(message_id, choice_index, tool_index) DO UPDATE SET
        tool_call_id = excluded.tool_call_id,
        tool_type = excluded.tool_type,
        function_name = excluded.function_name,
        arguments_text = excluded.arguments_text,
        arguments_observed = excluded.arguments_observed,
        arguments_json = excluded.arguments_json,
        status = excluded.status,
        parse_error_code = excluded.parse_error_code,
        execution_state = excluded.execution_state,
        sequence_end = excluded.sequence_end,
        updated_at_ms = excluded.updated_at_ms
    `).run({ ...value, argumentsObservedInt: value.argumentsObserved ? 1 : 0 })
    return this.getCall(value.messageId, value.choiceIndex, value.toolIndex)!
  }

  saveCalls(inputs: readonly SaveCompatibleToolCallInput[]): readonly CompatibleToolCall[] {
    const values = z.array(SaveCompatibleToolCallInputSchema).min(1).max(256).parse(inputs)
    const transaction = this.db.transaction((items: readonly SaveCompatibleToolCallInput[]) => items.map((item) => this.saveCall(item)))
    return Object.freeze(transaction(values))
  }

  getCall(messageId: unknown, choiceIndex: unknown, toolIndex: unknown): CompatibleToolCall | null {
    const key = CompatibleToolCallKeySchema.parse({ messageId, choiceIndex, toolIndex })
    const row = this.db.prepare(`
      SELECT * FROM compatible_tool_calls WHERE message_id = ? AND choice_index = ? AND tool_index = ?
    `).get(key.messageId, key.choiceIndex, key.toolIndex) as ToolCallRow | undefined
    return row ? mapCall(row) : null
  }

  listCalls(routeProvenanceId: unknown, choiceIndex?: unknown): readonly CompatibleToolCall[] {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const choice = choiceIndex === undefined ? undefined : compatibleChoiceIndexSchema.parse(choiceIndex)
    const rows = (choice === undefined
      ? this.db.prepare('SELECT * FROM compatible_tool_calls WHERE route_provenance_id = ? ORDER BY choice_index, tool_index').all(routeId)
      : this.db.prepare('SELECT * FROM compatible_tool_calls WHERE route_provenance_id = ? AND choice_index = ? ORDER BY tool_index').all(routeId, choice)) as ToolCallRow[]
    return Object.freeze(rows.map(mapCall))
  }

  createResult(input: CreateCompatibleToolResultInput): CompatibleToolResult {
    const value = CreateCompatibleToolResultInputSchema.parse(input)
    const contentJson = JSON.stringify(value.content)
    const binding = this.db.prepare(`
      SELECT tc.status, tc.message_id AS call_message_id,
             call_message.convo_id AS call_conversation_id, call_message.seq AS call_sequence,
             result_message.convo_id AS result_conversation_id, result_message.seq AS result_sequence,
             result_message.role AS result_role, result_body.body AS result_body
      FROM compatible_tool_calls tc
      JOIN message call_message ON call_message.id = tc.message_id
      JOIN message result_message ON result_message.id = @toolResultMessageId
      LEFT JOIN message_body result_body ON result_body.message_id = result_message.id
      WHERE tc.route_provenance_id = @routeProvenanceId AND tc.tool_call_id = @toolCallId
    `).get(value) as {
      status: CompatibleToolCall['status']
      call_message_id: string
      call_conversation_id: string
      call_sequence: number
      result_conversation_id: string
      result_sequence: number
      result_role: string
      result_body: string | null
    } | undefined
    const expectedBody = typeof value.content === 'string' ? value.content : contentJson
    if (!binding || binding.status !== 'complete' || binding.result_role !== 'tool' ||
      binding.call_conversation_id !== binding.result_conversation_id || binding.result_sequence <= binding.call_sequence ||
      binding.result_body !== expectedBody || !isMessageDescendant(this.db, value.toolResultMessageId, binding.call_message_id)) {
      throw new Error('compatible_tool_result_binding_invalid')
    }
    const existing = this.getResult(value.toolResultMessageId)
    if (existing) {
      if (existing.routeProvenanceId !== value.routeProvenanceId || existing.toolCallId !== value.toolCallId || existing.contentJson !== contentJson) {
        throw new Error('compatible_tool_result_idempotency_conflict')
      }
      return existing
    }
    this.db.prepare(`
      INSERT INTO compatible_tool_results (
        tool_result_message_id, route_provenance_id, tool_call_id, content_json, created_at_ms
      ) VALUES (@toolResultMessageId, @routeProvenanceId, @toolCallId, @contentJson, @createdAtMs)
    `).run({ ...value, contentJson })
    return this.getResult(value.toolResultMessageId)!
  }

  getResult(toolResultMessageId: unknown): CompatibleToolResult | null {
    const messageId = compatibleMessageIdSchema.parse(toolResultMessageId)
    const row = this.db.prepare(`
      SELECT r.*, m.seq AS message_sequence
      FROM compatible_tool_results r
      JOIN message m ON m.id = r.tool_result_message_id
      WHERE r.tool_result_message_id = ?
    `).get(messageId) as ToolResultRow | undefined
    return row ? mapResult(row) : null
  }

  listResults(routeProvenanceId: unknown): readonly CompatibleToolResult[] {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const rows = this.db.prepare(`
      SELECT r.*, m.seq AS message_sequence
      FROM compatible_tool_results r
      JOIN message m ON m.id = r.tool_result_message_id
      WHERE r.route_provenance_id = ?
      ORDER BY m.seq, r.tool_result_message_id
    `).all(routeId) as ToolResultRow[]
    return Object.freeze(rows.map(mapResult))
  }

  loadChoiceChain(routeProvenanceId: unknown, choiceIndex: unknown): Readonly<{
    calls: readonly CompatibleToolCall[]
    results: readonly CompatibleToolResult[]
  }> {
    const routeId = routeProvenanceIdSchema.parse(routeProvenanceId)
    const calls = this.listCalls(routeId, choiceIndex)
    const ids = new Set(calls.flatMap((call) => call.toolCallId ? [call.toolCallId] : []))
    const results = this.listResults(routeId).filter((result) => ids.has(result.toolCallId))
    return Object.freeze({ calls, results: Object.freeze(results) })
  }
}

function isBoundedParsedJson(value: unknown): boolean {
  const pending: Array<readonly [unknown, number]> = [[value, 0]]
  let nodes = 0
  while (pending.length > 0) {
    const [candidate, depth] = pending.pop()!
    nodes += 1
    if (nodes > 100_000 || depth > 64) return false
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean' || typeof candidate === 'number') continue
    if (Array.isArray(candidate)) {
      for (const child of candidate) pending.push([child, depth + 1])
      continue
    }
    if (!candidate || typeof candidate !== 'object' || Object.getPrototypeOf(candidate) !== Object.prototype) return false
    for (const child of Object.values(candidate)) pending.push([child, depth + 1])
  }
  return true
}

function isMessageDescendant(db: BetterSqlite3.Database, messageId: string, ancestorId: string): boolean {
  const row = db.prepare(`
    WITH RECURSIVE lineage(id, parent_id, depth) AS (
      SELECT id, parent_id, 0 FROM message WHERE id = @messageId
      UNION ALL
      SELECT parent.id, parent.parent_id, lineage.depth + 1
      FROM message parent
      JOIN lineage ON parent.id = lineage.parent_id
      WHERE lineage.depth < 1024
    )
    SELECT 1 AS found FROM lineage WHERE id = @ancestorId LIMIT 1
  `).get({ messageId, ancestorId }) as { found: number } | undefined
  return row?.found === 1
}

function assertMonotonic(existing: CompatibleToolCall, next: z.output<typeof SaveCompatibleToolCallInputSchema>): void {
  if (existing.routeProvenanceId !== next.routeProvenanceId || existing.messageId !== next.messageId ||
    existing.choiceIndex !== next.choiceIndex || existing.toolIndex !== next.toolIndex || existing.sequenceStart !== next.sequenceStart) {
    throw new Error('compatible_tool_identity_conflict')
  }
  if (next.sequenceEnd < existing.sequenceEnd || next.updatedAtMs < existing.updatedAtMs) throw new Error('compatible_tool_sequence_out_of_order')
  if (existing.status !== 'streaming' && next.sequenceEnd !== existing.sequenceEnd) throw new Error('compatible_tool_terminal_immutable')
  if (existing.toolType && next.toolType !== existing.toolType) throw new Error('compatible_tool_type_conflict')
  if (existing.toolCallId && (!next.toolCallId || !next.toolCallId.startsWith(existing.toolCallId))) throw new Error('compatible_tool_id_conflict')
  if (existing.functionName && (!next.functionName || !next.functionName.startsWith(existing.functionName))) throw new Error('compatible_tool_name_conflict')
  if (!next.argumentsText.startsWith(existing.argumentsText)) throw new Error('compatible_tool_arguments_conflict')
}

function toComparable(value: CompatibleToolCall | z.output<typeof SaveCompatibleToolCallInputSchema>) {
  return {
    routeProvenanceId: value.routeProvenanceId,
    messageId: value.messageId,
    choiceIndex: value.choiceIndex,
    toolIndex: value.toolIndex,
    toolCallId: value.toolCallId,
    toolType: value.toolType,
    functionName: value.functionName,
    argumentsText: value.argumentsText,
    argumentsObserved: value.argumentsObserved,
    argumentsJson: value.argumentsJson,
    status: value.status,
    parseErrorCode: value.parseErrorCode,
    executionState: value.executionState,
    sequenceStart: value.sequenceStart,
    sequenceEnd: value.sequenceEnd,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
  }
}

function toFragmentComparable(value: CompatibleToolCall | z.output<typeof SaveCompatibleToolCallInputSchema>) {
  const comparable = toComparable(value)
  return {
    routeProvenanceId: comparable.routeProvenanceId,
    messageId: comparable.messageId,
    choiceIndex: comparable.choiceIndex,
    toolIndex: comparable.toolIndex,
    toolCallId: comparable.toolCallId,
    toolType: comparable.toolType,
    functionName: comparable.functionName,
    argumentsText: comparable.argumentsText,
    argumentsObserved: comparable.argumentsObserved,
    executionState: comparable.executionState,
    sequenceStart: comparable.sequenceStart,
    sequenceEnd: comparable.sequenceEnd,
    createdAtMs: comparable.createdAtMs,
  }
}

function mapCall(row: ToolCallRow): CompatibleToolCall {
  return Object.freeze({
    routeProvenanceId: routeProvenanceIdSchema.parse(row.route_provenance_id),
    messageId: row.message_id,
    choiceIndex: row.choice_index,
    toolIndex: row.tool_index,
    toolCallId: row.tool_call_id,
    toolType: row.tool_type,
    functionName: row.function_name,
    argumentsText: row.arguments_text,
    argumentsObserved: row.arguments_observed === 1,
    argumentsJson: row.arguments_json,
    status: row.status,
    parseErrorCode: row.parse_error_code,
    executionState: row.execution_state,
    sequenceStart: row.sequence_start,
    sequenceEnd: row.sequence_end,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  })
}

function mapResult(row: ToolResultRow): CompatibleToolResult {
  return Object.freeze({
    toolResultMessageId: row.tool_result_message_id,
    routeProvenanceId: routeProvenanceIdSchema.parse(row.route_provenance_id),
    toolCallId: row.tool_call_id,
    contentJson: row.content_json,
    messageSequence: row.message_sequence,
    createdAtMs: row.created_at_ms,
  })
}
