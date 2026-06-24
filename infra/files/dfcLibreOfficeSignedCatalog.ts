import { createPublicKey, verify as verifySignature } from 'node:crypto'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  type DfcLibreOfficeTrustDistributionStatus,
  type DfcLibreOfficeTrustModel,
  type DfcOfficePdfRuntimeManifest,
} from './dfcManagedLibreOfficeRuntime'

export const DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION = '1' as const
export const DFC_LIBREOFFICE_SIGNED_CATALOG_TRUST_POLICY_ID =
  'owner_gated_hash_pinned_signed_catalog_required_for_production' satisfies DfcLibreOfficeTrustModel

export type DfcLibreOfficeCatalogSignatureAlgorithm = 'ed25519'
export type DfcLibreOfficeCatalogMode = 'owner_gated_candidate' | 'production'

export type DfcLibreOfficeCatalogDiagnosticCode =
  | 'office_pdf_catalog_signature_missing'
  | 'office_pdf_catalog_signature_invalid'
  | 'office_pdf_catalog_untrusted_key'
  | 'office_pdf_catalog_package_revoked'
  | 'office_pdf_catalog_package_expired'
  | 'office_pdf_catalog_package_mismatch'
  | 'office_pdf_catalog_schema_unsupported'
  | 'office_pdf_catalog_source_unapproved'

export type DfcLibreOfficeCatalogEntry = Readonly<{
  packageId: string
  runtimePackageId: string
  runtimeId: string
  pluginId: string
  runtimeVersion: string
  packageVersion: string
  platform: string
  arch: string
  packageSha256: string
  packageSizeBytes: number
  executableRelativePath: string
  executableSha256: string
  executableSizeBytes: number
  capabilities: readonly string[]
  sourceKind: 'github_prerelease_asset' | 'offline_import' | 'production_release_asset' | 'product_managed_mirror' | 'bundled_runtime'
  channel: 'owner_gated_candidate' | 'production'
  productionApproved: boolean
  trustPolicyId: DfcLibreOfficeTrustModel
  createdAt: string
  expiresAt?: string | null
  revokedAt?: string | null
  revocationReason?: string | null
  rollbackAllowed: boolean
  minimumStarverseContractVersion?: string | null
}>

export type DfcLibreOfficeSignedCatalogPayload = Readonly<{
  schemaVersion: typeof DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION
  catalogId: 'starverse-dfc-libreoffice-runtime-catalog'
  createdAt: string
  entries: readonly DfcLibreOfficeCatalogEntry[]
}>

export type DfcLibreOfficeSignedCatalogEnvelope = Readonly<{
  schemaVersion: typeof DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION
  payload: DfcLibreOfficeSignedCatalogPayload
  signature: Readonly<{
    algorithm: DfcLibreOfficeCatalogSignatureAlgorithm
    keyId: string
    value: string
    signedAt?: string | null
  }>
}>

export type DfcLibreOfficeSignedCatalogTrustRoot = Readonly<{
  schemaVersion: typeof DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION
  trustedKeys: readonly Readonly<{
    keyId: string
    algorithm: DfcLibreOfficeCatalogSignatureAlgorithm
    publicKeyPem: string
    scope: 'test_only' | 'owner_controlled_production'
  }>[]
}>

export type DfcLibreOfficeCatalogPackageEvidence = Readonly<{
  sha256: string
  sizeBytes: number
}>

export type DfcLibreOfficeCatalogVerificationInput = Readonly<{
  envelope: DfcLibreOfficeSignedCatalogEnvelope | null
  trustRoot: DfcLibreOfficeSignedCatalogTrustRoot
  packageEvidence: DfcLibreOfficeCatalogPackageEvidence
  manifest: DfcOfficePdfRuntimeManifest
  mode: DfcLibreOfficeCatalogMode
  now?: Date | string | null
}>

export type DfcLibreOfficeCatalogVerificationResult =
  | Readonly<{
      ok: true
      entry: DfcLibreOfficeCatalogEntry
      diagnostics: readonly []
      trust: Partial<DfcLibreOfficeTrustDistributionStatus>
    }>
  | Readonly<{
      ok: false
      entry: DfcLibreOfficeCatalogEntry | null
      diagnosticCode: DfcLibreOfficeCatalogDiagnosticCode
      diagnostics: readonly string[]
      trust: Partial<DfcLibreOfficeTrustDistributionStatus>
    }>

export type DfcLibreOfficeCatalogRollbackInput = Readonly<{
  currentEntry: DfcLibreOfficeCatalogEntry
  rollbackEntry: DfcLibreOfficeCatalogEntry
  rollbackVerification: DfcLibreOfficeCatalogVerificationResult
  mode: DfcLibreOfficeCatalogMode
  now?: Date | string | null
}>

export type DfcLibreOfficeCatalogRollbackResult =
  | Readonly<{
      ok: true
      rollbackEligibility: 'eligible'
      diagnostics: readonly []
      trust: Partial<DfcLibreOfficeTrustDistributionStatus>
    }>
  | Readonly<{
      ok: false
      rollbackEligibility: 'ineligible'
      reason: 'identity_mismatch' | 'platform_arch_mismatch' | 'catalog_verification_failed' | 'revoked' | 'expired' | 'rollback_disallowed' | 'trust_policy_failed'
      diagnostics: readonly string[]
      trust: Partial<DfcLibreOfficeTrustDistributionStatus>
    }>

const FULL_SHA256_RE = /^[a-f0-9]{64}$/u

export function canonicalizeDfcLibreOfficeCatalogPayload(payload: DfcLibreOfficeSignedCatalogPayload): string {
  return canonicalJson(payload)
}

export function evaluateDfcLibreOfficeUnsignedCatalogCompatibility(input: Readonly<{
  hashPinned: boolean
  mode: DfcLibreOfficeCatalogMode
}>): DfcLibreOfficeCatalogVerificationResult {
  const trust = input.hashPinned
    ? ownerGatedHashPinnedTrust()
    : blockedTrust('office_pdf_catalog_package_mismatch')
  if (input.mode === 'owner_gated_candidate' && input.hashPinned) {
    return {
      ok: true,
      entry: unsignedCompatibilityEntry(),
      diagnostics: [],
      trust,
    }
  }
  return {
    ok: false,
    entry: null,
    diagnosticCode: 'office_pdf_catalog_signature_missing',
    diagnostics: ['office_pdf_catalog_signature_missing'],
    trust: {
      ...trust,
      productionTrustReadiness: input.hashPinned ? 'blocked_signature_missing' : 'blocked_package_mismatch',
      lastVerificationResult: 'blocked',
      diagnosticCode: 'office_pdf_catalog_signature_missing',
    },
  }
}

export function verifyDfcLibreOfficeSignedCatalog(
  input: DfcLibreOfficeCatalogVerificationInput
): DfcLibreOfficeCatalogVerificationResult {
  if (!input.envelope) {
    return fail(null, 'office_pdf_catalog_signature_missing')
  }
  if (
    input.envelope.schemaVersion !== DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION ||
    input.envelope.payload?.schemaVersion !== DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION
  ) {
    return fail(null, 'office_pdf_catalog_schema_unsupported')
  }
  if (input.envelope.signature.algorithm !== 'ed25519') {
    return fail(null, 'office_pdf_catalog_signature_invalid')
  }
  const trustedKey = input.trustRoot.trustedKeys.find((key) =>
    key.keyId === input.envelope?.signature.keyId &&
    key.algorithm === input.envelope?.signature.algorithm
  )
  if (!trustedKey || input.trustRoot.schemaVersion !== DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION) {
    return fail(null, 'office_pdf_catalog_untrusted_key')
  }
  if (!verifyCatalogSignature(input.envelope, trustedKey.publicKeyPem)) {
    return fail(null, 'office_pdf_catalog_signature_invalid')
  }

  const entry = findMatchingEntry(input.envelope.payload.entries, input.manifest)
  if (!entry) return fail(null, 'office_pdf_catalog_package_mismatch')
  const baseTrust = signedTrust(entry)
  if (!entryMatchesEvidence(entry, input.packageEvidence, input.manifest)) {
    return fail(entry, 'office_pdf_catalog_package_mismatch', baseTrust)
  }
  if (entry.revokedAt) {
    return fail(entry, 'office_pdf_catalog_package_revoked', {
      ...baseTrust,
      trustStates: ['revoked'],
      revocationStatus: 'revoked',
      productionTrustReadiness: 'blocked_revoked',
    })
  }
  if (entry.expiresAt && isExpired(entry.expiresAt, input.now)) {
    return fail(entry, 'office_pdf_catalog_package_expired', {
      ...baseTrust,
      trustStates: ['expired'],
      expirationStatus: 'expired',
      productionTrustReadiness: 'blocked_expired',
    })
  }
  if (!isSourceAllowed(entry, input.mode)) {
    return fail(entry, 'office_pdf_catalog_source_unapproved', {
      ...baseTrust,
      trustStates: ['production_source_unapproved'],
      productionTrustReadiness: 'blocked_source_unapproved',
    })
  }

  return {
    ok: true,
    entry,
    diagnostics: [],
    trust: {
      ...baseTrust,
      productionTrustReadiness: entry.productionApproved && entry.channel === 'production' ? 'ready' : 'blocked_source_unapproved',
      ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
    },
  }
}

export function evaluateDfcLibreOfficeCatalogRollbackEligibility(
  input: DfcLibreOfficeCatalogRollbackInput
): DfcLibreOfficeCatalogRollbackResult {
  const { currentEntry, rollbackEntry } = input
  if (
    currentEntry.pluginId !== rollbackEntry.pluginId ||
    currentEntry.runtimeId !== rollbackEntry.runtimeId ||
    currentEntry.runtimePackageId !== rollbackEntry.runtimePackageId
  ) {
    return rollbackFail('identity_mismatch', 'office_pdf_catalog_package_mismatch')
  }
  if (currentEntry.platform !== rollbackEntry.platform || currentEntry.arch !== rollbackEntry.arch) {
    return rollbackFail('platform_arch_mismatch', 'office_pdf_catalog_package_mismatch')
  }
  if (!input.rollbackVerification.ok) {
    return rollbackFail('catalog_verification_failed', input.rollbackVerification.diagnosticCode)
  }
  if (rollbackEntry.revokedAt) return rollbackFail('revoked', 'office_pdf_catalog_package_revoked')
  if (rollbackEntry.expiresAt && isExpired(rollbackEntry.expiresAt, input.now)) {
    return rollbackFail('expired', 'office_pdf_catalog_package_expired')
  }
  if (!rollbackEntry.rollbackAllowed) return rollbackFail('rollback_disallowed', 'office_pdf_catalog_package_mismatch')
  if (input.mode === 'production' && input.rollbackVerification.trust.productionTrustReadiness !== 'ready') {
    return rollbackFail('trust_policy_failed', 'office_pdf_catalog_source_unapproved')
  }
  return {
    ok: true,
    rollbackEligibility: 'eligible',
    diagnostics: [],
    trust: {
      ...input.rollbackVerification.trust,
      rollbackEligibility: 'eligible',
    },
  }
}

function verifyCatalogSignature(envelope: DfcLibreOfficeSignedCatalogEnvelope, publicKeyPem: string): boolean {
  try {
    const signedPayload = Buffer.from(canonicalizeDfcLibreOfficeCatalogPayload(envelope.payload), 'utf8')
    const publicKey = createPublicKey(publicKeyPem)
    return verifySignature(null, signedPayload, publicKey, Buffer.from(envelope.signature.value, 'base64'))
  } catch {
    return false
  }
}

function findMatchingEntry(
  entries: readonly DfcLibreOfficeCatalogEntry[],
  manifest: DfcOfficePdfRuntimeManifest
): DfcLibreOfficeCatalogEntry | null {
  return entries.find((entry) =>
    entry.packageId === manifest.packageId &&
    entry.runtimePackageId === (manifest.runtimePackageId ?? manifest.packageId) &&
    entry.runtimeId === manifest.runtimeId &&
    entry.pluginId === (manifest.pluginId ?? DFC_OFFICE_PDF_PLUGIN_ID) &&
    entry.runtimeVersion === manifest.libreOfficeVersion &&
    entry.packageVersion === manifest.packageVersion &&
    entry.platform === manifest.platform &&
    entry.arch === (manifest.arch ?? '')
  ) ?? null
}

function entryMatchesEvidence(
  entry: DfcLibreOfficeCatalogEntry,
  packageEvidence: DfcLibreOfficeCatalogPackageEvidence,
  manifest: DfcOfficePdfRuntimeManifest
): boolean {
  return isSha(entry.packageSha256) &&
    entry.packageSha256 === packageEvidence.sha256.toLowerCase() &&
    entry.packageSizeBytes === packageEvidence.sizeBytes &&
    entry.executableRelativePath === manifest.executablePath &&
    entry.executableSha256 === manifest.executableSha256?.toLowerCase() &&
    entry.executableSizeBytes === manifest.executableSizeBytes &&
    DFC_OFFICE_PDF_CAPABILITIES.every((capability) => entry.capabilities.includes(capability)) &&
    DFC_OFFICE_PDF_CAPABILITIES.every((capability) => (manifest.capabilities ?? []).includes(capability)) &&
    entry.trustPolicyId === DFC_LIBREOFFICE_SIGNED_CATALOG_TRUST_POLICY_ID &&
    entry.minimumStarverseContractVersion === manifest.minimumStarverseContractVersion
}

function isSourceAllowed(entry: DfcLibreOfficeCatalogEntry, mode: DfcLibreOfficeCatalogMode): boolean {
  if (mode === 'owner_gated_candidate') {
    return entry.channel === 'owner_gated_candidate' || entry.channel === 'production'
  }
  return entry.channel === 'production' && entry.productionApproved === true
}

function signedTrust(entry: DfcLibreOfficeCatalogEntry): Partial<DfcLibreOfficeTrustDistributionStatus> {
  return {
    trustStates: ['hash_pinned', 'signature_valid', 'catalog_trusted', ...(entry.productionApproved ? [] : ['production_source_unapproved' as const])],
    distributionStates: [
      entry.productionApproved && entry.channel === 'production' ? 'windows_x64_production_approved' : entry.channel === 'production' ? 'production_release_pending_approval' : 'prerelease_source_owner_gated',
      'offline_import_allowed',
      ...(entry.productionApproved ? ['manual_github_release_allowed' as const, 'verified_offline_import_allowed' as const] : []),
      'download_disabled_by_policy',
    ],
    packageDecision: entry.productionApproved
      ? 'approved_windows_x64_docx_to_pdf_production_asset'
      : 'candidate_production_asset_pending_signing_legal_approval',
    signatureCatalogStatus: 'signature_valid_catalog_trusted',
    catalogSignatureStatus: 'valid',
    keyIdStatus: 'trusted',
    revocationStatus: 'not_revoked',
    expirationStatus: 'not_expired',
    rollbackEligibility: entry.rollbackAllowed ? 'eligible' : 'ineligible',
    productionTrustReadiness: entry.productionApproved && entry.channel === 'production' ? 'ready' : 'blocked_source_unapproved',
    ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
    lastVerificationResult: 'signed_catalog_verified',
    diagnosticCode: null,
  }
}

function ownerGatedHashPinnedTrust(): Partial<DfcLibreOfficeTrustDistributionStatus> {
  return {
    trustStates: ['unsigned_owner_gated', 'hash_pinned', 'signature_missing', 'catalog_untrusted', 'production_source_unapproved'],
    distributionStates: ['prerelease_source_owner_gated', 'offline_import_allowed', 'download_disabled_by_policy'],
    packageDecision: 'candidate_production_asset_pending_signing_legal_approval',
    signatureCatalogStatus: 'signature_missing_catalog_unsigned',
    catalogSignatureStatus: 'missing',
    keyIdStatus: 'not_checked',
    revocationStatus: 'not_checked',
    expirationStatus: 'not_checked',
    rollbackEligibility: 'not_evaluated',
    productionTrustReadiness: 'blocked_signature_missing',
    ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
    lastVerificationResult: 'hash_pin_matched',
    diagnosticCode: null,
  }
}

function blockedTrust(code: DfcLibreOfficeCatalogDiagnosticCode): Partial<DfcLibreOfficeTrustDistributionStatus> {
  return {
    trustStates: code === 'office_pdf_catalog_package_revoked'
      ? ['revoked']
      : code === 'office_pdf_catalog_package_expired'
        ? ['expired']
        : ['signature_invalid', 'catalog_untrusted'],
    distributionStates: ['distribution_mode_unapproved', 'download_disabled_by_policy'],
    packageDecision: code === 'office_pdf_catalog_package_revoked' ? 'rejected' : 'replace_before_production',
    signatureCatalogStatus: code === 'office_pdf_catalog_signature_missing' ? 'signature_missing_catalog_unsigned' : 'signature_invalid_or_catalog_untrusted',
    catalogSignatureStatus: code === 'office_pdf_catalog_signature_missing' ? 'missing' : 'invalid',
    keyIdStatus: code === 'office_pdf_catalog_untrusted_key' ? 'untrusted' : 'not_checked',
    revocationStatus: code === 'office_pdf_catalog_package_revoked' ? 'revoked' : 'not_checked',
    expirationStatus: code === 'office_pdf_catalog_package_expired' ? 'expired' : 'not_checked',
    rollbackEligibility: 'ineligible',
    productionTrustReadiness: readinessForCode(code),
    ownerGatedCandidateReadiness: 'blocked',
    lastVerificationResult: 'blocked',
    diagnosticCode: code,
  }
}

function readinessForCode(code: DfcLibreOfficeCatalogDiagnosticCode): DfcLibreOfficeTrustDistributionStatus['productionTrustReadiness'] {
  switch (code) {
    case 'office_pdf_catalog_signature_missing':
      return 'blocked_signature_missing'
    case 'office_pdf_catalog_signature_invalid':
      return 'blocked_catalog_invalid'
    case 'office_pdf_catalog_untrusted_key':
      return 'blocked_untrusted_key'
    case 'office_pdf_catalog_package_revoked':
      return 'blocked_revoked'
    case 'office_pdf_catalog_package_expired':
      return 'blocked_expired'
    case 'office_pdf_catalog_package_mismatch':
    case 'office_pdf_catalog_schema_unsupported':
      return 'blocked_package_mismatch'
    case 'office_pdf_catalog_source_unapproved':
      return 'blocked_source_unapproved'
  }
}

function fail(
  entry: DfcLibreOfficeCatalogEntry | null,
  code: DfcLibreOfficeCatalogDiagnosticCode,
  trust?: Partial<DfcLibreOfficeTrustDistributionStatus>
): Extract<DfcLibreOfficeCatalogVerificationResult, { ok: false }> {
  return {
    ok: false,
    entry,
    diagnosticCode: code,
    diagnostics: [code],
    trust: trust ?? blockedTrust(code),
  }
}

function rollbackFail(
  reason: Extract<DfcLibreOfficeCatalogRollbackResult, { ok: false }>['reason'],
  code: DfcLibreOfficeCatalogDiagnosticCode
): Extract<DfcLibreOfficeCatalogRollbackResult, { ok: false }> {
  return {
    ok: false,
    rollbackEligibility: 'ineligible',
    reason,
    diagnostics: [code],
    trust: {
      ...blockedTrust(code),
      rollbackEligibility: 'ineligible',
    },
  }
}

function unsignedCompatibilityEntry(): DfcLibreOfficeCatalogEntry {
  return {
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    runtimeVersion: 'owner-gated-candidate',
    packageVersion: 'owner-gated-candidate',
    platform: 'win32',
    arch: 'x64',
    packageSha256: '0'.repeat(64),
    packageSizeBytes: 0,
    executableRelativePath: 'program/soffice.exe',
    executableSha256: '0'.repeat(64),
    executableSizeBytes: 0,
    capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
    sourceKind: 'github_prerelease_asset',
    channel: 'owner_gated_candidate',
    productionApproved: false,
    trustPolicyId: DFC_LIBREOFFICE_SIGNED_CATALOG_TRUST_POLICY_ID,
    createdAt: '1970-01-01T00:00:00.000Z',
    rollbackAllowed: false,
    minimumStarverseContractVersion: '1',
  }
}

function isExpired(value: string, now: Date | string | null | undefined): boolean {
  const expiresAt = Date.parse(value)
  if (!Number.isFinite(expiresAt)) return true
  const reference = now instanceof Date
    ? now.getTime()
    : typeof now === 'string'
      ? Date.parse(now)
      : Date.now()
  return Number.isFinite(reference) && expiresAt <= reference
}

function isSha(value: string): boolean {
  return FULL_SHA256_RE.test(value)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}
