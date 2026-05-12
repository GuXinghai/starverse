import {
  PLUGIN_SIGNATURE_ALGORITHMS,
  PLUGIN_TARGETS_SCHEMA_VERSION,
  PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
  type PluginFailureReason,
  type PluginSignatureAlgorithm,
  type PluginSignatureEnvelope,
  type PluginTargetMetadata,
  type PluginTargetsMetadata,
  type PluginTrustRootMetadata,
  type TrustPolicyValidationError,
} from './types'
import {
  createValidationError,
  detectRollbackVersion,
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

const SIGNATURE_ALGORITHM_SET = new Set<string>(PLUGIN_SIGNATURE_ALGORITHMS)

export type TrustPolicyValidationOptions = Readonly<{
  now?: Date
  previousTargetsVersion?: number | null
}>

export type TrustRootValidationResult =
  | Readonly<{ ok: true; root: PluginTrustRootMetadata }>
  | Readonly<{ ok: false; errors: readonly TrustPolicyValidationError[] }>

export type TargetsMetadataValidationResult =
  | Readonly<{ ok: true; targets: PluginTargetsMetadata }>
  | Readonly<{ ok: false; errors: readonly TrustPolicyValidationError[] }>

export type SignatureEnvelopeValidationResult =
  | Readonly<{ ok: true; signature: PluginSignatureEnvelope }>
  | Readonly<{ ok: false; errors: readonly TrustPolicyValidationError[] }>

export type RollbackDetectionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: Extract<PluginFailureReason, 'rollback_detected'> }>

export function validatePluginTrustRootMetadata(
  input: unknown,
  options?: TrustPolicyValidationOptions
): TrustRootValidationResult {
  const errors: TrustPolicyValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }
  if (input.rootSchemaVersion !== PLUGIN_TRUST_ROOT_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_schema_version', 'rootSchemaVersion'))
  }
  const rootVersion = readFiniteNonNegativeInteger(input.rootVersion)
  if (rootVersion === null) errors.push(createValidationError('invalid_version', 'rootVersion'))
  const generatedAt = readIsoTimestamp(input.generatedAt)
  if (!generatedAt) errors.push(createValidationError('invalid_timestamp', 'generatedAt'))
  const expiresAt = readIsoTimestamp(input.expiresAt)
  if (!expiresAt) {
    errors.push(createValidationError('invalid_timestamp', 'expiresAt'))
  } else if (isExpiredTimestamp(expiresAt, options?.now)) {
    errors.push(createValidationError('expired_metadata', 'expiresAt'))
  }
  requireReservedRoles(input, errors)
  const keys = parseRootKeys(input.keys, errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    root: {
      rootSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      rootVersion: rootVersion!,
      generatedAt: generatedAt!,
      expiresAt: expiresAt!,
      keys,
      snapshotRole: 'reserved',
      timestampRole: 'reserved',
      delegatedRoles: 'reserved',
    },
  }
}

export function validatePluginTargetsMetadata(
  input: unknown,
  options?: TrustPolicyValidationOptions
): TargetsMetadataValidationResult {
  const errors: TrustPolicyValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }
  if (input.targetsSchemaVersion !== PLUGIN_TARGETS_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_schema_version', 'targetsSchemaVersion'))
  }
  const targetsVersion = readFiniteNonNegativeInteger(input.targetsVersion)
  if (targetsVersion === null) errors.push(createValidationError('invalid_version', 'targetsVersion'))
  if (
    targetsVersion !== null &&
    options?.previousTargetsVersion !== undefined &&
    options.previousTargetsVersion !== null &&
    targetsVersion < options.previousTargetsVersion
  ) {
    errors.push(createValidationError('rollback_detected', 'targetsVersion'))
  }
  const generatedAt = readIsoTimestamp(input.generatedAt)
  if (!generatedAt) errors.push(createValidationError('invalid_timestamp', 'generatedAt'))
  const expiresAt = readIsoTimestamp(input.expiresAt)
  if (!expiresAt) {
    errors.push(createValidationError('invalid_timestamp', 'expiresAt'))
  } else if (isExpiredTimestamp(expiresAt, options?.now)) {
    errors.push(createValidationError('expired_metadata', 'expiresAt'))
  }
  requireReservedRoles(input, errors)
  const targets = parseTargets(input.targets, errors, options)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    targets: {
      targetsSchemaVersion: PLUGIN_TARGETS_SCHEMA_VERSION,
      targetsVersion: targetsVersion!,
      generatedAt: generatedAt!,
      expiresAt: expiresAt!,
      targets,
      snapshotRole: 'reserved',
      timestampRole: 'reserved',
      delegatedRoles: 'reserved',
    },
  }
}

export function validatePluginSignatureEnvelope(
  input: unknown,
  options?: TrustPolicyValidationOptions
): SignatureEnvelopeValidationResult {
  const errors: TrustPolicyValidationError[] = []
  if (!isRecord(input)) {
    return { ok: false, errors: [createValidationError('invalid_type', 'root')] }
  }
  if (input.signatureSchemaVersion !== PLUGIN_TRUST_ROOT_SCHEMA_VERSION) {
    errors.push(createValidationError('unsupported_schema_version', 'signatureSchemaVersion'))
  }
  const keyId = requiredString(input.keyId, 'keyId', errors)
  const algorithm = parseEnumValue<PluginSignatureAlgorithm>(
    input.algorithm,
    SIGNATURE_ALGORITHM_SET,
    'algorithm',
    errors
  )
  const signedAt = readIsoTimestamp(input.signedAt)
  if (!signedAt) errors.push(createValidationError('invalid_timestamp', 'signedAt'))
  const expiresAt = readIsoTimestamp(input.expiresAt)
  if (!expiresAt) {
    errors.push(createValidationError('invalid_timestamp', 'expiresAt'))
  } else if (isExpiredTimestamp(expiresAt, options?.now)) {
    errors.push(createValidationError('expired_metadata', 'expiresAt'))
  }
  const value = requiredString(input.value, 'value', errors)
  const coveredManifestSha256 = parseOptionalSha(input.coveredManifestSha256, 'coveredManifestSha256', errors)
  const coveredInventorySha256 = parseOptionalSha(input.coveredInventorySha256, 'coveredInventorySha256', errors)

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    signature: {
      signatureSchemaVersion: PLUGIN_TRUST_ROOT_SCHEMA_VERSION,
      keyId: keyId!,
      algorithm: algorithm!,
      signedAt: signedAt!,
      expiresAt: expiresAt!,
      value: value!,
      coveredManifestSha256: coveredManifestSha256 ?? undefined,
      coveredInventorySha256: coveredInventorySha256 ?? undefined,
    },
  }
}

export function detectPluginVersionRollback(
  nextVersion: string,
  previousVersion?: string | null
): RollbackDetectionResult {
  const error = detectRollbackVersion(nextVersion, previousVersion)
  return error?.code === 'rollback_detected' ? { ok: false, reason: 'rollback_detected' } : { ok: true }
}

function parseRootKeys(
  input: unknown,
  errors: TrustPolicyValidationError[]
): PluginTrustRootMetadata['keys'] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', 'keys', { expected: 'array' }))
    return []
  }
  const keys: PluginTrustRootMetadata['keys'][number][] = []
  for (let i = 0; i < input.length; i++) {
    const key = input[i]
    if (!isRecord(key)) {
      errors.push(createValidationError('invalid_type', `keys[${i}]`))
      continue
    }
    const keyId = requiredString(key.keyId, `keys[${i}].keyId`, errors)
    const algorithm = parseEnumValue<PluginSignatureAlgorithm>(
      key.algorithm,
      SIGNATURE_ALGORITHM_SET,
      `keys[${i}].algorithm`,
      errors
    )
    const publicKeyRef = parseRelativeRef(key.publicKeyRef, `keys[${i}].publicKeyRef`, errors)
    const role = key.role === 'root' || key.role === 'targets' ? key.role : null
    if (!role) errors.push(createValidationError('unsupported_enum_value', `keys[${i}].role`))
    if (keyId && algorithm && publicKeyRef && role) {
      keys.push({ keyId, algorithm, publicKeyRef, role })
    }
  }
  if (keys.length === 0) errors.push(createValidationError('empty_array', 'keys'))
  return keys
}

function parseTargets(
  input: unknown,
  errors: TrustPolicyValidationError[],
  options: TrustPolicyValidationOptions | undefined
): readonly PluginTargetMetadata[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', 'targets', { expected: 'array' }))
    return []
  }
  const targets: PluginTargetMetadata[] = []
  for (let i = 0; i < input.length; i++) {
    const target = input[i]
    if (!isRecord(target)) {
      errors.push(createValidationError('invalid_type', `targets[${i}]`))
      continue
    }
    const pluginId = requiredString(target.pluginId, `targets[${i}].pluginId`, errors)
    const pluginVersion = requiredString(target.pluginVersion, `targets[${i}].pluginVersion`, errors)
    const packageSha256 = parseRequiredSha(target.packageSha256, `targets[${i}].packageSha256`, errors)
    const packageSizeBytes = readFiniteNonNegativeInteger(target.packageSizeBytes)
    if (packageSizeBytes === null) {
      errors.push(createValidationError('invalid_size', `targets[${i}].packageSizeBytes`))
    }
    const expiresAt = readIsoTimestamp(target.expiresAt)
    if (!expiresAt) {
      errors.push(createValidationError('invalid_timestamp', `targets[${i}].expiresAt`))
    } else if (isExpiredTimestamp(expiresAt, options?.now)) {
      errors.push(createValidationError('expired_metadata', `targets[${i}].expiresAt`))
    }
    const signatureRef = parseRelativeRef(target.signatureRef, `targets[${i}].signatureRef`, errors)
    if (pluginId && pluginVersion && packageSha256 && packageSizeBytes !== null && expiresAt && signatureRef) {
      targets.push({ pluginId, pluginVersion, packageSha256, packageSizeBytes, expiresAt, signatureRef })
    }
  }
  if (targets.length === 0) errors.push(createValidationError('empty_array', 'targets'))
  return targets
}

function requireReservedRoles(
  input: Record<string, unknown>,
  errors: TrustPolicyValidationError[]
): void {
  for (const field of ['snapshotRole', 'timestampRole', 'delegatedRoles'] as const) {
    if (input[field] !== 'reserved') {
      errors.push(createValidationError('reserved_role_not_deferred', field, { expected: 'reserved' }))
    }
  }
}

function parseRelativeRef(
  input: unknown,
  field: string,
  errors: TrustPolicyValidationError[]
): string | null {
  const result = validateSafeRelativePath(input)
  if (!result.ok) {
    errors.push(createValidationError(result.code, field))
    return null
  }
  return result.path
}

function parseRequiredSha(
  input: unknown,
  field: string,
  errors: TrustPolicyValidationError[]
): string | null {
  if (!isValidSha256(input)) {
    errors.push(createValidationError('invalid_sha256', field))
    return null
  }
  return normalizeSha256(input)
}

function parseOptionalSha(
  input: unknown,
  field: string,
  errors: TrustPolicyValidationError[]
): string | null {
  if (input === undefined || input === null) return null
  return parseRequiredSha(input, field, errors)
}

function requiredString(
  input: unknown,
  field: string,
  errors: TrustPolicyValidationError[]
): string | null {
  const value = readNonEmptyString(input)
  if (!value) errors.push(createValidationError('missing_required', field))
  return value
}
