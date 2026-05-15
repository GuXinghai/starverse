import type {
  OfficialPackageReleaseMetadata,
} from './officialPackageRelease'
import {
  buildReadOnlyCatalogDto,
  validateOfficialPluginCatalog,
  type CatalogCompatibilityEnvironment,
  type ReadOnlyCatalogDto,
} from './catalogReadModel'
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
export const MAGIKA_OFFICIAL_PLUGIN_VERSION = '0.1.0'
export const MAGIKA_OFFICIAL_MODEL_VERSION = 'standard_v3_3'
export const MAGIKA_OFFICIAL_RELEASE_TAG = 'starverse-plugin-magika-v0.1.0'
export const MAGIKA_OFFICIAL_RELEASE_ASSET_NAME = 'starverse-plugin-magika-0.1.0-win32-x64.zip'
export const MAGIKA_OFFICIAL_RELEASE_URL =
  'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip'

export const MAGIKA_OFFICIAL_PACKAGE_SHA256 =
  '4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728'
export const MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES = 65401229
export const MAGIKA_OFFICIAL_MANIFEST_SHA256 =
  '7e32c31ef972d493b333395ef98b8364e08f0da535791a4911dd2730278af17d'
export const MAGIKA_OFFICIAL_INVENTORY_SHA256 =
  'cb00f8b079bb9454d9eaae61cf75041625748c2de4a0454c6b6085c01feeb0b7'

export const MAGIKA_OFFICIAL_SIGNATURE_KEY_ID = 'starverse-pdp-ed25519-prod-2026Q2'
export const MAGIKA_OFFICIAL_SIGNATURE_REF = 'signatures/starverse-plugin-magika-0.1.0-win32-x64.sig.json'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_REF = 'keys/starverse-pdp-ed25519-prod-2026Q2.public.pem'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256 =
  '141a5458134ca46fe353368ce190d3b5c8f015a6dee024e62e127a91d3f76bd6'
export const MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT = '2026-05-14T14:58:29.502Z'
export const MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT = '2027-05-14T00:00:00.000Z'

export const MAGIKA_OFFICIAL_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOqFZKnmTjxC/vZpT2NWxP5n/i8R/F/rXXGiH63frJBE=
-----END PUBLIC KEY-----`

export const MAGIKA_OFFICIAL_SIGNATURE_ENVELOPE = {
  signatureSchemaVersion: '1',
  keyId: MAGIKA_OFFICIAL_SIGNATURE_KEY_ID,
  algorithm: 'ed25519',
  signedAt: MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  value: 'XoLq7F3Jtv+ie90VtUUcpmq8nXsNddRQC9y8PN0c2lpoz2zuQWZic/jjNNfaDV50I4z1aR2pqmsxol8Z0MqEAw==',
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
  platform: 'win32',
  arch: 'x64',
  packageRef: `${MAGIKA_OFFICIAL_RELEASE_TAG}/${MAGIKA_OFFICIAL_RELEASE_ASSET_NAME}`,
  packageSha256: MAGIKA_OFFICIAL_PACKAGE_SHA256,
  packageSizeBytes: MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES,
  manifestSha256: MAGIKA_OFFICIAL_MANIFEST_SHA256,
  inventorySha256: MAGIKA_OFFICIAL_INVENTORY_SHA256,
  signatureRef: MAGIKA_OFFICIAL_SIGNATURE_REF,
  compatibility: {
    platforms: ['win32'],
    architectures: ['x64'],
    starverseVersionRange: '>=0.0.0',
  },
  channel: 'stable',
} as const satisfies PluginCatalogEntry

export const MAGIKA_OFFICIAL_CATALOG_METADATA = {
  catalogSchemaVersion: '1',
  catalogVersion: 1,
  generatedAt: '2026-05-14T15:05:44.000Z',
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
