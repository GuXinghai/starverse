import { createDiagnosticsLogger, installDiagnosticsBridge } from '@/shared/diagnostics/bridge'
import { getDiagnosticsFlags } from '@/shared/diagnostics/flags'

export function useDiagnostics() {
  const diagnosticsFlags = getDiagnosticsFlags()
  const diagnosticsLogger = createDiagnosticsLogger(diagnosticsFlags)
  const diagnosticsBridge = installDiagnosticsBridge(diagnosticsFlags)

  function isUiDebugEnabled(): boolean {
    try {
      return String(globalThis?.localStorage?.getItem('sv_debug_chat') ?? '').trim() === '1'
    } catch {
      return false
    }
  }

  function shouldLogDebug(): boolean {
    return !!import.meta.env?.DEV || isUiDebugEnabled()
  }

  function shouldLogReasoningDebug(): boolean {
    try {
      const flag = String(globalThis?.localStorage?.getItem('sv_debug_reasoning') ?? '').trim()
      if (flag === '0') return false
      if (flag === '1') return true
    } catch {
      // no-op
    }
    return false
  }

  function isEventSchedulerEnabled(): boolean {
    try {
      const flag = String(globalThis?.localStorage?.getItem('sv_event_scheduler') ?? '').trim()
      if (flag === '0') return false
      if (flag === '1') return true
    } catch {
      // no-op
    }
    return true
  }

  return {
    diagnosticsFlags,
    diagnosticsLogger,
    diagnosticsBridge,
    isUiDebugEnabled,
    shouldLogDebug,
    shouldLogReasoningDebug,
    isEventSchedulerEnabled,
  }
}
