import type { PdpPluginRegistryRecord } from './registryModel'
import { sanitizePluginDistributionText } from './sanitization'
import { containsUnsafeRefSyntax } from './installPlan'

export const PDP_INSTALL_OPERATION_PHASES = [
  'pending',
  'downloading',
  'verifying',
  'staging',
  'installing',
  'installed',
  'cancelled',
  'failed',
  'cleanup_pending',
] as const

export type PdpInstallOperationPhase = (typeof PDP_INSTALL_OPERATION_PHASES)[number]

export type PdpInstallFailureKind =
  | 'download_interrupted'
  | 'verification_failed'
  | 'staging_failed'
  | 'install_finalization_failed'
  | 'cleanup_failed'
  | 'cancelled'

export type PdpInstallRecoveryInput = Readonly<{
  phase: PdpInstallOperationPhase
  failureKind?: PdpInstallFailureKind | null
  previousKnownGoodRecord?: PdpPluginRegistryRecord | null
  candidateRecord?: PdpPluginRegistryRecord | null
  ownedStagingRefs?: readonly string[]
  detail?: string | null
}>

export type PdpInstallRecoveryResult = Readonly<{
  phase: PdpInstallOperationPhase
  installed: boolean
  enabled: boolean
  previousKnownGoodRecord: PdpPluginRegistryRecord | null
  activeRecord: PdpPluginRegistryRecord | null
  cleanupRefs: readonly string[]
  failureKind: PdpInstallFailureKind | null
  diagnostics: readonly string[]
}>

export function resolveInstallOperationRecovery(
  input: PdpInstallRecoveryInput
): PdpInstallRecoveryResult {
  const cleanupRefs = sanitizeOwnedStagingRefs(input.ownedStagingRefs ?? [])
  const previousKnownGoodRecord = input.previousKnownGoodRecord ?? null
  const failed = input.phase === 'failed' || Boolean(input.failureKind && input.failureKind !== 'cancelled')
  const cancelled = input.phase === 'cancelled' || input.failureKind === 'cancelled'

  if (cancelled) {
    return {
      phase: 'cancelled',
      installed: false,
      enabled: false,
      previousKnownGoodRecord,
      activeRecord: previousKnownGoodRecord,
      cleanupRefs,
      failureKind: 'cancelled',
      diagnostics: sanitizeDiagnostics(['operation_cancelled', input.detail]),
    }
  }

  if (failed) {
    return {
      phase: cleanupRefs.length > 0 ? 'cleanup_pending' : 'failed',
      installed: false,
      enabled: false,
      previousKnownGoodRecord,
      activeRecord: previousKnownGoodRecord,
      cleanupRefs,
      failureKind: input.failureKind ?? 'install_finalization_failed',
      diagnostics: sanitizeDiagnostics([input.failureKind ?? 'operation_failed', input.detail]),
    }
  }

  if (input.phase === 'installed' && input.candidateRecord) {
    return {
      phase: 'installed',
      installed: true,
      enabled: false,
      previousKnownGoodRecord,
      activeRecord: { ...input.candidateRecord, enabled: false },
      cleanupRefs,
      failureKind: null,
      diagnostics: [],
    }
  }

  return {
    phase: input.phase,
    installed: false,
    enabled: false,
    previousKnownGoodRecord,
    activeRecord: previousKnownGoodRecord,
    cleanupRefs,
    failureKind: null,
    diagnostics: sanitizeDiagnostics([input.detail]),
  }
}

export function sanitizeOwnedStagingRefs(refs: readonly string[]): readonly string[] {
  const out: string[] = []
  for (const ref of refs) {
    if (typeof ref !== 'string') continue
    const trimmed = ref.trim()
    if (!trimmed || containsUnsafeRefSyntax(trimmed)) continue
    if (!/^[a-z0-9][a-z0-9._:-]{1,127}$/iu.test(trimmed)) continue
    out.push(trimmed)
  }
  return out
}

function sanitizeDiagnostics(values: readonly (string | null | undefined)[]): readonly string[] {
  return values
    .map((value) => sanitizePluginDistributionText(value))
    .filter((value): value is string => Boolean(value))
}
