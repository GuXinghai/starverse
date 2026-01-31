import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'
import { createDiagnosticsLogger } from '@/shared/diagnostics/bridge'

const diagnosticsFlags = getDiagnosticsFlags()
const diagnosticsLogger = createDiagnosticsLogger(diagnosticsFlags)

type RefAuditSnapshot = Readonly<{
  stable?: number
  changed?: number
  stableRatio?: number
}>

type PerfSnapshot = Readonly<{
  bubbleUpdateCount?: number
  bubbleUpdateTotalPerSec?: number
  bubbleUpdateUniquePerSec?: number
  fallbackReplayPerSec?: number
  mergeOpsPerSec?: number
  mergeDurationAvgMs?: number
}>

type PieceSnapshot = Readonly<{
  messageId?: string
  count?: number
  reasoningTotalChars?: number
  reasoningLastPieceLen?: number
  pieceSplitCountPerSec?: number
}>

export type Phase3AuditSnapshot = Readonly<{
  t: number
  stable?: number
  changed?: number
  stableRatio?: number
  bubbleUpdateCount?: number
  bubbleUpdateTotalPerSec?: number
  bubbleUpdateUniquePerSec?: number
  fallbackReplayPerSec?: number
  pieceCount?: number
  reasoningTotalChars?: number
  reasoningLastPieceLen?: number
  pieceSplitCountPerSec?: number
  mergeOpsPerSec?: number
  mergeAvgMs?: number
}>

function readRefAuditSnapshot(): RefAuditSnapshot | null {
  const raw = (globalThis as any).__svRefAuditSnapshot
  if (!raw || typeof raw !== 'object') return null
  return raw as RefAuditSnapshot
}

function readPerfSnapshot(): PerfSnapshot | null {
  const raw = (globalThis as any).__svPerfSnapshot
  if (!raw || typeof raw !== 'object') return null
  return raw as PerfSnapshot
}

function readPieceSnapshot(): PieceSnapshot | null {
  const raw = (globalThis as any).__svPhase3PieceCount
  if (!raw || typeof raw !== 'object') return null
  return raw as PieceSnapshot
}

export function runPhase3Audit(): Phase3AuditSnapshot | null {
  if (!diagnosticsFlags.phase3Audit) return null
  const ref = readRefAuditSnapshot()
  const perf = readPerfSnapshot()
  const pieces = readPieceSnapshot()

  const snapshot: Phase3AuditSnapshot = {
    t: Date.now(),
    stable: ref?.stable,
    changed: ref?.changed,
    stableRatio: ref?.stableRatio,
    bubbleUpdateCount: perf?.bubbleUpdateCount,
    bubbleUpdateTotalPerSec: perf?.bubbleUpdateTotalPerSec,
    bubbleUpdateUniquePerSec: perf?.bubbleUpdateUniquePerSec,
    fallbackReplayPerSec: perf?.fallbackReplayPerSec,
    pieceCount: pieces?.count,
    reasoningTotalChars: pieces?.reasoningTotalChars,
    reasoningLastPieceLen: pieces?.reasoningLastPieceLen,
    pieceSplitCountPerSec: pieces?.pieceSplitCountPerSec,
    mergeOpsPerSec: perf?.mergeOpsPerSec,
    mergeAvgMs: perf?.mergeDurationAvgMs,
  }

  diagnosticsLogger.log('phase3-audit', snapshot)
  return snapshot
}

export function startPhase3AuditTicker(intervalMs = 1000): () => void {
  if (!diagnosticsFlags.phase3Audit) return () => {}
  const handle = setInterval(() => {
    runPhase3Audit()
  }, intervalMs)
  return () => clearInterval(handle)
}
