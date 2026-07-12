import type { CompatibleInlinePolicyConfig, CompatibleReasoningMappingConfig } from '../schemas'
import type { CompatibleWireEvent } from '../wire'
import { coalesceCompatibleRawExtensions, extractOpenAICompatibleExtensions, normalizeCompatibleExtensionPath, type CompatibleDiscoveryObservation, type CompatibleExtensionContext, type CompatibleExtensionMapping, type CompatibleRawExtensionDraft } from '../extensions'
import { CompatibleInlineReasoningParser, CompatibleReasoningSourceLock, projectCompatibleReasoningCandidate, projectCustomReasoningCandidate, type CompatibleInlineBlock, type CompatibleReasoningCandidate, type CompatibleReasoningChoiceState, type CompatibleReasoningSource } from '../reasoning'
import { CompatibleTurnProjector, type CompatibleDurableChoiceProjection } from '../display'

type Choice = Readonly<{ choiceIndex: number; messageId: string }>
type RoutePin = Readonly<{
  routeProvenanceId: string; providerInstanceId: string; responseProfileId: string; responseProfileVersion: number
  reasoningMappingId: string; reasoningMappingVersion: number; reasoningMode: 'custom_preferred_with_builtin_fallback' | 'custom_only'
}>

export class CompatibleChatResponseCoordinator {
  readonly #route: RoutePin
  readonly #mapping: CompatibleReasoningMappingConfig
  readonly #projector: CompatibleTurnProjector
  readonly #choices = new Map<number, Choice>()
  readonly #locks = new Map<number, CompatibleReasoningSourceLock>()
  readonly #inline = new Map<number, CompatibleInlineReasoningParser>()
  readonly #inlineLengths = new Map<number, Map<string, number>>()
  readonly #raw = new Map<number, Array<{ context: CompatibleExtensionContext; sequence: number; choiceIndex: number; sourcePath: readonly (string | number)[]; value: Extract<CompatibleWireEvent, { kind: 'extension' }>['candidate']['value']; mode: 'append' | 'snapshot'; semantic: 'reasoning' | 'diagnostic' }>>()
  readonly #discovery: CompatibleDiscoveryObservation[] = []

  constructor(input: Readonly<{
    route: RoutePin
    choices: readonly Choice[]
    reasoningMapping: CompatibleReasoningMappingConfig
    inlinePolicy: Readonly<{ inlinePolicyId: string; version: number; config: CompatibleInlinePolicyConfig }>
  }>) {
    this.#route = input.route
    this.#mapping = input.reasoningMapping
    if (input.reasoningMapping.mode !== input.route.reasoningMode) throw new Error('compatible_reasoning_mapping_pin_mismatch')
    this.#projector = new CompatibleTurnProjector({
      routeProvenanceId: input.route.routeProvenanceId,
      choices: input.choices,
      reasoningMappingId: input.route.reasoningMappingId,
      reasoningMappingVersion: input.route.reasoningMappingVersion,
      reasoningMode: input.route.reasoningMode,
    })
    for (const choice of input.choices) {
      this.#choices.set(choice.choiceIndex, choice)
      this.#locks.set(choice.choiceIndex, new CompatibleReasoningSourceLock({
        context: this.#context(choice), choiceIndex: choice.choiceIndex, mode: input.route.reasoningMode,
      }))
      this.#inline.set(choice.choiceIndex, new CompatibleInlineReasoningParser({
        routeProvenanceId: input.route.routeProvenanceId,
        choiceIndex: choice.choiceIndex,
        inlinePolicyId: input.inlinePolicy.inlinePolicyId,
        inlinePolicyVersion: input.inlinePolicy.version,
        participation: input.route.reasoningMode === 'custom_only' ? 'custom_only' : 'eligible',
        customTags: input.inlinePolicy.config.customTags,
      }))
      this.#inlineLengths.set(choice.choiceIndex, new Map())
      this.#raw.set(choice.choiceIndex, [])
    }
  }

  apply(event: CompatibleWireEvent): readonly CompatibleDurableChoiceProjection[] {
    if (event.kind === 'extension') {
      this.#observeRaw(event)
      if (event.candidate.choiceIndex !== undefined) this.#applyReasoning(event)
    }
    if (event.kind === 'choice_content' && typeof event.content === 'string') {
      return this.#applyInline(event.choiceIndex, event.sequence, this.#inline.get(event.choiceIndex)!.push(event.content, event.sequence).blocks)
    }
    if (event.kind === 'terminal') {
      for (const [choiceIndex, parser] of this.#inline) this.#applyInline(choiceIndex, event.sequence, parser.finalize().blocks)
      for (const [choiceIndex, lock] of this.#locks) {
        const state = lock.finalize()
        if (state.lockedSource) this.#projectReasoning(choiceIndex, event.sequence, state, state.selectedSegmentIds.at(-1)!)
      }
    }
    return this.#projector.applyWireEvent(event)
  }

  snapshots(): readonly CompatibleDurableChoiceProjection[] { return this.#projector.snapshots() }
  reasoningStates(): readonly Readonly<{ choice: Choice; state: CompatibleReasoningChoiceState }>[] {
    return Object.freeze([...this.#locks].map(([choiceIndex, lock]) => Object.freeze({ choice: this.#choices.get(choiceIndex)!, state: lock.snapshot() })))
  }
  rawDrafts(): readonly CompatibleRawExtensionDraft[] {
    return Object.freeze([...this.#raw].flatMap(([choiceIndex, items]) => {
      const choice = this.#choices.get(choiceIndex)!
      return coalesceCompatibleRawExtensions(this.#context(choice), items).records
    }))
  }
  setRawExtensionRecordIds(choiceIndex: number, ids: readonly string[]): readonly CompatibleDurableChoiceProjection[] {
    return this.#projector.setRawExtensionRecordIds(choiceIndex, ids)
  }
  discoveryObservations(): readonly CompatibleDiscoveryObservation[] { return Object.freeze([...this.#discovery]) }

  #applyReasoning(event: Extract<CompatibleWireEvent, { kind: 'extension' }>): void {
    const choiceIndex = event.candidate.choiceIndex!
    const choice = this.#choices.get(choiceIndex)
    const lock = this.#locks.get(choiceIndex)
    if (!choice || !lock) throw new Error('compatible_projector_choice_missing')
    const phase = event.source === 'stream' ? 'stream' : 'final'
    const mappings = this.#extensionMappings(phase)
    const context = this.#context(choice)
    const extracted = extractOpenAICompatibleExtensions({ context, events: [event], mappings })
    const candidates: CompatibleReasoningCandidate[] = extracted.semanticCandidates.flatMap((candidate) => {
      const projected = projectCustomReasoningCandidate(candidate)
      return projected ? [{ ...projected, segmentId: segmentId(projected), segmentOrdinal: event.sequence, sequenceStart: event.sequence }] : []
    })
    if (this.#route.reasoningMode !== 'custom_only') {
      const builtinSource = builtInSource(event.candidate.sourcePath)
      if (builtinSource) {
        const projected = projectCompatibleReasoningCandidate({
          context, choiceIndex, sequence: event.sequence, phase, source: builtinSource, sourceKey: builtinSource,
          mode: phase === 'stream' ? 'append' : 'snapshot', value: event.candidate.value,
        })
        if (projected) candidates.push({ ...projected, segmentId: segmentId(projected), segmentOrdinal: event.sequence, sequenceStart: event.sequence })
      }
    }
    const state = lock.acceptEvent(candidates)
    if (state.lockedSource) this.#projectReasoning(choiceIndex, event.sequence, state, state.selectedSegmentIds.at(-1)!)
  }

  #observeRaw(event: Extract<CompatibleWireEvent, { kind: 'extension' }>): void {
    const choiceIndex = event.candidate.choiceIndex ?? Math.min(...this.#choices.keys())
    const choice = this.#choices.get(choiceIndex)
    const bucket = this.#raw.get(choiceIndex)
    if (!choice || !bucket) throw new Error('compatible_projector_choice_missing')
    const normalized = normalizeCompatibleExtensionPath(event.candidate.sourcePath)
    const matchedRule = this.#mapping.rules.find((rule) => {
      const path = event.source === 'stream' ? rule.stream.path : rule.final?.path
      return path ? wildcardPathMatch(path, normalized) : false
    })
    bucket.push({
      context: this.#context(choice), sequence: event.sequence, choiceIndex,
      sourcePath: event.candidate.sourcePath, value: event.candidate.value,
      mode: matchedRule && (event.source === 'stream' ? matchedRule.stream.mode : matchedRule.final?.mode) === 'append' ? 'append' : 'snapshot',
      semantic: matchedRule && matchedRule.semantic !== 'opaque' ? 'reasoning' : 'diagnostic',
    })
    const extracted = extractOpenAICompatibleExtensions({
      context: this.#context(choice), events: [event], mappings: this.#extensionMappings(event.source === 'stream' ? 'stream' : 'final'),
    })
    this.#discovery.push(...extracted.discoveryObservations)
  }

  #extensionMappings(phase: 'stream' | 'final'): readonly CompatibleExtensionMapping[] {
    return this.#mapping.rules.flatMap((rule) => {
      const selected = phase === 'stream' ? rule.stream : rule.final
      if (!selected) return []
      return [{
        mappingId: this.#route.reasoningMappingId, mappingVersion: this.#route.reasoningMappingVersion,
        responseProfileId: this.#route.responseProfileId, responseProfileVersion: this.#route.responseProfileVersion,
        path: selected.path, semantic: rule.semantic === 'opaque' ? 'diagnostic' as const : 'reasoning' as const,
        mode: selected.mode === 'append' ? 'append' as const : 'snapshot' as const,
      }]
    })
  }

  #projectReasoning(choiceIndex: number, sequence: number, state: CompatibleReasoningChoiceState, selectedSegmentId: string): void {
    if (!selectedSegmentId) throw new Error('compatible_reasoning_segment_missing')
    this.#projector.applyReasoningBlock({
      choiceIndex,
      blockId: `${this.#route.routeProvenanceId}:${choiceIndex}:reasoning`,
      segmentId: selectedSegmentId,
      text: state.value,
      sequenceStart: 0,
      sequenceEnd: sequence,
      state,
    })
  }

  #applyInline(choiceIndex: number, sequence: number, blocks: readonly CompatibleInlineBlock[]): readonly CompatibleDurableChoiceProjection[] {
    const lengths = this.#inlineLengths.get(choiceIndex)
    const lock = this.#locks.get(choiceIndex)
    const choice = this.#choices.get(choiceIndex)
    if (!lengths || !lock || !choice) throw new Error('compatible_projector_choice_missing')
    const candidates: CompatibleReasoningCandidate[] = []
    for (const block of blocks) {
      const previous = lengths.get(block.blockId) ?? 0
      if (block.text.length < previous) throw new Error('compatible_inline_snapshot_rollback')
      const delta = block.text.slice(previous)
      lengths.set(block.blockId, block.text.length)
      if (!delta) continue
      if (block.kind === 'content') {
        this.#projector.applyWireEvent({ kind: 'choice_content', source: 'stream', sequence, choiceIndex, content: delta })
      } else if (this.#route.reasoningMode !== 'custom_only') {
        candidates.push({
          context: this.#context(choice), choiceIndex, sequence, phase: 'stream', source: 'inline',
          sourceKey: `inline:${block.tagPairId ?? 'canonical_think'}`, mode: 'append', value: delta,
          segmentId: block.blockId, segmentOrdinal: block.reasoningSegmentOrdinal ?? block.segmentOrdinal,
          sequenceStart: block.sequenceStart,
        })
      }
    }
    if (candidates.length > 0) {
      const state = lock.acceptEvent(candidates)
      if (state.lockedSource) this.#projectReasoning(choiceIndex, sequence, state, state.selectedSegmentIds.at(-1)!)
    }
    return this.#projector.snapshots()
  }

  #context(choice: Choice): CompatibleExtensionContext {
    return Object.freeze({
      routeProvenanceId: this.#route.routeProvenanceId, messageId: choice.messageId,
      providerInstanceId: this.#route.providerInstanceId,
      responseProfileId: this.#route.responseProfileId, responseProfileVersion: this.#route.responseProfileVersion,
      allowedMappings: [{ mappingId: this.#route.reasoningMappingId, mappingVersion: this.#route.reasoningMappingVersion }],
    })
  }
}

function builtInSource(path: readonly (string | number)[]): CompatibleReasoningSource | null {
  const leaf = String(path.at(-1) ?? '')
  return leaf === 'reasoning' || leaf === 'reasoning_content' || leaf === 'thinking' ? leaf : null
}

function segmentId(candidate: Pick<CompatibleReasoningCandidate, 'sourceKey' | 'sequence'>): string {
  return `${candidate.sourceKey}:${candidate.sequence}`.slice(0, 512)
}

function wildcardPathMatch(pattern: string, normalized: string): boolean {
  const left = pattern.split('.')
  const right = normalized.split('.')
  return left.length === right.length && left.every((segment, index) => segment === '*' || segment === right[index])
}

export { normalizeCompatibleExtensionPath }
