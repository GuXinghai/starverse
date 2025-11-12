import { toRaw, isProxy } from 'vue'

/**
 * Determine if a value is a plain object (Object literal or created via Object.create(null)).
 * @param {any} value
 * @returns {boolean}
 */
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Convert ArrayBuffer or ArrayBufferView into a plain array of numbers.
 * @param {ArrayBuffer | ArrayBufferView} bufferLike
 * @returns {number[]}
 */
const bufferToArray = (bufferLike) => {
  if (bufferLike instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(bufferLike.slice(0)))
  }
  return Array.from(
    new Uint8Array(
      bufferLike.buffer,
      bufferLike.byteOffset,
      bufferLike.byteLength
    )
  )
}

/**
 * Recursively sanitize a value so it can cross the Electron IPC structured clone boundary.
 * Removes Vue proxies, drops functions/symbols/custom prototypes, converts Maps/Sets/etc to plain data,
 * and ensures there are no cyclic references that would break structured cloning.
 *
 * @template T
 * @param {T} input
 * @returns {any}
 */
export function sanitizeForIpc(input) {
  const seen = new WeakMap()

  const walk = (value) => {
    if (value === null || value === undefined) return value

    const valueType = typeof value
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
      return value
    }
    if (valueType === 'bigint') {
      return value.toString()
    }
    if (valueType === 'symbol' || valueType === 'function') {
      return undefined
    }

    if (isProxy?.(value)) {
      value = toRaw(value)
    }

    if (seen.has(value)) {
      return seen.get(value)
    }

    if (Array.isArray(value)) {
      const out = []
      seen.set(value, out)
      for (const item of value) {
        const sanitized = walk(item)
        out.push(sanitized === undefined ? null : sanitized)
      }
      return out
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    if (value instanceof RegExp) {
      return value.toString()
    }

    if (typeof URL !== 'undefined' && value instanceof URL) {
      return value.toString()
    }

    if (value instanceof Map) {
      const out = {}
      seen.set(value, out)
      for (const [key, mapValue] of value.entries()) {
        const sanitized = walk(mapValue)
        if (sanitized !== undefined) {
          const propName = typeof key === 'string' ? key : String(key)
          out[propName] = sanitized
        }
      }
      return out
    }

    if (value instanceof Set) {
      const out = []
      seen.set(value, out)
      for (const item of value.values()) {
        const sanitized = walk(item)
        out.push(sanitized === undefined ? null : sanitized)
      }
      return out
    }

    if (ArrayBuffer.isView(value)) {
      return bufferToArray(value)
    }

    if (value instanceof ArrayBuffer) {
      return bufferToArray(value)
    }

    if (isPlainObject(value)) {
      const out = {}
      seen.set(value, out)
      for (const key of Object.keys(value)) {
        const sanitized = walk(value[key])
        if (sanitized !== undefined) {
          out[key] = sanitized
        }
      }
      return out
    }

    if (typeof value.toJSON === 'function') {
      return walk(value.toJSON())
    }

    if (typeof value.valueOf === 'function') {
      const plainValue = value.valueOf()
      if (plainValue !== value) {
        return walk(plainValue)
      }
    }

    return undefined
  }

  return walk(input)
}

/**
 * Specialized sanitizer for message metadata.
 * - Forces metadata to be JSON-safe.
 * - Removes heavy/unsafe fields like usage.raw.
 *
 * @param {Record<string, any> | undefined | null} metadata
 * @returns {Record<string, any> | undefined}
 */
export function sanitizeMessageMetadata(metadata) {
  if (metadata == null) {
    return undefined
  }

  const cleaned = sanitizeForIpc(metadata)
  if (!cleaned || typeof cleaned !== 'object') {
    return undefined
  }

  if (cleaned.usage && typeof cleaned.usage === 'object') {
    delete cleaned.usage.raw

    if (cleaned.usage.cost_details && typeof cleaned.usage.cost_details === 'object') {
      const sanitizedCostDetails = sanitizeForIpc(cleaned.usage.cost_details)
      if (sanitizedCostDetails && typeof sanitizedCostDetails === 'object') {
        cleaned.usage.cost_details = sanitizedCostDetails
      } else {
        delete cleaned.usage.cost_details
      }
    }

    if (Object.keys(cleaned.usage).length === 0) {
      delete cleaned.usage
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}
