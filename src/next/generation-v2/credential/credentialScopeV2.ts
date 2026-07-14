import { createHmac } from 'node:crypto'
import { GenerationV2Identity, isGenerationV2Identity } from '../domain/identityV2'

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

export function deriveCredentialScopeIdV2(input: Readonly<{
  epochScopeKey: Uint8Array
  providerId: GenerationV2Identity<'provider_id'>
  credential: string
}>): GenerationV2Identity<'credential_scope_id'> {
  const scopeKey = input.epochScopeKey as Uint8Array & { readonly BYTES_PER_ELEMENT?: number }
  if (!ArrayBuffer.isView(scopeKey) || scopeKey instanceof DataView || scopeKey.BYTES_PER_ELEMENT !== 1 || scopeKey.byteLength !== 32) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID')
  }
  if ((typeof SharedArrayBuffer !== 'undefined' && scopeKey.buffer instanceof SharedArrayBuffer) ||
      Object.prototype.toString.call(scopeKey.buffer) === '[object SharedArrayBuffer]') {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID')
  }
  if (!isGenerationV2Identity(input.providerId, 'provider_id')) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_PROVIDER_INVALID')
  }
  if (typeof input.credential !== 'string' || input.credential.length === 0 || input.credential.length > 16_384 ||
      input.credential.trim() !== input.credential) {
    throw new CredentialScopeV2Error('GENERATION_V2_CREDENTIAL_SCOPE_CREDENTIAL_INVALID')
  }
  const key = new Uint8Array(32)
  key.set(new Uint8Array(scopeKey.buffer as ArrayBuffer, scopeKey.byteOffset, scopeKey.byteLength))
  const domain = lengthPrefixedUtf8('starverse-generation-v2-credential-scope')
  const provider = lengthPrefixedUtf8(input.providerId.value)
  const credential = lengthPrefixedUtf8(input.credential)
  try {
    const hmac = createHmac('sha256', key)
    hmac.update(domain)
    hmac.update(provider)
    hmac.update(credential)
    return GenerationV2Identity.create('credential_scope_id', `credential-scope-v2:${hmac.digest('hex')}`)
  } finally {
    key.fill(0)
    domain.fill(0)
    provider.fill(0)
    credential.fill(0)
  }
}
