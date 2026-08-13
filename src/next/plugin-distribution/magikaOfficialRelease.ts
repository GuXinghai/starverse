import type {
  OfficialPackageReleaseMetadata,
} from './officialPackageRelease'
import {
  buildReadOnlyCatalogDto,
  validateOfficialPluginCatalog,
  type ReadOnlyCatalogDto,
} from './catalogReadModel'
import type { CatalogCompatibilityEnvironment } from './catalogCompatibility'
import { validatePluginTrustRootMetadata } from './trustPolicy'
import type {
  PluginCatalogEntry,
  PluginCatalogMetadata,
  PluginSignatureEnvelope,
  PluginTargetMetadata,
  PluginTrustRootMetadata,
} from './types'
import type { TrustedCatalogPublicKeyMap } from '../file-type/pluginCatalogSignature'

export const MAGIKA_OFFICIAL_PLUGIN_ID = 'magika'
export const MAGIKA_OFFICIAL_PLUGIN_VERSION = '0.2.0'
export const MAGIKA_OFFICIAL_MODEL_VERSION = 'standard_v3_3'
export const MAGIKA_OFFICIAL_RELEASE_TAG = 'starverse-plugin-magika-v0.2.0'
export const MAGIKA_OFFICIAL_RELEASE_ASSET_NAME = 'starverse-plugin-magika-0.2.0-any-any.zip'
export const MAGIKA_OFFICIAL_RELEASE_URL =
  'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.2.0/starverse-plugin-magika-0.2.0-any-any.zip'

export const MAGIKA_OFFICIAL_PACKAGE_SHA256 =
  '08307d2eead8019ea51d6b1205e6a1b56da678fa215048f471e0091b4cbaeb18'
export const MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES = 64085105
export const MAGIKA_OFFICIAL_MANIFEST_SHA256 =
  '53037ab956545dc59b58d0a40d6dc93958bfd1ea2bce08a45795ef510fe951a2'
export const MAGIKA_OFFICIAL_INVENTORY_SHA256 =
  'b3218d6944ebb4c73dd285ba7f5edca9dc3b0b419f0d1cb2bc5e8275ded1f063'

export const MAGIKA_OFFICIAL_SIGNATURE_KEY_ID = 'starverse-official-plugin-ed25519-2026-05'
export const MAGIKA_OFFICIAL_SIGNATURE_REF = 'signatures/starverse-plugin-magika-0.2.0-any-any.sig.json'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_REF = 'keys/starverse-official-plugin-ed25519-2026-05.public.pem'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256 =
  '726297001d097a0e1c348f9012dcbc356a70b4cc823310e09cfe7faee6c7a2c9'
export const MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT = '2026-08-13T09:19:14.780Z'
export const MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT = '2027-08-13T09:19:14.780Z'

export const MAGIKA_OFFICIAL_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA2JUh2pJsKuiIHxWl41yFXPF8GCPfkN34Y2VMbppsz0I=
-----END PUBLIC KEY-----`

export const MAGIKA_OFFICIAL_SIGNATURE_ENVELOPE = {
  signatureSchemaVersion: '1',
  keyId: MAGIKA_OFFICIAL_SIGNATURE_KEY_ID,
  algorithm: 'ed25519',
  signedAt: MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  value: '96pqT6eI2Be1Tupe5OD07TifBAdYchXFb4rC2Gt8dz0l5V3Z/S9k0osEchFo0wY+22zCqBe9YvGUqLJXMPuNBQ==',
  coveredManifestSha256: MAGIKA_OFFICIAL_MANIFEST_SHA256,
  coveredInventorySha256: MAGIKA_OFFICIAL_INVENTORY_SHA256,
} as const satisfies PluginSignatureEnvelope

export const MAGIKA_OFFICIAL_TRUST_ROOT = {
  rootSchemaVersion: '1',
  rootVersion: 1,
  generatedAt: MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  keys: [
    {
      keyId: MAGIKA_OFFICIAL_SIGNATURE_KEY_ID,
      algorithm: 'ed25519',
      publicKeyRef: MAGIKA_OFFICIAL_PUBLIC_KEY_REF,
      role: 'targets',
    },
  ],
  snapshotRole: 'reserved',
  timestampRole: 'reserved',
  delegatedRoles: 'reserved',
} as const satisfies PluginTrustRootMetadata

export const MAGIKA_OFFICIAL_CATALOG_ENTRY = {
  pluginId: MAGIKA_OFFICIAL_PLUGIN_ID,
  pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
  runtimeKind: 'managed',
  platform: 'any',
  arch: 'any',
  packageRef: `${MAGIKA_OFFICIAL_RELEASE_TAG}/${MAGIKA_OFFICIAL_RELEASE_ASSET_NAME}`,
  packageSha256: MAGIKA_OFFICIAL_PACKAGE_SHA256,
  packageSizeBytes: MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES,
  manifestSha256: MAGIKA_OFFICIAL_MANIFEST_SHA256,
  inventorySha256: MAGIKA_OFFICIAL_INVENTORY_SHA256,
  signatureRef: MAGIKA_OFFICIAL_SIGNATURE_REF,
  compatibility: {
    platforms: ['any'],
    architectures: ['any'],
    starverseVersionRange: '>=0.0.0',
  },
  channel: 'stable',
} as const satisfies PluginCatalogEntry

export const MAGIKA_OFFICIAL_CATALOG_METADATA = {
  catalogSchemaVersion: '1',
  catalogVersion: 3,
  generatedAt: MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  sourceKind: 'official',
  entries: [MAGIKA_OFFICIAL_CATALOG_ENTRY],
} as const satisfies PluginCatalogMetadata

export const MAGIKA_OFFICIAL_TARGET_METADATA = {
  pluginId: MAGIKA_OFFICIAL_PLUGIN_ID,
  pluginVersion: MAGIKA_OFFICIAL_PLUGIN_VERSION,
  packageSha256: MAGIKA_OFFICIAL_PACKAGE_SHA256,
  packageSizeBytes: MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  signatureRef: MAGIKA_OFFICIAL_SIGNATURE_REF,
} as const satisfies PluginTargetMetadata

export const MAGIKA_OFFICIAL_RELEASE_METADATA = {
  catalogEntry: MAGIKA_OFFICIAL_CATALOG_ENTRY,
  releaseUrl: MAGIKA_OFFICIAL_RELEASE_URL,
  remoteInstallEnabled: true,
  downloadPolicy: {
    maxBytes: 70000000,
    allowedOfficialHosts: ['github.com', 'release-assets.githubusercontent.com'],
  },
  signatureEnvelope: MAGIKA_OFFICIAL_SIGNATURE_ENVELOPE,
  trustRoot: MAGIKA_OFFICIAL_TRUST_ROOT,
  trustedKeys: [
    {
      publicKeyRef: MAGIKA_OFFICIAL_PUBLIC_KEY_REF,
      publicKeyPem: MAGIKA_OFFICIAL_PUBLIC_KEY_PEM,
    },
  ],
  targetMetadata: MAGIKA_OFFICIAL_TARGET_METADATA,
  compatibility: MAGIKA_OFFICIAL_CATALOG_ENTRY.compatibility,
} as const satisfies OfficialPackageReleaseMetadata

const RELEASE_READY_REASON_OVERRIDES = new Set([
  'metadata_compatible_future_install',
  'read_only_catalog_no_install_action',
  'signature_verification_deferred',
])

export type MagikaOfficialCatalogReadModelResult =
  | Readonly<{ ok: true; catalog: ReadOnlyCatalogDto }>
  | Readonly<{ ok: false; reason: 'official_trusted_root_unconfigured' | 'official_release_metadata_invalid' }>

export function buildMagikaOfficialCatalogReadModel(input: Readonly<{
  trustedRoots: TrustedCatalogPublicKeyMap
  trustedRootSource?: 'official' | 'test' | null
  now?: Date
  environment?: CatalogCompatibilityEnvironment
}>): MagikaOfficialCatalogReadModelResult {
  const now = input.now ?? new Date()
  if (
    input.trustedRootSource !== 'official' ||
    !hasMagikaOfficialProductionTrustedRoot(input.trustedRoots)
  ) {
    return { ok: false, reason: 'official_trusted_root_unconfigured' }
  }

  const trustRoot = validatePluginTrustRootMetadata(MAGIKA_OFFICIAL_RELEASE_METADATA.trustRoot, { now })
  const validation = validateOfficialPluginCatalog({
    source: { kind: 'bundled_static', sourceRef: 'magika_official_release' },
    catalog: MAGIKA_OFFICIAL_CATALOG_METADATA,
    signatureMetadata: MAGIKA_OFFICIAL_RELEASE_METADATA.signatureEnvelope,
    trustPolicy: { requireSignedCatalogs: true },
    environment: { now },
  })
  if (!MAGIKA_OFFICIAL_RELEASE_METADATA.remoteInstallEnabled || !trustRoot.ok || !validation.ok) {
    return { ok: false, reason: 'official_release_metadata_invalid' }
  }

  const catalog = buildReadOnlyCatalogDto({
    validation,
    environment: input.environment,
    entryMetadata: {
      [`${MAGIKA_OFFICIAL_PLUGIN_ID}@${MAGIKA_OFFICIAL_PLUGIN_VERSION}`]: {
        displayName: 'Magika',
        publisher: 'Google Magika',
        capabilities: ['file_identification', 'model_inference'],
        modelVersion: MAGIKA_OFFICIAL_MODEL_VERSION,
      },
    },
  })

  return {
    ok: true,
    catalog: {
      ...catalog,
      entries: catalog.entries.map((entry) => ({
        ...entry,
        verificationMetadataStatus: 'production_signature_available',
        installabilityStatus: 'official_remote_install_available',
        reasons: [
          ...entry.reasons.filter((reason) => !RELEASE_READY_REASON_OVERRIDES.has(reason)),
          'official_remote_install_available',
          'production_signature_available',
          'verify_before_install',
        ],
      })),
    },
  }
}

export function hasMagikaOfficialProductionTrustedRoot(
  trustedRoots: TrustedCatalogPublicKeyMap
): boolean {
  const trustedRoot = trustedRoots[MAGIKA_OFFICIAL_SIGNATURE_KEY_ID]
  return (
    trustedRoot?.algorithm === 'ed25519' &&
    trustedRoot.publicKeyPem.trim() === MAGIKA_OFFICIAL_PUBLIC_KEY_PEM.trim()
  )
}
