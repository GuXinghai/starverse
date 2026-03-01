import type {
  CompletionOutcome,
  MessageAnnotation,
  MessageState,
  ReasoningPiece,
  RootState,
  RunState,
  StreamEndReason,
  ToolCallDelta,
  ToolCallVM,
} from '../types'
import type { CompletionClass, ErrorPhase, ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import { ReasoningDetailStreamMerger } from '../reasoningDetailStreamMerger'
import type { ReducerCoreOptions } from './reducerTypes'

const REASONING_PIECE_MAX_CHARS = 2048

export function getNow(options?: ReducerCoreOptions): number {
  return options?.now ? options.now() : 0
}

export function createGeneratedId(prefix: string, options?: ReducerCoreOptions): string {
  if (options?.generateId) return options.generateId(prefix)
  throw new Error(`startGenerationCore requires options.generateId when ${prefix} id is missing`)
}

export function createSeededReasoningMerger(seedDetails?: ReadonlyArray<unknown>): ReasoningDetailStreamMerger {
  const merger = new ReasoningDetailStreamMerger()
  if (Array.isArray(seedDetails) && seedDetails.length > 0) {
    for (const detail of seedDetails) {
      merger.merge(detail)
    }
  }
  return merger
}

function nextPieceIdFrom(pieces: ReasoningPiece[]): number {
  let maxId = 0
  for (const piece of pieces) {
    if (typeof piece.id === 'number' && piece.id > maxId) {
      maxId = piece.id
    }
  }
  return maxId + 1
}

export function appendReasoningPieces(prevPieces: ReasoningPiece[] | undefined, deltaText: string): { pieces: ReasoningPiece[]; lastLen: number } {
  if (!deltaText) {
    const lastLen = prevPieces && prevPieces.length > 0 ? prevPieces[prevPieces.length - 1].text.length : 0
    return { pieces: prevPieces ?? [], lastLen }
  }

  const pieces: ReasoningPiece[] = Array.isArray(prevPieces) && prevPieces.length > 0
    ? [...prevPieces]
    : [{ id: 1, text: '' }]
  let nextPieceId = nextPieceIdFrom(pieces)
  let remaining = deltaText

  const lastIndex = pieces.length - 1
  const last = pieces[lastIndex]
  if (last.text.length < REASONING_PIECE_MAX_CHARS) {
    const space = REASONING_PIECE_MAX_CHARS - last.text.length
    if (space > 0) {
      const head = remaining.slice(0, space)
      pieces[lastIndex] = { ...last, text: last.text + head }
      remaining = remaining.slice(head.length)
    }
  }

  while (remaining.length > 0) {
    const chunk = remaining.slice(0, REASONING_PIECE_MAX_CHARS)
    pieces.push({ id: nextPieceId++, text: chunk })
    remaining = remaining.slice(chunk.length)
  }

  const lastLen = pieces.length > 0 ? pieces[pieces.length - 1].text.length : 0
  return { pieces, lastLen }
}

export function updateMessage(state: RootState, messageId: string, updater: (m: MessageState) => MessageState): RootState {
  const messages = state.entities?.messagesById ?? state.messages
  const prev = messages[messageId]
  if (!prev) return state
  const next = updater(prev)
  if (next === prev) return state
  messages[messageId] = next
  if (state.messages !== messages) {
    state.messages[messageId] = next
  }
  return {
    ...state,
    messages: state.messages,
    runMessageIds: state.runMessageIds,
    entities: state.entities,
    views: state.views,
  }
}

export function updateRun(state: RootState, runId: string, updater: (s: RunState) => RunState): RootState {
  const prev = state.runs[runId]
  if (!prev) return state
  const next = updater(prev)
  if (next === prev) return state
  state.runs[runId] = next
  return {
    ...state,
    runs: state.runs,
    messages: state.messages,
    runMessageIds: state.runMessageIds,
    entities: state.entities,
    views: state.views,
  }
}

export function inferHasEncrypted(detail: unknown): boolean {
  return !!(detail && typeof detail === 'object' && (detail as any).type === 'reasoning.encrypted')
}

export function normalizeToolCallDelta(input: unknown): ToolCallDelta | null {
  if (!input || typeof input !== 'object') return null
  const d = input as any
  const idx = typeof d.index === 'number' ? d.index : undefined
  const id = typeof d.id === 'string' ? d.id : undefined
  const type = typeof d.type === 'string' ? d.type : undefined

  let fn: ToolCallDelta['function'] | undefined
  if (d.function && typeof d.function === 'object') {
    const name = typeof d.function.name === 'string' ? d.function.name : undefined
    const args = typeof d.function.arguments === 'string' ? d.function.arguments : undefined
    if (name !== undefined || args !== undefined) {
      fn = { ...(name !== undefined ? { name } : {}), ...(args !== undefined ? { arguments: args } : {}) }
    }
  }

  if (idx === undefined && id === undefined && type === undefined && fn === undefined) return null
  return { ...(idx === undefined ? {} : { index: idx }), ...(id ? { id } : {}), ...(type ? { type } : {}), ...(fn ? { function: fn } : {}) }
}

export function normalizeAnnotation(input: unknown): MessageAnnotation | null {
  if (!input || typeof input !== 'object') return null
  return input as MessageAnnotation
}

export function annotationMergeKey(annotation: MessageAnnotation): string {
  const type = typeof annotation.type === 'string' ? annotation.type : ''
  const citation =
    annotation.url_citation && typeof annotation.url_citation === 'object'
      ? (annotation.url_citation as Record<string, unknown>)
      : null

  if (type === 'url_citation' && citation) {
    const url = typeof citation.url === 'string' ? citation.url : ''
    const start = typeof citation.start_index === 'number' ? citation.start_index : ''
    const end = typeof citation.end_index === 'number' ? citation.end_index : ''
    return `url_citation|${url}|${start}|${end}`
  }

  try {
    return `raw|${JSON.stringify(annotation)}`
  } catch {
    return `raw|${String(annotation)}`
  }
}

export function dedupeAnnotations(input: ReadonlyArray<MessageAnnotation>): MessageAnnotation[] {
  const out: MessageAnnotation[] = []
  const indexByKey = new Map<string, number>()
  for (const ann of input) {
    const key = annotationMergeKey(ann)
    const existingIndex = indexByKey.get(key)
    if (typeof existingIndex === 'number') {
      out[existingIndex] = ann
      continue
    }
    indexByKey.set(key, out.length)
    out.push(ann)
  }
  return out
}

export function areAnnotationListsEquivalent(
  left: ReadonlyArray<MessageAnnotation> | undefined,
  right: ReadonlyArray<MessageAnnotation> | undefined
): boolean {
  const l = Array.isArray(left) ? left : []
  const r = Array.isArray(right) ? right : []
  if (l.length !== r.length) return false
  for (let i = 0; i < l.length; i += 1) {
    if (annotationMergeKey(l[i]) !== annotationMergeKey(r[i])) return false
  }
  return true
}

export function hasSameImageBlock(blocks: ReadonlyArray<unknown>, url: string): boolean {
  const target = String(url ?? '')
  if (!target) return false
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    const row = block as any
    if (row.type !== 'image') continue
    if (typeof row.url === 'string' && row.url === target) return true
  }
  return false
}

export function mergeToolCalls(
  prev: ReadonlyArray<ToolCallVM>,
  deltas: ReadonlyArray<ToolCallDelta>,
  mergeStrategy: 'append' | 'replace'
): ToolCallVM[] {
  const byIndex = new Map<number, ToolCallVM>()
  for (const tc of prev) byIndex.set(tc.index, tc)

  let nextAutoIndex = prev.reduce((max, tc) => Math.max(max, tc.index), -1) + 1

  for (const rawDelta of deltas) {
    const idx = typeof rawDelta.index === 'number' ? rawDelta.index : nextAutoIndex++
    const existing = byIndex.get(idx) ?? { index: idx, argumentsText: '' }

    const name =
      typeof rawDelta.function?.name === 'string' && rawDelta.function.name.length > 0
        ? rawDelta.function.name
        : existing.name

    const argsChunk = typeof rawDelta.function?.arguments === 'string' ? rawDelta.function.arguments : undefined
    const argumentsText =
      argsChunk === undefined
        ? existing.argumentsText
        : mergeStrategy === 'append'
          ? existing.argumentsText + argsChunk
          : argsChunk

    const merged: ToolCallVM = {
      index: idx,
      id: typeof rawDelta.id === 'string' && rawDelta.id.length > 0 ? rawDelta.id : existing.id,
      type: typeof rawDelta.type === 'string' && rawDelta.type.length > 0 ? rawDelta.type : existing.type,
      name,
      argumentsText,
    }

    byIndex.set(idx, merged)
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

const endReasonPriority: Record<StreamEndReason, number> = {
  user_abort: 3,
  mid_stream_error: 2,
  transport_error: 2,
  pre_stream_error: 2,
  normal_complete: 1,
}

export function endReasonFromPhase(phase?: ErrorPhase): StreamEndReason {
  if (phase === 'pre_stream') return 'pre_stream_error'
  return 'mid_stream_error'
}

export function completionClassFromEnvelope(env?: ErrorEnvelope | null): CompletionClass {
  if (!env) return 'error'
  return env.completionClass ?? 'error'
}

export function completionOutcomeFromFinishReason(finishReason: string | undefined): CompletionOutcome | undefined {
  const reason = typeof finishReason === 'string' ? finishReason.trim() : ''
  if (!reason) return undefined
  switch (reason) {
    case 'stop':
      return 'complete'
    case 'length':
      return 'truncated'
    case 'content_filter':
      return 'filtered'
    case 'tool_calls':
      return 'tool_calls'
    case 'unknown':
      return 'unknown'
    default:
      return 'unknown'
  }
}

export function resolveEndReason(prev?: StreamEndReason, next?: StreamEndReason): StreamEndReason | undefined {
  if (!next) return prev
  if (!prev) return next
  return endReasonPriority[next] > endReasonPriority[prev] ? next : prev
}

function computeDurationMs(run: RunState): { durationMs: number | null; isFallback: boolean } {
  if (typeof run.localProcessingDurationMs === 'number' && Number.isFinite(run.localProcessingDurationMs)) {
    return { durationMs: Math.max(0, run.localProcessingDurationMs), isFallback: false }
  }
  if (typeof run.tAck === 'number' && typeof run.tEnd === 'number') {
    return { durationMs: Math.max(0, run.tEnd - run.tAck), isFallback: false }
  }
  // tAck 缺失：默认 NULL（不做降级计算）
  return { durationMs: null, isFallback: false }
}

export function freezeOutputStartIfNeeded(
  state: RootState,
  runId: string,
  messageId: string | undefined,
  options?: ReducerCoreOptions
): RootState {
  const run = state.runs[runId]
  if (!run) return state
  if (run.timingFinalized) return state
  if (!run.targetAssistantMessageId || !messageId || run.targetAssistantMessageId !== messageId) return state
  if (typeof run.tEnd === 'number') return state

  const now = getNow(options)
  return updateRun(state, runId, (s) => {
    if (s.timingFinalized) return s
    if (typeof s.tEnd === 'number') return s
    const duration = typeof s.tAck === 'number' ? Math.max(0, now - s.tAck) : s.localProcessingDurationMs
    return {
      ...s,
      tEnd: now,
      localProcessingDurationMs: duration,
    }
  })
}

export function finalizeRunTiming(
  state: RootState,
  runId: string,
  endReasonHint: StreamEndReason | undefined,
  options?: ReducerCoreOptions
): RootState {
  const run = state.runs[runId]
  if (!run) return state
  if (run.timingFinalized) return state

  const assistantMessageId = run.targetAssistantMessageId
  const ensuredTEnd = typeof run.tEnd === 'number' ? run.tEnd : getNow(options)
  const runWithEnd = typeof run.tEnd === 'number'
    ? run
    : { ...run, tEnd: ensuredTEnd }
  if (!assistantMessageId) {
    return updateRun(state, runId, (s) => ({
      ...s,
      tEnd: typeof s.tEnd === 'number' ? s.tEnd : ensuredTEnd,
      endReason: resolveEndReason(s.endReason, endReasonHint),
      timingFinalized: true,
    }))
  }

  const resolvedEndReason = resolveEndReason(runWithEnd.endReason, endReasonHint)
  const timing = computeDurationMs(runWithEnd)

  let nextState = updateRun(state, runId, (s) => ({
    ...s,
    tEnd: typeof s.tEnd === 'number' ? s.tEnd : ensuredTEnd,
    endReason: resolvedEndReason ?? s.endReason,
    localProcessingDurationMs: typeof s.localProcessingDurationMs === 'number' ? s.localProcessingDurationMs : (timing.durationMs ?? s.localProcessingDurationMs),
    timingFinalized: true,
  }))

  nextState = updateMessage(nextState, assistantMessageId, (m) => {
    const nextDuration = m.reasoningDurationMs !== undefined ? m.reasoningDurationMs : timing.durationMs
    const nextEndReason = m.reasoningEndReason ?? resolvedEndReason
    const nextFallback = m.reasoningDurationIsFallback ?? (timing.isFallback ? true : undefined)
    return {
      ...m,
      reasoningDurationMs: nextDuration,
      reasoningEndReason: nextEndReason,
      reasoningDurationIsFallback: nextFallback,
    }
  })

  return nextState
}
