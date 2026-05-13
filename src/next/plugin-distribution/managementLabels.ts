import { sanitizePluginDistributionText } from './sanitization'
import type {
  PluginFailureReason,
  PluginHealthStatus,
  PluginInstallState,
  PluginVerificationStatus,
} from './types'

export const PDP_MANAGEMENT_SEVERITIES = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
] as const

export type PdpManagementSeverity = (typeof PDP_MANAGEMENT_SEVERITIES)[number]

export type PdpManagementLabel = Readonly<{
  code: string
  label: string
  severity: PdpManagementSeverity
  description?: string
}>

const VERIFICATION_LABELS: Readonly<Record<PluginVerificationStatus, PdpManagementLabel>> = {
  unverified: {
    code: 'verification_unverified',
    label: 'Not verified',
    severity: 'warning',
    description: 'Package metadata has not passed the supported verification policy.',
  },
  verified: {
    code: 'verification_verified',
    label: 'Verified by supported policy',
    severity: 'success',
    description: 'Cryptographic verification was performed for supported algorithms.',
  },
  failed: {
    code: 'verification_failed',
    label: 'Verification failed',
    severity: 'danger',
    description: 'The package cannot be enabled until verification succeeds.',
  },
  revoked: {
    code: 'verification_revoked',
    label: 'Revoked',
    severity: 'danger',
    description: 'The plugin is blocked by revocation metadata.',
  },
  expired: {
    code: 'verification_expired',
    label: 'Expired metadata',
    severity: 'danger',
    description: 'The verification metadata is no longer current.',
  },
}

const INSTALL_LABELS: Readonly<Record<PluginInstallState, PdpManagementLabel>> = {
  not_installed: {
    code: 'install_not_installed',
    label: 'Not installed',
    severity: 'neutral',
    description: 'Only catalog metadata is available.',
  },
  installing: {
    code: 'install_contract_ready',
    label: 'Install contract staged',
    severity: 'info',
    description: 'Install contract metadata exists; extraction may still be deferred.',
  },
  installed: {
    code: 'install_installed',
    label: 'Installed',
    severity: 'success',
    description: 'Registry metadata marks the plugin installed.',
  },
  failed: {
    code: 'install_failed',
    label: 'Install failed',
    severity: 'danger',
    description: 'The plugin is not eligible for enablement.',
  },
  disabled: {
    code: 'install_disabled',
    label: 'Disabled',
    severity: 'warning',
    description: 'The plugin is registered but disabled.',
  },
  quarantined: {
    code: 'install_quarantined',
    label: 'Quarantined / disabled',
    severity: 'danger',
    description: 'The plugin is blocked from enablement.',
  },
  uninstalled: {
    code: 'install_uninstalled',
    label: 'Metadata uninstalled',
    severity: 'neutral',
    description: 'Registry metadata marks this plugin uninstalled.',
  },
}

const HEALTH_LABELS: Readonly<Record<PluginHealthStatus, PdpManagementLabel>> = {
  unknown: {
    code: 'health_unknown',
    label: 'Health unknown',
    severity: 'neutral',
  },
  healthy: {
    code: 'health_healthy',
    label: 'Healthy',
    severity: 'success',
  },
  failed: {
    code: 'health_failed',
    label: 'Health check failed',
    severity: 'danger',
  },
  disabled: {
    code: 'health_disabled',
    label: 'Health disabled',
    severity: 'warning',
  },
}

const FAILURE_LABELS: Readonly<Record<PluginFailureReason, PdpManagementLabel>> = {
  unsigned: {
    code: 'unsigned',
    label: 'Unsigned package',
    severity: 'danger',
  },
  signature_invalid: {
    code: 'signature_invalid',
    label: 'Signature metadata invalid',
    severity: 'danger',
  },
  signature_missing: {
    code: 'signature_missing',
    label: 'Signature metadata missing',
    severity: 'danger',
  },
  hash_mismatch: {
    code: 'hash_mismatch',
    label: 'Integrity metadata mismatch',
    severity: 'danger',
  },
  integrity_missing: {
    code: 'integrity_missing',
    label: 'Integrity metadata missing',
    severity: 'danger',
  },
  revoked: {
    code: 'revoked',
    label: 'Revoked by trust metadata',
    severity: 'danger',
  },
  expired_metadata: {
    code: 'expired_metadata',
    label: 'Expired metadata',
    severity: 'danger',
  },
  rollback_detected: {
    code: 'rollback_detected',
    label: 'Rollback detected',
    severity: 'danger',
  },
  incompatible_platform: {
    code: 'incompatible_platform',
    label: 'Platform incompatible',
    severity: 'warning',
  },
  incompatible_arch: {
    code: 'incompatible_arch',
    label: 'Architecture incompatible',
    severity: 'warning',
  },
  incompatible_app_version: {
    code: 'incompatible_app_version',
    label: 'App version incompatible',
    severity: 'warning',
  },
  unsupported_manifest_schema: {
    code: 'unsupported_manifest_schema',
    label: 'Unsupported manifest schema',
    severity: 'danger',
  },
  install_interrupted: {
    code: 'install_interrupted',
    label: 'Install interrupted',
    severity: 'danger',
  },
  install_root_unsafe: {
    code: 'install_root_unsafe',
    label: 'Install root unsafe',
    severity: 'danger',
  },
  package_path_unsafe: {
    code: 'package_path_unsafe',
    label: 'Package reference unsafe',
    severity: 'danger',
  },
  health_failed: {
    code: 'health_failed',
    label: 'Health check failed',
    severity: 'danger',
  },
  disabled_by_user: {
    code: 'disabled_by_user',
    label: 'Disabled by user',
    severity: 'warning',
  },
  unknown: {
    code: 'unknown',
    label: 'Unknown status',
    severity: 'warning',
  },
}

export function labelPdpVerificationStatus(
  status: PluginVerificationStatus
): PdpManagementLabel {
  return VERIFICATION_LABELS[status]
}

export function labelPdpInstallState(state: PluginInstallState): PdpManagementLabel {
  return INSTALL_LABELS[state]
}

export function labelPdpHealthStatus(status: PluginHealthStatus): PdpManagementLabel {
  return HEALTH_LABELS[status]
}

export function labelPdpFailureReason(reason: PluginFailureReason): PdpManagementLabel {
  return FAILURE_LABELS[reason]
}

export function labelPdpReasonCode(code: string): PdpManagementLabel {
  const knownFailure = FAILURE_LABELS[code as PluginFailureReason]
  if (knownFailure) return knownFailure
  return {
    code: sanitizeCode(code),
    label: humanizeCode(code),
    severity: severityForUnknownCode(code),
  }
}

export function sanitizePdpManagementText(
  value: string | null | undefined,
  fallback = 'Unavailable'
): string {
  return sanitizePluginDistributionText(value) ?? fallback
}

export function sanitizePdpManagementCode(value: string | null | undefined): string {
  return sanitizeCode(sanitizePluginDistributionText(value) ?? 'unknown')
}

function sanitizeCode(value: string): string {
  const code = value.trim().replace(/[^a-z0-9._:-]/giu, '_').slice(0, 128)
  return code || 'unknown'
}

function humanizeCode(value: string): string {
  const code = sanitizeCode(value)
  return code
    .split(/[_:-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function severityForUnknownCode(code: string): PdpManagementSeverity {
  if (code.includes('failed') || code.includes('invalid') || code.includes('revoked')) {
    return 'danger'
  }
  if (code.includes('missing') || code.includes('unsupported') || code.includes('unavailable')) {
    return 'warning'
  }
  return 'neutral'
}
