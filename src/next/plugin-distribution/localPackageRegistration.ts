import type { PluginFailureReason } from './types'
import {
  type LocalPackageIdentity,
  type LocalPackageVerificationResult,
  canEnableAfterVerification,
} from './packageVerification'
import { readNonEmptyString } from './validation'
import { sanitizePluginDistributionText } from './sanitization'

export const LOCAL_CONTROLLED_ROOT_KINDS = ['user_local', 'portable', 'dev_only'] as const
export type LocalControlledRootKind = (typeof LOCAL_CONTROLLED_ROOT_KINDS)[number]

export const LOCAL_INSTALL_SOURCE = 'manual_local' as const
export type LocalInstallSource = typeof LOCAL_INSTALL_SOURCE

export type LocalPackageRegistrationInput = Readonly<{
  controlledRootKind: LocalControlledRootKind | string
  installRef: string
  packageRef?: string | null
  hostSelectedPath?: string | null
  verifiedPackage?: LocalPackageVerificationResult | null
  packageIdentity?: LocalPackageIdentity | null
}>

export type LocalPackageRegistrationRecord = Readonly<{
  packageId: string
  packageVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  installSource: LocalInstallSource
  installRef: string
  packageRef: string | null
  enabled: boolean
  hasHostSelection: boolean
  verificationStatus: 'verified' | 'unverified' | 'failed'
}>

export type LocalPackageRegistrationPublicDto = Readonly<{
  packageId: string
  packageVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  installSource: LocalInstallSource
  installRef: string
  packageRef: string | null
  enabled: boolean
  verificationStatus: 'verified' | 'unverified' | 'failed'
}>

export type LocalPackageRegistrationResult =
  | Readonly<{
      ok: true
      record: LocalPackageRegistrationRecord
      publicDto: LocalPackageRegistrationPublicDto
      diagnostics: readonly string[]
    }>
  | Readonly<{
      ok: false
      failureReason: PluginFailureReason
      diagnostics: readonly string[]
    }>

const ABSTRACT_REF_RE = /^[a-z0-9][a-z0-9._:-]{1,127}$/iu
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/u
const WINDOWS_UNC_PATH_RE = /^\\\\/u
const UNIX_ABSOLUTE_PATH_RE = /^\//u
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/iu
const PATH_TRAVERSAL_RE = /(^|[\\/])\.\.($|[\\/])/u

export function registerLocalPackage(
  input: LocalPackageRegistrationInput
): LocalPackageRegistrationResult {
  const controlledRootKind = normalizeRootKind(input.controlledRootKind)
  if (!controlledRootKind) {
    return fail(
      'install_root_unsafe',
      'controlledRootKind must be one of: user_local, portable, dev_only'
    )
  }

  const installRef = normalizeAbstractRef(input.installRef)
  if (!installRef.ok) {
    return fail('install_root_unsafe', installRef.diagnostic)
  }

  const packageRefResult = normalizeOptionalPackageRef(input.packageRef ?? null)
  if (!packageRefResult.ok) {
    return fail('package_path_unsafe', packageRefResult.diagnostic)
  }

  const boundaryPathResult = normalizeBoundaryHostPath(input.hostSelectedPath ?? null)
  if (!boundaryPathResult.ok) {
    return fail('install_root_unsafe', boundaryPathResult.diagnostic)
  }

  const verificationStatus = resolveVerificationStatus(input.verifiedPackage)
  const identity = resolvePackageIdentity(input.packageIdentity, input.verifiedPackage)
  if (!identity) {
    return fail('unknown', 'package identity is required for manual registration')
  }

  const record: LocalPackageRegistrationRecord = {
    packageId: identity.pluginId,
    packageVersion: identity.pluginVersion,
    runtimeKind: identity.runtimeKind,
    controlledRootKind,
    installSource: LOCAL_INSTALL_SOURCE,
    installRef: installRef.value,
    packageRef: packageRefResult.value,
    enabled: verificationStatus === 'verified',
    hasHostSelection: boundaryPathResult.hasBoundaryPath,
    verificationStatus,
  }

  return {
    ok: true,
    record,
    publicDto: toPublicRegistrationDto(record),
    diagnostics: [],
  }
}

export function toPublicRegistrationDto(
  record: LocalPackageRegistrationRecord
): LocalPackageRegistrationPublicDto {
  return {
    packageId: record.packageId,
    packageVersion: record.packageVersion,
    runtimeKind: record.runtimeKind,
    controlledRootKind: record.controlledRootKind,
    installSource: record.installSource,
    installRef: record.installRef,
    packageRef: record.packageRef,
    enabled: record.enabled,
    verificationStatus: record.verificationStatus,
  }
}

function resolveVerificationStatus(
  verifiedPackage: LocalPackageVerificationResult | null | undefined
): 'verified' | 'unverified' | 'failed' {
  if (!verifiedPackage) return 'unverified'
  if (!verifiedPackage.ok) return 'failed'
  return canEnableAfterVerification(verifiedPackage) ? 'verified' : 'unverified'
}

function resolvePackageIdentity(
  identity: LocalPackageIdentity | null | undefined,
  verification: LocalPackageVerificationResult | null | undefined
): LocalPackageIdentity | null {
  if (verification?.normalizedPackageIdentity) return verification.normalizedPackageIdentity
  return identity ?? null
}

function normalizeRootKind(input: string): LocalControlledRootKind | null {
  const normalized = readNonEmptyString(input)?.toLowerCase()
  if (!normalized) return null
  if (
    normalized === 'user_local' ||
    normalized === 'portable' ||
    normalized === 'dev_only'
  ) {
    return normalized
  }
  return null
}

function normalizeAbstractRef(
  input: string
): Readonly<{ ok: true; value: string } | { ok: false; diagnostic: string }> {
  const normalized = readNonEmptyString(input)
  if (!normalized) return { ok: false, diagnostic: 'installRef is required' }
  if (!ABSTRACT_REF_RE.test(normalized)) {
    return {
      ok: false,
      diagnostic: 'installRef must be an abstract token (no path separators or URL schemes)',
    }
  }
  if (containsPathIndicators(normalized)) {
    return { ok: false, diagnostic: 'installRef must not contain path traversal or absolute paths' }
  }
  return { ok: true, value: normalized }
}

function normalizeOptionalPackageRef(
  input: string | null
): Readonly<{ ok: true; value: string | null } | { ok: false; diagnostic: string }> {
  if (input === null) return { ok: true, value: null }
  const normalized = readNonEmptyString(input)
  if (!normalized) return { ok: false, diagnostic: 'packageRef cannot be blank when provided' }
  if (!ABSTRACT_REF_RE.test(normalized)) {
    return {
      ok: false,
      diagnostic: 'packageRef must be an abstract reference token',
    }
  }
  if (containsPathIndicators(normalized)) {
    return { ok: false, diagnostic: 'packageRef must not contain traversal or absolute path syntax' }
  }
  return { ok: true, value: normalized }
}

function normalizeBoundaryHostPath(
  input: string | null
): Readonly<
  | { ok: true; hasBoundaryPath: boolean }
  | { ok: false; diagnostic: string }
> {
  if (input === null) return { ok: true, hasBoundaryPath: false }
  const normalized = readNonEmptyString(input)
  if (!normalized) return { ok: false, diagnostic: 'hostSelectedPath cannot be blank when provided' }
  if (!isAbsolutePath(normalized)) {
    return {
      ok: false,
      diagnostic: 'hostSelectedPath must be absolute when provided by host boundary',
    }
  }
  if (normalized.includes('\u0000')) {
    return { ok: false, diagnostic: 'hostSelectedPath must not contain NUL' }
  }
  return { ok: true, hasBoundaryPath: true }
}

function isAbsolutePath(value: string): boolean {
  return (
    WINDOWS_ABSOLUTE_PATH_RE.test(value) ||
    WINDOWS_UNC_PATH_RE.test(value) ||
    UNIX_ABSOLUTE_PATH_RE.test(value)
  )
}

function containsPathIndicators(value: string): boolean {
  return (
    PATH_TRAVERSAL_RE.test(value) ||
    value.includes('\\') ||
    value.includes('/') ||
    WINDOWS_ABSOLUTE_PATH_RE.test(value) ||
    WINDOWS_UNC_PATH_RE.test(value) ||
    UNIX_ABSOLUTE_PATH_RE.test(value) ||
    URL_SCHEME_RE.test(value)
  )
}

function fail(
  failureReason: PluginFailureReason,
  diagnostic: string
): LocalPackageRegistrationResult {
  return {
    ok: false,
    failureReason,
    diagnostics: [sanitizeDiagnosticText(diagnostic)],
  }
}

function sanitizeDiagnosticText(detail: string): string {
  return sanitizePluginDistributionText(detail) ?? 'registration failed'
}
