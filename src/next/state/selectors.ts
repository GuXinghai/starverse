import type { MessageState, MessageVM, ReasoningPiece, ReasoningViewVisibility, RootState, RunVM } from './types'
import { ReasoningDetailStreamMerger, buildDetailKey } from './reasoningDetailStreamMerger'
import { beginDeriveMeasure, endDeriveMeasure, recordDerive, recordFallbackReplay } from './perfMetrics'
import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'
import { createDiagnosticsLogger, publishPhase3PieceSnapshot } from '@/shared/diagnostics/bridge'
import { recordSelectorsDerive, isSchedDiagEnabled, startTimer } from './schedulerDiagnostics'

// fallbackReplayCount 监控
let fallbackReplayCount = 0
let lastFallbackReportTime = Date.now()
let lastPieceReportTime = Date.now()
const lastPieceCounts = new Map<string, { count: number; t: number }>()
const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true
const diagnosticsFlags = getDiagnosticsFlags()
const diagnosticsLogger = createDiagnosticsLogger(diagnosticsFlags)

type MessageCacheEntry = Readonly<{ source: MessageState; derived: MessageVM }>
const messageCache = new Map<string, MessageCacheEntry>()

type TranscriptCacheEntry = Readonly<{
  idsRef: string[]
  messageRefs: ReadonlyArray<MessageState | undefined>
  result: MessageVM[]
}>
const transcriptCache = new Map<string, TranscriptCacheEntry>()

function recordFallbackReplayLocal(): void {
  if (!diagnosticsFlags.perf) return
  fallbackReplayCount++
  const now = Date.now()
  if (now - lastFallbackReportTime >= 1000) {
    const rate = fallbackReplayCount / ((now - lastFallbackReportTime) / 1000)
    diagnosticsLogger.log('fallback-replay', { rate: Number(rate.toFixed(2)), total: fallbackReplayCount })
    fallbackReplayCount = 0
    lastFallbackReportTime = now
  }
  // 同时记录到全局性能指标
  recordFallbackReplay()
}

function normalizeReasoningPieces(raw: ReadonlyArray<ReasoningPiece> | undefined): ReasoningPiece[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const pieces = raw.filter((piece) => typeof piece?.text === 'string' && piece.text.trim().length > 0)
  return pieces.length > 0 ? pieces : undefined
}

function logPieceCount(messageId: string, pieces: ReasoningPiece[], lastPieceLen?: number): void {
  if (!diagnosticsFlags.phase3Audit) return
  if (!Array.isArray(pieces) || pieces.length === 0) return
  const now = Date.now()
  if (now - lastPieceReportTime < 1000) return
  lastPieceReportTime = now
  const count = pieces.length
  const totalChars = pieces.reduce((sum, piece) => sum + (piece?.text?.length ?? 0), 0)
  const resolvedLastLen =
    typeof lastPieceLen === 'number'
      ? lastPieceLen
      : (pieces[count - 1]?.text?.length ?? 0)
  const prev = lastPieceCounts.get(messageId)
  const elapsedMs = prev ? Math.max(1, now - prev.t) : 1000
  const delta = prev ? Math.max(0, count - prev.count) : 0
  const pieceSplitCountPerSec = delta / (elapsedMs / 1000)
  lastPieceCounts.set(messageId, { count, t: now })
  diagnosticsLogger.log('piece-count', { messageId: messageId.slice(-8), count })
  if (isDev) {
    publishPhase3PieceSnapshot({
      t: now,
      messageId,
      count,
      reasoningTotalChars: totalChars,
      reasoningLastPieceLen: resolvedLastLen,
      pieceSplitCountPerSec,
    })
  }
}

export function selectRun(state: RootState, runId: string): RunVM | null {
  const s = state.runs[runId]
  if (!s) return null
  return {
    runId: s.runId,
    status: s.status,
    requestId: s.requestId,
    generationId: s.generationId,
    model: s.model,
    provider: s.provider,
    finishReason: s.finishReason,
    nativeFinishReason: s.nativeFinishReason,
    completionOutcome: s.completionOutcome,
    usage: s.usage,
    error: s.error,
    localProcessingDurationMs: s.localProcessingDurationMs,
    tAck: s.tAck,
  }
}

/**
 * Compute reasoning visibility based on SSOT Section 3.4 rules:
 * - 'shown': has encrypted reasoning OR has reasoning_details/raw content
 * - 'excluded': request had reasoning.exclude=true AND no reasoning returned (intentional hide)
 * - 'not_returned': no exclude requested but model didn't return reasoning (provider didn't provide)
 *
 * CRITICAL: We NEVER infer 'encrypted' from empty reasoning. Encrypted is only set
 * when we see explicit `reasoning.encrypted` type in the response.
 */
function computeReasoningVisibility(
  hasEncryptedReasoning: boolean,
  reasoningDetailsRaw: unknown[],
  requestedReasoningExclude: boolean
): ReasoningViewVisibility {
  // If we have encrypted signal or actual reasoning content → shown
  if (hasEncryptedReasoning || reasoningDetailsRaw.length > 0) {
    return 'shown'
  }
  // No reasoning content: distinguish excluded vs not_returned
  if (requestedReasoningExclude) {
    return 'excluded'
  }
  return 'not_returned'
}

function deriveReasoningDisplayFromDetails(reasoningDetailsRaw: unknown[]): {
  summaryText?: string
  reasoningText?: string
} {
  // 使用 Merger 重放，统一快照/增量语义
  const merger = new ReasoningDetailStreamMerger()
  const firstSeenOrder = new Map<string, number>()
  let order = 0

  for (const detail of reasoningDetailsRaw) {
    if (!detail || typeof detail !== 'object') continue
    merger.merge(detail)
    const key = buildDetailKey(detail as any)
    if (!firstSeenOrder.has(key)) {
      firstSeenOrder.set(key, order++)
    }
  }

  const snapshots = merger.getMergedSnapshots()
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    const ai = typeof a.index === 'number' ? a.index : Number.POSITIVE_INFINITY
    const bi = typeof b.index === 'number' ? b.index : Number.POSITIVE_INFINITY
    if (ai !== bi) return ai - bi
    const aKey = buildDetailKey(a)
    const bKey = buildDetailKey(b)
    return (firstSeenOrder.get(aKey) ?? 0) - (firstSeenOrder.get(bKey) ?? 0)
  })

  let summaryText: string | undefined
  const reasoningTextParts: string[] = []

  for (const detail of sortedSnapshots) {
    const type = (detail as any).type

    if (type === 'reasoning.text') {
      const text = (detail as any).text
      if (typeof text === 'string' && text.length > 0) reasoningTextParts.push(text)
      continue
    }

    if (type === 'reasoning.summary') {
      const summary = (detail as any).summary ?? (detail as any).text
      if (typeof summary === 'string' && summary.length > 0) summaryText = summary
      continue
    }
  }

  const reasoningText = reasoningTextParts.length > 0 ? reasoningTextParts.join('') : undefined
  return { summaryText, reasoningText }
}

export function selectMessage(state: RootState, messageId: string): MessageVM | null {
  const messagesById = state.entities?.messagesById ?? state.messages
  const m = messagesById[messageId]
  if (!m) return null

  const cached = messageCache.get(messageId)
  if (cached && cached.source === m) return cached.derived

  // 诊断计时
  const diagEnabled = isSchedDiagEnabled()
  const endTimer = diagEnabled ? startTimer() : null
  let usedFallback = false

  const normalizedPieces = normalizeReasoningPieces(m.reasoningPieces)
  const hasPieces = Array.isArray(normalizedPieces) && normalizedPieces.length > 0
  const hasDetails = Array.isArray(m.reasoningDetailsRaw) && m.reasoningDetailsRaw.length > 0

  // 监控 piece 数量
  if (hasPieces && normalizedPieces) {
    logPieceCount(messageId, normalizedPieces, m.reasoningLastPieceLen)
  }

  let summaryText = m.reasoningSummaryText
  let reasoningText: string | undefined
  let reasoningPieces: ReasoningPiece[] | undefined

  // 优先使用增量 pieces，必要时才回退全量重放
  if (hasPieces) {
    reasoningPieces = normalizedPieces
    // 使用 pieces 时不需要 reasoningText
  } else if (summaryText) {
    // 仅有 summary（常见于 summary-only 流）
    reasoningText = m.reasoningStreamingText
  } else if (hasDetails) {
    // 回退到全量重放
    usedFallback = true
    recordFallbackReplayLocal()
    const derived = deriveReasoningDisplayFromDetails(m.reasoningDetailsRaw)
    summaryText = summaryText ?? derived.summaryText
    reasoningText = derived.reasoningText
  }

  if (!reasoningText && !reasoningPieces) {
    reasoningText = m.reasoningStreamingText
  }

  const visibility = computeReasoningVisibility(
    m.hasEncryptedReasoning,
    m.reasoningDetailsRaw,
    m.requestedReasoningExclude
  )

  const derived: MessageVM = {
    messageId: m.messageId,
    role: m.role,
    contentBlocks: m.contentBlocks,
    toolCalls: m.toolCalls,
    errorEnvelope: m.errorEnvelope ?? null,
    errorSummary: m.errorSummary ?? null,
    reasoningView: {
      summaryText,
      reasoningText,
      reasoningPieces,
      hasEncrypted: m.hasEncryptedReasoning,
      visibility,
      panelState: m.reasoningPanelState,
    },
    reasoningDurationMs: m.reasoningDurationMs,
    reasoningEndReason: m.reasoningEndReason,
    reasoningDurationIsFallback: m.reasoningDurationIsFallback,
    streaming: m.streaming,
  }

  messageCache.set(messageId, { source: m, derived })

  // 记录诊断数据
  if (diagEnabled && endTimer) {
    recordSelectorsDerive({
      deriveMs: endTimer(),
      fallbackReplay: usedFallback,
    })
  }

  return derived
}

export function selectTranscript(state: RootState, runId: string): MessageVM[] {
  const measureId = beginDeriveMeasure()
  const ids = state.views?.transcriptsByRunId?.[runId] ?? []
  const messagesById = state.entities?.messagesById ?? state.messages

  const cached = transcriptCache.get(runId)
  if (cached && cached.idsRef === ids && cached.messageRefs.length === ids.length) {
    let same = true
    for (let i = 0; i < ids.length; i += 1) {
      if (cached.messageRefs[i] !== messagesById[ids[i]]) {
        same = false
        break
      }
    }
    if (same) {
      const duration = endDeriveMeasure(measureId)
      recordDerive(duration)
      return cached.result
    }
  }

  const messageRefs: Array<MessageState | undefined> = new Array(ids.length)
  const result: MessageVM[] = []
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]
    const msg = messagesById[id]
    messageRefs[i] = msg
    if (!msg) continue
    const vm = selectMessage(state, id)
    if (vm) result.push(vm)
  }

  const duration = endDeriveMeasure(measureId)
  recordDerive(duration)
  transcriptCache.set(runId, { idsRef: ids, messageRefs, result })
  return result
}

export type TokenUsage = Readonly<{
  promptTokens: number
  completionTokens: number
  totalTokens: number
}>

function normalizeTokenUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null
  const u = usage as any

  const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : null
  const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : null
  const totalTokens = typeof u.total_tokens === 'number' ? u.total_tokens : null

  if (promptTokens == null && completionTokens == null && totalTokens == null) return null

  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  }
}

export function selectUsageThisTurn(state: RootState, runId: string): TokenUsage | null {
  const run = state.runs[runId]
  if (!run) return null
  return normalizeTokenUsage(run.usage)
}

export function selectUsageSessionTotalDerived(state: RootState): TokenUsage | null {
  let sumPrompt = 0
  let sumCompletion = 0
  let sumTotal = 0
  let hasAny = false

  for (const runId of Object.keys(state.runs)) {
    const run = state.runs[runId]
    const u = normalizeTokenUsage(run?.usage)
    if (!u) continue
    hasAny = true
    sumPrompt += u.promptTokens
    sumCompletion += u.completionTokens
    sumTotal += u.totalTokens
  }

  if (!hasAny) return null
  return { promptTokens: sumPrompt, completionTokens: sumCompletion, totalTokens: sumTotal }
}
