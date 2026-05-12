import { createHash, createPublicKey, verify } from 'node:crypto'
import { sanitizePluginDistributionText } from './sanitization'
import { validatePluginSignatureEnvelope, validatePluginTrustRootMetadata } from './trustPolicy'
import type {
  PluginFailureReason,
  PluginPackageArchitecture,
  PluginPackageCompatibility,
  PluginPackagePlatform,
  PluginSignatureEnvelope,
  PluginTargetMetadata,
  PluginTrustRootMetadata,
} from './types'
import {
  compareSemverLike,
  detectRollbackVersion,
  isExpiredTimestamp,
  isRecord,
  isValidSha256,
  normalizeSha256,
  readFiniteNonNegativeInteger,
  readIsoTimestamp,
  readNonEmptyString,
  validateSafeRelativePath,
} from './validation'

export const SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS = ['ed25519'] as const
export type SupportedPluginCryptoSignatureAlgorithm =
  (typeof SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS)[number]

export type TrustedPluginPublicKeyMaterial = Readonly<{
  publicKeyRef: string
  publicKeyPem: string
}>

export type CryptoVerificationEnvironment = Readonly<{
  platform?: string
  architecture?: string
  appVersion?: string
}>

export type PluginCryptoVerificationInput = Readonly<{
  targetBytes: Uint8Array | string
  signatureEnvelope: unknown
  trustRoot: unknown
  targetMetadata: unknown
  trustedKeys: readonly TrustedPluginPublicKeyMaterial[]
  now?: Date
  previousTrustedVersion?: string | null
  expectedManifestSha256?: string | null
  expectedInventorySha256?: string | null
  compatibility?: PluginPackageCompatibility | null
  environment?: CryptoVerificationEnvironment
}>

export type PluginCryptoVerificationFailureReason =
  | PluginFailureReason
  | 'signature_algorithm_unsupported'
  | 'trusted_root_missing'
  | 'trusted_root_invalid'
  | 'target_metadata_invalid'
  | 'signature_value_invalid'

export type PluginCryptoVerificationStatus = 'verified' | 'failed' | 'expired'

export type PluginCryptoVerificationDiagnostic = Readonly<{
  code: string
  field: string
  detail?: string
}>

export type PluginCryptoVerificationResult = Readonly<{
  ok: boolean
  verificationStatus: PluginCryptoVerificationStatus
  failureReasons: readonly PluginCryptoVerificationFailureReason[]
  diagnostics: readonly PluginCryptoVerificationDiagnostic[]
  verifiedKeyId: string | null
  trustRootId: string | null
  cryptographicVerificationPerformed: boolean
  executableTrustApproved: boolean
}>

const SUPPORTED_ALGORITHM_SET = new Set<string>(SUPPORTED_PLUGIN_CRYPTO_SIGNATURE_ALGORITHMS)

// PDP4-A intentionally centralizes fail-closed crypto, integrity, rollback, and compatibility gates.
// eslint-disable-next-line complexity
export function verifyPluginPackageCryptographicTrust(
  input: PluginCryptoVerificationInput
): PluginCryptoVerificationResult {
  const diagnostics: PluginCryptoVerificationDiagnostic[] = []
  const failureReasons: PluginCryptoVerificationFailureReason[] = []
  const now = input.now ?? new Date()
  const targetBytes = normalizeTargetBytes(input.targetBytes)

  const signatureResult = validatePluginSignatureEnvelope(input.signatureEnvelope, { now })
  const signature = signatureResult.ok ? signatureResult.signature : null
  if (!signatureResult.ok) {
    diagnostics.push(...mapValidationDiagnostics(signatureResult.errors))
    failureReasons.push(...mapSignatureValidationFailures(signatureResult.errors, input.signatureEnvelope))
  }

  const rootResult = validatePluginTrustRootMetadata(input.trustRoot, { now })
  const root = rootResult.ok ? rootResult.root : null
  if (!rootResult.ok) {
    diagnostics.push(...mapValidationDiagnostics(rootResult.errors))
    failureReasons.push(...mapRootValidationFailures(rootResult.errors))
  }

  const targetResult = normalizeTargetMetadata(input.targetMetadata, now)
  if (!targetResult.target) {
    diagnostics.push(...targetResult.diagnostics)
    failureReasons.push('target_metadata_invalid')
  }

  if (targetResult.target) {
    enforcePayloadIntegrity(targetBytes, targetResult.target, diagnostics, failureReasons)
    enforceRollback(targetResult.target, input.previousTrustedVersion, diagnostics, failureReasons)
    enforceExpectedCoverage(signature, input, diagnostics, failureReasons)
    enforceCompatibility(input.compatibility, input.environment, diagnostics, failureReasons)
  }

  const keySelection =
    signature && root
      ? selectTrustedKey(signature, root, input.trustedKeys, diagnostics, failureReasons)
      : null

  let cryptographicVerificationPerformed = false
  if (
    signature &&
    targetResult.target &&
    keySelection &&
    !hasBlockingPreCryptoFailure(failureReasons)
  ) {
    cryptographicVerificationPerformed = true
    const cryptoOk = verifyDetachedSignature(targetBytes, signature, keySelection.publicKeyPem)
    if (!cryptoOk.ok) {
      diagnostics.push({ code: cryptoOk.reason, field: cryptoOk.field, detail: cryptoOk.detail })
      failureReasons.push(cryptoOk.reason)
    }
  }

  const uniqueReasons = uniqueFailureReasons(failureReasons)
  const ok = uniqueReasons.length === 0 && cryptographicVerificationPerformed
  const expired = uniqueReasons.includes('expired_metadata')

  return {
    ok,
    verificationStatus: ok ? 'verified' : expired ? 'expired' : 'failed',
    failureReasons: uniqueReasons,
    diagnostics: sanitizeDiagnostics(diagnostics),
    verifiedKeyId: ok ? signature?.keyId ?? null : null,
    trustRootId: ok ? keySelection?.publicKeyRef ?? null : null,
    cryptographicVerificationPerformed,
    executableTrustApproved: ok,
  }
}

function normalizeTargetBytes(value: Uint8Array | string): Uint8Array {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : value
}

function normalizeTargetMetadata(
  input: unknown,
  now: Date
): Readonly<{ target: PluginTargetMetadata | null; diagnostics: readonly PluginCryptoVerificationDiagnostic[] }> {
  const diagnostics: PluginCryptoVerificationDiagnostic[] = []
  if (!isRecord(input)) {
    return {
      target: null,
      diagnostics: [{ code: 'invalid_type', field: 'targetMetadata', detail: 'target metadata is required' }],
    }
  }

  const pluginId = requiredString(input.pluginId, 'targetMetadata.pluginId', diagnostics)
  const pluginVersion = requiredString(input.pluginVersion, 'targetMetadata.pluginVersion', diagnostics)
  const packageSha256 = requiredSha(input.packageSha256, 'targetMetadata.packageSha256', diagnostics)
  const packageSizeBytes = readFiniteNonNegativeInteger(input.packageSizeBytes)
  if (packageSizeBytes === null) {
    diagnostics.push({ code: 'invalid_size', field: 'targetMetadata.packageSizeBytes' })
  }
  const expiresAt = readIsoTimestamp(input.expiresAt)
  if (!expiresAt) {
    diagnostics.push({ code: 'invalid_timestamp', field: 'targetMetadata.expiresAt' })
  } else if (isExpiredTimestamp(expiresAt, now)) {
    diagnostics.push({ code: 'expired_metadata', field: 'targetMetadata.expiresAt' })
  }
  const signatureRef = validateSafeRelativePath(input.signatureRef)
  if (!signatureRef.ok) {
    diagnostics.push({ code: signatureRef.code, field: 'targetMetadata.signatureRef' })
  }
  const signatureRefPath = signatureRef.ok ? signatureRef.path : null

  if (diagnostics.length > 0) {
    return { target: null, diagnostics }
  }
  return {
    target: {
      pluginId: pluginId!,
      pluginVersion: pluginVersion!,
      packageSha256: packageSha256!,
      packageSizeBytes: packageSizeBytes!,
      expiresAt: expiresAt!,
      signatureRef: signatureRefPath!,
    },
    diagnostics: [],
  }
}

function requiredString(
  input: unknown,
  field: string,
  diagnostics: PluginCryptoVerificationDiagnostic[]
): string | null {
  const value = readNonEmptyString(input)
  if (!value) diagnostics.push({ code: 'missing_required', field })
  return value
}

function requiredSha(
  input: unknown,
  field: string,
  diagnostics: PluginCryptoVerificationDiagnostic[]
): string | null {
  if (!isValidSha256(input)) {
    diagnostics.push({ code: 'invalid_sha256', field })
    return null
  }
  return normalizeSha256(input)
}

function enforcePayloadIntegrity(
  targetBytes: Uint8Array,
  target: PluginTargetMetadata,
  diagnostics: PluginCryptoVerificationDiagnostic[],
  failureReasons: PluginCryptoVerificationFailureReason[]
): void {
  const actualHash = createHash('sha256').update(Buffer.from(targetBytes)).digest('hex')
  if (actualHash !== target.packageSha256) {
    diagnostics.push({
      code: 'hash_mismatch',
      field: 'targetMetadata.packageSha256',
      detail: 'package bytes do not match expected SHA-256',
    })
    failureReasons.push('hash_mismatch')
  }
  if (targetBytes.byteLength !== target.packageSizeBytes) {
    diagnostics.push({
      code: 'size_mismatch',
      field: 'targetMetadata.packageSizeBytes',
      detail: 'package bytes do not match expected size',
    })
    failureReasons.push('integrity_missing')
  }
}

function enforceRollback(
  target: PluginTargetMetadata,
  previousTrustedVersion: string | null | undefined,
  diagnostics: PluginCryptoVerificationDiagnostic[],
  failureReasons: PluginCryptoVerificationFailureReason[]
): void {
  const rollback = detectRollbackVersion(target.pluginVersion, previousTrustedVersion)
  if (rollback?.code === 'rollback_detected') {
    diagnostics.push({
      code: 'rollback_detected',
      field: 'targetMetadata.pluginVersion',
      detail: 'target version is older than previous trusted version',
    })
    failureReasons.push('rollback_detected')
  } else if (rollback?.code === 'invalid_version') {
    diagnostics.push({
      code: 'invalid_version',
      field: 'targetMetadata.pluginVersion',
      detail: 'target version cannot be compared safely',
    })
    failureReasons.push('target_metadata_invalid')
  }
}

function enforceExpectedCoverage(
  signature: PluginSignatureEnvelope | null,
  input: PluginCryptoVerificationInput,
  diagnostics: PluginCryptoVerificationDiagnostic[],
  failureReasons: PluginCryptoVerificationFailureReason[]
): void {
  if (!signature) return
  if (
    input.expectedManifestSha256 &&
    signature.coveredManifestSha256 !== normalizeSha256(input.expectedManifestSha256)
  ) {
    diagnostics.push({
      code: 'manifest_hash_mismatch',
      field: 'signatureEnvelope.coveredManifestSha256',
      detail: 'signature metadata does not cover expected manifest digest',
    })
    failureReasons.push('hash_mismatch')
  }
  if (
    input.expectedInventorySha256 &&
    signature.coveredInventorySha256 !== normalizeSha256(input.expectedInventorySha256)
  ) {
    diagnostics.push({
      code: 'inventory_hash_mismatch',
      field: 'signatureEnvelope.coveredInventorySha256',
      detail: 'signature metadata does not cover expected inventory digest',
    })
    failureReasons.push('hash_mismatch')
  }
}

function enforceCompatibility(
  compatibility: PluginPackageCompatibility | null | undefined,
  environment: CryptoVerificationEnvironment | undefined,
  diagnostics: PluginCryptoVerificationDiagnostic[],
  failureReasons: PluginCryptoVerificationFailureReason[]
): void {
  if (!compatibility) {
    diagnostics.push({
      code: 'missing_required',
      field: 'compatibility',
      detail: 'package compatibility metadata is required before trust approval',
    })
    failureReasons.push('target_metadata_invalid')
    return
  }
  const platform = normalizePlatform(environment?.platform)
  const architecture = normalizeArchitecture(environment?.architecture)
  const appVersion = readNonEmptyString(environment?.appVersion)

  if (!platform) {
    diagnostics.push({
      code: 'incompatible_platform',
      field: 'environment.platform',
      detail: 'current platform must be known before trust approval',
    })
    failureReasons.push('incompatible_platform')
  } else if (!compatibility.platforms.includes('any') && !compatibility.platforms.includes(platform)) {
    diagnostics.push({
      code: 'incompatible_platform',
      field: 'compatibility.platforms',
      detail: 'current platform is not supported by package metadata',
    })
    failureReasons.push('incompatible_platform')
  }
  if (!architecture) {
    diagnostics.push({
      code: 'incompatible_arch',
      field: 'environment.architecture',
      detail: 'current architecture must be known before trust approval',
    })
    failureReasons.push('incompatible_arch')
  } else if (!compatibility.architectures.includes('any') && !compatibility.architectures.includes(architecture)) {
    diagnostics.push({
      code: 'incompatible_arch',
      field: 'compatibility.architectures',
      detail: 'current architecture is not supported by package metadata',
    })
    failureReasons.push('incompatible_arch')
  }
  if (!appVersion || !satisfiesSemverRange(appVersion, compatibility.starverseVersionRange)) {
    diagnostics.push({
      code: 'incompatible_app_version',
      field: 'compatibility.starverseVersionRange',
      detail: appVersion
        ? 'current app version is outside package compatibility range'
        : 'current app version must be known before trust approval',
    })
    failureReasons.push('incompatible_app_version')
  }
}

function selectTrustedKey(
  signature: PluginSignatureEnvelope,
  root: PluginTrustRootMetadata,
  trustedKeys: readonly TrustedPluginPublicKeyMaterial[],
  diagnostics: PluginCryptoVerificationDiagnostic[],
  failureReasons: PluginCryptoVerificationFailureReason[]
): TrustedPluginPublicKeyMaterial | null {
  const rootKey = root.keys.find(
    (key) =>
      key.keyId === signature.keyId &&
      key.algorithm === signature.algorithm &&
      (key.role === 'targets' || key.role === 'root')
  )
  if (!rootKey) {
    diagnostics.push({
      code: 'trusted_root_missing',
      field: 'signatureEnvelope.keyId',
      detail: 'signature key is not present in trust root metadata',
    })
    failureReasons.push('trusted_root_missing')
    return null
  }

  const keyMaterial = trustedKeys.find((key) => key.publicKeyRef === rootKey.publicKeyRef)
  if (!keyMaterial || !readNonEmptyString(keyMaterial.publicKeyPem)) {
    diagnostics.push({
      code: 'trusted_root_invalid',
      field: 'trustedKeys',
      detail: 'trusted key material is missing for trust root publicKeyRef',
    })
    failureReasons.push('trusted_root_invalid')
    return null
  }
  return keyMaterial
}

function verifyDetachedSignature(
  targetBytes: Uint8Array,
  signature: PluginSignatureEnvelope,
  publicKeyPem: string
): Readonly<
  | { ok: true }
  | {
      ok: false
      reason: Extract<
        PluginCryptoVerificationFailureReason,
        'signature_invalid' | 'signature_value_invalid' | 'trusted_root_invalid'
      >
      field: string
      detail: string
    }
> {
  if (!SUPPORTED_ALGORITHM_SET.has(signature.algorithm)) {
    return {
      ok: false,
      reason: 'signature_invalid',
      field: 'signatureEnvelope.algorithm',
      detail: 'unsupported signature algorithm',
    }
  }

  const signatureBytes = decodeBase64(signature.value)
  if (!signatureBytes || signatureBytes.byteLength === 0) {
    return {
      ok: false,
      reason: 'signature_value_invalid',
      field: 'signatureEnvelope.value',
      detail: 'signature value must be valid base64',
    }
  }

  try {
    const publicKey = createPublicKey(publicKeyPem)
    const valid = verify(null, Buffer.from(targetBytes), publicKey, Buffer.from(signatureBytes))
    if (!valid) {
      return {
        ok: false,
        reason: 'signature_invalid',
        field: 'signatureEnvelope.value',
        detail: 'package signature verification failed',
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'trusted_root_invalid',
      field: 'trustedKeys.publicKeyPem',
      detail: 'trusted public key could not be parsed',
    }
  }
}

function mapValidationDiagnostics(
  errors: readonly Readonly<{ code: string; field: string; expected?: string; path?: string }>[]
): PluginCryptoVerificationDiagnostic[] {
  return errors.map((error) => ({
    code: error.code,
    field: error.field,
    detail: error.expected
      ? `expected ${error.expected}`
      : error.path
        ? `path=${error.path}`
        : undefined,
  }))
}

function mapSignatureValidationFailures(
  errors: readonly Readonly<{ code: string; field: string }>[],
  signatureEnvelope: unknown
): PluginCryptoVerificationFailureReason[] {
  if (signatureEnvelope === undefined || signatureEnvelope === null) return ['signature_missing', 'unsigned']
  return errors.map((error) => {
    if (error.field === 'algorithm' && error.code === 'unsupported_enum_value') {
      return 'signature_algorithm_unsupported'
    }
    if (error.code === 'expired_metadata') return 'expired_metadata'
    if (error.field === 'value') return 'signature_value_invalid'
    return 'signature_invalid'
  })
}

function mapRootValidationFailures(
  errors: readonly Readonly<{ code: string }>[]
): PluginCryptoVerificationFailureReason[] {
  return errors.map((error) => (error.code === 'expired_metadata' ? 'expired_metadata' : 'trusted_root_invalid'))
}

function hasBlockingPreCryptoFailure(
  failureReasons: readonly PluginCryptoVerificationFailureReason[]
): boolean {
  return failureReasons.some(
    (reason) =>
      reason !== 'signature_invalid' &&
      reason !== 'signature_value_invalid' &&
      reason !== 'trusted_root_invalid'
  )
}

function uniqueFailureReasons(
  reasons: readonly PluginCryptoVerificationFailureReason[]
): readonly PluginCryptoVerificationFailureReason[] {
  const seen = new Set<PluginCryptoVerificationFailureReason>()
  const out: PluginCryptoVerificationFailureReason[] = []
  for (const reason of reasons) {
    if (!seen.has(reason)) {
      seen.add(reason)
      out.push(reason)
    }
  }
  return out
}

function sanitizeDiagnostics(
  diagnostics: readonly PluginCryptoVerificationDiagnostic[]
): readonly PluginCryptoVerificationDiagnostic[] {
  return diagnostics.map((entry) => ({
    ...entry,
    detail: sanitizePluginDistributionText(entry.detail),
  }))
}

function decodeBase64(value: unknown): Uint8Array | null {
  const raw = readNonEmptyString(value)
  if (!raw) return null
  const normalized = raw.replace(/-/gu, '+').replace(/_/gu, '/')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(normalized)) {
    return null
  }
  try {
    return Buffer.from(normalized, 'base64')
  } catch {
    return null
  }
}

function normalizePlatform(input: string | undefined): PluginPackagePlatform | null {
  const normalized = input?.trim().toLowerCase()
  if (normalized === 'win32' || normalized === 'darwin' || normalized === 'linux') return normalized
  return normalized === 'any' ? 'any' : null
}

function normalizeArchitecture(input: string | undefined): PluginPackageArchitecture | null {
  const normalized = input?.trim().toLowerCase()
  if (normalized === 'x64' || normalized === 'arm64') return normalized
  return normalized === 'any' ? 'any' : null
}

function satisfiesSemverRange(currentVersion: string, starverseVersionRange: string): boolean {
  const range = starverseVersionRange.trim()
  if (!range) return false
  if (range.startsWith('>=')) {
    const comparison = compareSemverLike(currentVersion, range.slice(2).trim())
    return comparison !== null && comparison >= 0
  }
  if (range.startsWith('=')) {
    const comparison = compareSemverLike(currentVersion, range.slice(1).trim())
    return comparison !== null && comparison === 0
  }
  const comparison = compareSemverLike(currentVersion, range)
  return comparison !== null && comparison === 0
}
