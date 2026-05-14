import { SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS } from './cryptoPolicy'
import {
  labelPdpFailureReason,
  labelPdpHealthStatus,
  labelPdpReasonCode,
  labelPdpVerificationStatus,
  sanitizePdpManagementCode,
  sanitizePdpManagementText,
  type PdpManagementLabel,
} from './managementLabels'
import type {
  PdpManagementPluginViewModel,
  PdpManagementRollbackState,
  PdpManagementUpdateState,
} from './managementViewModel'
import type {
  PluginFailureReason,
  PluginHealthStatus,
  PluginPackageCapability,
  PluginVerificationStatus,
} from './types'

export type PdpManagementDetailInput = Readonly<{
  plugin: PdpManagementPluginViewModel
  manifest?: Readonly<{
    pluginId?: string | null
    displayName?: string | null
    publisher?: string | null
    pluginVersion?: string | null
    runtimeKind?: string | null
    capabilities?: readonly PluginPackageCapability[]
  }>
  catalog?: Readonly<{
    pluginId?: string | null
    catalogVersion?: number | null
    sourceKind?: 'official' | null
    channel?: string | null
    status?: string | null
  }>
  verification?: Readonly<{
    status?: PluginVerificationStatus | null
    signatureAlgorithm?: string | null
    cryptographicVerificationPerformed?: boolean
    reasonCodes?: readonly string[]
  }>
  health?: Readonly<{
    status?: PluginHealthStatus | null
    reasonCodes?: readonly string[]
  }>
  update?: Readonly<{
    state?: PdpManagementUpdateState | null
    currentVersion?: string | null
    candidateVersion?: string | null
    reasonCodes?: readonly string[]
  }>
  rollback?: Readonly<{
    state?: PdpManagementRollbackState | null
    previousKnownGoodVersion?: string | null
    reasonCodes?: readonly string[]
  }>
  quarantine?: Readonly<{
    quarantined?: boolean
    disabled?: boolean
    reasonCodes?: readonly string[]
  }>
  failureReasons?: readonly PluginFailureReason[]
  diagnostics?: readonly string[]
}>

export type PdpManagementDetailModel = Readonly<{
  identity: Readonly<{
    pluginId: string
    displayName: string
    publisher: string
    pluginVersion: string
    runtimeKind: string
    capabilities: readonly string[]
  }>
  catalog: Readonly<{
    present: boolean
    pluginId: string | null
    catalogVersion: number | null
    sourceKind: 'official' | null
    channel: string | null
    status: string
  }>
  verification: Readonly<{
    status: PluginVerificationStatus
    label: PdpManagementLabel
    cryptographicVerificationPerformed: boolean
    signatureAlgorithm: Readonly<{
      status: 'supported' | 'unsupported' | 'unknown'
      algorithmLabel: string
      label: string
    }>
  }>
  health: Readonly<{
    status: PluginHealthStatus
    label: PdpManagementLabel
  }>
  update: Readonly<{
    state: PdpManagementUpdateState
    currentVersion: string | null
    candidateVersion: string | null
    label: string
  }>
  rollback: Readonly<{
    state: PdpManagementRollbackState
    previousKnownGoodVersion: string | null
    label: string
    filesystemRestoreDeferred: true
  }>
  quarantine: Readonly<{
    quarantined: boolean
    disabled: boolean
    label: string
    malwareVerdict: false
    arbitraryDeletionDeferred: true
  }>
  failureReasons: readonly PdpManagementLabel[]
  diagnostics: readonly string[]
}>

const SUPPORTED_ALGORITHMS = new Set<string>(SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS)

// eslint-disable-next-line max-lines-per-function, complexity
export function buildPdpManagementDetailModel(
  input: PdpManagementDetailInput
): PdpManagementDetailModel {
  const plugin = input.plugin
  const verificationStatus = input.verification?.status ?? plugin.status.verificationStatus
  const healthStatus = input.health?.status ?? plugin.status.healthStatus
  const updateState = input.update?.state ?? plugin.status.updateState
  const rollbackState = input.rollback?.state ?? plugin.status.rollbackState
  const quarantined = input.quarantine?.quarantined ?? plugin.status.quarantined

  return {
    identity: {
      pluginId: sanitizePdpManagementText(input.manifest?.pluginId ?? plugin.id, plugin.id),
      displayName: sanitizePdpManagementText(input.manifest?.displayName ?? plugin.displayName, plugin.id),
      publisher: sanitizePdpManagementText(input.manifest?.publisher ?? plugin.publisher, 'Unknown publisher'),
      pluginVersion: sanitizePdpManagementText(
        input.manifest?.pluginVersion ?? plugin.pluginVersion,
        'unknown'
      ),
      runtimeKind: sanitizePdpManagementText(input.manifest?.runtimeKind ?? plugin.runtimeKind, 'unknown'),
      capabilities: (input.manifest?.capabilities ?? plugin.capabilities).map((capability) =>
        sanitizePdpManagementText(capability, 'unknown')
      ),
    },
    catalog: {
      present: plugin.catalog.present || Boolean(input.catalog),
      pluginId: input.catalog?.pluginId
        ? sanitizePdpManagementText(input.catalog.pluginId, plugin.id)
        : plugin.catalog.present
          ? plugin.id
          : null,
      catalogVersion: input.catalog?.catalogVersion ?? null,
      sourceKind: input.catalog?.sourceKind ?? (plugin.catalog.present ? 'official' : null),
      channel: input.catalog?.channel ? sanitizePdpManagementCode(input.catalog.channel) : null,
      status: sanitizePdpManagementCode(input.catalog?.status ?? plugin.catalog.status),
    },
    verification: {
      status: verificationStatus,
      label: labelPdpVerificationStatus(verificationStatus),
      cryptographicVerificationPerformed: input.verification?.cryptographicVerificationPerformed === true,
      signatureAlgorithm: describeSignatureAlgorithm(input.verification?.signatureAlgorithm),
    },
    health: {
      status: healthStatus,
      label: labelPdpHealthStatus(healthStatus),
    },
    update: {
      state: updateState,
      currentVersion: input.update?.currentVersion
        ? sanitizePdpManagementText(input.update.currentVersion, nullFallback(plugin.pluginVersion))
        : plugin.pluginVersion,
      candidateVersion: input.update?.candidateVersion
        ? sanitizePdpManagementText(input.update.candidateVersion, 'candidate')
        : null,
      label: labelUpdateState(updateState),
    },
    rollback: {
      state: rollbackState,
      previousKnownGoodVersion: input.rollback?.previousKnownGoodVersion
        ? sanitizePdpManagementText(input.rollback.previousKnownGoodVersion, 'previous')
        : null,
      label: labelRollbackState(rollbackState),
      filesystemRestoreDeferred: true,
    },
    quarantine: {
      quarantined,
      disabled: input.quarantine?.disabled ?? (quarantined || !plugin.status.enabled),
      label: quarantined ? 'Quarantined / disabled' : 'No quarantine state',
      malwareVerdict: false,
      arbitraryDeletionDeferred: true,
    },
    failureReasons: uniqueReasonCodes([
      ...plugin.reasonCodes,
      ...(input.verification?.reasonCodes ?? []),
      ...(input.health?.reasonCodes ?? []),
      ...(input.update?.reasonCodes ?? []),
      ...(input.rollback?.reasonCodes ?? []),
      ...(input.quarantine?.reasonCodes ?? []),
      ...(input.failureReasons ?? []),
    ]).map((reason) =>
      isPluginFailureReason(reason)
        ? labelPdpFailureReason(reason)
        : labelPdpReasonCode(reason)
    ),
    diagnostics: sanitizeDiagnostics([
      ...plugin.diagnostics,
      ...(input.diagnostics ?? []),
    ]),
  }
}

function describeSignatureAlgorithm(
  algorithm: string | null | undefined
): PdpManagementDetailModel['verification']['signatureAlgorithm'] {
  if (!algorithm) {
    return {
      status: 'unknown',
      algorithmLabel: 'Unknown',
      label: 'Signature algorithm unknown',
    }
  }
  const algorithmLabel = sanitizePdpManagementCode(algorithm)
  if (SUPPORTED_ALGORITHMS.has(algorithmLabel)) {
    return {
      status: 'supported',
      algorithmLabel,
      label: 'Supported signature algorithm',
    }
  }
  return {
    status: 'unsupported',
    algorithmLabel,
    label: 'Unsupported signature algorithm',
  }
}

function labelUpdateState(state: PdpManagementUpdateState): string {
  if (state === 'eligible_manual') return 'Manual update eligibility'
  if (state === 'staged_contract') return 'Update contract staged'
  if (state === 'ineligible') return 'Update not eligible'
  return 'Update not checked'
}

function labelRollbackState(state: PdpManagementRollbackState): string {
  if (state === 'previous_known_good_metadata') return 'Previous known-good metadata'
  return 'Rollback metadata unavailable'
}

function uniqueReasonCodes(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const code = sanitizePdpManagementCode(value)
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

function sanitizeDiagnostics(values: readonly string[]): readonly string[] {
  return values
    .map((value) => sanitizePdpManagementText(value, ''))
    .filter((value): value is string => Boolean(value))
}

function nullFallback(value: string): string {
  return value || 'unknown'
}

function isPluginFailureReason(value: string): value is PluginFailureReason {
  return [
    'unsigned',
    'signature_invalid',
    'signature_missing',
    'hash_mismatch',
    'integrity_missing',
    'revoked',
    'expired_metadata',
    'rollback_detected',
    'incompatible_platform',
    'incompatible_arch',
    'incompatible_app_version',
    'unsupported_manifest_schema',
    'install_interrupted',
    'install_root_unsafe',
    'package_path_unsafe',
    'health_failed',
    'disabled_by_user',
    'unknown',
  ].includes(value)
}
