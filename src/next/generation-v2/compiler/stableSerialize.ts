import { createHash } from 'node:crypto'

export class StableSerializeV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_JSON_UNSUPPORTED_VALUE'
    | 'GENERATION_V2_JSON_NON_FINITE_NUMBER'
    | 'GENERATION_V2_JSON_CYCLE'
    | 'GENERATION_V2_JSON_DEPTH_EXCEEDED'
    | 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'StableSerializeV2Error'
  }
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

class CanonicalJsonWriter {
  readonly #chunks: string[] = []
  #byteLength = 0

  constructor(readonly maxUtf8Bytes?: number) {}

  append(value: string): void {
    const nextBytes = new TextEncoder().encode(value).byteLength
    if (this.maxUtf8Bytes !== undefined && this.#byteLength + nextBytes > this.maxUtf8Bytes) {
      throw new StableSerializeV2Error('GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED')
    }
    this.#byteLength += nextBytes
    this.#chunks.push(value)
  }

  finish(): string {
    return this.#chunks.join('')
  }
}

function writeCanonicalJson(
  value: unknown,
  active: WeakSet<object>,
  depth: number,
  writer: CanonicalJsonWriter,
): void {
  if (depth > 128) throw new StableSerializeV2Error('GENERATION_V2_JSON_DEPTH_EXCEEDED')
  if (value === null) {
    writer.append('null')
    return
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    writer.append(JSON.stringify(value))
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new StableSerializeV2Error('GENERATION_V2_JSON_NON_FINITE_NUMBER')
    writer.append(JSON.stringify(value))
    return
  }
  if (typeof value !== 'object') throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
  if (active.has(value)) throw new StableSerializeV2Error('GENERATION_V2_JSON_CYCLE')
  active.add(value)
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value)
      const expectedKeys = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
      if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !keys.includes(key))) {
        throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
      }
      writer.append('[')
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) writer.append(',')
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
        }
        writeCanonicalJson(descriptor.value, active, depth + 1, writer)
      }
      writer.append(']')
      return
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
        Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) {
      throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    }
    writer.append('{')
    const keys = Object.keys(descriptors).sort(compareCodePoints)
    for (let index = 0; index < keys.length; index += 1) {
      if (index > 0) writer.append(',')
      const key = keys[index]
      writer.append(JSON.stringify(key))
      writer.append(':')
      writeCanonicalJson(descriptors[key].value, active, depth + 1, writer)
    }
    writer.append('}')
  } finally {
    active.delete(value)
  }
}

export function stableSerializeProviderRequestV2(value: unknown): string {
  const writer = new CanonicalJsonWriter()
  writeCanonicalJson(value, new WeakSet<object>(), 0, writer)
  return writer.finish()
}

export function stableSerializeProviderRequestBoundedV2(value: unknown, maxUtf8Bytes: number): string {
  if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes < 1) {
    throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
  }
  const writer = new CanonicalJsonWriter(maxUtf8Bytes)
  writeCanonicalJson(value, new WeakSet<object>(), 0, writer)
  return writer.finish()
}

export function sha256PreparedBytesV2(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

const preparedBodies = new WeakSet<object>()
const preparedBodyBytes = new WeakMap<object, Uint8Array>()
const PREPARED_BODY_TOKEN: unique symbol = Symbol('starverse.generation-v2.prepared-body')

export class ImmutablePreparedBodyV2 {
  readonly byteLength: number
  readonly sha256: string
  readonly mediaType = 'application/json' as const

  private constructor(token: typeof PREPARED_BODY_TOKEN, serialized: string) {
    if (token !== PREPARED_BODY_TOKEN) throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    const bytes = new TextEncoder().encode(serialized)
    preparedBodyBytes.set(this, bytes)
    preparedBodies.add(this)
    this.byteLength = bytes.byteLength
    this.sha256 = sha256PreparedBytesV2(bytes)
    Object.freeze(this)
  }

  static fromNativeRequest(value: unknown): ImmutablePreparedBodyV2 {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    }
    return new ImmutablePreparedBodyV2(PREPARED_BODY_TOKEN, stableSerializeProviderRequestV2(value))
  }

  static fromNativeRequestWithMaxBytes(value: unknown, maxUtf8Bytes: number): ImmutablePreparedBodyV2 {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
    }
    return new ImmutablePreparedBodyV2(
      PREPARED_BODY_TOKEN,
      stableSerializeProviderRequestBoundedV2(value, maxUtf8Bytes),
    )
  }

  copyBytes(): Uint8Array {
    return copyPreparedBodyBytesV2(this)
  }

  copyUtf8Text(): string {
    return new TextDecoder('utf-8', { fatal: true }).decode(copyPreparedBodyBytesV2(this))
  }

  verifyIntegrity(): boolean {
    return isImmutablePreparedBodyV2(this)
  }
}

Object.freeze(ImmutablePreparedBodyV2.prototype)

export function isImmutablePreparedBodyV2(value: unknown): value is ImmutablePreparedBodyV2 {
  if (!value || typeof value !== 'object' || !preparedBodies.has(value)) return false
  const bytes = preparedBodyBytes.get(value)
  const body = value as ImmutablePreparedBodyV2
  return Boolean(bytes && bytes.byteLength === body.byteLength && sha256PreparedBytesV2(bytes) === body.sha256)
}

export function copyPreparedBodyBytesV2(body: ImmutablePreparedBodyV2): Uint8Array {
  if (!isImmutablePreparedBodyV2(body)) throw new StableSerializeV2Error('GENERATION_V2_JSON_UNSUPPORTED_VALUE')
  return preparedBodyBytes.get(body)!.slice()
}
