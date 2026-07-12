import { z } from 'zod'
import type { CompatibleReasoningChoiceState } from '../reasoning'
import type { CompatibleToolAggregate } from '../tools'

const utf8Within = (limit: number) => (value: string): boolean => new TextEncoder().encode(value).byteLength <= limit
const MAX_STREAMABLE_PROJECTION_BYTES = 31 * 1024 * 1024

export const compatibleDisplayBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), blockId: z.string().min(1).max(512), ordinal: z.number().int().nonnegative(), sequenceStart: z.number().int().nonnegative(), sequenceEnd: z.number().int().nonnegative(), text: z.string().refine(utf8Within(16 * 1024 * 1024)) }).strict(),
  z.object({ kind: z.literal('content_parts'), blockId: z.string().min(1).max(512), ordinal: z.number().int().nonnegative(), sequenceStart: z.number().int().nonnegative(), sequenceEnd: z.number().int().nonnegative(), parts: z.array(z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string().refine(utf8Within(16 * 1024 * 1024)) }).strict(),
    z.object({ kind: z.literal('image_url'), url: z.string().url().max(8192), detail: z.enum(['auto', 'low', 'high']).optional() }).strict(),
    z.object({ kind: z.literal('refusal'), text: z.string().refine(utf8Within(1024 * 1024)) }).strict(),
    z.object({ kind: z.literal('opaque'), label: z.literal('unsupported_content_part') }).strict(),
  ])).max(4096).superRefine((parts, context) => { if (new TextEncoder().encode(JSON.stringify(parts)).byteLength > 16 * 1024 * 1024) context.addIssue({ code: 'custom', message: 'Content parts exceed byte limit.' }) }) }).strict(),
  z.object({ kind: z.literal('reasoning'), blockId: z.string().min(1).max(512), ordinal: z.number().int().nonnegative(), sequenceStart: z.number().int().nonnegative(), sequenceEnd: z.number().int().nonnegative(), text: z.string().refine(utf8Within(1024 * 1024)), segmentId: z.string().min(1).max(512) }).strict(),
  z.object({ kind: z.literal('tool_call'), blockId: z.string().min(1).max(512), ordinal: z.number().int().nonnegative(), sequenceStart: z.number().int().nonnegative(), sequenceEnd: z.number().int().nonnegative(), toolIndex: z.number().int().nonnegative().max(1024), toolCallId: z.string().min(1).max(256).nullable(), functionName: z.string().min(1).max(256).nullable(), argumentsText: z.string().refine(utf8Within(1024 * 1024)), status: z.enum(['streaming', 'complete', 'malformed', 'incomplete']), parseErrorCode: z.string().min(1).max(128).nullable() }).strict(),
])

export type CompatibleDisplayBlock = z.infer<typeof compatibleDisplayBlockSchema>
export type CompatibleTerminalOutcome = 'streaming' | 'completed' | 'failed' | 'aborted' | 'interrupted'

const networkErrorSchema = z.object({ code: z.string().startsWith('compatible_'), stage: z.enum(['url', 'dns', 'connect', 'redirect', 'headers', 'request', 'response', 'stream', 'lifecycle']), safeMessage: z.string().min(1).max(512), retryable: z.boolean(), httpStatus: z.number().int().min(100).max(599).optional() }).strict()
const displayErrorSchema = z.object({
  network: networkErrorSchema,
  diagnostic: z.object({ category: z.enum(['framing', 'json', 'shape', 'tool', 'extension', 'http', 'lifecycle']), providerErrorShape: z.enum(['object', 'other', 'none']).optional(), providerCodePresent: z.boolean().optional(), providerTypePresent: z.boolean().optional() }).strict(),
}).strict()
export type CompatibleDisplayErrorEnvelope = z.infer<typeof displayErrorSchema>
const tokenCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const promptTokenDetailsSchema = z.object({ cached_tokens: tokenCountSchema.optional(), audio_tokens: tokenCountSchema.optional() }).strict()
const completionTokenDetailsSchema = z.object({ reasoning_tokens: tokenCountSchema.optional(), audio_tokens: tokenCountSchema.optional(), accepted_prediction_tokens: tokenCountSchema.optional(), rejected_prediction_tokens: tokenCountSchema.optional() }).strict()
const usageValueSchema = z.object({
  prompt_tokens: tokenCountSchema.optional(),
  completion_tokens: tokenCountSchema.optional(),
  total_tokens: tokenCountSchema.optional(),
  prompt_tokens_details: promptTokenDetailsSchema.optional(),
  completion_tokens_details: completionTokenDetailsSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Usage snapshot is not bounded safe JSON.')

export const compatibleDurableChoiceProjectionSchema = z.object({
  routeProvenanceId: z.string().startsWith('ocp_route_').max(106),
  messageId: z.string().min(1).max(256),
  choiceIndex: z.number().int().nonnegative().max(1024),
  status: z.enum(['streaming', 'completed', 'failed', 'aborted', 'interrupted']),
  terminalCause: z.enum(['none', 'done', 'eof_without_done', 'aborted', 'interrupted', 'error', 'recovered_after_crash']),
  checkpointCompleteness: z.enum(['complete', 'recovered_incomplete']),
  lastSequence: z.number().int().nonnegative(),
  blocks: z.array(compatibleDisplayBlockSchema).max(8192),
  reasoning: z.object({ mappingId: z.string().min(1).max(128), mappingVersion: z.number().int().positive(), mode: z.enum(['custom_preferred_with_builtin_fallback', 'custom_only']), lockedSource: z.enum(['custom', 'reasoning', 'reasoning_content', 'thinking', 'inline']).nullable(), lockedSourceKey: z.string().min(1).max(1280).nullable(), selectedSegmentIds: z.array(z.string().min(1).max(512)).max(4096), conflicts: z.array(z.object({ kind: z.string().min(1).max(128), source: z.string().min(1).max(128), sequence: z.number().int().nonnegative() }).strict()).max(64) }).strict(),
  finishReason: z.string().max(256).nullable(),
  usage: z.object({ scope: z.enum(['response', 'choice']), ownerChoiceIndex: z.number().int().nonnegative().max(1024), provenance: z.enum(['provider_reported', 'locally_derived']), value: usageValueSchema }).strict().nullable(),
  error: displayErrorSchema.nullable(),
  rawExtensionRecordIds: z.array(z.string().startsWith('ocp_raw_extension_').max(114)).max(256),
  toolResultMessageIds: z.array(z.string().min(1).max(256)).max(1024),
}).strict().superRefine((value, context) => {
  if (value.blocks.some((block) => block.sequenceEnd < block.sequenceStart || block.sequenceEnd > value.lastSequence)) context.addIssue({ code: 'custom', message: 'Display block sequence range is invalid.' })
  if (value.status === 'failed' && !value.error) context.addIssue({ code: 'custom', message: 'Failed projection requires an error.' })
  if (value.status !== 'failed' && value.error) context.addIssue({ code: 'custom', message: 'Only failed projection may own an error.' })
  if (value.usage && value.usage.ownerChoiceIndex !== value.choiceIndex) context.addIssue({ code: 'custom', message: 'Usage owner does not match projection choice.' })
  if ((value.status === 'streaming') !== (value.terminalCause === 'none')) context.addIssue({ code: 'custom', message: 'Projection terminal cause is inconsistent.' })
  if (value.checkpointCompleteness === 'recovered_incomplete' && (value.status !== 'interrupted' || value.terminalCause !== 'recovered_after_crash')) context.addIssue({ code: 'custom', message: 'Recovered incomplete projection must be interrupted.' })
  if (value.blocks.some((block, index) => block.ordinal !== index || (index > 0 && block.sequenceStart < value.blocks[index - 1]!.sequenceStart))) context.addIssue({ code: 'custom', message: 'Display blocks must be canonically ordered with contiguous ordinals.' })
  const projectionLimit = value.status === 'streaming' ? MAX_STREAMABLE_PROJECTION_BYTES : 32 * 1024 * 1024
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > projectionLimit) context.addIssue({ code: 'custom', message: 'Projection exceeds byte limit.' })
})

export type CompatibleDurableChoiceProjection = z.infer<typeof compatibleDurableChoiceProjectionSchema>

type MutableBlock = CompatibleDisplayBlock

export class CompatibleDisplayAssembler {
  readonly #identity: Pick<CompatibleDurableChoiceProjection, 'routeProvenanceId' | 'messageId' | 'choiceIndex'>
  readonly #reasoningPin: Pick<CompatibleDurableChoiceProjection['reasoning'], 'mappingId' | 'mappingVersion' | 'mode'>
  #blocks = new Map<string, MutableBlock>()
  #blockInsertion = new Map<string, number>()
  #nextBlockInsertion = 0
  #activeContentId: string | null = null
  #contentOrdinal = 0
  #lastSequence = 0
  #reasoning: CompatibleDurableChoiceProjection['reasoning']
  #finishReason: string | null = null
  #usage: CompatibleDurableChoiceProjection['usage'] = null
  #rawExtensionRecordIds: string[] = []
  #toolResultMessageIds: string[] = []
  #terminal: CompatibleDurableChoiceProjection | null = null

  constructor(input: Readonly<{ routeProvenanceId: string; messageId: string; choiceIndex: number; reasoningMappingId: string; reasoningMappingVersion: number; reasoningMode: 'custom_preferred_with_builtin_fallback' | 'custom_only' }>) {
    this.#identity = { routeProvenanceId: input.routeProvenanceId, messageId: input.messageId, choiceIndex: input.choiceIndex }
    this.#reasoningPin = { mappingId: input.reasoningMappingId, mappingVersion: input.reasoningMappingVersion, mode: input.reasoningMode }
    this.#reasoning = { ...this.#reasoningPin, lockedSource: null, lockedSourceKey: null, selectedSegmentIds: [], conflicts: [] }
  }

  appendContent(text: string, sequence: number): CompatibleDurableChoiceProjection {
    return this.#withRollback(() => {
      this.#assertMutableSequence(sequence)
    if (text) {
      const id = this.#activeContentId ?? `${this.#identity.routeProvenanceId}:${this.#identity.choiceIndex}:content:${this.#contentOrdinal++}`
      const existing = this.#blocks.get(id)
      if (!existing) this.#blockInsertion.set(id, this.#nextBlockInsertion++)
      this.#blocks.set(id, existing?.kind === 'content' ? { ...existing, sequenceEnd: sequence, text: existing.text + text } : { kind: 'content', blockId: id, ordinal: 0, sequenceStart: sequence, sequenceEnd: sequence, text })
      this.#activeContentId = id
    }
      return this.snapshot()
    })
  }

  appendContentParts(parts: readonly CompatibleNeutralContentPart[], sequence: number): CompatibleDurableChoiceProjection {
    return this.#withRollback(() => {
      this.#assertMutableSequence(sequence)
      this.#activeContentId = null
      const blockId = `${this.#identity.routeProvenanceId}:${this.#identity.choiceIndex}:content-parts:${this.#contentOrdinal++}`
      this.#blockInsertion.set(blockId, this.#nextBlockInsertion++)
      this.#blocks.set(blockId, { kind: 'content_parts', blockId, ordinal: 0, sequenceStart: sequence, sequenceEnd: sequence, parts: structuredClone([...parts]) })
      return this.snapshot()
    })
  }

  upsertReasoning(input: Readonly<{ blockId: string; segmentId: string; text: string; sequenceStart: number; sequenceEnd: number; state: CompatibleReasoningChoiceState }>): CompatibleDurableChoiceProjection {
    return this.#withRollback(() => {
      this.#assertMutableSequence(input.sequenceEnd)
    if (input.sequenceStart > input.sequenceEnd || input.state.choiceIndex !== this.#identity.choiceIndex || input.state.context.routeProvenanceId !== this.#identity.routeProvenanceId) throw new Error('compatible_display_reasoning_identity_invalid')
    if (!input.state.lockedSource || !input.state.lockedSourceKey || !input.state.selectedSegmentIds.includes(input.segmentId)) throw new Error('compatible_display_reasoning_source_unlocked')
    this.#activeContentId = null
    if (!this.#blocks.has(input.blockId)) this.#blockInsertion.set(input.blockId, this.#nextBlockInsertion++)
    this.#blocks.set(input.blockId, { kind: 'reasoning', blockId: input.blockId, ordinal: 0, sequenceStart: input.sequenceStart, sequenceEnd: input.sequenceEnd, text: input.text, segmentId: input.segmentId })
    this.#reasoning = { ...this.#reasoningPin, lockedSource: input.state.lockedSource, lockedSourceKey: input.state.lockedSourceKey, selectedSegmentIds: [...input.state.selectedSegmentIds], conflicts: input.state.conflicts.map((conflict) => ({ ...conflict })) }
      return this.snapshot()
    })
  }

  upsertToolCall(call: CompatibleToolAggregate): CompatibleDurableChoiceProjection {
    return this.#withRollback(() => {
      this.#assertMutableSequence(call.sequenceEnd)
    if (call.choiceIndex !== this.#identity.choiceIndex || call.sequenceStart > call.sequenceEnd) throw new Error('compatible_display_tool_identity_invalid')
    this.#activeContentId = null
    const blockId = `${this.#identity.routeProvenanceId}:${this.#identity.choiceIndex}:tool:${call.toolIndex}`
    if (!this.#blocks.has(blockId)) this.#blockInsertion.set(blockId, this.#nextBlockInsertion++)
    this.#blocks.set(blockId, { kind: 'tool_call', blockId, ordinal: 0, sequenceStart: call.sequenceStart, sequenceEnd: call.sequenceEnd, toolIndex: call.toolIndex, toolCallId: call.toolCallId, functionName: call.functionName, argumentsText: call.argumentsText, status: call.status, parseErrorCode: call.diagnosticCode })
      return this.snapshot()
    })
  }

  setFinishReason(finishReason: string | null, sequence: number): CompatibleDurableChoiceProjection { return this.#withRollback(() => { this.#assertMutableSequence(sequence); this.#finishReason = finishReason; return this.snapshot() }) }
  setUsage(value: Readonly<Record<string, unknown>>, provenance: 'provider_reported' | 'locally_derived', sequence: number, scope: 'response' | 'choice' = 'choice', ownerChoiceIndex = this.#identity.choiceIndex): CompatibleDurableChoiceProjection { return this.#withRollback(() => { this.#assertMutableSequence(sequence); this.#usage = { scope, ownerChoiceIndex, provenance, value: structuredClone(value) }; return this.snapshot() }) }
  setRawExtensionRecordIds(ids: readonly string[]): CompatibleDurableChoiceProjection { return this.#withRollback(() => { this.#assertMutable(); this.#rawExtensionRecordIds = [...new Set(ids)]; return this.snapshot() }) }
  setToolResultMessageIds(ids: readonly string[]): CompatibleDurableChoiceProjection { return this.#withRollback(() => { this.#assertMutable(); this.#toolResultMessageIds = [...new Set(ids)]; return this.snapshot() }) }
  touch(sequence: number): CompatibleDurableChoiceProjection { return this.#withRollback(() => { this.#assertMutableSequence(sequence); return this.snapshot() }) }

  terminate(status: Exclude<CompatibleTerminalOutcome, 'streaming'>, error: CompatibleDisplayErrorEnvelope | null = null, cause: Exclude<CompatibleDurableChoiceProjection['terminalCause'], 'none' | 'recovered_after_crash'> = defaultTerminalCause(status)): CompatibleDurableChoiceProjection {
    if (this.#terminal) {
      if (this.#terminal.status !== status || this.#terminal.terminalCause !== cause || JSON.stringify(this.#terminal.error) !== JSON.stringify(error)) throw new Error('compatible_display_terminal_conflict')
      return this.#terminal
    }
    return this.#withRollback(() => {
      this.#terminal = this.#build(status, error, cause)
      return this.#terminal
    })
  }

  snapshot(): CompatibleDurableChoiceProjection { return this.#terminal ?? this.#build('streaming', null, 'none') }

  #build(status: CompatibleTerminalOutcome, error: CompatibleDisplayErrorEnvelope | null, terminalCause: CompatibleDurableChoiceProjection['terminalCause']): CompatibleDurableChoiceProjection {
    const blocks = [...this.#blocks.values()].sort((left, right) => left.sequenceStart - right.sequenceStart || this.#blockInsertion.get(left.blockId)! - this.#blockInsertion.get(right.blockId)!).map((block, ordinal) => Object.freeze({ ...block, ordinal }))
    return Object.freeze(compatibleDurableChoiceProjectionSchema.parse({ ...this.#identity, status, terminalCause, checkpointCompleteness: 'complete', lastSequence: this.#lastSequence, blocks, reasoning: this.#reasoning, finishReason: this.#finishReason, usage: this.#usage, error, rawExtensionRecordIds: this.#rawExtensionRecordIds, toolResultMessageIds: this.#toolResultMessageIds }))
  }
  #assertMutable(): void { if (this.#terminal) throw new Error('compatible_display_terminal') }
  #assertMutableSequence(sequence: number): void { this.#assertMutable(); if (!Number.isSafeInteger(sequence) || sequence < this.#lastSequence) throw new Error('compatible_display_sequence_invalid'); this.#lastSequence = sequence }
  #withRollback<T>(operation: () => T): T {
    const backup = {
      blocks: new Map(this.#blocks), blockInsertion: new Map(this.#blockInsertion), nextBlockInsertion: this.#nextBlockInsertion,
      activeContentId: this.#activeContentId, contentOrdinal: this.#contentOrdinal, lastSequence: this.#lastSequence,
      reasoning: structuredClone(this.#reasoning), finishReason: this.#finishReason, usage: this.#usage ? structuredClone(this.#usage) : null,
      rawExtensionRecordIds: [...this.#rawExtensionRecordIds], toolResultMessageIds: [...this.#toolResultMessageIds], terminal: this.#terminal,
    }
    try { return operation() } catch (error) {
      this.#blocks = backup.blocks; this.#blockInsertion = backup.blockInsertion; this.#nextBlockInsertion = backup.nextBlockInsertion
      this.#activeContentId = backup.activeContentId; this.#contentOrdinal = backup.contentOrdinal; this.#lastSequence = backup.lastSequence
      this.#reasoning = backup.reasoning; this.#finishReason = backup.finishReason; this.#usage = backup.usage
      this.#rawExtensionRecordIds = backup.rawExtensionRecordIds; this.#toolResultMessageIds = backup.toolResultMessageIds; this.#terminal = backup.terminal
      throw error
    }
  }
}

export type CompatibleNeutralContentPart =
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'image_url'; url: string; detail?: 'auto' | 'low' | 'high' }>
  | Readonly<{ kind: 'refusal'; text: string }>
  | Readonly<{ kind: 'opaque'; label: 'unsupported_content_part' }>

function defaultTerminalCause(status: Exclude<CompatibleTerminalOutcome, 'streaming'>): Exclude<CompatibleDurableChoiceProjection['terminalCause'], 'none' | 'recovered_after_crash'> {
  return status === 'completed' ? 'done' : status === 'failed' ? 'error' : status
}
