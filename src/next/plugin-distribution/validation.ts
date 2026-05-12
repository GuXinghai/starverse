import type {
  PluginDistributionValidationCode,
  PluginDistributionValidationError,
  PluginDistributionValidationResult,
} from './types'

const SAFE_RELATIVE_PATH_REDACTION = '[unsafe-path]'

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u

export type SafeRelativePathResult =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; code: PluginDistributionValidationCode }>

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

export function readNonEmptyString(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  return value.length > 0 ? value : null
}

export function readFiniteNonNegativeInteger(input: unknown): number | null {
  if (typeof input !== 'number') return null
  if (!Number.isInteger(input) || input < 0 || !Number.isFinite(input)) return null
  return input
}

export function readIsoTimestamp(input: unknown): string | null {
  const value = readNonEmptyString(input)
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : value
}

export function isExpiredTimestamp(input: string, now: Date = new Date()): boolean {
  return Date.parse(input) <= now.getTime()
}

export function isValidSha256(input: unknown): input is string {
  return typeof input === 'string' && SHA256_HEX_PATTERN.test(input.trim().toLowerCase())
}

export function normalizeSha256(input: string): string {
  return input.trim().toLowerCase()
}

export function validateSafeRelativePath(input: unknown): SafeRelativePathResult {
  if (typeof input !== 'string') return { ok: false, code: 'invalid_type' }
  if (input.includes('\u0000')) return { ok: false, code: 'unsafe_relative_path' }
  const trimmed = input.trim()
  if (trimmed.length === 0) return { ok: false, code: 'unsafe_relative_path' }
  if (/^[A-Za-z]:($|[\\/])/u.test(trimmed)) return { ok: false, code: 'unsafe_relative_path' }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(trimmed)) return { ok: false, code: 'unsafe_relative_path' }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return { ok: false, code: 'unsafe_relative_path' }
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) {
    return { ok: false, code: 'unsafe_relative_path' }
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\/+/u, '')
  if (normalized.length === 0) return { ok: false, code: 'unsafe_relative_path' }
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return { ok: false, code: 'unsafe_relative_path' }
  }
  if (
    normalized.includes('\u2024') ||
    normalized.includes('\u2025') ||
    normalized.includes('\uFE30')
  ) {
    return { ok: false, code: 'unsafe_relative_path' }
  }
  return { ok: true, path: normalized }
}

export function safePathForError(input: unknown): string | undefined {
  const result = validateSafeRelativePath(input)
  return result.ok ? result.path : undefined
}

export function createValidationError(
  code: PluginDistributionValidationCode,
  field: string,
  options?: Readonly<{ path?: unknown; expected?: string }>
): PluginDistributionValidationError {
  return {
    code,
    field,
    path: options?.path === SAFE_RELATIVE_PATH_REDACTION ? undefined : safePathForError(options?.path),
    expected: options?.expected,
  }
}

export function validationSuccess<T>(
  value: T,
  warnings?: readonly PluginDistributionValidationError[]
): PluginDistributionValidationResult<T> {
  return warnings && warnings.length > 0 ? { ok: true, value, warnings } : { ok: true, value }
}

export function validationFailure<T = never>(
  errors: readonly PluginDistributionValidationError[]
): PluginDistributionValidationResult<T> {
  return { ok: false, errors }
}

export function readStringArray(
  input: unknown,
  field: string,
  errors: PluginDistributionValidationError[]
): readonly string[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', field, { expected: 'array' }))
    return []
  }
  const values: string[] = []
  for (let i = 0; i < input.length; i++) {
    const value = readNonEmptyString(input[i])
    if (!value) {
      errors.push(createValidationError('empty_string', `${field}[${i}]`))
      continue
    }
    values.push(value)
  }
  if (values.length === 0) {
    errors.push(createValidationError('empty_array', field))
  }
  return values
}

export function readSafePathArray(
  input: unknown,
  field: string,
  errors: PluginDistributionValidationError[]
): readonly string[] {
  if (!Array.isArray(input)) {
    errors.push(createValidationError('invalid_type', field, { expected: 'array' }))
    return []
  }
  const values: string[] = []
  for (let i = 0; i < input.length; i++) {
    const result = validateSafeRelativePath(input[i])
    if (!result.ok) {
      errors.push(createValidationError(result.code, `${field}[${i}]`))
      continue
    }
    values.push(result.path)
  }
  if (values.length === 0) {
    errors.push(createValidationError('empty_array', field))
  }
  return values
}

export function parseEnumValue<T extends string>(
  input: unknown,
  allowed: ReadonlySet<string>,
  field: string,
  errors: PluginDistributionValidationError[]
): T | null {
  const value = readNonEmptyString(input)
  if (!value) {
    errors.push(createValidationError('missing_required', field))
    return null
  }
  if (!allowed.has(value)) {
    errors.push(createValidationError('unsupported_enum_value', field))
    return null
  }
  return value as T
}

export function parseSemverParts(version: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareSemverLike(a: string, b: string): number | null {
  const aParts = parseSemverParts(a)
  const bParts = parseSemverParts(b)
  if (!aParts || !bParts) return null
  for (let i = 0; i < aParts.length; i++) {
    const delta = aParts[i] - bParts[i]
    if (delta !== 0) return delta
  }
  return 0
}

export function detectRollbackVersion(
  nextVersion: string,
  previousVersion?: string | null
): PluginDistributionValidationError | null {
  if (!previousVersion) return null
  const comparison = compareSemverLike(nextVersion, previousVersion)
  if (comparison === null) {
    return createValidationError('invalid_version', 'pluginVersion')
  }
  return comparison < 0 ? createValidationError('rollback_detected', 'pluginVersion') : null
}
