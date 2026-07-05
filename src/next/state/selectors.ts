import type { MessageState, MessageVM, ReasoningDisplayBlock, ReasoningPiece, ReasoningViewVisibility, RootState, RunVM } from './types'
import { beginDeriveMeasure, endDeriveMeasure, recordDerive } from './perfMetrics'
import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'
import { createDiagnosticsLogger, publishPhase3PieceSnapshot } from '@/shared/diagnostics/bridge'
import { recordSelectorsDerive, isSchedDiagEnabled, startTimer } from './schedulerDiagnostics'

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

function normalizeReasoningPieces(raw: ReadonlyArray<ReasoningPiece> | undefined): ReasoningPiece[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const pieces = raw.filter((piece) => {
    if (piece?.type === 'text') return piece.text.trim().length > 0
    if (piece?.type === 'image') return piece.url.trim().length > 0
    return false
  })
  return pieces.length > 0 ? pieces : undefined
}

function logPieceCount(messageId: string, pieces: ReasoningPiece[], lastPieceLen?: number): void {
  if (!diagnosticsFlags.phase3Audit) return
  if (!Array.isArray(pieces) || pieces.length === 0) return
  const now = Date.now()
  if (now - lastPieceReportTime < 1000) return
  lastPieceReportTime = now
  const count = pieces.length
  const totalChars = pieces.reduce((sum, piece) => sum + (piece.type === 'text' ? piece.text.length : 0), 0)
  const lastPiece = pieces[count - 1]
  const resolvedLastLen =
    typeof lastPieceLen === 'number'
      ? lastPieceLen
      : (lastPiece?.type === 'text' ? lastPiece.text.length : 0)
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
  hasReasoningDisplayBlocks: boolean,
  requestedReasoningExclude: boolean
): ReasoningViewVisibility {
  // If we have encrypted signal or actual reasoning content → shown
  if (hasEncryptedReasoning || reasoningDetailsRaw.length > 0 || hasReasoningDisplayBlocks) {
    return 'shown'
  }
  // No reasoning content: distinguish excluded vs not_returned
  if (requestedReasoningExclude) {
    return 'excluded'
  }
  return 'not_returned'
}

function normalizeReasoningDisplayBlocks(raw: ReadonlyArray<ReasoningDisplayBlock> | undefined): ReasoningDisplayBlock[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const blocks = raw.filter((block) => {
    if (block?.type === 'text') return block.text.trim().length > 0
    if (block?.type === 'image') return block.url.trim().length > 0
    if (block?.type === 'opaque') return block.label.trim().length > 0
    return false
  }).slice().sort((a, b) => a.ordinal - b.ordinal)
  return blocks.length > 0 ? blocks : undefined
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
  const displayBlocks = normalizeReasoningDisplayBlocks(m.reasoningDisplayBlocks)
  const hasPieces = Array.isArray(normalizedPieces) && normalizedPieces.length > 0

  // 监控 piece 数量
  if (hasPieces && normalizedPieces) {
    logPieceCount(messageId, normalizedPieces, m.reasoningLastPieceLen)
  }

  let summaryText = m.reasoningSummaryText
  let reasoningText: string | undefined
  let reasoningPieces: ReasoningPiece[] | undefined

  // Display blocks are the UI SSOT. Raw reasoning details remain semantic only.
  if (hasPieces) {
    reasoningPieces = normalizedPieces
    // 使用 pieces 时不需要 reasoningText
  } else if (summaryText) {
    // 仅有 summary（常见于 summary-only 流）
    reasoningText = m.reasoningStreamingText
  }

  if (!reasoningText && !reasoningPieces && m.reasoningStreamingText.length > 0) {
    reasoningText = m.reasoningStreamingText
  }

  const visibility = computeReasoningVisibility(
    m.hasEncryptedReasoning,
    m.reasoningDetailsRaw,
    !!displayBlocks,
    m.requestedReasoningExclude
  )

  const derived: MessageVM = {
    messageId: m.messageId,
    role: m.role,
    contentBlocks: m.contentBlocks,
    ...(m.requestedImageGeneration === true ? { requestedImageGeneration: true } : {}),
    ...(Array.isArray(m.annotations) && m.annotations.length > 0 ? { annotations: m.annotations } : {}),
    toolCalls: m.toolCalls,
    errorEnvelope: m.errorEnvelope ?? null,
    errorSummary: m.errorSummary ?? null,
    reasoningView: {
      summaryText,
      reasoningText,
      ...(displayBlocks ? { displayBlocks } : { reasoningPieces }),
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
