import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'

export const EPOCH2_PRESERVED_PROVIDER_KEYS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic',
  'deepseek',
] as const satisfies readonly ProviderCredentialKey[])

export type Epoch2CredentialDecryptValidator = (
  providerKey: ProviderCredentialKey,
  ciphertext: Buffer,
) => string

export class Epoch2ConfigProjectionError extends Error {
  constructor(
    readonly code: 'EPOCH2_CONFIG_INVALID' | 'EPOCH2_CREDENTIAL_INVALID',
    readonly field?: string,
  ) {
    super(field ? `${code}:${field}` : code)
    this.name = 'Epoch2ConfigProjectionError'
  }
}

type SecureCredentialRecord = Readonly<{
  version: 1
  providerKey: ProviderCredentialKey
  backend: 'electron_safe_storage'
  ciphertextBase64: string
  updatedAtMs: number
}>

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function decodeStrictBase64(value: unknown): Buffer | null {
  if (typeof value !== 'string' || value.trim() === '' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null
  try {
    const decoded = Buffer.from(value, 'base64')
    if (decoded.length === 0 || decoded.toString('base64') !== value) return null
    return decoded
  } catch {
    return null
  }
}

function projectCredential(input: Readonly<{
  providerKey: ProviderCredentialKey
  value: unknown
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): SecureCredentialRecord {
  const raw = record(input.value)
  const ciphertext = decodeStrictBase64(raw?.ciphertextBase64)
  const keys = Object.keys(raw ?? {}).sort()
  if (!raw || keys.join('\0') !== ['backend', 'ciphertextBase64', 'providerKey', 'updatedAtMs', 'version'].sort().join('\0') ||
      raw.version !== 1 || raw.providerKey !== input.providerKey ||
      raw.backend !== 'electron_safe_storage' || !ciphertext ||
      typeof raw.updatedAtMs !== 'number' || !Number.isSafeInteger(raw.updatedAtMs) || raw.updatedAtMs < 0) {
    throw new Epoch2ConfigProjectionError('EPOCH2_CREDENTIAL_INVALID', input.providerKey)
  }
  try {
    const decrypted = input.validateDecrypt(input.providerKey, ciphertext)
    if (typeof decrypted !== 'string' || decrypted.trim() === '') throw new Error('empty credential')
  } catch {
    throw new Epoch2ConfigProjectionError('EPOCH2_CREDENTIAL_INVALID', input.providerKey)
  }
  return Object.freeze({
    version: 1,
    providerKey: input.providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: raw.ciphertextBase64 as string,
    updatedAtMs: raw.updatedAtMs,
  })
}

function copyPreferences(raw: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {}
  if (typeof raw.language === 'string' && raw.language.trim() !== '') projected.language = raw.language
  if (typeof raw.languageManual === 'string' && raw.languageManual.trim() !== '') projected.languageManual = raw.languageManual
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'auto') projected.theme = raw.theme
  for (const key of ['fontSize', 'sidebarWidth'] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) projected[key] = value
  }
  for (const key of ['windowMaximized', 'sidebarCollapsed', 'analyticsEnabled'] as const) {
    const value = raw[key]
    if (typeof value === 'boolean') projected[key] = value
  }
  const bounds = record(raw.windowBounds)
  if (bounds && ['x', 'y', 'width', 'height'].every((key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]))) {
    projected.windowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  }
  return projected
}

export function projectEpoch2Config(input: Readonly<{
  rawConfig: unknown
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): Readonly<Record<string, unknown>> {
  const raw = record(input.rawConfig)
  if (!raw) throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID')
  const projected = copyPreferences(raw)
  const credentialRoot = record(raw.providerCredentials)
  const credentialV1 = record(credentialRoot?.v1)
  if ((raw.providerCredentials !== undefined && !credentialRoot) ||
      (credentialRoot?.v1 !== undefined && !credentialV1)) {
    throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'providerCredentials')
  }
  const preserved: Partial<Record<ProviderCredentialKey, SecureCredentialRecord>> = {}
  for (const providerKey of EPOCH2_PRESERVED_PROVIDER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(credentialV1 ?? {}, providerKey)) continue
    preserved[providerKey] = projectCredential({
      providerKey,
      value: credentialV1?.[providerKey],
      validateDecrypt: input.validateDecrypt,
    })
  }
  if (Object.keys(preserved).length > 0) projected.providerCredentials = { v1: preserved }
  return Object.freeze(projected)
}
