import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { stableSerializeProviderRequestBoundedV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'

export type ApiRequestBodySchemaNodeV2 = Readonly<
  | { type: 'any_json' }
  | { type: 'string'; enum?: readonly string[]; maxLength?: number }
  | { type: 'number'; safeInteger?: boolean }
  | { type: 'boolean'; const?: boolean }
  | { type: 'null' }
  | { type: 'array'; items: ApiRequestBodySchemaNodeV2; minItems?: number; maxItems?: number }
  | { type: 'object'; properties: Readonly<Record<string, ApiRequestBodySchemaNodeV2>>; required?: readonly string[];
      additionalProperties?: false | ApiRequestBodySchemaNodeV2 }
  | { type: 'union'; variants: readonly ApiRequestBodySchemaNodeV2[] }
>

export class ApiRequestBodySchemaV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_API_REQUEST_BODY_SCHEMA_INVALID'
    | 'GENERATION_V2_API_REQUEST_BODY_SCHEMA_UNKNOWN') {
    super(code)
    this.name = 'ApiRequestBodySchemaV2Error'
  }
}

export function apiBodyStringV2(options: Readonly<{ enum?: readonly string[]; maxLength?: number }> = {}): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'string', ...options })
}

export function apiBodyNumberV2(safeInteger = false): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'number', ...(safeInteger ? { safeInteger: true } : {}) })
}

export function apiBodyBooleanV2(constant?: boolean): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'boolean', ...(constant === undefined ? {} : { const: constant }) })
}
export function apiBodyNullV2(): ApiRequestBodySchemaNodeV2 { return Object.freeze({ type: 'null' }) }
export function apiBodyJsonV2(): ApiRequestBodySchemaNodeV2 { return Object.freeze({ type: 'any_json' }) }

export function apiBodyArrayV2(
  items: ApiRequestBodySchemaNodeV2,
  options: Readonly<{ minItems?: number; maxItems?: number }> = {},
): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'array', items, ...options })
}

export function apiBodyObjectV2(
  properties: Readonly<Record<string, ApiRequestBodySchemaNodeV2>>,
  required: readonly string[] = [],
  additionalProperties: false | ApiRequestBodySchemaNodeV2 = false,
): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'object', properties: Object.freeze({ ...properties }), required: Object.freeze([...required]), additionalProperties })
}

export function apiBodyUnionV2(...variants: readonly ApiRequestBodySchemaNodeV2[]): ApiRequestBodySchemaNodeV2 {
  return Object.freeze({ type: 'union', variants: Object.freeze([...variants]) })
}

function invalid(): never { throw new ApiRequestBodySchemaV2Error('GENERATION_V2_API_REQUEST_BODY_SCHEMA_INVALID') }

function readPlainObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) return invalid()
    return value as Readonly<Record<string, unknown>>
  } catch {
    return invalid()
  }
}

function validateJsonValue(value: unknown, depth: number, seen: Set<object>): void {
  if (depth > 128) return invalid()
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return invalid()
    return
  }
  if (typeof value !== 'object') return invalid()
  if (seen.has(value)) return invalid()
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return invalid()
      const ownKeys = Reflect.ownKeys(value)
      if (ownKeys.length !== value.length + 1 || !ownKeys.includes('length')) return invalid()
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor?.enumerable || !('value' in descriptor)) return invalid()
        validateJsonValue(descriptor.value, depth + 1, seen)
      }
      return
    }
    const object = readPlainObject(value)
    for (const key of Object.keys(object)) validateJsonValue(object[key], depth + 1, seen)
  } finally {
    seen.delete(value)
  }
}

function validateNode(value: unknown, schema: ApiRequestBodySchemaNodeV2): void {
  switch (schema.type) {
    case 'any_json':
      validateJsonValue(value, 0, new Set())
      return
    case 'string':
      if (typeof value !== 'string' || (schema.maxLength !== undefined && value.length > schema.maxLength) ||
          (schema.enum !== undefined && !schema.enum.includes(value))) return invalid()
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.safeInteger && !Number.isSafeInteger(value))) return invalid()
      return
    case 'boolean':
      if (typeof value !== 'boolean' || (schema.const !== undefined && value !== schema.const)) return invalid()
      return
    case 'null':
      if (value !== null) return invalid()
      return
    case 'array': {
      if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
          (schema.minItems !== undefined && value.length < schema.minItems) ||
          (schema.maxItems !== undefined && value.length > schema.maxItems)) return invalid()
      const keys = Reflect.ownKeys(value)
      if (keys.length !== value.length + 1 || !keys.includes('length')) return invalid()
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor?.enumerable || !('value' in descriptor)) return invalid()
        validateNode(descriptor.value, schema.items)
      }
      return
    }
    case 'object': {
      const object = readPlainObject(value)
      const keys = Object.keys(object)
      if (schema.required?.some((key) => !Object.prototype.hasOwnProperty.call(object, key))) return invalid()
      for (const key of keys) {
        const propertySchema = schema.properties[key]
        if (propertySchema) validateNode(object[key], propertySchema)
        else if (schema.additionalProperties === false || schema.additionalProperties === undefined) return invalid()
        else validateNode(object[key], schema.additionalProperties)
      }
      return
    }
    case 'union': {
      for (const variant of schema.variants) {
        try { validateNode(value, variant); return } catch (error) {
          if (!(error instanceof ApiRequestBodySchemaV2Error)) throw error
        }
      }
      return invalid()
    }
  }
}

export function validateApiRequestBodySchemaV2(value: unknown, schema: ApiRequestBodySchemaNodeV2, maxBytes: number): unknown {
  validateNode(value, schema)
  try {
    stableSerializeProviderRequestBoundedV2(value, maxBytes)
  } catch {
    return invalid()
  }
  return value
}

export function apiRequestBodySchemaDigestV2(value: unknown): string {
  return sha256Hex(stableSerializeProviderRequestV2(value))
}
