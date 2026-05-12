import {
  PLUGIN_PACKAGE_ARCHITECTURES,
  PLUGIN_PACKAGE_CAPABILITIES,
  PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
  PLUGIN_PACKAGE_PLATFORMS,
  PLUGIN_PACKAGE_RUNTIME_KINDS,
  type PluginPackageArchitecture,
  type PluginPackageCapability,
  type PluginPackageManifest,
  type PluginPackagePlatform,
  type PluginPackageRuntimeKind,
  type PluginPackageValidationError,
} from './types'
import {
  createValidationError,
  detectRollbackVersion,
  isRecord,
  parseEnumValue,
  readNonEmptyString,
  readSafePathArray,
  validateSafeRelativePath,
  type SafeRelativePathResult,
} from './validation'

const RUNTIME_KIND_SET = new Set<string>(PLUGIN_PACKAGE_RUNTIME_KINDS)
const CAPABILITY_SET = new Set<string>(PLUGIN_PACKAGE_CAPABILITIES)
const PLATFORM_SET = new Set<string>(PLUGIN_PACKAGE_PLATFORMS)
const ARCH_SET = new Set<string>(PLUGIN_PACKAGE_ARCHITECTURES)

export type PackageManifestValidationOptions = Readonly<{
  previousPluginVersion?: string | null
}>

export type PackageManifestValidationResult =
  | Readonly<{ ok: true; manifest: PluginPackageManifest; warnings?: readonly PluginPackageValidationError[] }>
  | Readonly<{ ok: false; errors: readonly PluginPackageValidationError[] }>

export function validatePluginPackageManifest(
  input: unknown,
  options?: PackageManifestValidationOptions
): PackageManifestValidationResult {
  const errors: PluginPackageValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }

  if (input.manifestSchemaVersion !== PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_manifest_schema', 'manifestSchemaVersion'))
  }
  rejectExecutionScope(input, errors)

  const pluginId = requiredString(input.pluginId, 'pluginId', errors)
  const displayName = requiredString(input.displayName, 'displayName', errors)
  const publisher = requiredString(input.publisher, 'publisher', errors)
  const pluginVersion = requiredString(input.pluginVersion, 'pluginVersion', errors)
  const runtimeKind = parseEnumValue<PluginPackageRuntimeKind>(
    input.runtimeKind,
    RUNTIME_KIND_SET,
    'runtimeKind',
    errors
  )
  const compatibility = parseCompatibility(input.compatibility, errors)
  const capabilities = parseEnumArray<PluginPackageCapability>(
    input.capabilities,
    CAPABILITY_SET,
    'capabilities',
    errors
  )
  const artifactInventoryRef = parseRequiredPath(input.artifactInventoryRef, 'artifactInventoryRef', errors)
  const licenseRefs = readSafePathArray(input.licenseRefs, 'licenseRefs', errors)
  const attributionRefs = readSafePathArray(input.attributionRefs, 'attributionRefs', errors)

  const rollbackError = pluginVersion
    ? detectRollbackVersion(pluginVersion, options?.previousPluginVersion)
    : null
  if (rollbackError) errors.push(rollbackError)

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    manifest: {
      manifestSchemaVersion: PLUGIN_PACKAGE_MANIFEST_SCHEMA_VERSION,
      pluginId: pluginId!,
      displayName: displayName!,
      publisher: publisher!,
      pluginVersion: pluginVersion!,
      runtimeKind: runtimeKind!,
      compatibility: compatibility!,
      capabilities,
      artifactInventoryRef: artifactInventoryRef!,
      licenseRefs,
      attributionRefs,
      network: { allowed: false },
    },
  }
}

function requiredString(
  input: unknown,
  field: string,
  errors: PluginPackageValidationError[]
): string | null {
  const value = readNonEmptyString(input)
  if (!value) errors.push(createValidationError('missing_required', field))
  return value
}

function parseRequiredPath(
  input: unknown,
  field: string,
  errors: PluginPackageValidationError[]
): string | null {
  const result: SafeRelativePathResult = validateSafeRelativePath(input)
  if (!result.ok) {
    errors.push(createValidationError(result.code, field))
    return null
  }
  return result.path
}

function parseEnumArray<T extends string>(
  input: unknown,
  allowed: ReadonlySet<string>,
  field: string,
  errors: PluginPackageValidationError[]
): readonly T[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', field, { expected: 'array' }))
    return []
  }
  const values: T[] = []
  const seen = new Set<string>()
  for (let i = 0; i < input.length; i++) {
    const value = readNonEmptyString(input[i])
    if (!value) {
      errors.push(createValidationError('empty_string', `${field}[${i}]`))
      continue
    }
    if (!allowed.has(value)) {
      errors.push(createValidationError('unsupported_enum_value', `${field}[${i}]`))
      continue
    }
    if (!seen.has(value)) {
      seen.add(value)
      values.push(value as T)
    }
  }
  if (values.length === 0) errors.push(createValidationError('empty_array', field))
  return values
}

function parseCompatibility(
  input: unknown,
  errors: PluginPackageValidationError[]
): PluginPackageManifest['compatibility'] | null {
  if (!isRecord(input)) {
    errors.push(createValidationError('missing_required', 'compatibility'))
    return null
  }
  const platforms = parseEnumArray<PluginPackagePlatform>(
    input.platforms,
    PLATFORM_SET,
    'compatibility.platforms',
    errors
  )
  const architectures = parseEnumArray<PluginPackageArchitecture>(
    input.architectures,
    ARCH_SET,
    'compatibility.architectures',
    errors
  )
  const starverseVersionRange = requiredString(
    input.starverseVersionRange,
    'compatibility.starverseVersionRange',
    errors
  )
  if (!starverseVersionRange) return null
  return { platforms, architectures, starverseVersionRange }
}

function rejectExecutionScope(
  source: Record<string, unknown>,
  errors: PluginPackageValidationError[]
): void {
  const network = source.network
  if (isRecord(network) && network.allowed !== undefined && network.allowed !== false) {
    errors.push(createValidationError('network_not_allowed', 'network.allowed'))
  }
  const forbiddenExecutionFields = [
    'entrypoint',
    'entryPoint',
    'scriptEntry',
    'userScriptEntry',
    'executionHook',
    'executionHooks',
    'installScript',
    'postInstallScript',
    'networkHook',
  ] as const
  for (const field of forbiddenExecutionFields) {
    if (source[field] !== undefined) {
      errors.push(createValidationError('script_entry_not_allowed', field))
    }
  }
}
