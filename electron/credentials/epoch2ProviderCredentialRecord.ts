import type { ProviderCredentialKey } from './providerCredentialContract'

export type Epoch2ProviderCredentialRecord = Readonly<{
  version: 1
  providerKey: ProviderCredentialKey
  backend: 'electron_safe_storage'
  ciphertextBase64: string
  updatedAtMs: number
}>

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

const RECORD_KEYS = Object.freeze([
  'backend',
  'ciphertextBase64',
  'providerKey',
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

export async function decodeAndValidateEpoch2ProviderCredentialRecord(input: Readonly<{
  value: unknown
  providerKey: ProviderCredentialKey
  validateDecrypt: Epoch2ProviderCredentialDecryptValidator
}>): Promise<Epoch2ProviderCredentialRecord> {
  const decoded = decodeEpoch2ProviderCredentialRecordStructure({
    value: input.value,
    providerKey: input.providerKey,
  })
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
  if (Object.keys(record).sort().join('\0') !== RECORD_KEYS.join('\0') ||
      record.version !== 1 || record.providerKey !== input.providerKey ||
      record.backend !== 'electron_safe_storage' ||
      !Number.isSafeInteger(record.updatedAtMs) || (record.updatedAtMs as number) < 0) {
    return invalid(input.providerKey)
  }
  return Object.freeze({
    version: 1,
    providerKey: input.providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: record.ciphertextBase64 as string,
    updatedAtMs: record.updatedAtMs as number,
  })
}

export async function withEpoch2ProviderCredentialCiphertext<T>(input: Readonly<{
  record: Epoch2ProviderCredentialRecord
  consume: Epoch2ProviderCredentialCiphertextConsumer<T>
}>): Promise<T> {
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
