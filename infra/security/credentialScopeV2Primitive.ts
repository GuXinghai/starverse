import { createHmac } from 'node:crypto'

const CREDENTIAL_SCOPE_PREFIX = 'credential-scope-v2:'
const CREDENTIAL_SCOPE_PATTERN = /^credential-scope-v2:[0-9a-f]{64}$/u

declare const CREDENTIAL_SCOPE_ID_V2: unique symbol

export type CredentialScopeIdV2 = string & {
  readonly [CREDENTIAL_SCOPE_ID_V2]: true
}

export class CredentialScopeV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID'
    | 'GENERATION_V2_CREDENTIAL_SCOPE_PROVIDER_INVALID'
    | 'GENERATION_V2_CREDENTIAL_SCOPE_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'CredentialScopeV2Error'
  }
}

function lengthPrefixedUtf8(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value)
  const result = new Uint8Array(4 + bytes.byteLength)
  new DataView(result.buffer).setUint32(0, bytes.byteLength, false)
  result.set(bytes, 4)
  bytes.fill(0)
  return result
}

function assertProviderId(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_PROVIDER_INVALID')
  }
}

export function isCredentialScopeIdV2(value: unknown): value is CredentialScopeIdV2 {
  return typeof value === 'string' && CREDENTIAL_SCOPE_PATTERN.test(value)
}

export function deriveCredentialScopeIdV2Primitive(input: Readonly<{
  epochScopeKey: Uint8Array
  providerId: string
  credential: string
}>): CredentialScopeIdV2 {
  const scopeKey = input.epochScopeKey as Uint8Array & { readonly BYTES_PER_ELEMENT?: number }
  if (!ArrayBuffer.isView(scopeKey) || scopeKey instanceof DataView ||
      scopeKey.BYTES_PER_ELEMENT !== 1 || scopeKey.byteLength !== 32 ||
      (typeof SharedArrayBuffer !== 'undefined' && scopeKey.buffer instanceof SharedArrayBuffer) ||
      Object.prototype.toString.call(scopeKey.buffer) === '[object SharedArrayBuffer]') {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID')
  }
  assertProviderId(input.providerId)
  if (typeof input.credential !== 'string' || input.credential.length === 0 ||
      input.credential.length > 16_384 || input.credential.trim() !== input.credential) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_CREDENTIAL_INVALID')
  }

  const key = new Uint8Array(32)
  key.set(new Uint8Array(scopeKey.buffer as ArrayBuffer, scopeKey.byteOffset, scopeKey.byteLength))
  const domain = lengthPrefixedUtf8('starverse-generation-v2-credential-scope')
  const provider = lengthPrefixedUtf8(input.providerId)
  const credential = lengthPrefixedUtf8(input.credential)
  try {
    const hmac = createHmac('sha256', key)
    hmac.update(domain)
    hmac.update(provider)
    hmac.update(credential)
    return `${CREDENTIAL_SCOPE_PREFIX}${hmac.digest('hex')}` as CredentialScopeIdV2
  } finally {
    key.fill(0)
    domain.fill(0)
    provider.fill(0)
    credential.fill(0)
  }
}
