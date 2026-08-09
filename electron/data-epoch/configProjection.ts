import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import {
  decodeAndValidateEpoch2ProviderCredentialRecord,
  type Epoch2ProviderCredentialDecryptValidator,
  type Epoch2ProviderCredentialRecord,
} from '../credentials/epoch2ProviderCredentialRecord'
import { parseNetworkProxySettingsStrict, type NetworkProxySettings } from '../../src/shared/plugin-distribution/networkProxyShared'
import {
  canonicalOpenRouterCatalogPolicyV2,
  migrateOpenRouterCatalogSettingsV2,
} from '../../src/shared/modelCatalog/openRouterCatalogSettingsMigrationV2'
import { validateCatalogPolicyV2 } from '../../src/shared/modelCatalog/catalogPolicyV2'

export const EPOCH2_PRESERVED_PROVIDER_KEYS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic',
  'deepseek',
] as const satisfies readonly ProviderCredentialKey[])

const EPOCH2_CATALOG_PROVIDER_KEYS = Object.freeze([
  'openrouter', 'openai_responses', 'google_ai_studio', 'anthropic', 'deepseek',
] as const)

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

async function projectCredential(input: Readonly<{
  providerKey: ProviderCredentialKey
  value: unknown
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): Promise<Epoch2ProviderCredentialRecord> {
  try {
    return await decodeAndValidateEpoch2ProviderCredentialRecord({
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

function legacyProxyToV2(value: unknown): NetworkProxySettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.mode === 'system') return parseNetworkProxySettingsStrict({
    proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true,
  })
  if (raw.mode === 'direct') return parseNetworkProxySettingsStrict({
    proxyMode: 'direct', manualProxyUrl: '', noProxy: '', strictSSL: true,
  })
  return null
}

function projectNetworkProxy(raw: Record<string, unknown>, projected: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(raw, 'networkProxySettingsV2')) {
    try {
      projected.networkProxySettingsV2 = parseNetworkProxySettingsStrict(raw.networkProxySettingsV2)
    } catch {
      throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'networkProxySettingsV2')
    }
    return
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'networkProxyPolicy')) {
    const converted = legacyProxyToV2(raw.networkProxyPolicy)
    if (!converted) throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'networkProxyPolicy')
    projected.networkProxySettingsV2 = converted
  }
}

function projectCatalogPolicy(raw: Record<string, unknown>, projected: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(raw, 'catalogPolicyV2')) {
    try {
      projected.catalogPolicyV2 = validateCatalogPolicyV2(raw.catalogPolicyV2)
    } catch {
      throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'catalogPolicyV2')
    }
  }
  const migrated = migrateOpenRouterCatalogSettingsV2(raw)
  if (migrated) {
    Object.assign(projected, canonicalOpenRouterCatalogPolicyV2(migrated))
  }
  const existingRoot = record(raw.providerCatalog)
  if (Object.prototype.hasOwnProperty.call(raw, 'providerCatalog') && !existingRoot) {
    throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'providerCatalog')
  }
  if (!existingRoot) return
  const projectedRoot = record(projected.providerCatalog) ?? {}
  const preserved: Record<string, unknown> = { ...projectedRoot }
  for (const providerKey of EPOCH2_CATALOG_PROVIDER_KEYS) {
    const existingProvider = record(existingRoot[providerKey])
    if (!existingProvider || existingProvider.policyV2 === undefined) continue
    try {
      preserved[providerKey] = {
        ...(record(preserved[providerKey]) ?? {}),
        policyV2: validateCatalogPolicyV2(existingProvider.policyV2),
      }
    } catch {
      throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', `providerCatalog.${providerKey}.policyV2`)
    }
  }
  if (Object.keys(preserved).length > 0) projected.providerCatalog = preserved
}

export async function projectEpoch2Config(input: Readonly<{
  rawConfig: unknown
  validateDecrypt: Epoch2CredentialDecryptValidator
}>): Promise<Readonly<Record<string, unknown>>> {
  const raw = record(input.rawConfig)
  if (!raw) throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID')
  const projected = copyPreferences(raw)
  projectNetworkProxy(raw, projected)
  projectCatalogPolicy(raw, projected)
  const credentialRoot = record(raw.providerCredentials)
  const credentialV1 = record(credentialRoot?.v1)
  if ((raw.providerCredentials !== undefined && !credentialRoot) ||
      (credentialRoot?.v1 !== undefined && !credentialV1)) {
    throw new Epoch2ConfigProjectionError('EPOCH2_CONFIG_INVALID', 'providerCredentials')
  }
  const preserved: Partial<Record<ProviderCredentialKey, Epoch2ProviderCredentialRecord>> = {}
  for (const providerKey of EPOCH2_PRESERVED_PROVIDER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(credentialV1 ?? {}, providerKey)) continue
    preserved[providerKey] = await projectCredential({
      providerKey,
      value: credentialV1?.[providerKey],
      validateDecrypt: input.validateDecrypt,
    })
  }
  if (Object.keys(preserved).length > 0) projected.providerCredentials = { v1: preserved }
  return Object.freeze(projected)
}
