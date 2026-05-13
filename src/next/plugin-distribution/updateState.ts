import { sanitizePluginDistributionText } from './sanitization'
import type { PdpPluginRegistryRecord } from './registryModel'
import type { PluginFailureReason } from './types'

export const PDP_UPDATE_OPERATION_STATES = [
  'idle',
  'checking',
  'eligible',
  'downloading',
  'verifying',
  'staged',
  'ready_to_activate',
  'activated',
  'failed',
  'cancelled',
] as const

export type PdpUpdateOperationState = (typeof PDP_UPDATE_OPERATION_STATES)[number]

export type PdpStagedUpdateRef = Readonly<{
  pluginId: string
  currentVersion: string
  candidateVersion: string
  stagingRef: string
  finalInstallRef: string
}>

export type PdpUpdateOperation = Readonly<{
  operationId: string
  pluginId: string
  state: PdpUpdateOperationState
  currentActiveRecord: PdpPluginRegistryRecord
  stagedUpdate: PdpStagedUpdateRef | null
  failureReason: string | null
  diagnostics: readonly string[]
}>

export type CreatePdpUpdateOperationInput = Readonly<{
  operationId: string
  currentActiveRecord: PdpPluginRegistryRecord
}>

export type PdpUpdateOperationTransitionInput = Readonly<{
  operation: PdpUpdateOperation
  nextState: PdpUpdateOperationState
  stagedUpdate?: PdpStagedUpdateRef | null
  activatedRecord?: PdpPluginRegistryRecord | null
  failureReason?: string | null
  diagnostic?: string | null
}>

export type PdpUpdateOperationTransitionFailure =
  | 'invalid_transition'
  | 'staged_update_required'
  | 'activation_record_required'
  | 'activation_identity_mismatch'
  | 'activation_candidate_not_verified'
  | 'activation_staged_update_mismatch'
  | 'unsafe_update_ref'

export type PdpUpdateOperationTransitionResult =
  | Readonly<{ ok: true; operation: PdpUpdateOperation }>
  | Readonly<{
      ok: false
      failureReason: PdpUpdateOperationTransitionFailure
      operation: PdpUpdateOperation
      diagnostics: readonly string[]
    }>

const ALLOWED_TRANSITIONS: Readonly<Record<PdpUpdateOperationState, readonly PdpUpdateOperationState[]>> = {
  idle: ['checking', 'cancelled'],
  checking: ['eligible', 'failed', 'cancelled'],
  eligible: ['downloading', 'failed', 'cancelled'],
  downloading: ['verifying', 'failed', 'cancelled'],
  verifying: ['staged', 'failed', 'cancelled'],
  staged: ['ready_to_activate', 'failed', 'cancelled'],
  ready_to_activate: ['activated', 'failed', 'cancelled'],
  activated: [],
  failed: [],
  cancelled: [],
}

const ACTIVATION_BLOCKED_FAILURE_REASONS = new Set<PluginFailureReason>([
  'expired_metadata',
  'hash_mismatch',
  'health_failed',
  'incompatible_app_version',
  'incompatible_arch',
  'incompatible_platform',
  'install_interrupted',
  'install_root_unsafe',
  'integrity_missing',
  'package_path_unsafe',
  'revoked',
  'rollback_detected',
  'signature_invalid',
  'signature_missing',
  'unknown',
  'unsupported_manifest_schema',
  'unsigned',
])

export function createPdpUpdateOperation(input: CreatePdpUpdateOperationInput): PdpUpdateOperation {
  return {
    operationId: sanitizeOpaqueToken(input.operationId, 'update_operation'),
    pluginId: input.currentActiveRecord.pluginId,
    state: 'idle',
    currentActiveRecord: input.currentActiveRecord,
    stagedUpdate: null,
    failureReason: null,
    diagnostics: [],
  }
}

// eslint-disable-next-line complexity
export function transitionPdpUpdateOperation(
  input: PdpUpdateOperationTransitionInput
): PdpUpdateOperationTransitionResult {
  const operation = input.operation
  if (!ALLOWED_TRANSITIONS[operation.state].includes(input.nextState)) {
    return fail(input, 'invalid_transition', `cannot transition update from ${operation.state} to ${input.nextState}`)
  }

  if (
    operation.stagedUpdate &&
    input.stagedUpdate &&
    !stagedUpdatesEqual(input.stagedUpdate, operation.stagedUpdate)
  ) {
    return fail(
      input,
      'activation_staged_update_mismatch',
      'staged update metadata cannot be replaced after staging'
    )
  }
  const stagedUpdate = operation.stagedUpdate ?? input.stagedUpdate ?? null
  if (input.nextState === 'activated' && !matchesPersistedStagedUpdate(input.stagedUpdate, operation.stagedUpdate)) {
    return fail(
      input,
      'activation_staged_update_mismatch',
      'activation must use the staged update already recorded on the operation'
    )
  }
  if (requiresStagedUpdate(input.nextState) && !stagedUpdate) {
    return fail(input, 'staged_update_required', 'staged update metadata is required for this transition')
  }
  if (stagedUpdate && !isSafeStagedUpdateRef(stagedUpdate, operation.currentActiveRecord)) {
    return fail(input, 'unsafe_update_ref', 'staged update reference is unsafe or does not match current plugin')
  }

  const currentActiveRecord =
    input.nextState === 'activated'
      ? resolveActivatedRecord(input.activatedRecord ?? null, operation, stagedUpdate)
      : operation.currentActiveRecord

  if (!currentActiveRecord) {
    return fail(input, 'activation_record_required', 'activation requires the verified candidate registry record')
  }
  if (currentActiveRecord === 'identity_mismatch') {
    return fail(input, 'activation_identity_mismatch', 'activated record must match staged update identity')
  }
  if (currentActiveRecord === 'candidate_not_verified') {
    return fail(input, 'activation_candidate_not_verified', 'activated record must be verified, installed, and enabled')
  }

  const next: PdpUpdateOperation = {
    ...operation,
    state: input.nextState,
    currentActiveRecord,
    stagedUpdate: input.nextState === 'activated' ? null : stagedUpdate,
    failureReason: input.nextState === 'failed' ? sanitizeOpaqueToken(input.failureReason ?? 'update_failed', 'update_failed') : null,
    diagnostics: appendDiagnostic(operation.diagnostics, input.diagnostic),
  }
  return { ok: true, operation: next }
}

function matchesPersistedStagedUpdate(
  supplied: PdpStagedUpdateRef | null | undefined,
  persisted: PdpStagedUpdateRef | null
): boolean {
  if (supplied === undefined || supplied === null) return persisted !== null
  if (!persisted) return false
  return stagedUpdatesEqual(supplied, persisted)
}

function stagedUpdatesEqual(a: PdpStagedUpdateRef, b: PdpStagedUpdateRef): boolean {
  return (
    a.pluginId === b.pluginId &&
    a.currentVersion === b.currentVersion &&
    a.candidateVersion === b.candidateVersion &&
    a.stagingRef === b.stagingRef &&
    a.finalInstallRef === b.finalInstallRef
  )
}

function requiresStagedUpdate(state: PdpUpdateOperationState): boolean {
  return state === 'staged' || state === 'ready_to_activate' || state === 'activated'
}

function resolveActivatedRecord(
  activatedRecord: PdpPluginRegistryRecord | null,
  operation: PdpUpdateOperation,
  stagedUpdate: PdpStagedUpdateRef | null
): PdpPluginRegistryRecord | null | 'identity_mismatch' | 'candidate_not_verified' {
  if (!activatedRecord) return null
  if (!stagedUpdate) return 'identity_mismatch'
  if (
    activatedRecord.pluginId !== operation.pluginId ||
    activatedRecord.pluginId !== stagedUpdate.pluginId ||
    activatedRecord.runtimeKind !== operation.currentActiveRecord.runtimeKind ||
    activatedRecord.pluginVersion !== stagedUpdate.candidateVersion ||
    activatedRecord.installRef !== stagedUpdate.finalInstallRef ||
    activatedRecord.packageRef !== stagedUpdate.stagingRef
  ) {
    return 'identity_mismatch'
  }
  if (
    activatedRecord.verificationStatus !== 'verified' ||
    activatedRecord.installState !== 'installed' ||
    activatedRecord.registryState !== 'enabled' ||
    !activatedRecord.enabled
  ) {
    return 'candidate_not_verified'
  }
  if (activatedRecord.failureReason && ACTIVATION_BLOCKED_FAILURE_REASONS.has(activatedRecord.failureReason)) {
    return 'candidate_not_verified'
  }
  return activatedRecord
}

function isSafeStagedUpdateRef(
  stagedUpdate: PdpStagedUpdateRef,
  activeRecord: PdpPluginRegistryRecord
): boolean {
  return (
    stagedUpdate.pluginId === activeRecord.pluginId &&
    stagedUpdate.currentVersion === activeRecord.pluginVersion &&
    isSafeOpaqueRef(stagedUpdate.stagingRef) &&
    isSafeOpaqueRef(stagedUpdate.finalInstallRef) &&
    isSafeVersion(stagedUpdate.candidateVersion)
  )
}

function isSafeVersion(value: string): boolean {
  return Boolean(value.trim()) && !value.includes('\u0000') && !/[\\/]/u.test(value)
}

function isSafeOpaqueRef(value: string): boolean {
  return (
    /^[a-z0-9][a-z0-9._:-]{1,127}$/iu.test(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  )
}

function sanitizeOpaqueToken(input: string, fallback: string): string {
  const sanitized = sanitizePluginDistributionText(input)?.replace(/[^a-z0-9._:-]/giu, '_').slice(0, 128)
  return sanitized || fallback
}

function appendDiagnostic(values: readonly string[], diagnostic: string | null | undefined): readonly string[] {
  const sanitized = sanitizePluginDistributionText(diagnostic)
  return sanitized ? [...values, sanitized] : values
}

function fail(
  input: PdpUpdateOperationTransitionInput,
  failureReason: PdpUpdateOperationTransitionFailure,
  diagnostic: string
): PdpUpdateOperationTransitionResult {
  return {
    ok: false,
    failureReason,
    operation: input.operation,
    diagnostics: [sanitizePluginDistributionText(diagnostic) ?? failureReason],
  }
}
