import { isCompatibleSecretLikeFieldName, looksLikeCompatibleSecretValue } from '../schemas'
import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleExtensionValueShape } from './extensionTypes'

const OPAQUE_NAME = /(?:^|[-_.])(?:encrypted|opaque|signature)(?:[-_.]|$)/i

export function compatibleExtensionValueShape(value: CompatibleJsonValue): CompatibleExtensionValueShape {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value as Exclude<CompatibleExtensionValueShape, 'null' | 'array'>
}

export function redactCompatibleExtensionValue(value: CompatibleJsonValue, fieldName?: string): Readonly<{
  value: CompatibleJsonValue
  redactionState: 'redacted' | 'truncated_redacted' | 'dropped'
}> {
  let changed = false
  const visit = (candidate: CompatibleJsonValue, key?: string): CompatibleJsonValue => {
    if (key && (isCompatibleSecretLikeFieldName(key) || OPAQUE_NAME.test(key))) {
      changed = true
      return '[redacted]'
    }
    if (typeof candidate === 'string') {
      changed = true
      return looksLikeCompatibleSecretValue(candidate) ? '[redacted]' : '[redacted]'
    }
    if (Array.isArray(candidate)) return candidate.map((item) => visit(item))
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(Object.entries(candidate).map(([name, child]) => [name, visit(child, name)])) as CompatibleJsonValue
    }
    return candidate
  }
  const redacted = visit(value, fieldName)
  return Object.freeze({ value: redacted, redactionState: changed ? 'redacted' : 'redacted' })
}

export function createCompatibleDiscoveryPreview(value: CompatibleJsonValue, maxBytes = 4096): string | null {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('compatible_extension_preview_limit_invalid')
  if (typeof value !== 'string') return null
  if (looksLikeCompatibleSecretValue(value)) return '[redacted]'
  const bytes = new TextEncoder().encode(value)
  if (bytes.byteLength <= maxBytes) return value
  return new TextDecoder().decode(bytes.slice(0, maxBytes))
}
