import type { CompatibleExtensionContext } from '../extensions'
import type { CompatibleReasoningCandidate } from './reasoningTypes'

export type CompatibleInlineTagPair = Readonly<{ openTag: string; closeTag: string }>
export type CompatibleInlineBlock = Readonly<{
  blockId: string
  segmentOrdinal: number
  reasoningSegmentOrdinal: number | null
  kind: 'content' | 'reasoning'
  tagPairId: string | null
  sequenceStart: number
  sequenceEnd: number
  text: string
}>
export type CompatibleInlineDiagnostic = 'nested_start_literal' | 'unmatched_end_literal' | 'incomplete_segment_restored' | 'final_snapshot_mismatch'
export type CompatibleInlineTerminalOutcome = 'eof' | 'abort' | 'interrupted'

type Unit = { char: string; sequence: number }
type BufferState = { text: string; sequenceStart: number | null; sequenceEnd: number | null; bytes: number; committedBytes: number; pendingHighSurrogate: string }

const CANONICAL_TAG: CompatibleInlineTagPair = Object.freeze({ openTag: '<think>', closeTag: '</think>' })
const MAX_INPUT_BYTES = 2 * 1024 * 1024
const MAX_REASONING_BYTES = 1024 * 1024
const MAX_BLOCKS = 4096
const MAX_DIAGNOSTICS = 64
const MAX_XML_DEPTH = 64
const MAX_XML_TOKEN_CHARS = 256
const PROCESS_BATCH_CHARS = 4096

export function validateCompatibleInlineTags(customTags: readonly CompatibleInlineTagPair[]): readonly CompatibleInlineTagPair[] {
  if (customTags.length > 16) throw new Error('compatible_inline_tag_limit_exceeded')
  const tags = [CANONICAL_TAG, ...customTags].map((tag) => Object.freeze({ ...tag }))
  const tokens = new Set<string>()
  const encoder = new TextEncoder()
  for (const tag of tags) {
    if (tag.openTag.length < 1 || encoder.encode(tag.openTag).byteLength > 128 || tag.closeTag.length < 1 || encoder.encode(tag.closeTag).byteLength > 128 || tag.openTag === tag.closeTag || /[\r\n]/.test(tag.openTag + tag.closeTag) || markdownDelimiterConflict(tag.openTag) || markdownDelimiterConflict(tag.closeTag)) throw new Error('compatible_inline_tag_invalid')
    if (tokens.has(tag.openTag) || tokens.has(tag.closeTag)) throw new Error('compatible_inline_tag_conflict')
    tokens.add(tag.openTag); tokens.add(tag.closeTag)
  }
  const all = [...tokens]
  if (all.some((token, index) => all.some((other, otherIndex) => index !== otherIndex && other.startsWith(token)))) throw new Error('compatible_inline_tag_prefix_conflict')
  if (encoder.encode(all.join('')).byteLength > 4096) throw new Error('compatible_inline_matcher_state_limit_exceeded')
  return Object.freeze(tags)
}

export class CompatibleInlineReasoningParser {
  readonly #tags: readonly CompatibleInlineTagPair[]
  readonly #choiceKey: string
  readonly #inlinePolicyKey: string
  readonly #eligible: boolean
  readonly #encoder = new TextEncoder()
  #queue: Unit[] = []
  #queueCursor = 0
  #inputBytes = 0
  #pendingInputHighSurrogate = ''
  #nextSequence = 0
  #lastSequence = -1
  #terminal = false
  #finalResult: Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[]; pending: false }> | null = null
  #active: CompatibleInlineTagPair | null = null
  #activeTagPairId: string | null = null
  #activeStartUnits: Unit[] = []
  #content: BufferState = emptyBuffer()
  #reasoning: BufferState = emptyBuffer()
  #blocks: CompatibleInlineBlock[] = []
  #diagnostics: CompatibleInlineDiagnostic[] = []
  #blockOrdinal = 0
  #reasoningOrdinal = 0
  #fence: { marker: '`' | '~'; width: number } | null = null
  #pendingFenceRun: { marker: '`' | '~'; width: number } | null = null
  #inlineTicks = 0
  #lineStart = true
  #lineTail = ''
  #xmlStack: string[] = []

  constructor(input: Readonly<{ routeProvenanceId: string; choiceIndex: number; inlinePolicyId?: string; inlinePolicyVersion?: number; participation?: 'eligible' | 'custom_only' | 'structured_locked'; customTags?: readonly CompatibleInlineTagPair[] }>) {
    this.#tags = validateCompatibleInlineTags(input.customTags ?? [])
    this.#choiceKey = `${input.routeProvenanceId}:${input.choiceIndex}`
    this.#inlinePolicyKey = `${input.inlinePolicyId ?? 'canonical'}:${input.inlinePolicyVersion ?? 1}`
    this.#eligible = (input.participation ?? 'eligible') === 'eligible'
  }

  push(fragment: string, sequence = this.#nextSequence++): Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[]; pending: boolean }> {
    if (this.#terminal) throw new Error('compatible_inline_parser_terminal')
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence <= this.#lastSequence) throw new Error('compatible_inline_sequence_invalid')
    const byteInput = this.#pendingInputHighSurrogate + fragment
    const nextPendingHighSurrogate = /[\uD800-\uDBFF]$/.test(byteInput) ? byteInput.at(-1)! : ''
    const committedByteInput = nextPendingHighSurrogate ? byteInput.slice(0, -1) : byteInput
    const nextInputBytes = this.#inputBytes + this.#encoder.encode(committedByteInput).byteLength
    const effectiveInputBytes = nextInputBytes + (nextPendingHighSurrogate ? this.#encoder.encode(nextPendingHighSurrogate).byteLength : 0)
    if (effectiveInputBytes > MAX_INPUT_BYTES) throw new Error('compatible_inline_input_overflow')
    this.#inputBytes = nextInputBytes
    this.#pendingInputHighSurrogate = nextPendingHighSurrogate
    this.#lastSequence = sequence
    for (let offset = 0; offset < fragment.length; offset += PROCESS_BATCH_CHARS) {
      const end = Math.min(fragment.length, offset + PROCESS_BATCH_CHARS)
      for (let index = offset; index < end; index += 1) this.#queue.push({ char: fragment[index]!, sequence })
      this.#process(false)
    }
    return this.#snapshot(this.#remaining() > 0 || this.#active !== null || this.#pendingFenceRun !== null)
  }

  finalize(): Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[]; pending: false }> {
    return this.terminate('eof')
  }

  terminate(_outcome: CompatibleInlineTerminalOutcome): Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[]; pending: false }> {
    if (this.#finalResult) return this.#finalResult
    if (this.#terminal) throw new Error('compatible_inline_parser_terminal')
    this.#terminal = true
    const terminalPending = this.#peek(MAX_XML_TOKEN_CHARS)
    if (this.#eligible && !this.#active && terminalPending && this.#tags.some((tag) => tag.openTag.startsWith(terminalPending) && tag.openTag !== terminalPending)) this.#diagnose('incomplete_segment_restored')
    this.#process(true)
    if (this.#active) {
      this.#appendUnitsToContent(this.#activeStartUnits)
      this.#appendTextToContent(this.#reasoning)
      this.#reasoning = emptyBuffer()
      this.#active = null
      this.#activeTagPairId = null
      this.#activeStartUnits = []
      this.#diagnose('incomplete_segment_restored')
    }
    this.#flushContent(true)
    this.#finalResult = Object.freeze({ blocks: Object.freeze([...this.#blocks]), diagnostics: Object.freeze([...this.#diagnostics]), pending: false })
    return this.#finalResult
  }

  #process(final: boolean): void {
    while (this.#remaining() > 0) {
      if (this.#pendingFenceRun) {
        let width = 0
        while (width < this.#remaining() && this.#queue[this.#queueCursor + width]!.char === this.#pendingFenceRun.marker) width += 1
        if (width > 0) {
          this.#appendContentUnits(this.#takeText(width))
          this.#pendingFenceRun.width += width
        }
        if (this.#remaining() === 0 && !final) break
        this.#applyFenceDelimiter(this.#pendingFenceRun.marker, this.#pendingFenceRun.width)
        this.#pendingFenceRun = null
        continue
      }
      if (!final && this.#mustWaitForMore()) break
      if (!this.#eligible) {
        this.#appendContentUnit(this.#takeOne())
        continue
      }
      const lookahead = this.#peek(MAX_XML_TOKEN_CHARS)
      if (!this.#active && this.#lineStart) {
        const fence = this.#readFenceDelimiter()
        if (fence) {
          this.#appendContentUnits(this.#takeText(fence.consumed))
          if (fence.pending && !final) this.#pendingFenceRun = { marker: fence.marker, width: fence.width }
          else this.#applyFenceDelimiter(fence.marker, fence.width)
          continue
        }
      }
      if (!this.#active && !this.#fence && this.#queue[this.#queueCursor]?.char === '`') {
        const width = leadingRun(lookahead, '`')
        if (this.#inlineTicks !== 0) {
          if (width === this.#inlineTicks) this.#inlineTicks = 0
        } else if (width < 3 || !this.#lineStart) this.#inlineTicks = width
        this.#takeText(width).forEach((unit) => this.#appendContentUnit(unit))
        continue
      }
      if (!this.#fence && this.#inlineTicks === 0) {
        if (!this.#active) {
          const startIndex = this.#tags.findIndex((tag) => lookahead.startsWith(tag.openTag))
          const escaped = this.#content.text.endsWith('\\')
          const literal = this.#xmlStack.length > 0 || isLiteralExampleTail(this.#lineTail)
          if (startIndex >= 0 && !escaped && !literal) {
            this.#active = this.#tags[startIndex]!
            this.#activeTagPairId = startIndex === 0 ? 'canonical_think' : `${this.#inlinePolicyKey}:custom:${startIndex - 1}`
            this.#activeStartUnits = this.#takeText(this.#active.openTag.length)
            continue
          }
          const unmatchedEnd = this.#tags.find((tag) => lookahead.startsWith(tag.closeTag))
          if (unmatchedEnd) this.#diagnose('unmatched_end_literal')
          this.#updateXmlState(lookahead)
        } else {
          if (lookahead.startsWith(this.#active.closeTag)) {
            this.#takeText(this.#active.closeTag.length)
            this.#flushContent(true)
            this.#flushReasoning()
            this.#active = null
            this.#activeTagPairId = null
            this.#activeStartUnits = []
            continue
          }
          if (this.#tags.some((tag) => lookahead.startsWith(tag.openTag))) this.#diagnose('nested_start_literal')
        }
      }
      const batchLength = this.#safeBatchLength()
      if (batchLength > 1) {
        const units = this.#takeText(batchLength)
        if (this.#active) this.#appendReasoningUnits(units)
        else this.#appendContentUnits(units)
        continue
      }
      const unit = this.#takeOne()
      if (this.#active) this.#appendReasoningUnit(unit)
      else {
        this.#appendContentUnit(unit)
      }
    }
  }

  #mustWaitForMore(): boolean {
    const text = this.#peek(MAX_XML_TOKEN_CHARS)
    const relevant = this.#active ? [this.#active.closeTag, ...this.#tags.map((tag) => tag.openTag)] : this.#tags.map((tag) => tag.openTag)
    if (relevant.some((token) => token.startsWith(text) && token !== text)) return true
    if (!this.#active && !this.#fence && !this.#lineStart && /^`+$/.test(text) && this.#remaining() <= MAX_XML_TOKEN_CHARS) return true
    if (!this.#active && text.startsWith('<') && /[A-Za-z/]/.test(text[1] ?? '') && !text.includes('>') && this.#remaining() <= MAX_XML_TOKEN_CHARS) return true
    return false
  }

  #readFenceDelimiter(): { marker: '`' | '~'; width: number; consumed: number; pending: boolean } | null {
    let spaces = 0
    while (spaces < 3 && this.#queue[this.#queueCursor + spaces]?.char === ' ') spaces += 1
    const marker = this.#queue[this.#queueCursor + spaces]?.char
    if (marker !== '`' && marker !== '~') return null
    let width = 0
    while (spaces + width < this.#remaining() && this.#queue[this.#queueCursor + spaces + width]!.char === marker) width += 1
    if (width < 3 && spaces + width < this.#remaining()) return null
    return { marker, width, consumed: spaces + width, pending: spaces + width === this.#remaining() }
  }

  #applyFenceDelimiter(marker: '`' | '~', width: number): void {
    if (width < 3) return
    if (!this.#fence) this.#fence = { marker, width }
    else if (marker === this.#fence.marker && width >= this.#fence.width) this.#fence = null
  }

  #safeBatchLength(): number {
    const limit = Math.min(this.#remaining(), PROCESS_BATCH_CHARS)
    if (limit < 2) return limit
    for (let offset = 1; offset < limit; offset += 1) {
      const char = this.#queue[this.#queueCursor + offset]!.char
      if (char === '`' || (!this.#active && char === '\n')) return offset
      const next = this.#queue[this.#queueCursor + offset + 1]?.char
      const tokenCandidate = this.#tags.some((tag) => [tag.openTag, tag.closeTag].some((token) => {
        return token[0] === char && (next === undefined || token[1] === next)
      }))
      const xmlCandidate = char === '<' && /[A-Za-z/]/.test(next ?? '')
      if (tokenCandidate || xmlCandidate) {
        const suffix = this.#peekFrom(offset, MAX_XML_TOKEN_CHARS)
        if (this.#tags.some((tag) => suffix.startsWith(tag.openTag) || suffix.startsWith(tag.closeTag) || tag.openTag.startsWith(suffix) || tag.closeTag.startsWith(suffix)) || xmlCandidate) return offset
      }
    }
    return limit
  }

  #updateXmlState(lookahead: string): void {
    if (!lookahead.startsWith('<') || !/[A-Za-z/]/.test(lookahead[1] ?? '') || this.#tags.some((tag) => lookahead.startsWith(tag.openTag) || lookahead.startsWith(tag.closeTag))) return
    const close = lookahead.indexOf('>')
    if (close < 0 || close > MAX_XML_TOKEN_CHARS) return
    const xml = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:_-]*)\b[^>]*>$/.exec(lookahead.slice(0, close + 1))
    if (!xml) return
    const name = xml[2]!.toLowerCase()
    if (xml[1]) {
      if (this.#xmlStack.at(-1) === name) this.#xmlStack.pop()
    } else if (!xml[0].endsWith('/>')) {
      if (this.#xmlStack.length >= MAX_XML_DEPTH) throw new Error('compatible_inline_literal_depth_exceeded')
      this.#xmlStack.push(name)
    }
  }

  #appendContentUnit(unit: Unit): void {
    appendUnit(this.#content, unit, this.#encoder)
    this.#trackLine(unit.char)
  }

  #appendReasoningUnit(unit: Unit): void {
    appendUnit(this.#reasoning, unit, this.#encoder)
    if (this.#reasoning.bytes > MAX_REASONING_BYTES) throw new Error('compatible_reasoning_value_overflow')
    this.#trackLine(unit.char)
  }

  #appendContentUnits(units: readonly Unit[]): void {
    appendUnits(this.#content, units, this.#encoder)
    for (const unit of units) this.#trackLine(unit.char)
  }

  #appendReasoningUnits(units: readonly Unit[]): void {
    appendUnits(this.#reasoning, units, this.#encoder)
    if (this.#reasoning.bytes > MAX_REASONING_BYTES) throw new Error('compatible_reasoning_value_overflow')
    for (const unit of units) this.#trackLine(unit.char)
  }

  #appendUnitsToContent(units: readonly Unit[]): void {
    units.forEach((unit) => this.#appendContentUnit(unit))
  }

  #appendTextToContent(buffer: BufferState): void {
    if (!buffer.text) return
    appendText(this.#content, buffer.text, buffer.sequenceStart, buffer.sequenceEnd, this.#encoder)
  }

  #trackLine(char: string): void {
    this.#lineStart = char === '\n'
    this.#lineTail = char === '\n' ? '' : (this.#lineTail + char).slice(-32)
  }

  #flushContent(force: boolean): void {
    if (!this.#content.text || !force) return
    this.#emitBlock('content', this.#content, null, null)
    this.#content = emptyBuffer()
  }

  #flushReasoning(): void {
    if (this.#reasoning.text.trim()) this.#emitBlock('reasoning', this.#reasoning, this.#activeTagPairId, this.#reasoningOrdinal++)
    this.#reasoning = emptyBuffer()
  }

  #emitBlock(kind: 'content' | 'reasoning', buffer: BufferState, tagPairId: string | null, reasoningOrdinal: number | null): void {
    if (!buffer.text) return
    if (this.#blocks.length >= MAX_BLOCKS) throw new Error('compatible_inline_segment_limit_exceeded')
    const blockOrdinal = this.#blockOrdinal++
    this.#blocks.push(Object.freeze({
      blockId: kind === 'reasoning' ? `${this.#choiceKey}:inline-reasoning:${reasoningOrdinal}` : `${this.#choiceKey}:inline-content:${blockOrdinal}`,
      segmentOrdinal: blockOrdinal,
      reasoningSegmentOrdinal: reasoningOrdinal,
      kind,
      tagPairId,
      sequenceStart: buffer.sequenceStart ?? this.#lastSequence,
      sequenceEnd: buffer.sequenceEnd ?? this.#lastSequence,
      text: buffer.text,
    }))
  }

  #diagnose(code: CompatibleInlineDiagnostic): void {
    if (this.#diagnostics.length < MAX_DIAGNOSTICS) this.#diagnostics.push(code)
  }

  #takeOne(): Unit {
    const unit = this.#queue[this.#queueCursor++]!
    this.#compactQueue()
    return unit
  }

  #takeText(length: number): Unit[] {
    const units = this.#queue.slice(this.#queueCursor, this.#queueCursor + length)
    this.#queueCursor += units.length
    this.#compactQueue()
    return units
  }

  #peek(max: number): string {
    return this.#queue.slice(this.#queueCursor, this.#queueCursor + max).map((unit) => unit.char).join('')
  }

  #peekFrom(offset: number, max: number): string {
    return this.#queue.slice(this.#queueCursor + offset, this.#queueCursor + offset + max).map((unit) => unit.char).join('')
  }

  #remaining(): number {
    return this.#queue.length - this.#queueCursor
  }

  #compactQueue(): void {
    if (this.#queueCursor < 4096 || this.#queueCursor * 2 < this.#queue.length) return
    this.#queue = this.#queue.slice(this.#queueCursor)
    this.#queueCursor = 0
  }

  #snapshot(pending: boolean): Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[]; pending: boolean }> {
    const blocks = [...this.#blocks]
    if (this.#content.text) {
      const blockOrdinal = this.#blockOrdinal
      blocks.push(Object.freeze({ blockId: `${this.#choiceKey}:inline-content:${blockOrdinal}`, segmentOrdinal: blockOrdinal, reasoningSegmentOrdinal: null, kind: 'content' as const, tagPairId: null, sequenceStart: this.#content.sequenceStart ?? this.#lastSequence, sequenceEnd: this.#content.sequenceEnd ?? this.#lastSequence, text: this.#content.text }))
    }
    return Object.freeze({ blocks: Object.freeze(blocks), diagnostics: Object.freeze([...this.#diagnostics]), pending })
  }
}

function emptyBuffer(): BufferState {
  return { text: '', sequenceStart: null, sequenceEnd: null, bytes: 0, committedBytes: 0, pendingHighSurrogate: '' }
}

function appendUnit(buffer: BufferState, unit: Unit, encoder: TextEncoder): void {
  appendText(buffer, unit.char, unit.sequence, unit.sequence, encoder)
}

function appendUnits(buffer: BufferState, units: readonly Unit[], encoder: TextEncoder): void {
  if (units.length === 0) return
  const text = units.map((unit) => unit.char).join('')
  appendText(buffer, text, units[0]!.sequence, units.at(-1)!.sequence, encoder)
}

function appendText(buffer: BufferState, text: string, sequenceStart: number | null, sequenceEnd: number | null, encoder: TextEncoder): void {
  if (!text) return
  const byteInput = buffer.pendingHighSurrogate + text
  const nextPendingHighSurrogate = /[\uD800-\uDBFF]$/.test(byteInput) ? byteInput.at(-1)! : ''
  const committedByteInput = nextPendingHighSurrogate ? byteInput.slice(0, -1) : byteInput
  buffer.committedBytes += encoder.encode(committedByteInput).byteLength
  buffer.pendingHighSurrogate = nextPendingHighSurrogate
  buffer.bytes = buffer.committedBytes + (nextPendingHighSurrogate ? encoder.encode(nextPendingHighSurrogate).byteLength : 0)
  if (buffer.sequenceStart === null) buffer.sequenceStart = sequenceStart
  buffer.sequenceEnd = sequenceEnd
  buffer.text += text
}

function leadingRun(text: string, marker: string): number {
  let width = 0
  while (text[width] === marker) width += 1
  return width
}

function markdownDelimiterConflict(token: string): boolean {
  return /^ {0,3}(?:`+|~{3,})/.test(token)
}

function isLiteralExampleTail(lineTail: string): boolean {
  return /(?:example|xml|html)\s*:\s*$/i.test(lineTail)
}

export function projectCompatibleInlineBlocks(input: Readonly<{ context: CompatibleExtensionContext; choiceIndex: number; blocks: readonly CompatibleInlineBlock[] }>): readonly CompatibleReasoningCandidate[] {
  return Object.freeze(input.blocks.filter((block) => block.kind === 'reasoning' && block.tagPairId && block.text.trim()).map((block) => Object.freeze({
    context: input.context,
    choiceIndex: input.choiceIndex,
    sequence: block.sequenceEnd,
    phase: 'stream' as const,
    source: 'inline' as const,
    sourceKey: `inline:${block.tagPairId}`,
    mode: 'snapshot' as const,
    value: block.text,
    segmentId: block.blockId,
    segmentOrdinal: block.reasoningSegmentOrdinal ?? undefined,
    sequenceStart: block.sequenceStart,
  })))
}

export function reconcileCompatibleInlineFinal(input: Readonly<{ streamBlocks: readonly CompatibleInlineBlock[]; finalBlocks: readonly CompatibleInlineBlock[] }>): Readonly<{ blocks: readonly CompatibleInlineBlock[]; diagnostics: readonly CompatibleInlineDiagnostic[] }> {
  const streamReasoning = input.streamBlocks.filter((block) => block.kind === 'reasoning')
  const finalReasoning = input.finalBlocks.filter((block) => block.kind === 'reasoning')
  if (finalReasoning.length === 0) return Object.freeze({ blocks: Object.freeze([...input.streamBlocks]), diagnostics: Object.freeze([]) })
  const sameIdentity = streamReasoning.length === 0 || (streamReasoning.length === finalReasoning.length && streamReasoning.every((block, index) => block.tagPairId === finalReasoning[index]?.tagPairId && block.reasoningSegmentOrdinal === finalReasoning[index]?.reasoningSegmentOrdinal))
  if (!sameIdentity) return Object.freeze({ blocks: Object.freeze([...input.streamBlocks]), diagnostics: Object.freeze(['final_snapshot_mismatch' as const]) })
  return Object.freeze({ blocks: Object.freeze([...input.finalBlocks]), diagnostics: Object.freeze([]) })
}
