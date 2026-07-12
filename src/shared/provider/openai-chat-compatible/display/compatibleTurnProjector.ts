import type { CompatibleWireEvent } from '../wire'
import { CompatibleToolAccumulator } from '../tools'
import type { CompatibleReasoningChoiceState } from '../reasoning'
import { CompatibleDisplayAssembler, type CompatibleDisplayErrorEnvelope, type CompatibleDurableChoiceProjection, type CompatibleNeutralContentPart } from './compatibleDisplayProjection'

type ChoiceIdentity = Readonly<{ messageId: string; choiceIndex: number }>

export class CompatibleTurnProjector {
  readonly #routeProvenanceId: string
  readonly #assemblers = new Map<number, CompatibleDisplayAssembler>()
  readonly #tools = new Map<number, CompatibleToolAccumulator>()
  readonly #finishReasons = new Map<number, string | null>()
  readonly #toolsFinalized = new Set<number>()
  readonly #diagnostics: string[] = []
  #terminal: readonly CompatibleDurableChoiceProjection[] | null = null

  constructor(input: Readonly<{ routeProvenanceId: string; choices: readonly ChoiceIdentity[]; reasoningMappingId: string; reasoningMappingVersion: number; reasoningMode: 'custom_preferred_with_builtin_fallback' | 'custom_only' }>) {
    this.#routeProvenanceId = input.routeProvenanceId
    for (const choice of input.choices) {
      if (this.#assemblers.has(choice.choiceIndex)) throw new Error('compatible_projector_duplicate_choice')
      this.#assemblers.set(choice.choiceIndex, new CompatibleDisplayAssembler({ ...choice, routeProvenanceId: input.routeProvenanceId, reasoningMappingId: input.reasoningMappingId, reasoningMappingVersion: input.reasoningMappingVersion, reasoningMode: input.reasoningMode }))
      this.#tools.set(choice.choiceIndex, new CompatibleToolAccumulator({ ...choice, routeProvenanceId: input.routeProvenanceId }))
    }
    if (this.#assemblers.size === 0) throw new Error('compatible_projector_choices_required')
  }

  applyWireEvent(event: CompatibleWireEvent): readonly CompatibleDurableChoiceProjection[] {
    if (this.#terminal) throw new Error('compatible_projector_terminal')
    if (event.kind === 'response_meta' || event.kind === 'extension') return this.snapshots()
    if (event.kind === 'usage') {
      const ownerChoiceIndex = Math.min(...this.#assemblers.keys())
      try { this.#assemblers.get(ownerChoiceIndex)!.setUsage(event.usage, 'provider_reported', event.sequence, 'response', ownerChoiceIndex) } catch { this.#diagnose('usage_unrecognized') }
      return this.snapshots()
    }
    if (event.kind === 'terminal') return this.#terminate(event)
    const assembler = this.#choice(event.choiceIndex)
    if (event.kind === 'choice_role') assembler.touch(event.sequence)
    else if (event.kind === 'choice_content') {
      if (typeof event.content === 'string') assembler.appendContent(event.content, event.sequence)
      else if (Array.isArray(event.content)) assembler.appendContentParts(event.content.map(toNeutralContentPart), event.sequence)
      else assembler.touch(event.sequence)
    } else if (event.kind === 'tool_fragment') {
      const aggregate = this.#tools.get(event.choiceIndex)!.apply({ routeProvenanceId: this.#routeProvenanceId, messageId: assembler.snapshot().messageId, choiceIndex: event.choiceIndex, sequence: event.sequence, fragment: event.fragment })
      assembler.upsertToolCall(aggregate)
    } else if (event.kind === 'choice_finish') {
      this.#finishReasons.set(event.choiceIndex, event.finishReason)
      if (event.finishReason === null) {
        assembler.touch(event.sequence)
      } else {
        for (const aggregate of this.#tools.get(event.choiceIndex)!.finalize(event.finishReason)) assembler.upsertToolCall(aggregate)
        this.#toolsFinalized.add(event.choiceIndex)
        assembler.setFinishReason(event.finishReason, event.sequence)
      }
    }
    return this.snapshots()
  }

  applyReasoningBlock(input: Readonly<{ choiceIndex: number; blockId: string; segmentId: string; text: string; sequenceStart: number; sequenceEnd: number; state: CompatibleReasoningChoiceState }>): readonly CompatibleDurableChoiceProjection[] {
    if (this.#terminal) throw new Error('compatible_projector_terminal')
    this.#choice(input.choiceIndex).upsertReasoning(input)
    return this.snapshots()
  }

  setRawExtensionRecordIds(choiceIndex: number, ids: readonly string[]): readonly CompatibleDurableChoiceProjection[] { this.#choice(choiceIndex).setRawExtensionRecordIds(ids); return this.snapshots() }
  setToolResultMessageIds(choiceIndex: number, ids: readonly string[]): readonly CompatibleDurableChoiceProjection[] { this.#choice(choiceIndex).setToolResultMessageIds(ids); return this.snapshots() }
  diagnostics(): readonly string[] { return Object.freeze([...this.#diagnostics]) }
  snapshots(): readonly CompatibleDurableChoiceProjection[] { return this.#terminal ?? Object.freeze([...this.#assemblers.values()].map((assembler) => assembler.snapshot()).sort((left, right) => left.choiceIndex - right.choiceIndex)) }

  #terminate(event: Extract<CompatibleWireEvent, { kind: 'terminal' }>): readonly CompatibleDurableChoiceProjection[] {
    for (const [choiceIndex, assembler] of this.#assemblers) {
      if (!this.#toolsFinalized.has(choiceIndex)) for (const aggregate of this.#tools.get(choiceIndex)!.finalize(this.#finishReasons.get(choiceIndex) ?? null)) assembler.upsertToolCall(aggregate)
      assembler.touch(event.sequence)
    }
    const envelope: CompatibleDisplayErrorEnvelope | null = event.outcome === 'error'
      ? event.error ?? { network: { code: 'compatible_network_unknown', stage: 'lifecycle', safeMessage: 'The provider network request failed.', retryable: true }, diagnostic: { category: 'lifecycle' } }
      : null
    const status = event.outcome === 'done' ? 'completed' : event.outcome === 'aborted' ? 'aborted' : event.outcome === 'error' ? 'failed' : 'interrupted'
    this.#terminal = Object.freeze([...this.#assemblers.values()].map((assembler) => assembler.terminate(status, envelope, event.outcome)).sort((left, right) => left.choiceIndex - right.choiceIndex))
    return this.#terminal
  }

  #choice(choiceIndex: number): CompatibleDisplayAssembler {
    const assembler = this.#assemblers.get(choiceIndex)
    if (!assembler) throw new Error('compatible_projector_choice_missing')
    return assembler
  }
  #diagnose(value: string): void { if (this.#diagnostics.length < 64 && !this.#diagnostics.includes(value)) this.#diagnostics.push(value) }
}

function toNeutralContentPart(value: unknown): CompatibleNeutralContentPart {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'opaque', label: 'unsupported_content_part' }
  const part = value as Record<string, unknown>
  if (part.type === 'text' && typeof part.text === 'string') return { kind: 'text', text: part.text }
  if (part.type === 'refusal' && typeof part.refusal === 'string') return { kind: 'refusal', text: part.refusal }
  if (part.type === 'image_url') {
    const image = part.image_url
    if (typeof image === 'string') return sanitizeImageUrl(image)
    if (image && typeof image === 'object' && !Array.isArray(image) && typeof (image as Record<string, unknown>).url === 'string') {
      const detail = (image as Record<string, unknown>).detail
      const sanitized = sanitizeImageUrl(String((image as Record<string, unknown>).url))
      return sanitized.kind === 'image_url' ? { ...sanitized, ...(detail === 'auto' || detail === 'low' || detail === 'high' ? { detail } : {}) } : sanitized
    }
  }
  return { kind: 'opaque', label: 'unsupported_content_part' }
}

function sanitizeImageUrl(value: string): CompatibleNeutralContentPart {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'opaque', label: 'unsupported_content_part' }
    url.search = ''
    url.hash = ''
    return { kind: 'image_url', url: url.toString() }
  } catch {
    return { kind: 'opaque', label: 'unsupported_content_part' }
  }
}
