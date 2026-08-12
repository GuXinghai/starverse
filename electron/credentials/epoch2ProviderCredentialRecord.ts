import { isCredentialScopeIdV2, type CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { ProviderCredentialKey } from './providerCredentialContract'

export type Epoch2ProviderCredentialRecord = Readonly<
  | {
      version: 3
      providerKey: ProviderCredentialKey
      backend: 'electron_safe_storage'
      ciphertextBase64: string
      credentialScopeId: CredentialScopeIdV2
      revision: number
      updatedAtMs: number
    }
  | {
      version: 3
      providerKey: ProviderCredentialKey
      backend: 'plaintext'
      plaintext: string
      credentialScopeId: CredentialScopeIdV2
      revision: number
      updatedAtMs: number
    }
>

export type Epoch2ProviderCredentialDecryptResult = Readonly<{
  credential: string
  rewrappedCiphertext?: Buffer
}>

export type Epoch2ProviderCredentialDecryptValidator = (
  providerKey: ProviderCredentialKey,
  ciphertext: Buffer,
) => Promise<Epoch2ProviderCredentialDecryptResult>

export type Epoch2ProviderCredentialCiphertextConsumer<T> = (
  ciphertext: Buffer,
) => Promise<T>

const SECURE_RECORD_KEYS = Object.freeze([
  'backend',
  'ciphertextBase64',
  'credentialScopeId',
  'providerKey',
  'revision',
  'updatedAtMs',
  'version',
] as const)

const PLAINTEXT_RECORD_KEYS = Object.freeze([
  'backend',
  'credentialScopeId',
  'plaintext',
  'providerKey',
  'revision',
  'updatedAtMs',
  'version',
] as const)

function invalid(providerKey: ProviderCredentialKey): never {
  throw new Error(`EPOCH2_CREDENTIAL_INVALID:${providerKey}`)
}

function decodeCanonicalCiphertext(
  value: unknown,
  providerKey: ProviderCredentialKey,
): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 * 1024 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return invalid(providerKey)
  }
  const ciphertext = Buffer.from(value, 'base64')
  if (ciphertext.byteLength === 0 || ciphertext.toString('base64') !== value) {
    ciphertext.fill(0)
    return invalid(providerKey)
  }
  return ciphertext
}

function assertCanonicalCiphertext(value: unknown, providerKey: ProviderCredentialKey): void {
  const ciphertext = decodeCanonicalCiphertext(value, providerKey)
  ciphertext.fill(0)
}

export async function decodeAndValidateEpoch2ProviderCredentialRecord(input: Readonly<{
  value: unknown
  providerKey: ProviderCredentialKey
  validateDecrypt: Epoch2ProviderCredentialDecryptValidator
}>): Promise<Epoch2ProviderCredentialRecord> {
  const decoded = decodeEpoch2ProviderCredentialRecordStructure({
    value: input.value,
    providerKey: input.providerKey,
  })
  if (decoded.backend === 'plaintext') return decoded
  try {
    return await withEpoch2ProviderCredentialCiphertext({
      record: decoded,
      consume: async (ciphertext) => {
        const decrypted = await input.validateDecrypt(input.providerKey, ciphertext)
        if (!decrypted || typeof decrypted !== 'object' ||
            typeof decrypted.credential !== 'string' || decrypted.credential.trim().length === 0) {
          return invalid(input.providerKey)
        }
        if (decrypted.rewrappedCiphertext === undefined) return decoded
        const rewrapped = decrypted.rewrappedCiphertext
        try {
          if (!Buffer.isBuffer(rewrapped) || rewrapped.byteLength === 0 ||
              rewrapped.byteLength > 1024 * 1024) {
            return invalid(input.providerKey)
          }
          return Object.freeze({
            ...decoded,
            ciphertextBase64: rewrapped.toString('base64'),
          })
        } finally {
          if (Buffer.isBuffer(rewrapped)) rewrapped.fill(0)
        }
      },
    })
  } catch {
    return invalid(input.providerKey)
  }
}

export function decodeEpoch2ProviderCredentialRecordStructure(input: Readonly<{
  value: unknown
  providerKey: ProviderCredentialKey
}>): Epoch2ProviderCredentialRecord {
  if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value)) {
    return invalid(input.providerKey)
  }
  const record = input.value as Record<string, unknown>
  if (record.version !== 3 || record.providerKey !== input.providerKey ||
      !Number.isSafeInteger(record.revision) || (record.revision as number) < 1 ||
      !isCredentialScopeIdV2(record.credentialScopeId) ||
      !Number.isSafeInteger(record.updatedAtMs) || (record.updatedAtMs as number) < 0) {
    return invalid(input.providerKey)
  }
  if (record.backend === 'electron_safe_storage' &&
      Object.keys(record).sort().join('\0') === SECURE_RECORD_KEYS.join('\0')) {
    assertCanonicalCiphertext(record.ciphertextBase64, input.providerKey)
    return Object.freeze({
      version: 3,
      providerKey: input.providerKey,
      backend: 'electron_safe_storage',
      ciphertextBase64: record.ciphertextBase64 as string,
      credentialScopeId: record.credentialScopeId,
      revision: record.revision as number,
      updatedAtMs: record.updatedAtMs as number,
    })
  }
  if (record.backend === 'plaintext' &&
      Object.keys(record).sort().join('\0') === PLAINTEXT_RECORD_KEYS.join('\0') &&
      typeof record.plaintext === 'string' && record.plaintext.length > 0 &&
      record.plaintext.length <= 16_384 && record.plaintext.trim() === record.plaintext) {
    return Object.freeze({
      version: 3,
      providerKey: input.providerKey,
      backend: 'plaintext',
      plaintext: record.plaintext,
      credentialScopeId: record.credentialScopeId,
      revision: record.revision as number,
      updatedAtMs: record.updatedAtMs as number,
    })
  }
  return invalid(input.providerKey)
}

export function isLegacyEpoch2ProviderCredentialRecord(
  value: unknown,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1 || record.version === 2
}

/**
 * Keeps only the declared current record envelope while deliberately retaining an
 * invalid value for the runtime service to diagnose. This lets reset complete
 * without copying accidental plaintext extension fields into the new config.
 */
export function quarantineEpoch2ProviderCredentialRecordV2(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.version !== 3) return undefined
  const quarantined: Record<string, unknown> = {}
  for (const key of record.backend === 'plaintext' ? PLAINTEXT_RECORD_KEYS : SECURE_RECORD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) quarantined[key] = record[key]
  }
  return Object.freeze(quarantined)
}

export async function withEpoch2ProviderCredentialCiphertext<T>(input: Readonly<{
  record: Epoch2ProviderCredentialRecord
  consume: Epoch2ProviderCredentialCiphertextConsumer<T>
}>): Promise<T> {
  if (input.record.backend !== 'electron_safe_storage') {
    return invalid(input.record.providerKey)
  }
  const ciphertext = decodeCanonicalCiphertext(
    input.record.ciphertextBase64,
    input.record.providerKey,
  )
  try {
    return await input.consume(ciphertext)
  } finally {
    ciphertext.fill(0)
  }
}
