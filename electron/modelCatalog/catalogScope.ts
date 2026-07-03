import { createHmac, randomBytes } from 'node:crypto'
import type Store from 'electron-store'
import type { ProviderCatalogDataSource } from '../../src/shared/modelCatalog/providerCatalogCore'

export type CatalogScopeDataSource = ProviderCatalogDataSource

export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_CATALOG_LOCAL_SECRET_KEY = 'openRouterCatalogLocalSecret'
export const PROVIDER_CATALOG_LOCAL_SECRET_KEY = 'providerCatalogLocalSecret'

const SENSITIVE_STORE_KEYS = new Set<string>([
  OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
  PROVIDER_CATALOG_LOCAL_SECRET_KEY,
])

function hmacSha256Hex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex')
}

function isValidLocalSecret(value: unknown): value is string {
  const normalized = String(value ?? '').trim()
  return normalized.length >= 32
}

function getOrCreateSecretForKey(store: Store, key: string): string {
  const existing = store.get(key)
  if (isValidLocalSecret(existing)) {
    return String(existing).trim()
  }

  const secret = randomBytes(32).toString('base64url')
  store.set(key, secret)
  return secret
}

export function isSensitiveCatalogStoreKey(key: unknown): boolean {
  return SENSITIVE_STORE_KEYS.has(String(key ?? '').trim())
}

export function normalizeCatalogApiKey(apiKey: unknown): string {
  return String(apiKey ?? '').trim()
}

export function normalizeCatalogBaseUrl(baseUrl: unknown, defaultBaseUrl = OPENROUTER_DEFAULT_BASE_URL): string {
  const raw = String(baseUrl ?? '').trim()
  const resolved = raw.length > 0 ? raw : defaultBaseUrl
  return resolved.trim().replace(/\/+$/, '')
}

export function getOrCreateCatalogLocalSecret(store: Store): string {
  return getOrCreateSecretForKey(store, OPENROUTER_CATALOG_LOCAL_SECRET_KEY)
}

export function getOrCreateProviderCatalogLocalSecret(store: Store): string {
  return getOrCreateSecretForKey(store, PROVIDER_CATALOG_LOCAL_SECRET_KEY)
}

export function deriveCredentialFingerprint(input: Readonly<{
  localSecret: string
  apiKey: string
}>): string {
  const normalizedApiKey = normalizeCatalogApiKey(input.apiKey)
  return hmacSha256Hex(input.localSecret, normalizedApiKey)
}

export function deriveCatalogScopeKey(input: Readonly<{
  localSecret: string
  providerKey: string
  apiKey: string
  baseUrl?: string | null
  dataSource: CatalogScopeDataSource
  defaultBaseUrl?: string | null
}>): string {
  const providerKey = String(input.providerKey ?? '').trim()
  const dataSource = String(input.dataSource ?? '').trim() as CatalogScopeDataSource
  const normalizedBaseUrl = normalizeCatalogBaseUrl(input.baseUrl, input.defaultBaseUrl ?? OPENROUTER_DEFAULT_BASE_URL)
  const credentialFingerprint = deriveCredentialFingerprint({
    localSecret: input.localSecret,
    apiKey: input.apiKey,
  })

  return hmacSha256Hex(
    input.localSecret,
    `${providerKey}\n${normalizedBaseUrl}\n${dataSource}\n${credentialFingerprint}`
  )
}

export function deriveProviderCatalogScopeKey(input: Readonly<{
  localSecret: string
  providerKey: string
  apiKey: string
  baseUrl?: string | null
  dataSource: CatalogScopeDataSource
  defaultBaseUrl: string
  requestContextFingerprint?: string | null
}>): string {
  const providerKey = String(input.providerKey ?? '').trim()
  const dataSource = String(input.dataSource ?? '').trim() as CatalogScopeDataSource
  const normalizedBaseUrl = normalizeCatalogBaseUrl(input.baseUrl, input.defaultBaseUrl)
  const credentialFingerprint = deriveCredentialFingerprint({
    localSecret: input.localSecret,
    apiKey: input.apiKey,
  })
  const requestContextFingerprint = String(input.requestContextFingerprint ?? '').trim()

  return hmacSha256Hex(
    input.localSecret,
    `${providerKey}\n${normalizedBaseUrl}\n${dataSource}\n${credentialFingerprint}\n${requestContextFingerprint}`
  )
}

export function deriveCatalogScopeFromStore(input: Readonly<{
  store: Store
  providerKey: string
  apiKey: string
  baseUrl?: string | null
  dataSource: CatalogScopeDataSource
  defaultBaseUrl?: string | null
}>): Readonly<{
  providerKey: string
  catalogScopeKey: string
  normalizedBaseUrl: string
  dataSource: CatalogScopeDataSource
}> {
  const localSecret = getOrCreateCatalogLocalSecret(input.store)
  const normalizedBaseUrl = normalizeCatalogBaseUrl(input.baseUrl, input.defaultBaseUrl ?? OPENROUTER_DEFAULT_BASE_URL)
  return {
    providerKey: String(input.providerKey ?? '').trim(),
    catalogScopeKey: deriveCatalogScopeKey({
      localSecret,
      providerKey: input.providerKey,
      apiKey: input.apiKey,
      baseUrl: normalizedBaseUrl,
      dataSource: input.dataSource,
      defaultBaseUrl: input.defaultBaseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
    }),
    normalizedBaseUrl,
    dataSource: input.dataSource,
  }
}

export function deriveProviderCatalogScopeFromStore(input: Readonly<{
  store: Store
  providerKey: string
  apiKey: string
  baseUrl?: string | null
  dataSource: CatalogScopeDataSource
  defaultBaseUrl: string
  requestContextFingerprint?: string | null
}>): Readonly<{
  providerKey: string
  catalogScopeKey: string
  normalizedBaseUrl: string
  dataSource: CatalogScopeDataSource
}> {
  const localSecret = getOrCreateProviderCatalogLocalSecret(input.store)
  const normalizedBaseUrl = normalizeCatalogBaseUrl(input.baseUrl, input.defaultBaseUrl)
  return {
    providerKey: String(input.providerKey ?? '').trim(),
    catalogScopeKey: deriveProviderCatalogScopeKey({
      localSecret,
      providerKey: input.providerKey,
      apiKey: input.apiKey,
      baseUrl: normalizedBaseUrl,
      dataSource: input.dataSource,
      defaultBaseUrl: input.defaultBaseUrl,
      requestContextFingerprint: input.requestContextFingerprint,
    }),
    normalizedBaseUrl,
    dataSource: input.dataSource,
  }
}
