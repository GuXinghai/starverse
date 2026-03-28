export type DiagnosticsFlags = Readonly<{
  enabled: boolean
  perf: boolean
  refAudit: boolean
  phase3Audit: boolean
  sched: boolean
}>

type FlagState = boolean | null

let cachedFlags: DiagnosticsFlags | null = null

export const APPROVED_DEBUG_FLAGS = {
  streamError: { storageKey: 'sv_debug_stream_error' },
  timing: { storageKey: 'sv_debug_timing' },
  openrouterEchoUpstreamBody: { storageKey: 'sv_debug_openrouter_echo_upstream_body', devOnly: true },
  chat: { storageKey: 'sv_debug_chat' },
  reasoning: { storageKey: 'sv_debug_reasoning' },
  responses: { storageKey: 'sv_debug_responses' },
} as const

export type ApprovedDebugFlagName = keyof typeof APPROVED_DEBUG_FLAGS

const APPROVED_DEBUG_FLAG_NAMES = Object.freeze(
  Object.keys(APPROVED_DEBUG_FLAGS) as ApprovedDebugFlagName[],
)

export const SETTINGS_PANEL_DEBUG_FLAGS = Object.freeze([
  'openrouterEchoUpstreamBody',
] as const satisfies readonly ApprovedDebugFlagName[])

export type SettingsPanelDebugFlagName = (typeof SETTINGS_PANEL_DEBUG_FLAGS)[number]

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

function clearFlag(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.removeItem(key)
  } catch {
    // no-op
  }
}

function writeFlag(key: string, enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage?.setItem(key, '1')
      return
    }
    window.localStorage?.removeItem(key)
  } catch {
    // no-op
  }
}

function resolveModuleFlag(subKey: string, enabled: boolean, defaultWhenDiag: boolean): boolean {
  if (!enabled) return false
  const override = readFlag(subKey)
  if (override !== null) return override
  return defaultWhenDiag
}

export function isDiagnosticsDevRuntime(): boolean {
  return import.meta.env?.DEV === true
}

export function listApprovedDebugFlags(): readonly ApprovedDebugFlagName[] {
  return APPROVED_DEBUG_FLAG_NAMES
}

export function getApprovedDebugFlagStorageKey(name: ApprovedDebugFlagName): string {
  return APPROVED_DEBUG_FLAGS[name].storageKey
}

export function resolveApprovedDebugFlagName(storageKey: string): ApprovedDebugFlagName | null {
  for (const name of APPROVED_DEBUG_FLAG_NAMES) {
    if (APPROVED_DEBUG_FLAGS[name].storageKey === storageKey) return name
  }
  return null
}

export function readApprovedDebugFlag(
  name: ApprovedDebugFlagName,
  options?: Readonly<{ devRuntime?: boolean }>,
): boolean {
  const entry = APPROVED_DEBUG_FLAGS[name]
  const devRuntime = options?.devRuntime ?? isDiagnosticsDevRuntime()
  if (entry.devOnly && !devRuntime) {
    clearFlag(entry.storageKey)
    return false
  }
  return readFlag(entry.storageKey) === true
}

export function writeApprovedDebugFlag(
  name: ApprovedDebugFlagName,
  enabled: boolean,
  options?: Readonly<{ devRuntime?: boolean }>,
): void {
  const entry = APPROVED_DEBUG_FLAGS[name]
  const devRuntime = options?.devRuntime ?? isDiagnosticsDevRuntime()
  if (entry.devOnly && !devRuntime) {
    clearFlag(entry.storageKey)
    return
  }
  writeFlag(entry.storageKey, enabled)
}

export function listSettingsPanelDebugFlags(): readonly SettingsPanelDebugFlagName[] {
  return SETTINGS_PANEL_DEBUG_FLAGS
}

export function getSettingsPanelDebugFlagStorageKey(name: SettingsPanelDebugFlagName): string {
  return getApprovedDebugFlagStorageKey(name)
}

export function readSettingsPanelDebugFlag(
  name: SettingsPanelDebugFlagName,
  options?: Readonly<{ devRuntime?: boolean }>,
): boolean {
  return readApprovedDebugFlag(name, options)
}

export function writeSettingsPanelDebugFlag(
  name: SettingsPanelDebugFlagName,
  enabled: boolean,
  options?: Readonly<{ devRuntime?: boolean }>,
): void {
  writeApprovedDebugFlag(name, enabled, options)
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
