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
export const MAGIKA_OFFICIAL_PLUGIN_VERSION = '0.1.1'
export const MAGIKA_OFFICIAL_MODEL_VERSION = 'standard_v3_3'
export const MAGIKA_OFFICIAL_RELEASE_TAG = 'starverse-plugin-magika-v0.1.1'
export const MAGIKA_OFFICIAL_RELEASE_ASSET_NAME = 'starverse-plugin-magika-0.1.1-win32-x64.zip'
export const MAGIKA_OFFICIAL_RELEASE_URL =
  'https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.1/starverse-plugin-magika-0.1.1-win32-x64.zip'

export const MAGIKA_OFFICIAL_PACKAGE_SHA256 =
  'a85bb45b12186263443e17d0c4992d461fd42d948c826c14e66a885bfd9abb89'
export const MAGIKA_OFFICIAL_PACKAGE_SIZE_BYTES = 67393627
export const MAGIKA_OFFICIAL_MANIFEST_SHA256 =
  '0ac56b53ca85fc0691bc84ab2c2a85671692d4da97d7950b19648aabc428a6d9'
export const MAGIKA_OFFICIAL_INVENTORY_SHA256 =
  '5740c59afe0454053184631a0b5c4c14474b2a5886154587ed059a5382329502'

export const MAGIKA_OFFICIAL_SIGNATURE_KEY_ID = 'starverse-official-plugin-ed25519-2026-05'
export const MAGIKA_OFFICIAL_SIGNATURE_REF = 'signatures/starverse-plugin-magika-0.1.1-win32-x64.sig.json'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_REF = 'keys/starverse-official-plugin-ed25519-2026-05.public.pem'
export const MAGIKA_OFFICIAL_PUBLIC_KEY_FINGERPRINT_SHA256 =
  '726297001d097a0e1c348f9012dcbc356a70b4cc823310e09cfe7faee6c7a2c9'
export const MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT = '2026-05-22T00:00:00.000Z'
export const MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT = '2027-05-22T00:00:00.000Z'

export const MAGIKA_OFFICIAL_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA2JUh2pJsKuiIHxWl41yFXPF8GCPfkN34Y2VMbppsz0I=
-----END PUBLIC KEY-----`

export const MAGIKA_OFFICIAL_SIGNATURE_ENVELOPE = {
  signatureSchemaVersion: '1',
  keyId: MAGIKA_OFFICIAL_SIGNATURE_KEY_ID,
  algorithm: 'ed25519',
  signedAt: MAGIKA_OFFICIAL_SIGNATURE_SIGNED_AT,
  expiresAt: MAGIKA_OFFICIAL_SIGNATURE_EXPIRES_AT,
  value: 'eHeW6A0FKPqFQhmrjaxLm+NMtc79thw+nE/o83JSrfyClhRmage//78PltKswCSpG1JMwiJO3GpF0aR1Myd0Dg==',
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
  catalogVersion: 2,
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
