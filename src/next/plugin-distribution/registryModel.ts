import type {
  LocalControlledRootKind,
  LocalInstallSource,
} from './localPackageRegistration'
import { sanitizePluginDistributionText } from './sanitization'
import type {
  PluginFailureReason,
  PluginHealthStatus,
  PluginInstallState,
  PluginVerificationStatus,
} from './types'

export const PDP_PLUGIN_REGISTRY_STATES = [
  'discovered',
  'registered',
  'verifying',
  'verified',
  'enabled',
  'disabled',
  'failed',
  'uninstalled',
] as const

export type PdpPluginRegistryState = (typeof PDP_PLUGIN_REGISTRY_STATES)[number]

export type PdpPluginRegistryRecord = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  installSource: LocalInstallSource
  installRef: string
  packageRef: string | null
  registryState: PdpPluginRegistryState
  installState: PluginInstallState
  verificationStatus: PluginVerificationStatus
  enabled: boolean
  healthStatus: PluginHealthStatus
  failureReason: PluginFailureReason | null
  diagnostics: readonly string[]
}>

export type PdpPluginRegistryPublicDto = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  installSource: LocalInstallSource
  installRef: string
  packageRef: string | null
  registryState: PdpPluginRegistryState
  installState: PluginInstallState
  verificationStatus: PluginVerificationStatus
  enabled: boolean
  healthStatus: PluginHealthStatus
  failureReason: PluginFailureReason | null
}>

export type CreatePdpRegistryRecordInput = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  installSource: LocalInstallSource
  installRef: string
  packageRef?: string | null
  verificationStatus?: PluginVerificationStatus
  diagnostics?: readonly string[]
}>

export function createPdpRegistryRecord(
  input: CreatePdpRegistryRecordInput
): PdpPluginRegistryRecord {
  const verificationStatus = input.verificationStatus ?? 'unverified'
  const registryState = resolveInitialRegistryState(verificationStatus)
  return {
    pluginId: input.pluginId,
    pluginVersion: input.pluginVersion,
    runtimeKind: input.runtimeKind,
    controlledRootKind: input.controlledRootKind,
    installSource: input.installSource,
    installRef: input.installRef,
    packageRef: input.packageRef ?? null,
    registryState,
    installState: resolveInitialInstallState(registryState),
    verificationStatus,
    enabled: false,
    healthStatus: 'unknown',
    failureReason: verificationStatus === 'failed' ? 'signature_invalid' : null,
    diagnostics: (input.diagnostics ?? []).map(sanitizeDiagnosticText),
  }
}

export function toPdpRegistryPublicDto(
  record: PdpPluginRegistryRecord
): PdpPluginRegistryPublicDto {
  return {
    pluginId: record.pluginId,
    pluginVersion: record.pluginVersion,
    runtimeKind: record.runtimeKind,
    controlledRootKind: record.controlledRootKind,
    installSource: record.installSource,
    installRef: record.installRef,
    packageRef: record.packageRef,
    registryState: record.registryState,
    installState: record.installState,
    verificationStatus: record.verificationStatus,
    enabled: record.enabled,
    healthStatus: record.healthStatus,
    failureReason: record.failureReason,
  }
}

export function patchPdpRegistryRecord(
  record: PdpPluginRegistryRecord,
  patch: Partial<PdpPluginRegistryRecord>
): PdpPluginRegistryRecord {
  return {
    ...record,
    ...patch,
    diagnostics: patch.diagnostics
      ? patch.diagnostics.map(sanitizeDiagnosticText)
      : record.diagnostics,
  }
}

function resolveInitialRegistryState(
  verificationStatus: PluginVerificationStatus
): PdpPluginRegistryState {
  if (verificationStatus === 'verified') return 'verified'
  if (verificationStatus === 'failed') return 'failed'
  return 'registered'
}

function resolveInitialInstallState(
  state: PdpPluginRegistryState
): PluginInstallState {
  if (state === 'failed') return 'failed'
  if (state === 'verified') return 'installed'
  return 'not_installed'
}

function sanitizeDiagnosticText(detail: string): string {
  return sanitizePluginDistributionText(detail) ?? 'sanitized'
}
