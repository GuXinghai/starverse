import { evaluateCatalogEntryCompatibility, type CatalogCompatibilityEnvironment } from './catalogCompatibility'
import { validateOfficialCatalogSource, type OfficialCatalogSourceDescriptor } from './catalogSource'
import { validatePluginCatalogMetadata } from './catalogMetadata'
import { sanitizePluginDistributionText } from './sanitization'
import { validatePluginSignatureEnvelope } from './trustPolicy'
import type {
  PluginCatalogMetadata,
  PluginPackageCapability,
  PluginPackagePlatform,
  PluginPackageArchitecture,
} from './types'

export type CatalogReadTrustPolicy = Readonly<{
  requireSignedCatalogs: boolean
}>

export type OfficialCatalogValidationInput = Readonly<{
  source: OfficialCatalogSourceDescriptor
  catalog: unknown
  signatureMetadata?: unknown
  trustPolicy: CatalogReadTrustPolicy
  environment?: Readonly<{ now?: Date }>
  allowDevFixtures?: boolean
}>

export type OfficialCatalogValidationStatus = 'valid_metadata_only' | 'invalid'

export type OfficialCatalogFailureReason =
  | 'source_invalid'
  | 'catalog_invalid'
  | 'catalog_expired'
  | 'signature_missing'
  | 'signature_invalid'
  | 'target_metadata_missing'
  | 'unknown'

export type CatalogValidationDiagnostic = Readonly<{
  code: string
  field: string
  detail?: string
}>

export type OfficialCatalogValidationResult = Readonly<{
  ok: boolean
  status: OfficialCatalogValidationStatus
  failureReasons: readonly OfficialCatalogFailureReason[]
  diagnostics: readonly CatalogValidationDiagnostic[]
  catalogIdentity: Readonly<{
    catalogVersion: number
    sourceKind: 'official'
    sourceRef: string | null
  }> | null
  entryCount: number
  generatedAt: string | null
  expiresAt: string | null
  catalog: PluginCatalogMetadata | null
  trust: Readonly<{
    signatureMetadataPresent: boolean
    cryptographicVerificationDeferred: boolean
    executableTrustApproved: false
  }>
}>

export type CatalogEntryPresentationMetadata = Readonly<{
  displayName?: string
  publisher?: string
  capabilities?: readonly PluginPackageCapability[]
  modelVersion?: string | null
}>

export type CatalogReadModelInput = Readonly<{
  validation: OfficialCatalogValidationResult
  environment?: CatalogCompatibilityEnvironment
  entryMetadata?: Readonly<Record<string, CatalogEntryPresentationMetadata>>
}>

export type ReadOnlyCatalogEntryDto = Readonly<{
  pluginId: string
  displayName: string
  publisher: string
  pluginVersion: string
  runtimeKind: string
  capabilities: readonly PluginPackageCapability[]
  platformCompatibility: Readonly<{
    declaredPlatform: PluginPackagePlatform
    compatible: boolean
  }>
  architectureCompatibility: Readonly<{
    declaredArchitecture: PluginPackageArchitecture
    compatible: boolean
  }>
  appVersionCompatibility: Readonly<{
    declaredRange: string
    compatible: boolean
  }>
  modelVersion: string | null
  packageSizeBytes: number
  verificationMetadataStatus:
    | 'metadata_present_crypto_deferred'
    | 'production_signature_available'
    | 'metadata_missing'
    | 'metadata_invalid'
  catalogStatus: OfficialCatalogValidationStatus
  installabilityStatus:
    | 'metadata_compatible_future_install'
    | 'official_remote_install_available'
    | 'unavailable_read_only'
  reasons: readonly string[]
  warnings: readonly string[]
  packageRefLabel: string
}>

export type ReadOnlyCatalogDto = Readonly<{
  catalogStatus: OfficialCatalogValidationStatus
  entryCount: number
  generatedAt: string | null
  expiresAt: string | null
  entries: readonly ReadOnlyCatalogEntryDto[]
  diagnostics: readonly CatalogValidationDiagnostic[]
}>

export function validateOfficialPluginCatalog(
  input: OfficialCatalogValidationInput
): OfficialCatalogValidationResult {
  const diagnostics: CatalogValidationDiagnostic[] = []
  const failureReasons: OfficialCatalogFailureReason[] = []
  const now = input.environment?.now ?? new Date()

  const sourceResult = validateOfficialCatalogSource(input.source, {
    allowDevFixtures: input.allowDevFixtures,
  })
  if (!sourceResult.ok) {
    diagnostics.push(...sourceResult.diagnostics)
    failureReasons.push('source_invalid')
  }

  const catalogResult = validatePluginCatalogMetadata(input.catalog, { now })
  if (!catalogResult.ok) {
    diagnostics.push(...mapValidationErrors(catalogResult.errors))
    failureReasons.push(...mapCatalogErrorsToReasons(catalogResult.errors))
  }

  const signatureMetadataPresent =
    input.signatureMetadata !== undefined && input.signatureMetadata !== null
  const signatureResult = signatureMetadataPresent
    ? validatePluginSignatureEnvelope(input.signatureMetadata, { now })
    : null

  if (signatureResult && !signatureResult.ok) {
    diagnostics.push(...mapValidationErrors(signatureResult.errors))
    failureReasons.push('signature_invalid')
  }
  if (input.trustPolicy.requireSignedCatalogs && !signatureMetadataPresent) {
    diagnostics.push({
      code: 'signature_missing',
      field: 'signatureMetadata',
      detail: 'signed catalog policy requires signature metadata',
    })
    failureReasons.push('signature_missing')
  }

  const catalog = catalogResult.ok ? catalogResult.catalog : null
  const dedupedReasons = uniqueFailureReasons(failureReasons)
  const ok = dedupedReasons.length === 0

  return {
    ok,
    status: ok ? 'valid_metadata_only' : 'invalid',
    failureReasons: dedupedReasons,
    diagnostics: sanitizeDiagnostics(diagnostics),
    catalogIdentity:
      catalog && sourceResult.ok
        ? {
            catalogVersion: catalog.catalogVersion,
            sourceKind: catalog.sourceKind,
            sourceRef: sourceResult.source.sourceRef,
          }
        : null,
    entryCount: catalog?.entries.length ?? 0,
    generatedAt: catalog?.generatedAt ?? null,
    expiresAt: catalog?.expiresAt ?? null,
    catalog,
    trust: {
      signatureMetadataPresent,
      cryptographicVerificationDeferred: true,
      executableTrustApproved: false,
    },
  }
}

export function buildReadOnlyCatalogDto(input: CatalogReadModelInput): ReadOnlyCatalogDto {
  const catalog = input.validation.ok ? input.validation.catalog : null
  const entries = catalog
    ? catalog.entries.map((entry) => {
        const metadata = input.entryMetadata?.[entryKey(entry.pluginId, entry.pluginVersion)]
        const compatibility = evaluateCatalogEntryCompatibility(entry, input.environment, metadata)
        const installableFuture =
          input.validation.ok && compatibility.compatible && input.validation.trust.signatureMetadataPresent
        const warnings = input.validation.trust.cryptographicVerificationDeferred
          ? ['cryptographic_verification_deferred']
          : []
        return {
          pluginId: entry.pluginId,
          displayName: sanitizePluginDistributionText(metadata?.displayName) ?? entry.pluginId,
          publisher: sanitizePluginDistributionText(metadata?.publisher) ?? 'Starverse',
          pluginVersion: entry.pluginVersion,
          runtimeKind: entry.runtimeKind,
          capabilities: metadata?.capabilities ?? [],
          platformCompatibility: {
            declaredPlatform: entry.platform,
            compatible: compatibility.platformCompatible,
          },
          architectureCompatibility: {
            declaredArchitecture: entry.arch,
            compatible: compatibility.architectureCompatible,
          },
          appVersionCompatibility: {
            declaredRange: entry.compatibility.starverseVersionRange,
            compatible: compatibility.appVersionCompatible,
          },
          modelVersion: sanitizePluginDistributionText(metadata?.modelVersion) ?? null,
          packageSizeBytes: entry.packageSizeBytes,
          verificationMetadataStatus: resolveVerificationMetadataStatus(input.validation),
          catalogStatus: input.validation.status,
          installabilityStatus: installableFuture
            ? 'metadata_compatible_future_install'
            : 'unavailable_read_only',
          reasons: sanitizeStrings([
            ...input.validation.failureReasons,
            ...compatibility.reasons,
            'read_only_catalog_no_install_action',
          ]),
          warnings,
          packageRefLabel: safePackageRefLabel(entry.packageRef),
        } satisfies ReadOnlyCatalogEntryDto
      })
    : []

  return {
    catalogStatus: input.validation.status,
    entryCount: input.validation.entryCount,
    generatedAt: input.validation.generatedAt,
    expiresAt: input.validation.expiresAt,
    entries,
    diagnostics: input.validation.diagnostics,
  }
}

function resolveVerificationMetadataStatus(
  validation: OfficialCatalogValidationResult
): ReadOnlyCatalogEntryDto['verificationMetadataStatus'] {
  if (!validation.trust.signatureMetadataPresent) return 'metadata_missing'
  return validation.failureReasons.includes('signature_invalid')
    ? 'metadata_invalid'
    : 'metadata_present_crypto_deferred'
}

function mapValidationErrors(
  errors: readonly Readonly<{ code: string; field: string; expected?: string; path?: string }>[]
): CatalogValidationDiagnostic[] {
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

function mapCatalogErrorsToReasons(
  errors: readonly Readonly<{ code: string }>[]
): OfficialCatalogFailureReason[] {
  const reasons: OfficialCatalogFailureReason[] = []
  for (const error of errors) {
    switch (error.code) {
      case 'expired_metadata':
        reasons.push('catalog_expired')
        break
      case 'invalid_sha256':
      case 'invalid_size':
        reasons.push('target_metadata_missing')
        break
      default:
        reasons.push('catalog_invalid')
        break
    }
  }
  return reasons
}

function uniqueFailureReasons(
  reasons: readonly OfficialCatalogFailureReason[]
): readonly OfficialCatalogFailureReason[] {
  const seen = new Set<OfficialCatalogFailureReason>()
  const unique: OfficialCatalogFailureReason[] = []
  for (const reason of reasons) {
    if (!seen.has(reason)) {
      seen.add(reason)
      unique.push(reason)
    }
  }
  return unique
}

function sanitizeDiagnostics(
  diagnostics: readonly CatalogValidationDiagnostic[]
): readonly CatalogValidationDiagnostic[] {
  return diagnostics.map((entry) => ({
    ...entry,
    detail: sanitizePluginDistributionText(entry.detail),
  }))
}

function sanitizeStrings(values: readonly string[]): readonly string[] {
  return values
    .map((value) => sanitizePluginDistributionText(value))
    .filter((value): value is string => Boolean(value))
}

function safePackageRefLabel(packageRef: string): string {
  const parts = packageRef.split('/')
  return sanitizePluginDistributionText(parts[parts.length - 1]) ?? 'catalog-package'
}

function entryKey(pluginId: string, pluginVersion: string): string {
  return `${pluginId}@${pluginVersion}`
}
