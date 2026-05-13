import { sanitizePluginDistributionText } from './sanitization'
import type { PdpPluginRegistryRecord } from './registryModel'
import type { PluginFailureReason } from './types'

export type PdpPreviousKnownGoodRef = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  installRef: string
  packageRef: string | null
}>

export type PdpRollbackInput = Readonly<{
  currentRecord: PdpPluginRegistryRecord
  previousKnownGood: PdpPreviousKnownGoodRef | null
  previousRecord?: PdpPluginRegistryRecord | null
  reason?: string | null
}>

export type PdpRollbackFailureReason =
  | PluginFailureReason
  | 'previous_known_good_missing'
  | 'previous_known_good_mismatch'
  | 'previous_known_good_unverified'
  | 'previous_known_good_revoked'
  | 'previous_known_good_incompatible'
  | 'unsafe_rollback_ref'

export type PdpRollbackResult =
  | Readonly<{
      ok: true
      state: 'rolled_back'
      activeRecord: PdpPluginRegistryRecord
      rollbackRef: PdpPreviousKnownGoodRef
      diagnostics: readonly string[]
      filesystemRestoreDeferred: true
    }>
  | Readonly<{
      ok: false
      state: 'rollback_unavailable'
      activeRecord: PdpPluginRegistryRecord
      failureReasons: readonly PdpRollbackFailureReason[]
      diagnostics: readonly string[]
      filesystemRestoreDeferred: true
    }>

const INCOMPATIBLE_FAILURES = new Set<PluginFailureReason>([
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
])

export function evaluatePdpRollback(input: PdpRollbackInput): PdpRollbackResult {
  const failureReasons: PdpRollbackFailureReason[] = []
  const diagnostics: string[] = []
  const previousKnownGood = input.previousKnownGood

  if (!previousKnownGood) {
    pushFailure(failureReasons, diagnostics, 'previous_known_good_missing', 'previous known-good metadata is required')
  } else {
    if (!matchesCurrentIdentity(input.currentRecord, previousKnownGood)) {
      pushFailure(
        failureReasons,
        diagnostics,
        'previous_known_good_mismatch',
        'previous known-good metadata must match current plugin identity'
      )
    }
    if (!isSafeRollbackRef(previousKnownGood.installRef) || !isSafeOptionalRollbackRef(previousKnownGood.packageRef)) {
      pushFailure(
        failureReasons,
        diagnostics,
        'unsafe_rollback_ref',
        'rollback metadata refs must be owned abstract refs'
      )
    }
  }

  const previousRecord = input.previousRecord ?? null
  if (previousKnownGood && previousRecord) {
    validatePreviousRecord(previousKnownGood, previousRecord, failureReasons, diagnostics)
  } else if (previousKnownGood && !previousRecord) {
    pushFailure(
      failureReasons,
      diagnostics,
      'previous_known_good_unverified',
      'rollback requires verified previous registry metadata'
    )
  }

  if (failureReasons.length > 0 || !previousKnownGood || !previousRecord) {
    return {
      ok: false,
      state: 'rollback_unavailable',
      activeRecord: input.currentRecord,
      failureReasons: uniqueFailures(failureReasons),
      diagnostics: sanitizeDiagnostics(diagnostics),
      filesystemRestoreDeferred: true,
    }
  }

  return {
    ok: true,
    state: 'rolled_back',
    activeRecord: {
      ...previousRecord,
      registryState: previousRecord.enabled ? 'enabled' : 'verified',
      installState: 'installed',
      verificationStatus: 'verified',
      failureReason: null,
      diagnostics: previousRecord.diagnostics.map((entry) => sanitizePluginDistributionText(entry) ?? 'sanitized'),
    },
    rollbackRef: previousKnownGood,
    diagnostics: sanitizeDiagnostics([input.reason]),
    filesystemRestoreDeferred: true,
  }
}

function validatePreviousRecord(
  previousKnownGood: PdpPreviousKnownGoodRef,
  previousRecord: PdpPluginRegistryRecord,
  failureReasons: PdpRollbackFailureReason[],
  diagnostics: string[]
): void {
  if (
    previousRecord.pluginId !== previousKnownGood.pluginId ||
    previousRecord.pluginVersion !== previousKnownGood.pluginVersion ||
    previousRecord.runtimeKind !== previousKnownGood.runtimeKind ||
    previousRecord.installRef !== previousKnownGood.installRef ||
    previousRecord.packageRef !== previousKnownGood.packageRef
  ) {
    pushFailure(
      failureReasons,
      diagnostics,
      'previous_known_good_mismatch',
      'previous registry metadata must match previous known-good ref'
    )
  }
  if (previousRecord.verificationStatus !== 'verified') {
    pushFailure(
      failureReasons,
      diagnostics,
      'previous_known_good_unverified',
      'previous known-good package must be verified'
    )
  }
  if (previousRecord.failureReason === 'revoked' || previousRecord.verificationStatus === 'revoked') {
    pushFailure(failureReasons, diagnostics, 'previous_known_good_revoked', 'rollback target is revoked')
  }
  if (previousRecord.failureReason && INCOMPATIBLE_FAILURES.has(previousRecord.failureReason)) {
    pushFailure(
      failureReasons,
      diagnostics,
      'previous_known_good_incompatible',
      'rollback target is incompatible with the current environment'
    )
  }
}

function matchesCurrentIdentity(
  currentRecord: PdpPluginRegistryRecord,
  previousKnownGood: PdpPreviousKnownGoodRef
): boolean {
  return currentRecord.pluginId === previousKnownGood.pluginId && currentRecord.runtimeKind === previousKnownGood.runtimeKind
}

function isSafeOptionalRollbackRef(value: string | null): boolean {
  return value === null || isSafeRollbackRef(value)
}

function isSafeRollbackRef(value: string): boolean {
  return (
    /^[a-z0-9][a-z0-9._:-]{1,127}$/iu.test(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  )
}

function pushFailure(
  failureReasons: PdpRollbackFailureReason[],
  diagnostics: string[],
  reason: PdpRollbackFailureReason,
  diagnostic: string
): void {
  failureReasons.push(reason)
  diagnostics.push(diagnostic)
}

function uniqueFailures(values: readonly PdpRollbackFailureReason[]): readonly PdpRollbackFailureReason[] {
  const seen = new Set<PdpRollbackFailureReason>()
  const out: PdpRollbackFailureReason[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function sanitizeDiagnostics(values: readonly (string | null | undefined)[]): readonly string[] {
  return values
    .map((value) => sanitizePluginDistributionText(value))
    .filter((value): value is string => Boolean(value))
}
