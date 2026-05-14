import {
  downloadOfficialPackageToMemory,
  type DownloadOfficialPackageInput,
  type PackageDownloadFailureReason,
  type PackageDownloadTransport,
  type StagedDownloadedPackage,
} from './packageDownloader'
import {
  verifyPluginPackageCryptographicTrust,
  type CryptoVerificationEnvironment,
  type PluginCryptoVerificationFailureReason,
  type PluginCryptoVerificationResult,
  type TrustedPluginPublicKeyMaterial,
} from './cryptoVerification'
import type {
  PluginCatalogEntry,
  PluginPackageCompatibility,
  PluginSignatureEnvelope,
  PluginTargetMetadata,
  PluginTrustRootMetadata,
} from './types'

export type OfficialPackageReleaseMetadata = Readonly<{
  catalogEntry: PluginCatalogEntry
  releaseUrl: string
  remoteInstallEnabled: boolean
  downloadPolicy: DownloadOfficialPackageInput['policy']
  signatureEnvelope: PluginSignatureEnvelope
  trustRoot: PluginTrustRootMetadata
  trustedKeys: readonly TrustedPluginPublicKeyMaterial[]
  targetMetadata: PluginTargetMetadata
  compatibility: PluginPackageCompatibility
}>

export type OfficialPackageReleaseVerificationFailureReason =
  | 'remote_install_disabled'
  | PackageDownloadFailureReason
  | PluginCryptoVerificationFailureReason

export type OfficialPackageReleaseVerificationResult =
  | Readonly<{
      ok: true
      status: 'downloaded_verified_trusted'
      stagedPackage: StagedDownloadedPackage
      crypto: PluginCryptoVerificationResult
    }>
  | Readonly<{
      ok: false
      status: 'blocked' | 'download_failed' | 'signature_failed'
      failureReasons: readonly OfficialPackageReleaseVerificationFailureReason[]
      diagnostics: readonly string[]
      crypto: PluginCryptoVerificationResult | null
    }>

export type VerifyOfficialPackageReleaseInput = Readonly<{
  release: OfficialPackageReleaseMetadata
  transport: PackageDownloadTransport
  environment: CryptoVerificationEnvironment
  now?: Date
  previousTrustedVersion?: string | null
  signal?: AbortSignal
}>

export async function verifyOfficialPackageReleaseDownload(
  input: VerifyOfficialPackageReleaseInput
): Promise<OfficialPackageReleaseVerificationResult> {
  if (!input.release.remoteInstallEnabled) {
    return fail('blocked', ['remote_install_disabled'], ['remote install is disabled for this official package'], null)
  }

  const download = await downloadOfficialPackageToMemory({
    packageRef: {
      pluginId: input.release.catalogEntry.pluginId,
      pluginVersion: input.release.catalogEntry.pluginVersion,
      packageRef: input.release.releaseUrl,
      sourceKind: 'catalog_official',
      catalogStatus: 'valid_metadata_only',
      installabilityStatus: 'verified_future_install',
      packageSha256: input.release.catalogEntry.packageSha256,
      packageSizeBytes: input.release.catalogEntry.packageSizeBytes,
    },
    policy: input.release.downloadPolicy,
    transport: input.transport,
    signal: input.signal,
  })
  if (!download.ok) {
    return fail(
      'download_failed',
      download.failureReasons,
      download.diagnostics.map((entry) => `${entry.code}:${entry.field}`),
      null
    )
  }

  const crypto = verifyPluginPackageCryptographicTrust({
    targetBytes: download.stagedPackage.bytes,
    signatureEnvelope: input.release.signatureEnvelope,
    trustRoot: input.release.trustRoot,
    targetMetadata: input.release.targetMetadata,
    trustedKeys: input.release.trustedKeys,
    now: input.now,
    previousTrustedVersion: input.previousTrustedVersion,
    expectedManifestSha256: input.release.catalogEntry.manifestSha256,
    expectedInventorySha256: input.release.catalogEntry.inventorySha256,
    compatibility: input.release.compatibility,
    environment: input.environment,
  })
  if (!crypto.ok) {
    return fail(
      'signature_failed',
      crypto.failureReasons,
      crypto.diagnostics.map((entry) => `${entry.code}:${entry.field}`),
      crypto
    )
  }

  return {
    ok: true,
    status: 'downloaded_verified_trusted',
    stagedPackage: download.stagedPackage,
    crypto,
  }
}

function fail(
  status: 'blocked' | 'download_failed' | 'signature_failed',
  failureReasons: readonly OfficialPackageReleaseVerificationFailureReason[],
  diagnostics: readonly string[],
  crypto: PluginCryptoVerificationResult | null
): OfficialPackageReleaseVerificationResult {
  return {
    ok: false,
    status,
    failureReasons: uniqueFailureReasons(failureReasons),
    diagnostics,
    crypto,
  }
}

function uniqueFailureReasons(
  values: readonly OfficialPackageReleaseVerificationFailureReason[]
): readonly OfficialPackageReleaseVerificationFailureReason[] {
  const seen = new Set<OfficialPackageReleaseVerificationFailureReason>()
  const out: OfficialPackageReleaseVerificationFailureReason[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}
