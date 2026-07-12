const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])
const SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/

export const COMPATIBLE_EXTENSION_PATH_MAX_SEGMENTS = 32

export type CompatibleExtensionPath = readonly (string | number | '*')[]

export function parseCompatibleExtensionPath(input: string): CompatibleExtensionPath {
  if (typeof input !== 'string' || input.length < 1 || input.length > 1024) throw invalid()
  const segments = input.split('.')
  if (segments.length > COMPATIBLE_EXTENSION_PATH_MAX_SEGMENTS) throw invalid()
  return Object.freeze(segments.map((segment) => {
    if (segment === '*') return segment
    if (/^(?:0|[1-9][0-9]{0,5})$/.test(segment)) return Number(segment)
    if (!SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) throw invalid()
    return segment
  }))
}

export function normalizeCompatibleExtensionPath(path: readonly (string | number)[]): string {
  if (path.length < 1 || path.length > COMPATIBLE_EXTENSION_PATH_MAX_SEGMENTS) throw invalid()
  return path.map((segment) => {
    if (typeof segment === 'number') {
      if (!Number.isSafeInteger(segment) || segment < 0) throw invalid()
      return String(segment)
    }
    if (!SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) throw invalid()
    return segment
  }).join('.')
}

export function compatibleExtensionPathMatches(pattern: CompatibleExtensionPath, actual: readonly (string | number)[]): boolean {
  return pattern.length === actual.length && pattern.every((segment, index) => segment === '*' || segment === actual[index])
}

function invalid(): Error {
  return new Error('compatible_extension_path_invalid')
}
