export const PROVIDER_NATIVE_STATUSES = ['streaming', 'final', 'error', 'cancelled'] as const

export type ProviderNativeStatus = typeof PROVIDER_NATIVE_STATUSES[number]

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export class ProviderNativeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderNativeValidationError'
  }
}

export function clonePlainJsonObject(value: unknown, path = '$'): Record<string, unknown> {
  const cloned = clonePlainJsonValue(value, path, new WeakSet())
  if (!isPlainObject(cloned)) {
    throw new ProviderNativeValidationError(`${path} must be a plain object`)
  }
  return cloned
}

export function clonePlainJsonArray(value: unknown, path = '$'): unknown[] {
  const cloned = clonePlainJsonValue(value, path, new WeakSet())
  if (!Array.isArray(cloned)) {
    throw new ProviderNativeValidationError(`${path} must be an array`)
  }
  return cloned
}

export function clonePlainJsonValue(value: unknown, path = '$', seen = new WeakSet<object>()): unknown {
  if (value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    if (type === 'number' && !Number.isFinite(value as number)) {
      throw new ProviderNativeValidationError(`${path} must be finite`)
    }
    return value
  }
  if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new ProviderNativeValidationError(`${path} is not JSON serializable`)
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new ProviderNativeValidationError(`${path} contains a cycle`)
    seen.add(value)
    const out = value.map((item, index) => clonePlainJsonValue(item, `${path}[${index}]`, seen))
    seen.delete(value)
    return out
  }
  if (!isPlainObject(value)) {
    throw new ProviderNativeValidationError(`${path} must be a plain object`)
  }
  if (seen.has(value)) throw new ProviderNativeValidationError(`${path} contains a cycle`)
  seen.add(value)
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new ProviderNativeValidationError(`${path}.${key} is not allowed`)
    }
    out[key] = clonePlainJsonValue(child, `${path}.${key}`, seen)
  }
  seen.delete(value)
  return out
}

export function validateJsonByteLimit(value: unknown, maxBytes: number, message: string) {
  const json = JSON.stringify(value)
  const bytes = utf8ByteLength(json)
  if (bytes > maxBytes) {
    throw new ProviderNativeValidationError(`${message} (${bytes} bytes > ${maxBytes} bytes)`)
  }
}

export function isProviderNativeStatus(value: unknown): value is ProviderNativeStatus {
  return PROVIDER_NATIVE_STATUSES.includes(value as ProviderNativeStatus)
}

function utf8ByteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length
  } catch {
    return text.length
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.getPrototypeOf(value) === Object.prototype
}
