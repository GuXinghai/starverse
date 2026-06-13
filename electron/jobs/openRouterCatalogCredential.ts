/**
 * OpenRouter catalog sync legacy credential read wrapper.
 *
 * This intentionally wraps the current main-process electron-store read for
 * OpenRouter catalog sync only. It is not a secure store, not renderer IPC,
 * not the chat/send credential path, and not an endpoint/provider registry.
 */

export const OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY = 'openRouterApiKey'
export const OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY = 'openRouterBaseUrl'

export type OpenRouterCatalogCredentialStoreReader = Readonly<{
  get: (key: string) => unknown
}>

export type OpenRouterCatalogLegacyCredential = Readonly<{
  kind: 'openrouter_catalog_legacy_credential'
  apiKey: string
  baseUrl: string | null
}>

export type SafeOpenRouterCatalogCredentialDiagnostics = Readonly<{
  kind: 'openrouter_catalog_legacy_credential'
  status: 'configured' | 'missing'
  code: 'credential_configured' | 'credential_missing'
  baseUrlConfigured: boolean
}>

export function readOpenRouterCatalogLegacyCredentialFromStore(
  store: OpenRouterCatalogCredentialStoreReader,
): OpenRouterCatalogLegacyCredential | null {
  const apiKey = String(store.get(OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY) ?? '').trim()
  if (!apiKey) return null

  const baseUrl = String(store.get(OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY) ?? '').trim() || null
  return {
    kind: 'openrouter_catalog_legacy_credential',
    apiKey,
    baseUrl,
  }
}

export function toSafeOpenRouterCatalogCredentialDiagnostics(
  credential: OpenRouterCatalogLegacyCredential | null,
): SafeOpenRouterCatalogCredentialDiagnostics {
  return {
    kind: 'openrouter_catalog_legacy_credential',
    status: credential ? 'configured' : 'missing',
    code: credential ? 'credential_configured' : 'credential_missing',
    baseUrlConfigured: typeof credential?.baseUrl === 'string' && credential.baseUrl.length > 0,
  }
}
