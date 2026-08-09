import type {
  GenerationParamCapability,
  GenerationParamError,
  GenerationParamIssueCode,
  GenerationParamKey,
  GenerationParamValue,
  GenerationParamWarning,
} from './generationParamTypes'

export function makeGenerationParamError(
  code: GenerationParamIssueCode,
  message: string,
  key?: GenerationParamKey,
): GenerationParamError {
  return { code, severity: 'error', message, ...(key ? { key } : {}) }
}

export function makeGenerationParamWarning(
  code: GenerationParamIssueCode,
  message: string,
  key?: GenerationParamKey,
): GenerationParamWarning {
  return { code, severity: 'warning', message, ...(key ? { key } : {}) }
}

export function normalizeGenerationParamValue(
  key: GenerationParamKey,
  raw: unknown,
  capability: GenerationParamCapability,
): GenerationParamValue | null {
  if (capability.valueType === 'boolean') {
    return typeof raw === 'boolean' ? raw : null
  }

  if (capability.valueType === 'enum') {
    if (typeof raw !== 'string') return null
    const normalized = raw.trim()
    if (!normalized) return null
    return capability.enumValues?.includes(normalized) ? normalized : null
  }

  if (capability.valueType === 'stringArray') {
    if (!Array.isArray(raw)) return null
    if (raw.length > 16) return null
    const normalized = raw
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter(Boolean)
    if (normalized.length !== raw.length) return null
    if (normalized.some((item) => item.length > 128)) return null
    return normalized
  }

  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if ((capability.valueType === 'integer' || capability.range?.integer) && !Number.isSafeInteger(raw)) return null
  const normalized = raw
  if (capability.specialValues?.includes(normalized)) return normalized
  const range = capability.range
  if (range?.min !== undefined && normalized < range.min) return null
  if (range?.max !== undefined) {
    if (range.exclusiveMax ? normalized >= range.max : normalized > range.max) return null
  }
  if (key === 'seed' && normalized < 0) return null
  return normalized
}
