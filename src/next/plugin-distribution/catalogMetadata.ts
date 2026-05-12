import {
  PLUGIN_CATALOG_CHANNELS,
  PLUGIN_CATALOG_SCHEMA_VERSION,
  PLUGIN_CATALOG_SOURCE_KINDS,
  PLUGIN_PACKAGE_ARCHITECTURES,
  PLUGIN_PACKAGE_PLATFORMS,
  PLUGIN_PACKAGE_RUNTIME_KINDS,
  type PluginCatalogChannel,
  type PluginCatalogEntry,
  type PluginCatalogMetadata,
  type PluginCatalogValidationError,
  type PluginPackageArchitecture,
  type PluginPackagePlatform,
  type PluginPackageRuntimeKind,
} from './types'
import {
  createValidationError,
  isExpiredTimestamp,
  isRecord,
  isValidSha256,
  normalizeSha256,
  parseEnumValue,
  readFiniteNonNegativeInteger,
  readIsoTimestamp,
  readNonEmptyString,
  validateSafeRelativePath,
} from './validation'

const SOURCE_KIND_SET = new Set<string>(PLUGIN_CATALOG_SOURCE_KINDS)
const CHANNEL_SET = new Set<string>(PLUGIN_CATALOG_CHANNELS)
const RUNTIME_KIND_SET = new Set<string>(PLUGIN_PACKAGE_RUNTIME_KINDS)
const PLATFORM_SET = new Set<string>(PLUGIN_PACKAGE_PLATFORMS)
const ARCH_SET = new Set<string>(PLUGIN_PACKAGE_ARCHITECTURES)

export type CatalogMetadataValidationOptions = Readonly<{
  now?: Date
}>

export type CatalogMetadataValidationResult =
  | Readonly<{ ok: true; catalog: PluginCatalogMetadata; warnings?: readonly PluginCatalogValidationError[] }>
  | Readonly<{ ok: false; errors: readonly PluginCatalogValidationError[] }>

export function validatePluginCatalogMetadata(
  input: unknown,
  options?: CatalogMetadataValidationOptions
): CatalogMetadataValidationResult {
  const errors: PluginCatalogValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }

  if (input.catalogSchemaVersion !== PLUGIN_CATALOG_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_schema_version', 'catalogSchemaVersion'))
  }
  const catalogVersion = readFiniteNonNegativeInteger(input.catalogVersion)
  if (catalogVersion === null) errors.push(createValidationError('invalid_version', 'catalogVersion'))
  const generatedAt = readIsoTimestamp(input.generatedAt)
  if (!generatedAt) errors.push(createValidationError('invalid_timestamp', 'generatedAt'))
  const expiresAt = readIsoTimestamp(input.expiresAt)
  if (!expiresAt) {
    errors.push(createValidationError('invalid_timestamp', 'expiresAt'))
  } else if (isExpiredTimestamp(expiresAt, options?.now)) {
    errors.push(createValidationError('expired_metadata', 'expiresAt'))
  }

  parseEnumValue(input.sourceKind, SOURCE_KIND_SET, 'sourceKind', errors)
  if (typeof input.sourceKind === 'string' && input.sourceKind.trim() !== 'official') {
    errors.push(createValidationError('non_official_source', 'sourceKind'))
  }
  const entries = parseEntries(input.entries, errors)

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    catalog: {
      catalogSchemaVersion: PLUGIN_CATALOG_SCHEMA_VERSION,
      catalogVersion: catalogVersion!,
      generatedAt: generatedAt!,
      expiresAt: expiresAt!,
      sourceKind: 'official',
      entries,
    },
  }
}

function parseEntries(
  input: unknown,
  errors: PluginCatalogValidationError[]
): readonly PluginCatalogEntry[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', 'entries', { expected: 'array' }))
    return []
  }
  const entries: PluginCatalogEntry[] = []
  for (let i = 0; i < input.length; i++) {
    const parsed = parseEntry(input[i], i, errors)
    if (parsed) entries.push(parsed)
  }
  return entries
}

function parseEntry(
  input: unknown,
  index: number,
  errors: PluginCatalogValidationError[]
): PluginCatalogEntry | null {
  if (!isRecord(input)) {
    errors.push(createValidationError('invalid_type', `entries[${index}]`))
    return null
  }
  const field = (name: string): string => `entries[${index}].${name}`
  const pluginId = requiredString(input.pluginId, field('pluginId'), errors)
  const pluginVersion = requiredString(input.pluginVersion, field('pluginVersion'), errors)
  const runtimeKind = parseEnumValue<PluginPackageRuntimeKind>(
    input.runtimeKind,
    RUNTIME_KIND_SET,
    field('runtimeKind'),
    errors
  )
  const platform = parseEnumValue<PluginPackagePlatform>(input.platform, PLATFORM_SET, field('platform'), errors)
  const arch = parseEnumValue<PluginPackageArchitecture>(input.arch, ARCH_SET, field('arch'), errors)
  const packageRef = parsePackageRef(input.packageRef, field('packageRef'), errors)
  const packageSha256 = parseRequiredSha(input.packageSha256, field('packageSha256'), errors)
  const packageSizeBytes = parseSize(input.packageSizeBytes, field('packageSizeBytes'), errors)
  const manifestSha256 = parseRequiredSha(input.manifestSha256, field('manifestSha256'), errors)
  const inventorySha256 = parseRequiredSha(input.inventorySha256, field('inventorySha256'), errors)
  const signatureRef = parsePackageRef(input.signatureRef, field('signatureRef'), errors)
  const compatibility = parseCompatibility(input.compatibility, field('compatibility'), errors)
  const channel =
    input.channel === undefined
      ? 'stable'
      : parseEnumValue<PluginCatalogChannel>(input.channel, CHANNEL_SET, field('channel'), errors)

  if (!pluginId || !pluginVersion || !runtimeKind || !platform || !arch || !packageRef) return null
  if (!packageSha256 || packageSizeBytes === null || !manifestSha256 || !inventorySha256) return null
  if (!signatureRef || !compatibility || !channel) return null
  return {
    pluginId,
    pluginVersion,
    runtimeKind,
    platform,
    arch,
    packageRef,
    packageSha256,
    packageSizeBytes,
    manifestSha256,
    inventorySha256,
    signatureRef,
    compatibility,
    channel,
  }
}

function parseSize(
  input: unknown,
  field: string,
  errors: PluginCatalogValidationError[]
): number | null {
  const value = readFiniteNonNegativeInteger(input)
  if (value === null) errors.push(createValidationError('invalid_size', field))
  return value
}

function parsePackageRef(
  input: unknown,
  field: string,
  errors: PluginCatalogValidationError[]
): string | null {
  const pathResult = validateSafeRelativePath(input)
  if (!pathResult.ok) {
    errors.push(createValidationError(pathResult.code, field))
    return null
  }
  return pathResult.path
}

function parseCompatibility(
  input: unknown,
  field: string,
  errors: PluginCatalogValidationError[]
): PluginCatalogEntry['compatibility'] | null {
  if (!isRecord(input)) {
    errors.push(createValidationError('missing_required', field))
    return null
  }
  const platforms = parseEnumArray<PluginPackagePlatform>(
    input.platforms,
    PLATFORM_SET,
    `${field}.platforms`,
    errors
  )
  const architectures = parseEnumArray<PluginPackageArchitecture>(
    input.architectures,
    ARCH_SET,
    `${field}.architectures`,
    errors
  )
  const starverseVersionRange = requiredString(input.starverseVersionRange, `${field}.starverseVersionRange`, errors)
  if (!starverseVersionRange) return null
  return { platforms, architectures, starverseVersionRange }
}

function parseEnumArray<T extends string>(
  input: unknown,
  allowed: ReadonlySet<string>,
  field: string,
  errors: PluginCatalogValidationError[]
): readonly T[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', field, { expected: 'array' }))
    return []
  }
  const out: T[] = []
  for (let i = 0; i < input.length; i++) {
    const value = parseEnumValue<T>(input[i], allowed, `${field}[${i}]`, errors)
    if (value) out.push(value)
  }
  if (out.length === 0) errors.push(createValidationError('empty_array', field))
  return out
}

function parseRequiredSha(
  input: unknown,
  field: string,
  errors: PluginCatalogValidationError[]
): string | null {
  if (!isValidSha256(input)) {
    errors.push(createValidationError('invalid_sha256', field))
    return null
  }
  return normalizeSha256(input)
}

function requiredString(
  input: unknown,
  field: string,
  errors: PluginCatalogValidationError[]
): string | null {
  const value = readNonEmptyString(input)
  if (!value) errors.push(createValidationError('missing_required', field))
  return value
}
