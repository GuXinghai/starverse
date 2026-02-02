export type DiagnosticsFlags = Readonly<{
  enabled: boolean
  perf: boolean
  refAudit: boolean
  phase3Audit: boolean
  sched: boolean
}>

type FlagState = boolean | null

let cachedFlags: DiagnosticsFlags | null = null

function readFlag(key: string): FlagState {
  if (typeof window === 'undefined') return null
  try {
    const raw = String(window.localStorage?.getItem(key) ?? '').trim()
    if (raw === '1') return true
    if (raw === '0') return false
  } catch {
    // no-op
  }
  return null
}

function resolveModuleFlag(subKey: string, enabled: boolean, defaultWhenDiag: boolean): boolean {
  if (!enabled) return false
  const override = readFlag(subKey)
  if (override !== null) return override
  return defaultWhenDiag
}

export function readDiagnosticsFlags(): DiagnosticsFlags {
  const diag = readFlag('sv_diag')
  const enabled = diag === true

  // sched 独立开关：可单独启用，不依赖 sv_diag
  // 临时关闭 sched-diag 以减少噪音（忽略 sv_diag_sched）
  const schedEnabled = false

  return {
    enabled,
    perf: resolveModuleFlag('sv_diag_perf', enabled, true),
    refAudit: resolveModuleFlag('sv_diag_ref_audit', enabled, true),
    phase3Audit: resolveModuleFlag('sv_diag_phase3_audit', enabled, false),
    sched: schedEnabled,
  }
}

export function getDiagnosticsFlags(): DiagnosticsFlags {
  if (cachedFlags) return cachedFlags
  cachedFlags = readDiagnosticsFlags()
  return cachedFlags
}

export function resetDiagnosticsFlagsCache(): void {
  cachedFlags = null
}
