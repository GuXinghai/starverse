import type { EngineId, EnginePlatform, EngineFailureReason } from './externalEngineTypes'
import type { TrustedCatalogPublicKey, TrustedCatalogPublicKeyMap } from './pluginCatalogSignature'

export const TRUST_ROOT_SCOPES = ['production', 'test', 'development'] as const
export type TrustRootScope = (typeof TRUST_ROOT_SCOPES)[number]

export const TRUST_ROOT_ENVIRONMENTS = ['production', 'test', 'development', 'unknown'] as const
export type TrustRootEnvironment = (typeof TRUST_ROOT_ENVIRONMENTS)[number]

export type TrustedRootMetadata = Readonly<{
  keyId: string
  algorithm: 'ed25519'
  publicKeyPem: string
  version: number
  scope: TrustRootScope
  environment: TrustRootEnvironment
  activatedAt: string | null
  expiresAt: string | null
  revoked: boolean
}>

export function trustedRootMetadataFromPublicKey(
  key: TrustedCatalogPublicKey,
  overrides?: Partial<Pick<TrustedRootMetadata, 'version' | 'scope' | 'environment' | 'activatedAt' | 'expiresAt' | 'revoked'>>,
): TrustedRootMetadata {
  return {
    keyId: key.keyId,
    algorithm: 'ed25519',
    publicKeyPem: key.publicKeyPem,
    version: overrides?.version ?? 1,
    scope: overrides?.scope ?? 'production',
    environment: overrides?.environment ?? 'unknown',
    activatedAt: overrides?.activatedAt ?? null,
    expiresAt: overrides?.expiresAt ?? null,
    revoked: overrides?.revoked ?? false,
  }
}

export type VerificationBinding = Readonly<{
  engineId: EngineId
  platform: EnginePlatform | null
  pluginVersion: string | null
  modelVersion: string | null
  license: string | null
  attribution: string | null
}>

export function emptyVerificationBinding(): VerificationBinding {
  return {
    engineId: '' as EngineId,
    platform: null,
    pluginVersion: null,
    modelVersion: null,
    license: null,
    attribution: null,
  }
}

export type TrustVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'failed'
  | 'revoked'
  | 'expired'
  | 'unconfigured'

export const TRUST_VERIFICATION_STATUSES: readonly TrustVerificationStatus[] = [
  'unverified',
  'verified',
  'failed',
  'revoked',
  'expired',
  'unconfigured',
] as const

export type TrustVerificationFailureDetail =
  | 'trusted_root_unconfigured'
  | 'trusted_root_expired'
  | 'trusted_root_revoked'
  | 'catalog_signature_invalid'
  | 'catalog_signature_missing'
  | 'catalog_entry_not_found'
  | 'manifest_hash_mismatch'
  | 'package_hash_mismatch'
  | 'manifest_engine_mismatch'
  | 'manifest_version_mismatch'
  | 'manifest_platform_mismatch'
  | 'manifest_model_version_mismatch'
  | 'manifest_license_missing'
  | 'manifest_attribution_missing'
  | 'integrity_verification_failed'
  | 'plugin_not_found'
  | 'install_root_kind_mismatch'

export type PluginVerificationResult = Readonly<
  | { ok: true; status: TrustVerificationStatus; detail: null }
  | { ok: false; status: TrustVerificationStatus; detail: TrustVerificationFailureDetail | null }
>

export function unverifiedResult(): PluginVerificationResult {
  return { ok: false, status: 'unverified', detail: null }
}

export function verifiedResult(): PluginVerificationResult {
  return { ok: true, status: 'verified', detail: null }
}

export function failedResult(detail: TrustVerificationFailureDetail): PluginVerificationResult {
  return { ok: false, status: 'failed', detail }
}

export function revokedResult(detail?: TrustVerificationFailureDetail): PluginVerificationResult {
  return { ok: false, status: 'revoked', detail: detail ?? 'trusted_root_revoked' }
}

export function unconfiguredResult(): PluginVerificationResult {
  return { ok: false, status: 'unconfigured', detail: 'trusted_root_unconfigured' }
}

export function isPluginVerified(result: PluginVerificationResult): boolean {
  return result.ok
}

export function mapVerificationStatusToFailureReason(
  detail: TrustVerificationFailureDetail | null,
): EngineFailureReason | null {
  switch (detail) {
    case 'integrity_verification_failed':
    case 'manifest_hash_mismatch':
    case 'package_hash_mismatch':
      return 'hash_mismatch'
    case 'plugin_not_found':
      return 'plugin_not_found'
    case 'manifest_engine_mismatch':
    case 'manifest_version_mismatch':
    case 'manifest_model_version_mismatch':
    case 'manifest_license_missing':
    case 'manifest_attribution_missing':
      return 'manifest_invalid'
    case 'manifest_platform_mismatch':
      return 'platform_unsupported'
    case 'install_root_kind_mismatch':
    case 'trusted_root_unconfigured':
    case 'trusted_root_expired':
    case 'trusted_root_revoked':
    case 'catalog_signature_invalid':
    case 'catalog_signature_missing':
    case 'catalog_entry_not_found':
      return 'disabled_by_policy'
    case null:
      return null
    default: {
      const _unreachable: never = detail
      return _unreachable
    }
  }
}

export function sanitizeVerificationDetail(detail: string | null): string | null {
  if (!detail) return null
  let sanitized = detail
  // redact local paths
  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s,;]+/g, '[path]')
  sanitized = sanitized.replace(/\/[^\s,;]+\/[^\s,;]+/g, '[path]')
  // redact sha256 hashes (64 hex chars)
  sanitized = sanitized.replace(/\b[a-f0-9]{64}\b/g, '[hash]')
  // redact base64 public key material
  sanitized = sanitized.replace(/-----BEGIN PUBLIC KEY-----[^-]+-----END PUBLIC KEY-----/g, '[public-key]')
  return sanitized
}

export function resolveTrustRootEnvironment(env: {
  readonly isProduction?: boolean
  readonly isTest?: boolean
}): TrustRootEnvironment {
  if (env.isProduction) return 'production'
  if (env.isTest) return 'test'
  return 'development'
}

export function filterActiveTrustedRoots(
  roots: TrustedCatalogPublicKeyMap,
  metadata?: Readonly<Record<string, TrustedRootMetadata>>,
): TrustedCatalogPublicKeyMap {
  if (!metadata) return roots
  const now = new Date().toISOString()
  const filtered: Record<string, TrustedCatalogPublicKey> = {}
  for (const [keyId, key] of Object.entries(roots)) {
    const meta = metadata[keyId]
    if (!meta) {
      filtered[keyId] = key
      continue
    }
    if (meta.revoked) continue
    if (meta.expiresAt && meta.expiresAt <= now) continue
    filtered[keyId] = key
  }
  return filtered
}

export const OFFICIAL_TRUST_ROOT_SCOPE = 'production' satisfies TrustRootScope
export const TEST_TRUST_ROOT_SCOPE = 'test' satisfies TrustRootScope
export const DEV_TRUST_ROOT_SCOPE = 'development' satisfies TrustRootScope
