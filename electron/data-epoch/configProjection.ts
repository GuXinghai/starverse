import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import {
  decodeAndValidateEpoch2ProviderCredentialRecord,
  type Epoch2ProviderCredentialDecryptValidator,
  type Epoch2ProviderCredentialRecord,
} from '../credentials/epoch2ProviderCredentialRecord'

export const EPOCH2_PRESERVED_PROVIDER_KEYS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic',
  'deepseek',
] as const satisfies readonly ProviderCredentialKey[])

export type Epoch2CredentialDecryptValidator = Epoch2ProviderCredentialDecryptValidator

export class Epoch2ConfigProjectionError extends Error {
  constructor(
    readonly code: 'EPOCH2_CONFIG_INVALID' | 'EPOCH2_CREDENTIAL_INVALID',
    readonly field?: string,
  ) {
    super(field ? `${code}:${field}` : code)
    this.name = 'Epoch2ConfigProjectionError'
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function projectCredential(input: Readonly<{
  providerKey: ProviderCredentialKey
  value: unknown
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): Epoch2ProviderCredentialRecord {
  try {
    return decodeAndValidateEpoch2ProviderCredentialRecord({
      value: input.value,
      providerKey: input.providerKey,
      validateDecrypt: input.validateDecrypt,
    })
  } catch {
    throw new Epoch2ConfigProjectionError('EPOCH2_CREDENTIAL_INVALID', input.providerKey)
  }
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
  const preserved: Partial<Record<ProviderCredentialKey, Epoch2ProviderCredentialRecord>> = {}
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
