import type { CompatibleExtensionContext } from '../extensions'
import type { CompatibleReasoningCandidate, CompatibleReasoningChoiceState, CompatibleReasoningConflict, CompatibleReasoningConflictKind, CompatibleReasoningMode, CompatibleReasoningSource } from './reasoningTypes'

const PRIORITY: readonly CompatibleReasoningSource[] = ['custom', 'reasoning', 'reasoning_content', 'thinking', 'inline']
const MAX_CONFLICTS = 64
const MAX_REASONING_BYTES = 1024 * 1024

export class CompatibleReasoningSourceLock {
  readonly #context: CompatibleExtensionContext
  readonly #choiceIndex: number
  readonly #mode: CompatibleReasoningMode
  #status: 'unselected' | 'locked' | 'terminal' = 'unselected'
  #source: CompatibleReasoningSource | null = null
  #sourceKey: string | null = null
  #value = ''
  #segmentIds: string[] = []
  #conflicts: CompatibleReasoningConflict[] = []
  #events = new Map<number, string>()
  #finalFingerprint: string | null = null

  constructor(input: Readonly<{ context: CompatibleExtensionContext; choiceIndex: number; mode: CompatibleReasoningMode }>) {
    this.#context = Object.freeze({ ...input.context, allowedMappings: Object.freeze(input.context.allowedMappings.map((pin) => Object.freeze({ ...pin }))) })
    this.#choiceIndex = input.choiceIndex
    this.#mode = input.mode
  }

  acceptEvent(candidates: readonly CompatibleReasoningCandidate[]): CompatibleReasoningChoiceState {
    if (this.#status === 'terminal') throw new Error('compatible_reasoning_choice_terminal')
    const event = this.#preflightEvent(candidates)
    if (event.duplicate) return this.snapshot()
    const valid = candidates.filter((candidate) => {
      this.#assertIdentity(candidate)
      return candidate.value.trim().length > 0 && (this.#mode !== 'custom_only' || candidate.source === 'custom')
    }).sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source))
    this.#assertValueBudget(valid)
    if (event.sequence !== null) this.#events.set(event.sequence, event.fingerprint)
    if (valid.length === 0) return this.snapshot()
    if (this.#source === null) {
      const selected = valid[0]!
      this.#source = selected.source
      this.#sourceKey = selected.sourceKey
      this.#value = selected.value
      if (selected.segmentId) this.#segmentIds.push(selected.segmentId)
      this.#status = 'locked'
      for (const extra of valid.slice(1)) {
        if (extra.sourceKey === this.#sourceKey) {
          this.#value += extra.value
          if (extra.segmentId && !this.#segmentIds.includes(extra.segmentId)) this.#segmentIds.push(extra.segmentId)
        } else this.#conflict(this.#overlap(selected.source, extra.source), extra)
      }
      return this.snapshot()
    }
    for (const candidate of valid) {
      if (candidate.sourceKey === this.#sourceKey) {
        const newSegment = candidate.segmentId && !this.#segmentIds.includes(candidate.segmentId)
        if (newSegment) {
          this.#value += candidate.value
          this.#segmentIds.push(candidate.segmentId!)
        } else if (candidate.mode === 'snapshot' || candidate.phase === 'final') this.#value = candidate.value || this.#value
        else this.#value += candidate.value
      } else {
        const candidatePriority = PRIORITY.indexOf(candidate.source)
        const lockedPriority = PRIORITY.indexOf(this.#source)
        this.#conflict(candidate.value === this.#value ? 'duplicate_equivalent_source' : (candidatePriority === lockedPriority ? 'different_value_source' : candidatePriority < lockedPriority ? 'late_higher_priority_source' : 'late_lower_priority_source'), candidate)
      }
    }
    return this.snapshot()
  }

  finalize(candidates: readonly CompatibleReasoningCandidate[] = []): CompatibleReasoningChoiceState {
    for (const candidate of candidates) this.#assertIdentity(candidate)
    if (candidates.length > 0 && candidates.some((candidate) => candidate.sequence !== candidates[0]!.sequence)) throw new Error('compatible_reasoning_event_sequence_mismatch')
    const fingerprint = eventFingerprint(candidates)
    if (this.#status === 'terminal') {
      if (this.#finalFingerprint === fingerprint) return this.snapshot()
      throw new Error('compatible_reasoning_terminal_conflict')
    }
    const valid = candidates.filter((candidate) => {
      this.#assertIdentity(candidate)
      return candidate.value.trim().length > 0 && (this.#mode !== 'custom_only' || candidate.source === 'custom')
    })
    if (this.#sourceKey === null) this.#assertValueBudget([...valid].sort((a, b) => PRIORITY.indexOf(a.source) - PRIORITY.indexOf(b.source)))
    else this.#assertFinalBudget(valid)
    if (this.#source === null) this.acceptEvent(valid)
    else {
      const matching = valid.filter((candidate) => candidate.sourceKey === this.#sourceKey)
      if (matching.length > 0 && matching.every((candidate) => candidate.segmentId)) {
        const ordered = [...matching].sort((left, right) => (left.segmentOrdinal ?? 0) - (right.segmentOrdinal ?? 0))
        this.#value = ordered.map((candidate) => candidate.value).join('')
        this.#segmentIds = ordered.map((candidate) => candidate.segmentId!)
      } else for (const candidate of matching) if (candidate.value) this.#value = candidate.value
      for (const candidate of valid) if (candidate.sourceKey !== this.#sourceKey) this.#conflict('final_source_mismatch', candidate)
    }
    this.#status = 'terminal'
    this.#finalFingerprint = fingerprint
    return this.snapshot()
  }

  snapshot(): CompatibleReasoningChoiceState {
    return Object.freeze({ context: this.#context, choiceIndex: this.#choiceIndex, mode: this.#mode, status: this.#status, lockedSource: this.#source, lockedSourceKey: this.#sourceKey, value: this.#value, selectedSegmentIds: Object.freeze([...this.#segmentIds]), conflicts: Object.freeze([...this.#conflicts]) })
  }

  #assertIdentity(candidate: CompatibleReasoningCandidate): void {
    if (candidate.choiceIndex !== this.#choiceIndex || contextIdentity(candidate.context) !== contextIdentity(this.#context)) throw new Error('compatible_reasoning_identity_mismatch')
  }
  #assertValueBudget(candidates: readonly CompatibleReasoningCandidate[]): void {
    let value = this.#value
    if (this.#sourceKey === null) {
      const selected = candidates[0]
      value = selected ? candidates.filter((candidate) => candidate.sourceKey === selected.sourceKey).map((candidate) => candidate.value).join('') : value
    } else for (const candidate of candidates.filter((item) => item.sourceKey === this.#sourceKey)) {
      const newSegment = candidate.segmentId && !this.#segmentIds.includes(candidate.segmentId)
      value = newSegment || candidate.mode === 'append' ? value + candidate.value : candidate.value || value
    }
    if (new TextEncoder().encode(value).byteLength > MAX_REASONING_BYTES) throw new Error('compatible_reasoning_value_overflow')
  }
  #assertFinalBudget(candidates: readonly CompatibleReasoningCandidate[]): void {
    const matching = this.#sourceKey === null ? candidates : candidates.filter((candidate) => candidate.sourceKey === this.#sourceKey)
    const value = matching.every((candidate) => candidate.segmentId) ? matching.map((candidate) => candidate.value).join('') : matching.at(-1)?.value ?? this.#value
    if (new TextEncoder().encode(value).byteLength > MAX_REASONING_BYTES) throw new Error('compatible_reasoning_value_overflow')
  }
  #preflightEvent(candidates: readonly CompatibleReasoningCandidate[]): { duplicate: boolean; sequence: number | null; fingerprint: string } {
    for (const candidate of candidates) this.#assertIdentity(candidate)
    if (candidates.length === 0) return { duplicate: false, sequence: null, fingerprint: '[]' }
    const sequence = candidates[0]!.sequence
    if (candidates.some((candidate) => candidate.sequence !== sequence)) throw new Error('compatible_reasoning_event_sequence_mismatch')
    const fingerprint = eventFingerprint(candidates)
    const prior = this.#events.get(sequence)
    if (prior !== undefined) {
      if (prior !== fingerprint) throw new Error('compatible_reasoning_sequence_conflict')
      return { duplicate: true, sequence, fingerprint }
    }
    return { duplicate: false, sequence, fingerprint }
  }
  #conflict(kind: CompatibleReasoningConflictKind, candidate: CompatibleReasoningCandidate): void {
    if (this.#conflicts.length >= MAX_CONFLICTS) return
    this.#conflicts.push(Object.freeze({ kind, source: candidate.source, sequence: candidate.sequence }))
  }
  #overlap(first: CompatibleReasoningSource, second: CompatibleReasoningSource): CompatibleReasoningConflictKind {
    if (first === 'custom' || second === 'custom') return 'custom_and_builtin_overlap'
    if (first === 'inline' || second === 'inline') return 'structured_and_inline_overlap'
    return 'multiple_sources_in_same_event'
  }
}

function contextIdentity(context: CompatibleExtensionContext): string {
  return JSON.stringify([context.routeProvenanceId, context.messageId, context.providerInstanceId, context.responseProfileId, context.responseProfileVersion, context.allowedMappings])
}

function eventFingerprint(candidates: readonly CompatibleReasoningCandidate[]): string {
  return JSON.stringify([...candidates].map((candidate) => [contextIdentity(candidate.context), candidate.choiceIndex, candidate.sequence, candidate.source, candidate.sourceKey, candidate.mode, candidate.phase, candidate.value, candidate.segmentId, candidate.segmentOrdinal, candidate.sequenceStart]).sort((a, b) => String(a[4]).localeCompare(String(b[4]))))
}
