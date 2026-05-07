import { FILE_FORMAT_IDS, type FileFormatId } from './types'
import {
  ENGINE_CAPABILITIES,
  ENGINE_KINDS,
  ENGINE_PLATFORMS,
  type EngineCapability,
  type EngineKind,
  type EnginePlatform,
  type ManagedEnginePluginManifest,
} from './externalEngineTypes'

type ManifestValidationSuccess = Readonly<{
  ok: true
  manifest: ManagedEnginePluginManifest
}>

type ManifestValidationFailure = Readonly<{
  ok: false
  errors: readonly string[]
}>

export type ManifestValidationResult = ManifestValidationSuccess | ManifestValidationFailure

const FILE_FORMAT_ID_SET = new Set<string>(FILE_FORMAT_IDS)
const ENGINE_KIND_SET = new Set<string>(ENGINE_KINDS)
const ENGINE_PLATFORM_SET = new Set<string>(ENGINE_PLATFORMS)
const ENGINE_CAPABILITY_SET = new Set<string>(ENGINE_CAPABILITIES)

export function validateManagedEnginePluginManifest(input: unknown): ManifestValidationResult {
  const errors: string[] = []
  const source = asObject(input)
  if (!source) {
    return { ok: false, errors: ['manifest must be an object'] }
  }

  const id = readNonEmptyString(source.id)
  if (!id) errors.push('id is required')

  const displayName = readNonEmptyString(source.displayName)
  if (!displayName) errors.push('displayName is required')

  const version = readNonEmptyString(source.version)
  if (!version) errors.push('version is required')

  const kind = parseEnumValue<EngineKind>(source.kind, ENGINE_KIND_SET, 'kind', errors)
  const platform = parseEnumValue<EnginePlatform>(source.platform, ENGINE_PLATFORM_SET, 'platform', errors)
  const capabilities = parseCapabilities(source.capabilities, errors)
  const supportedFormatIds = parseSupportedFormatIds(source.supportedFormatIds, errors)
  const supportedMimeTypes = parseSupportedMimeTypes(source.supportedMimeTypes, errors)
  const resourceLimits = parseResourceLimits(source.resourceLimits, errors)
  const sandbox = parseSandbox(source.sandbox, errors)
  const network = parseNetwork(source.network, errors)
  const healthcheck = parseHealthcheck(source.healthcheck, errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    manifest: {
      id: id!,
      displayName: displayName!,
      version: version!,
      kind: kind!,
      platform: platform!,
      capabilities,
      supportedFormatIds,
      supportedMimeTypes,
      resourceLimits,
      sandbox,
      network,
      healthcheck,
    },
  }
}

export function parseManagedEnginePluginManifest(input: unknown): ManagedEnginePluginManifest {
  const result = validateManagedEnginePluginManifest(input)
  if (!result.ok) {
    throw new Error(`invalid engine manifest: ${result.errors.join('; ')}`)
  }
  return result.manifest
}

function parseCapabilities(input: unknown, errors: string[]): readonly EngineCapability[] {
  if (!Array.isArray(input)) {
    errors.push('capabilities must be an array')
    return []
  }
  const out: EngineCapability[] = []
  const seen = new Set<string>()
  for (const value of input) {
    const normalized = readNonEmptyString(value)
    if (!normalized) continue
    if (!ENGINE_CAPABILITY_SET.has(normalized)) {
      errors.push(`unsupported capability: ${normalized}`)
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized as EngineCapability)
  }
  if (out.length === 0) {
    errors.push('capabilities must include at least one known capability')
  }
  return out
}

function parseSupportedFormatIds(input: unknown, errors: string[]): readonly FileFormatId[] {
  if (input == null) return []
  if (!Array.isArray(input)) {
    errors.push('supportedFormatIds must be an array when provided')
    return []
  }
  const out: FileFormatId[] = []
  const seen = new Set<string>()
  for (const value of input) {
    const normalized = readNonEmptyString(value)
    if (!normalized) continue
    if (!FILE_FORMAT_ID_SET.has(normalized)) {
      errors.push(`unsupported format id: ${normalized}`)
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized as FileFormatId)
  }
  return out
}

function parseSupportedMimeTypes(input: unknown, errors: string[]): readonly string[] {
  if (input == null) return []
  if (!Array.isArray(input)) {
    errors.push('supportedMimeTypes must be an array when provided')
    return []
  }
  const out = new Set<string>()
  for (const value of input) {
    const normalized = readNonEmptyString(value)?.toLowerCase() ?? ''
    if (!normalized) continue
    out.add(normalized)
  }
  return Array.from(out)
}

function parseResourceLimits(
  input: unknown,
  errors: string[]
): ManagedEnginePluginManifest['resourceLimits'] {
  const source = asObject(input)
  if (!source) {
    return { maxInputBytes: null, maxDurationMs: null }
  }
  return {
    maxInputBytes: parseNullableFiniteNumber(source.maxInputBytes, 'resourceLimits.maxInputBytes', errors),
    maxDurationMs: parseNullableFiniteNumber(source.maxDurationMs, 'resourceLimits.maxDurationMs', errors),
  }
}

function parseSandbox(input: unknown, errors: string[]): ManagedEnginePluginManifest['sandbox'] {
  const source = asObject(input)
  if (!source) {
    return { enabled: true }
  }
  const enabled = source.enabled
  if (enabled == null) return { enabled: true }
  if (typeof enabled !== 'boolean') {
    errors.push('sandbox.enabled must be boolean when provided')
    return { enabled: true }
  }
  return { enabled }
}

function parseNetwork(input: unknown, errors: string[]): ManagedEnginePluginManifest['network'] {
  const source = asObject(input)
  if (!source) {
    return { allowed: false }
  }
  const allowed = source.allowed
  if (allowed == null) return { allowed: false }
  if (typeof allowed !== 'boolean') {
    errors.push('network.allowed must be boolean when provided')
    return { allowed: false }
  }
  return { allowed }
}

function parseHealthcheck(
  input: unknown,
  errors: string[]
): ManagedEnginePluginManifest['healthcheck'] {
  if (input == null) return null
  const source = asObject(input)
  if (!source) {
    errors.push('healthcheck must be an object when provided')
    return null
  }
  const command = readNonEmptyString(source.command)
  if (!command) {
    errors.push('healthcheck.command is required when healthcheck is provided')
    return null
  }

  const argsInput = source.args
  const args: string[] = []
  if (argsInput != null) {
    if (!Array.isArray(argsInput)) {
      errors.push('healthcheck.args must be an array of strings when provided')
    } else {
      for (const value of argsInput) {
        if (typeof value === 'string') args.push(value)
      }
    }
  }

  const cwdInput = source.cwd
  let cwd: string | null = null
  if (cwdInput != null) {
    if (typeof cwdInput !== 'string') {
      errors.push('healthcheck.cwd must be a string or null when provided')
    } else {
      const normalized = cwdInput.trim()
      cwd = normalized.length > 0 ? normalized : null
    }
  }

  return {
    command,
    args,
    cwd,
  }
}

function parseNullableFiniteNumber(input: unknown, field: string, errors: string[]): number | null {
  if (input == null) return null
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    errors.push(`${field} must be a non-negative finite number or null`)
    return null
  }
  return input
}

function parseEnumValue<T extends string>(
  input: unknown,
  allowed: ReadonlySet<string>,
  field: string,
  errors: string[]
): T | null {
  const normalized = readNonEmptyString(input)
  if (!normalized) {
    errors.push(`${field} is required`)
    return null
  }
  if (!allowed.has(normalized)) {
    errors.push(`${field} must be one of: ${Array.from(allowed).join(', ')}`)
    return null
  }
  return normalized as T
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
