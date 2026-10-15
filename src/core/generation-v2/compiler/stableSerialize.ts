import { sha256HexBytes } from '../../../shared/crypto/sha256Hex'
import { StableSerializeV2Error, stableSerializeProviderRequestV2, stableSerializeProviderRequestBoundedV2 } from '../../../shared/serialization/canonicalJsonV2'
export { StableSerializeV2Error, stableSerializeProviderRequestV2, stableSerializeProviderRequestBoundedV2 } from '../../../shared/serialization/canonicalJsonV2'

export function sha256PreparedBytesV2(bytes: Uint8Array): string {
  return sha256HexBytes(bytes)
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
