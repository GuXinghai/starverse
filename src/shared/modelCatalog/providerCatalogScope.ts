import type { CatalogProviderKey } from './internalSchema'

export type ProviderCatalogScopeDataSource = 'models_user_primary' | 'models_fallback' | 'mixed'

export type ProviderCatalogCredentialIdentity =
  | Readonly<{ kind: 'credential_fingerprint'; fingerprint: string }>
  | Readonly<{ kind: 'anonymous' }>

export type ProviderCatalogScopeRequest = Readonly<{
  providerKey: CatalogProviderKey
  baseUrl?: string | null
  dataSource: ProviderCatalogScopeDataSource
}>

export type ProviderCatalogScopeDescriptor = Readonly<{
  providerKey: CatalogProviderKey
  catalogScopeKey: string
  normalizedBaseUrl: string
  dataSource: ProviderCatalogScopeDataSource
  credentialIdentity: ProviderCatalogCredentialIdentity
}>

export type ProviderCatalogScopeDerivationInput = Readonly<{
  providerKey: CatalogProviderKey
  normalizedBaseUrl: string
  dataSource: ProviderCatalogScopeDataSource
  credentialIdentity: ProviderCatalogCredentialIdentity
}>

export type ProviderCatalogScopeDeriver = (
  input: ProviderCatalogScopeDerivationInput
) => ProviderCatalogScopeDescriptor

export function normalizeProviderCatalogDataSource(value: unknown): ProviderCatalogScopeDataSource {
  return value === 'models_user_primary' || value === 'models_fallback' || value === 'mixed'
    ? value
    : 'models_user_primary'
}

export function normalizeProviderCatalogBaseUrl(value: unknown, defaultBaseUrl: string): string {
  const raw = String(value ?? '').trim()
  const resolved = raw.length > 0 ? raw : defaultBaseUrl
  return resolved.trim().replace(/\/+$/, '')
}

export function isProviderCatalogScopeDescriptor(value: unknown): value is ProviderCatalogScopeDescriptor {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ProviderCatalogScopeDescriptor>
  return typeof record.providerKey === 'string' &&
    typeof record.catalogScopeKey === 'string' &&
    record.catalogScopeKey.length > 0 &&
    typeof record.normalizedBaseUrl === 'string' &&
    record.normalizedBaseUrl.length > 0 &&
    normalizeProviderCatalogDataSource(record.dataSource) === record.dataSource &&
    !!record.credentialIdentity &&
    typeof record.credentialIdentity === 'object' &&
    (record.credentialIdentity.kind === 'anonymous' ||
      (record.credentialIdentity.kind === 'credential_fingerprint' &&
        typeof record.credentialIdentity.fingerprint === 'string' &&
        record.credentialIdentity.fingerprint.length > 0))
}
