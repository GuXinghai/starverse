export const PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION = '1' as const
export const PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION = '1' as const
export const PLUGIN_CATALOG_SCHEMA_VERSION = '1' as const
export const PLUGIN_TRUST_ROOT_SCHEMA_VERSION = '1' as const
export const PLUGIN_TARGETS_SCHEMA_VERSION = '1' as const

export const PLUGIN_PACKAGE_RUNTIME_KINDS = [
  'managed',
  'native',
  'node',
  'python',
  'java',
  'wasm',
  'data',
] as const
export type PluginPackageRuntimeKind = (typeof PLUGIN_PACKAGE_RUNTIME_KINDS)[number]

export const PLUGIN_PACKAGE_CAPABILITIES = [
  'file_identification',
  'document_conversion',
  'spreadsheet_conversion',
  'presentation_conversion',
  'text_extraction',
  'metadata_extraction',
  'audio_video_probe',
  'model_inference',
  'utility',
] as const
export type PluginPackageCapability = (typeof PLUGIN_PACKAGE_CAPABILITIES)[number]

export const PLUGIN_PACKAGE_PLATFORMS = ['any', 'win32', 'darwin', 'linux'] as const
export type PluginPackagePlatform = (typeof PLUGIN_PACKAGE_PLATFORMS)[number]

export const PLUGIN_PACKAGE_ARCHITECTURES = ['any', 'x64', 'arm64'] as const
export type PluginPackageArchitecture = (typeof PLUGIN_PACKAGE_ARCHITECTURES)[number]

export type PluginPackageCompatibility = Readonly<{
  platforms: readonly PluginPackagePlatform[]
  architectures: readonly PluginPackageArchitecture[]
  starverseVersionRange: string
}>

export type PluginPackageNetworkPolicy = Readonly<{
  allowed: false
}>

export type PluginPackageManifest = Readonly<{
  manifestSchemaVersion: typeof PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION
  pluginId: string
  displayName: string
  publisher: string
  pluginVersion: string
  runtimeKind: PluginPackageRuntimeKind
  compatibility: PluginPackageCompatibility
  capabilities: readonly PluginPackageCapability[]
  artifactInventoryRef: string
  licenseRefs: readonly string[]
  attributionRefs: readonly string[]
  network?: PluginPackageNetworkPolicy
}>

export const PLUGIN_PACKAGE_ARTIFACT_CLASSES = [
  'runtime',
  'manifest',
  'signature',
  'catalog',
  'license',
  'attribution',
  'model',
  'config',
  'documentation',
  'checksum',
  'other',
] as const
export type PluginPackageArtifactClass = (typeof PLUGIN_PACKAGE_ARTIFACT_CLASSES)[number]

export const REQUIRED_RUNTIME_PACKAGE_ARTIFACT_CLASSES = [
  'runtime',
  'manifest',
  'signature',
  'license',
  'attribution',
] as const satisfies readonly PluginPackageArtifactClass[]

export type PluginPackageArtifact = Readonly<{
  artifactId: string
  relativePath: string
  artifactClass: PluginPackageArtifactClass
  sha256: string
  sizeBytes: number
  required?: boolean
}>

export type PluginPackageInventory = Readonly<{
  inventorySchemaVersion: typeof PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION
  pluginId: string
  pluginVersion: string
  artifacts: readonly PluginPackageArtifact[]
}>

export const PLUGIN_PACKAGE_INTEGRITY_STATUSES = [
  'unverified',
  'verified',
  'failed',
  'missing',
] as const
export type PluginPackageIntegrityStatus = (typeof PLUGIN_PACKAGE_INTEGRITY_STATUSES)[number]

export const PLUGIN_CATALOG_SOURCE_KINDS = ['official'] as const
export type PluginCatalogSourceKind = (typeof PLUGIN_CATALOG_SOURCE_KINDS)[number]

export const PLUGIN_CATALOG_CHANNELS = ['stable'] as const
export type PluginCatalogChannel = (typeof PLUGIN_CATALOG_CHANNELS)[number]

export type PluginCatalogCompatibility = PluginPackageCompatibility

export type PluginCatalogEntry = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: PluginPackageRuntimeKind
  platform: PluginPackagePlatform
  arch: PluginPackageArchitecture
  packageRef: string
  packageSha256: string
  packageSizeBytes: number
  manifestSha256: string
  inventorySha256: string
  signatureRef: string
  compatibility: PluginCatalogCompatibility
  channel?: PluginCatalogChannel
}>

export type PluginCatalogMetadata = Readonly<{
  catalogSchemaVersion: typeof PLUGIN_CATALOG_SCHEMA_VERSION
  catalogVersion: number
  generatedAt: string
  expiresAt: string
  sourceKind: PluginCatalogSourceKind
  entries: readonly PluginCatalogEntry[]
}>

export const PLUGIN_SIGNATURE_ALGORITHMS = ['ed25519'] as const
export type PluginSignatureAlgorithm = (typeof PLUGIN_SIGNATURE_ALGORITHMS)[number]

export type PluginSignatureEnvelope = Readonly<{
  signatureSchemaVersion: typeof PLUGIN_TRUST_ROOT_SCHEMA_VERSION
  keyId: string
  algorithm: PluginSignatureAlgorithm
  signedAt: string
  expiresAt: string
  value: string
  coveredManifestSha256?: string
  coveredInventorySha256?: string
}>

export type PluginTrustRootMetadata = Readonly<{
  rootSchemaVersion: typeof PLUGIN_TRUST_ROOT_SCHEMA_VERSION
  rootVersion: number
  generatedAt: string
  expiresAt: string
  keys: readonly Readonly<{
    keyId: string
    algorithm: PluginSignatureAlgorithm
    publicKeyRef: string
    role: 'root' | 'targets'
  }>[]
  snapshotRole: 'reserved'
  timestampRole: 'reserved'
  delegatedRoles: 'reserved'
}>

export type PluginTargetMetadata = Readonly<{
  pluginId: string
  pluginVersion: string
  packageSha256: string
  packageSizeBytes: number
  expiresAt: string
  signatureRef: string
}>

export type PluginTargetsMetadata = Readonly<{
  targetsSchemaVersion: typeof PLUGIN_TARGETS_SCHEMA_VERSION
  targetsVersion: number
  generatedAt: string
  expiresAt: string
  targets: readonly PluginTargetMetadata[]
  snapshotRole: 'reserved'
  timestampRole: 'reserved'
  delegatedRoles: 'reserved'
}>

export type PluginOfflineSigningMetadata = Readonly<{
  signer: 'starverse-offline'
  keyId: string
  algorithm: PluginSignatureAlgorithm
  signedAt: string
}>

export const PLUGIN_VERIFICATION_STATUSES = [
  'unverified',
  'verified',
  'failed',
  'revoked',
  'expired',
] as const
export type PluginVerificationStatus = (typeof PLUGIN_VERIFICATION_STATUSES)[number]

export const PLUGIN_INSTALL_STATES = [
  'not_installed',
  'installing',
  'installed',
  'failed',
  'disabled',
  'quarantined',
  'uninstalled',
] as const
export type PluginInstallState = (typeof PLUGIN_INSTALL_STATES)[number]

export const PLUGIN_HEALTH_STATUSES = ['unknown', 'healthy', 'failed', 'disabled'] as const
export type PluginHealthStatus = (typeof PLUGIN_HEALTH_STATUSES)[number]

export const PLUGIN_FAILURE_REASONS = [
  'unsigned',
  'signature_invalid',
  'signature_missing',
  'hash_mismatch',
  'integrity_missing',
  'revoked',
  'expired_metadata',
  'rollback_detected',
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
  'unsupported_manifest_schema',
  'install_interrupted',
  'install_root_unsafe',
  'package_path_unsafe',
  'health_failed',
  'disabled_by_user',
  'unknown',
] as const
export type PluginFailureReason = (typeof PLUGIN_FAILURE_REASONS)[number]

export type PluginLifecycleState = Readonly<{
  installState: PluginInstallState
  healthStatus: PluginHealthStatus
  verificationStatus: PluginVerificationStatus
  failureReason: PluginFailureReason | null
}>

export type PluginDistributionValidationCode =
  | 'invalid_type'
  | 'missing_required'
  | 'unsupported_schema_version'
  | 'unsupported_manifest_schema'
  | 'unsupported_enum_value'
  | 'empty_string'
  | 'empty_array'
  | 'unsafe_relative_path'
  | 'duplicate_artifact_id'
  | 'duplicate_artifact_path'
  | 'invalid_sha256'
  | 'invalid_size'
  | 'missing_required_artifact'
  | 'non_official_source'
  | 'expired_metadata'
  | 'rollback_detected'
  | 'network_not_allowed'
  | 'script_entry_not_allowed'
  | 'reserved_role_not_deferred'
  | 'invalid_timestamp'
  | 'invalid_version'

export type PluginDistributionValidationError = Readonly<{
  code: PluginDistributionValidationCode
  field: string
  path?: string
  expected?: string
}>

export type PluginDistributionValidationResult<T> =
  | Readonly<{ ok: true; value: T; warnings?: readonly PluginDistributionValidationError[] }>
  | Readonly<{ ok: false; errors: readonly PluginDistributionValidationError[] }>

export type PluginPackageValidationError = PluginDistributionValidationError
export type ArtifactInventoryValidationError = PluginDistributionValidationError
export type PluginCatalogValidationError = PluginDistributionValidationError
export type TrustPolicyValidationError = PluginDistributionValidationError
