import type { CompatibleToolFragment } from '../wire/wireTypes'
import {
  CompatibleToolContractError,
  type CompatibleToolAggregate,
  type CompatibleToolDiagnosticCode,
} from './toolTypes'

type MutableAggregate = {
  routeProvenanceId: string
  messageId: string
  choiceIndex: number
  toolIndex: number
  toolCallId: string | null
  toolType: 'function' | null
  functionName: string | null
  argumentsText: string
  argumentsObserved: boolean
  argumentsJson: string | null
  status: CompatibleToolAggregate['status']
  diagnosticCode: CompatibleToolDiagnosticCode | null
  executionState: 'not_executed'
  sequenceStart: number
  sequenceEnd: number
}

export class CompatibleToolAccumulator {
  readonly #calls = new Map<number, MutableAggregate>()
  readonly #sequenceFingerprints = new Map<number, string>()
  readonly #encoder = new TextEncoder()
  readonly #maxArgumentsBytes: number
  readonly #identity: Readonly<{ routeProvenanceId: string; messageId: string; choiceIndex: number }>
  #maxSequence = -1
  #finalizedReason: string | null | undefined

  constructor(input: Readonly<{ routeProvenanceId: string; messageId: string; choiceIndex: number; maxArgumentsBytes?: number }>) {
    if (typeof input.routeProvenanceId !== 'string' || input.routeProvenanceId.trim().length === 0 ||
      typeof input.messageId !== 'string' || input.messageId.trim().length === 0 ||
      !Number.isSafeInteger(input.choiceIndex) || input.choiceIndex < 0 || input.choiceIndex > 1024) {
      throw new Error('compatible_tool_identity_invalid')
    }
    this.#identity = Object.freeze({ routeProvenanceId: input.routeProvenanceId, messageId: input.messageId, choiceIndex: input.choiceIndex })
    const limit = input.maxArgumentsBytes ?? 1024 * 1024
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16 * 1024 * 1024) throw new Error('compatible_tool_limits_invalid')
    this.#maxArgumentsBytes = limit
  }

  apply(input: Readonly<{
    routeProvenanceId: string
    messageId: string
    choiceIndex: number
    sequence: number
    fragment: CompatibleToolFragment
  }>): CompatibleToolAggregate {
    if (input.routeProvenanceId !== this.#identity.routeProvenanceId || input.messageId !== this.#identity.messageId || input.choiceIndex !== this.#identity.choiceIndex) {
      throw new CompatibleToolContractError('tool_sequence_conflict')
    }
    if (this.#finalizedReason !== undefined) throw new CompatibleToolContractError('tool_fragment_after_final')
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) throw new CompatibleToolContractError('tool_sequence_out_of_order')
    const fingerprint = JSON.stringify([
      input.fragment.toolIndex,
      input.fragment.id ?? null,
      input.fragment.type ?? null,
      input.fragment.functionName ?? null,
      input.fragment.argumentsFragment ?? null,
    ])
    const priorFingerprint = this.#sequenceFingerprints.get(input.sequence)
    if (priorFingerprint !== undefined) {
      if (priorFingerprint !== fingerprint) throw new CompatibleToolContractError('tool_sequence_conflict')
      const existing = this.#calls.get(input.fragment.toolIndex)
      if (!existing) throw new CompatibleToolContractError('tool_sequence_conflict')
      return freeze(existing)
    }
    if (input.sequence < this.#maxSequence) throw new CompatibleToolContractError('tool_sequence_out_of_order')
    const existing = this.#calls.get(input.fragment.toolIndex)
    const aggregate = existing ? { ...existing } : createMutable(this.#identity, input.fragment.toolIndex, input.sequence)
    if (input.fragment.type !== undefined) {
      if (aggregate.toolType !== null && aggregate.toolType !== input.fragment.type) {
        throw new CompatibleToolContractError('tool_type_conflict')
      }
      aggregate.toolType = input.fragment.type
    }
    if (input.fragment.id !== undefined) {
      aggregate.toolCallId = (aggregate.toolCallId ?? '') + input.fragment.id
      if (this.#encoder.encode(aggregate.toolCallId).byteLength > 256) throw new CompatibleToolContractError('tool_id_overflow')
    }
    if (input.fragment.functionName !== undefined) {
      aggregate.functionName = (aggregate.functionName ?? '') + input.fragment.functionName
      if (this.#encoder.encode(aggregate.functionName).byteLength > 256) throw new CompatibleToolContractError('tool_name_overflow')
    }
    if (input.fragment.argumentsFragment !== undefined) {
      const next = aggregate.argumentsText + input.fragment.argumentsFragment
      if (this.#encoder.encode(next).byteLength > this.#maxArgumentsBytes) throw new CompatibleToolContractError('tool_arguments_overflow')
      aggregate.argumentsText = next
      aggregate.argumentsObserved = true
    }
    aggregate.sequenceEnd = input.sequence
    this.#maxSequence = input.sequence
    this.#sequenceFingerprints.set(input.sequence, fingerprint)
    this.#calls.set(aggregate.toolIndex, aggregate)
    return freeze(aggregate)
  }

  finalize(finishReason: string | null): readonly CompatibleToolAggregate[] {
    if (this.#finalizedReason !== undefined) {
      if (this.#finalizedReason !== finishReason) throw new CompatibleToolContractError('tool_sequence_conflict')
      return this.list()
    }
    if (this.#calls.size === 0 && finishReason === 'tool_calls') throw new CompatibleToolContractError('tool_arguments_missing')
    const finalized = [...this.#calls.entries()].map(([toolIndex, aggregate]) => {
      const candidate = { ...aggregate }
      finalizeAggregate(candidate, finishReason)
      return [toolIndex, candidate] as const
    })
    const observedIds = new Set<string>()
    for (const [, aggregate] of finalized) {
      if (aggregate.toolCallId && observedIds.has(aggregate.toolCallId)) throw new CompatibleToolContractError('tool_id_duplicate')
      if (aggregate.toolCallId) observedIds.add(aggregate.toolCallId)
    }
    for (const [toolIndex, aggregate] of finalized) this.#calls.set(toolIndex, aggregate)
    this.#finalizedReason = finishReason
    return this.list()
  }

  list(): readonly CompatibleToolAggregate[] {
    return Object.freeze([...this.#calls.values()].sort((left, right) => left.toolIndex - right.toolIndex).map(freeze))
  }
}

function createMutable(identity: Readonly<{ routeProvenanceId: string; messageId: string; choiceIndex: number }>, toolIndex: number, sequence: number): MutableAggregate {
  if (!Number.isSafeInteger(toolIndex) || toolIndex < 0 || toolIndex > 1024) throw new CompatibleToolContractError('tool_sequence_conflict')
  return {
    ...identity,
    toolIndex,
    toolCallId: null,
    toolType: null,
    functionName: null,
    argumentsText: '',
    argumentsObserved: false,
    argumentsJson: null,
    status: 'streaming',
    diagnosticCode: null,
    executionState: 'not_executed',
    sequenceStart: sequence,
    sequenceEnd: sequence,
  }
}

function finalizeAggregate(aggregate: MutableAggregate, finishReason: string | null): void {
  if (finishReason !== 'tool_calls') return mark(aggregate, 'incomplete', 'tool_finish_reason_mismatch')
  if (!aggregate.toolCallId) return mark(aggregate, 'incomplete', 'tool_id_missing')
  if (aggregate.toolType !== 'function') return mark(aggregate, 'incomplete', 'tool_type_missing')
  if (!aggregate.functionName) return mark(aggregate, 'incomplete', 'tool_name_missing')
  if (!aggregate.argumentsObserved) return mark(aggregate, 'incomplete', 'tool_arguments_missing')
  let parsed: unknown
  try {
    parsed = JSON.parse(aggregate.argumentsText)
  } catch {
    return mark(aggregate, 'malformed', 'tool_arguments_malformed')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    return mark(aggregate, 'malformed', 'tool_arguments_not_object')
  }
  if (!isBoundedJson(parsed)) return mark(aggregate, 'malformed', 'tool_arguments_overflow')
  aggregate.argumentsJson = aggregate.argumentsText
  aggregate.status = 'complete'
  aggregate.diagnosticCode = null
}

function isBoundedJson(value: unknown): boolean {
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

function mark(aggregate: MutableAggregate, status: 'malformed' | 'incomplete', code: CompatibleToolDiagnosticCode): void {
  aggregate.argumentsJson = null
  aggregate.status = status
  aggregate.diagnosticCode = code
}

function freeze(value: MutableAggregate): CompatibleToolAggregate {
  return Object.freeze({ ...value })
}
