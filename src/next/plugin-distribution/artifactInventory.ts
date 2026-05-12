import {
  PLUGIN_PACKAGE_ARTIFACT_CLASSES,
  PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
  REQUIRED_RUNTIME_PACKAGE_ARTIFACT_CLASSES,
  type ArtifactInventoryValidationError,
  type PluginPackageArtifact,
  type PluginPackageArtifactClass,
  type PluginPackageInventory,
  type PluginPackageRuntimeKind,
} from './types'
import {
  createValidationError,
  isRecord,
  isValidSha256,
  normalizeSha256,
  readFiniteNonNegativeInteger,
  readNonEmptyString,
  validateSafeRelativePath,
} from './validation'

const ARTIFACT_CLASS_SET = new Set<string>(PLUGIN_PACKAGE_ARTIFACT_CLASSES)

export type ArtifactInventoryValidationOptions = Readonly<{
  runtimeKind?: PluginPackageRuntimeKind
}>

export type ArtifactInventoryValidationResult =
  | Readonly<{ ok: true; inventory: PluginPackageInventory }>
  | Readonly<{ ok: false; errors: readonly ArtifactInventoryValidationError[] }>

export function validatePluginPackageInventory(
  input: unknown,
  options?: ArtifactInventoryValidationOptions
): ArtifactInventoryValidationResult {
  const errors: ArtifactInventoryValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }

  if (input.inventorySchemaVersion !== PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_schema_version', 'inventorySchemaVersion'))
  }
  const pluginId = requiredString(input.pluginId, 'pluginId', errors)
  const pluginVersion = requiredString(input.pluginVersion, 'pluginVersion', errors)
  const artifacts = parseArtifacts(input.artifacts, errors)
  validateRequiredRuntimeArtifactCoverage(artifacts, options, errors)

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    inventory: {
      inventorySchemaVersion: PLUGIN_PACKAGE_INVENTORY_SCHEMA_VERSION,
      pluginId: pluginId!,
      pluginVersion: pluginVersion!,
      artifacts,
    },
  }
}

export function validateRequiredRuntimeArtifactCoverage(
  artifacts: readonly PluginPackageArtifact[],
  options: ArtifactInventoryValidationOptions | undefined,
  errors: ArtifactInventoryValidationError[]
): void {
  if (options?.runtimeKind === undefined || options.runtimeKind === 'data') return
  const present = new Set(artifacts.map((artifact) => artifact.artifactClass))
  for (const artifactClass of REQUIRED_RUNTIME_PACKAGE_ARTIFACT_CLASSES) {
    if (!present.has(artifactClass)) {
      errors.push(
        createValidationError('missing_required_artifact', 'artifacts', { expected: artifactClass })
      )
    }
  }
}

function parseArtifacts(
  input: unknown,
  errors: ArtifactInventoryValidationError[]
): readonly PluginPackageArtifact[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', 'artifacts', { expected: 'array' }))
    return []
  }
  if (input.length === 0) {
    errors.push(createValidationError('empty_array', 'artifacts'))
    return []
  }

  const artifacts: PluginPackageArtifact[] = []
  const artifactIds = new Set<string>()
  const artifactPaths = new Set<string>()

  for (let i = 0; i < input.length; i++) {
    const artifact = input[i]
    if (!isRecord(artifact)) {
      errors.push(createValidationError('invalid_type', `artifacts[${i}]`))
      continue
    }

    const artifactId = requiredString(artifact.artifactId, `artifacts[${i}].artifactId`, errors)
    if (artifactId) {
      if (artifactIds.has(artifactId)) {
        errors.push(createValidationError('duplicate_artifact_id', `artifacts[${i}].artifactId`))
      }
      artifactIds.add(artifactId)
    }

    const pathResult = validateSafeRelativePath(artifact.relativePath)
    const relativePath = pathResult.ok ? pathResult.path : null
    if (!pathResult.ok) {
      errors.push(createValidationError(pathResult.code, `artifacts[${i}].relativePath`))
    } else {
      if (artifactPaths.has(pathResult.path)) {
        errors.push(
          createValidationError('duplicate_artifact_path', `artifacts[${i}].relativePath`, {
            path: pathResult.path,
          })
        )
      }
      artifactPaths.add(pathResult.path)
    }

    const artifactClass = parseArtifactClass(artifact.artifactClass, `artifacts[${i}].artifactClass`, errors)
    const sha256 = parseSha256(artifact.sha256, `artifacts[${i}].sha256`, errors)
    const sizeBytes = readFiniteNonNegativeInteger(artifact.sizeBytes)
    if (sizeBytes === null) {
      errors.push(createValidationError('invalid_size', `artifacts[${i}].sizeBytes`))
    }
    const required = artifact.required
    if (required !== undefined && typeof required !== 'boolean') {
      errors.push(createValidationError('invalid_type', `artifacts[${i}].required`))
    }

    if (artifactId && relativePath && artifactClass && sha256 && sizeBytes !== null) {
      artifacts.push({
        artifactId,
        relativePath,
        artifactClass,
        sha256,
        sizeBytes,
        required: required === true,
      })
    }
  }

  return artifacts
}

function requiredString(
  input: unknown,
  field: string,
  errors: ArtifactInventoryValidationError[]
): string | null {
  const value = readNonEmptyString(input)
  if (!value) errors.push(createValidationError('missing_required', field))
  return value
}

function parseArtifactClass(
  input: unknown,
  field: string,
  errors: ArtifactInventoryValidationError[]
): PluginPackageArtifactClass | null {
  const value = readNonEmptyString(input)
  if (!value) {
    errors.push(createValidationError('missing_required', field))
    return null
  }
  if (!ARTIFACT_CLASS_SET.has(value)) {
    errors.push(createValidationError('unsupported_enum_value', field))
    return null
  }
  return value as PluginPackageArtifactClass
}

function parseSha256(
  input: unknown,
  field: string,
  errors: ArtifactInventoryValidationError[]
): string | null {
  if (!isValidSha256(input)) {
    errors.push(createValidationError('invalid_sha256', field))
    return null
  }
  return normalizeSha256(input)
}
