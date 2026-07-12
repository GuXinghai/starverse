import type { CompatibleJsonValue } from '../request/messageTypes'
import { createCompatibleHttpWireError } from './wireError'
import { DEFAULT_COMPATIBLE_WIRE_LIMITS, type CompatibleWireErrorEnvelope } from './wireTypes'

export function mapCompatibleHttpError(input: Readonly<{
  status: number
  body?: Uint8Array
  maxBytes?: number
}>): CompatibleWireErrorEnvelope {
  const body = input.body
  let providerErrorShape: 'object' | 'other' | 'none' = 'none'
  let providerCodePresent: boolean | undefined
  let providerTypePresent: boolean | undefined
  if (body && body.byteLength > 0 && body.byteLength <= (input.maxBytes ?? DEFAULT_COMPATIBLE_WIRE_LIMITS.maxNonStreamBytes)) {
    try {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as CompatibleJsonValue
      const root = isObject(value) ? value : null
      const providerError = root?.error
      providerErrorShape = isObject(providerError) ? 'object' : providerError === undefined || providerError === null ? 'none' : 'other'
      if (isObject(providerError)) {
        providerCodePresent = typeof providerError.code === 'string' || typeof providerError.code === 'number'
        providerTypePresent = typeof providerError.type === 'string'
      }
    } catch {
      providerErrorShape = 'other'
    }
  } else if (body && body.byteLength > 0) {
    providerErrorShape = 'other'
  }
  return createCompatibleHttpWireError({
    status: input.status,
    providerErrorShape,
    ...(providerCodePresent === undefined ? {} : { providerCodePresent }),
    ...(providerTypePresent === undefined ? {} : { providerTypePresent }),
  }).envelope
}

function isObject(value: unknown): value is Record<string, CompatibleJsonValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype)
}
