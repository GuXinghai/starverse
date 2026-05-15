export const PDP_OFFICIAL_INSTALL_OPERATION_STATES = [
  'accepted',
  'pending',
  'downloading',
  'verifying',
  'staging',
  'registering',
  'health_checking',
  'installed',
  'failed',
  'cancelled',
  'stale',
] as const

export type PdpOfficialInstallOperationState = (typeof PDP_OFFICIAL_INSTALL_OPERATION_STATES)[number]

export type PdpOfficialInstallOperationTransitionFailure =
  | 'invalid_transition'
  | 'terminal_state'

const TERMINAL_STATES = new Set<PdpOfficialInstallOperationState>([
  'installed',
  'failed',
  'cancelled',
  'stale',
])

const ACTIVE_STATES = new Set<PdpOfficialInstallOperationState>([
  'accepted',
  'pending',
  'downloading',
  'verifying',
  'staging',
  'registering',
  'health_checking',
])

const ALLOWED_TRANSITIONS: Record<PdpOfficialInstallOperationState, readonly PdpOfficialInstallOperationState[]> = {
  accepted: ['pending', 'downloading', 'failed', 'cancelled', 'stale', 'installed'],
  pending: ['downloading', 'failed', 'cancelled', 'stale', 'installed'],
  downloading: ['verifying', 'failed', 'cancelled', 'stale', 'installed'],
  verifying: ['staging', 'failed', 'cancelled', 'stale', 'installed'],
  staging: ['registering', 'failed', 'cancelled', 'stale', 'installed'],
  registering: ['health_checking', 'installed', 'failed', 'cancelled', 'stale'],
  health_checking: ['installed', 'failed', 'cancelled', 'stale'],
  installed: [],
  failed: [],
  cancelled: [],
  stale: [],
}

export function isOfficialInstallOperationActive(state: PdpOfficialInstallOperationState): boolean {
  return ACTIVE_STATES.has(state)
}

export function isOfficialInstallOperationTerminal(state: PdpOfficialInstallOperationState): boolean {
  return TERMINAL_STATES.has(state)
}

export function validateOfficialInstallOperationTransition(
  from: PdpOfficialInstallOperationState,
  to: PdpOfficialInstallOperationState
): Readonly<{ ok: true } | { ok: false; reason: PdpOfficialInstallOperationTransitionFailure }> {
  if (from === to) return { ok: true }
  if (isOfficialInstallOperationTerminal(from)) {
    return { ok: false, reason: 'terminal_state' }
  }
  return ALLOWED_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: 'invalid_transition' }
}

export function labelOfficialInstallOperationPhase(state: PdpOfficialInstallOperationState): string {
  if (state === 'accepted' || state === 'pending') return 'Preparing install'
  if (state === 'downloading') return 'Downloading official package'
  if (state === 'verifying') return 'Verifying signature'
  if (state === 'staging') return 'Staging plugin'
  if (state === 'registering') return 'Registering plugin'
  if (state === 'health_checking') return 'Checking health'
  if (state === 'installed') return 'Installed'
  if (state === 'failed') return 'Install failed'
  if (state === 'stale') return 'Install status stale'
  return 'Cancelled'
}
