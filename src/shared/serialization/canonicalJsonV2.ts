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
