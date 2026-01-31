import type { DiagnosticsFlags } from './flags'
import { getDiagnosticsFlags } from './flags'
import {
  snapshotAndReset,
  recordCommit,
  recordDelta,
  recordDerive,
  recordFallbackReplay,
  recordMergeOp,
  recordUpdatedMessages,
  recordBubbleUpdate,
} from '@/next/state/perfMetrics'
import {
  initSchedDiag,
  installSchedDiagHook,
  uninstallSchedDiagHook,
} from '@/next/state/schedulerDiagnostics'

export type DiagnosticsLogger = Readonly<{
  log: (tag: string, payload: unknown) => void
  logLazy: (tag: string, producer: () => unknown) => void
}>

export type DiagnosticsBridge = Readonly<{
  setPerfSnapshot: (snapshot: unknown) => void
  setRefAuditSnapshot: (snapshot: unknown) => void
  setPhase3PieceSnapshot: (snapshot: unknown) => void
  dispose: () => void
}>

const perfMetricsApi = {
  snapshotAndReset,
  recordCommit,
  recordDerive,
  recordDelta,
  recordUpdatedMessages,
  recordBubbleUpdate,
  recordFallbackReplay,
  recordMergeOp,
}

let activeBridge: DiagnosticsBridge | null = null

export function createDiagnosticsLogger(flags: DiagnosticsFlags): DiagnosticsLogger {
  if (!flags.enabled) {
    return {
      log: () => {},
      logLazy: () => {},
    }
  }
  return {
    log: (tag, payload) => {
      console.log(`[${tag}]`, payload)
    },
    logLazy: (tag, producer) => {
      const payload = producer()
      console.log(`[${tag}]`, payload)
    },
  }
}

export function installDiagnosticsBridge(flags: DiagnosticsFlags = getDiagnosticsFlags()): DiagnosticsBridge | null {
  if (typeof window === 'undefined') return null

  const g = globalThis as any

  // sched diag 可独立启用，不依赖 flags.enabled
  if (flags.sched) {
    installSchedDiagHook()
    initSchedDiag({ sched: flags.sched })
  }

  // 其他诊断需要 flags.enabled
  if (!flags.enabled) return null

  if (flags.perf) {
    g.__svPerfMetrics = perfMetricsApi
  }

  const bridge: DiagnosticsBridge = {
    setPerfSnapshot: (snapshot) => {
      if (flags.perf) g.__svPerfSnapshot = snapshot
    },
    setRefAuditSnapshot: (snapshot) => {
      if (flags.refAudit) g.__svRefAuditSnapshot = snapshot
    },
    setPhase3PieceSnapshot: (snapshot) => {
      if (flags.phase3Audit) g.__svPhase3PieceCount = snapshot
    },
    dispose: () => {
      if (flags.perf) {
        delete g.__svPerfMetrics
        delete g.__svPerfSnapshot
      }
      if (flags.refAudit) {
        delete g.__svRefAuditSnapshot
      }
      if (flags.phase3Audit) {
        delete g.__svPhase3PieceCount
      }
      // 清理 sched diag hook
      uninstallSchedDiagHook()
    },
  }

  activeBridge = bridge
  return bridge
}

export function getDiagnosticsBridge(): DiagnosticsBridge | null {
  return activeBridge
}

export function publishPhase3PieceSnapshot(snapshot: unknown): void {
  activeBridge?.setPhase3PieceSnapshot(snapshot)
}
