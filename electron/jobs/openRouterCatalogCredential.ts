/**
 * OpenRouter catalog sync legacy credential read wrapper.
 *
 * This intentionally wraps the current main-process electron-store read for
 * OpenRouter catalog sync only. It is not a secure store, not renderer IPC,
 * not the chat/send credential path, and not an endpoint/provider registry.
 */

import {
  createBearerCredential,
} from '@/next/provider/credentials/providerCredential'
import {
  validateOpenRouterOfficialBaseUrl,
} from '../openrouter/openRouterEndpointPolicy'
import {
  providerCredentialResolutionFailure,
  providerCredentialResolutionFromCredential,
  resolveProviderCredential,
  type ProviderCredentialRef,
  type ProviderCredentialResolutionError,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'

export const OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY = 'openRouterApiKey'
export const OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY = 'openRouterBaseUrl'
export const OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF: ProviderCredentialRef = {
  kind: 'credential_ref',
  id: 'openrouter-catalog-legacy-store',
}

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
  status: 'configured' | 'missing' | 'invalid' | 'error'
  code: 'credential_configured' | 'credential_missing' | 'credential_invalid' | 'credential_error'
  baseUrlConfigured: boolean
}>

export type OpenRouterCatalogCredentialResolutionFailure = Readonly<{
  kind: 'openrouter_catalog_credential_resolution_error'
  code: ProviderCredentialResolutionError['code']
  status: 'missing' | 'invalid' | 'error'
  message: string
}>

export type OpenRouterCatalogCredentialResolution =
  | OpenRouterCatalogLegacyCredential
  | OpenRouterCatalogCredentialResolutionFailure

export type OpenRouterCatalogCredentialSource = 'legacy_store'

export type OpenRouterCatalogCredentialSourceResult =
  | Readonly<{
    ok: true
    source: OpenRouterCatalogCredentialSource
    credential: OpenRouterCatalogLegacyCredential
    diagnostics: SafeOpenRouterCatalogCredentialDiagnostics
  }>
  | Readonly<{
    ok: false
    source: OpenRouterCatalogCredentialSource
    failure: OpenRouterCatalogCredentialResolutionFailure
    diagnostics: SafeOpenRouterCatalogCredentialDiagnostics
  }>

export type OpenRouterCatalogCredentialResolutionInput = Readonly<{
  credentialRef: ProviderCredentialRef
  resolveCredential: ProviderCredentialResolver
  baseUrl?: string | null
}>

export function readOpenRouterCatalogLegacyCredentialFromStore(
  store: OpenRouterCatalogCredentialStoreReader,
): OpenRouterCatalogLegacyCredential | null {
  const apiKey = String(store.get(OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY) ?? '').trim()
  if (!apiKey) return null

  const rawBaseUrl = String(store.get(OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY) ?? '').trim()
  const baseUrl = rawBaseUrl ? validateOpenRouterOfficialBaseUrl(rawBaseUrl) : null
  if (baseUrl && !baseUrl.ok) return null
  return {
    kind: 'openrouter_catalog_legacy_credential',
    apiKey,
    baseUrl: baseUrl?.baseUrl ?? null,
  }
}

function openRouterCatalogCredentialResolutionFailure(
  code: ProviderCredentialResolutionError['code'],
): OpenRouterCatalogCredentialResolutionFailure {
  if (code === 'credential_invalid') {
    return {
      kind: 'openrouter_catalog_credential_resolution_error',
      code,
      status: 'invalid',
      message: 'Credential material is invalid.',
    }
  }
  if (code === 'invalid_credential_ref') {
    return {
      kind: 'openrouter_catalog_credential_resolution_error',
      code,
      status: 'error',
      message: 'Credential reference is invalid.',
    }
  }
  return {
    kind: 'openrouter_catalog_credential_resolution_error',
    code: 'credential_unresolved',
    status: 'missing',
    message: 'Credential could not be resolved.',
  }
}

function openRouterCatalogBaseUrlPolicyFailure(): OpenRouterCatalogCredentialResolutionFailure {
  return {
    kind: 'openrouter_catalog_credential_resolution_error',
    code: 'credential_invalid',
    status: 'invalid',
    message: 'Credential material is invalid.',
  }
}

function safeDiagnosticCodeForResolutionFailure(
  failure: OpenRouterCatalogCredentialResolutionFailure,
): SafeOpenRouterCatalogCredentialDiagnostics['code'] {
  if (failure.code === 'credential_invalid') {
    return 'credential_invalid'
  }
  if (failure.status === 'error') {
    return 'credential_error'
  }
  return 'credential_missing'
}

/**
 * Fixture-only OpenRouter catalog C3 migration seam.
 *
 * Resolves ProviderCredentialRef through the shared provider credential
 * boundary, then adapts bearer material to the existing catalog legacy
 * credential shape. This does not read electron-store, does not call catalog
 * sync, and is not wired into startup active behavior.
 */
export function resolveOpenRouterCatalogLegacyCredential(
  input: OpenRouterCatalogCredentialResolutionInput,
): OpenRouterCatalogCredentialResolution {
  const resolution = resolveProviderCredential(input.credentialRef, input.resolveCredential)
  if (!resolution.ok) {
    return openRouterCatalogCredentialResolutionFailure(resolution.error.code)
  }

  return {
    kind: 'openrouter_catalog_legacy_credential',
    apiKey: resolution.credential.token,
    baseUrl: input.baseUrl ?? null,
  }
}

/**
 * C3a main-process OpenRouter credential resolver source with legacy backing.
 *
 * The resolver is canonical for the C3 catalog path, but the backing store key
 * remains the existing legacy `openRouterApiKey`. There is no dual-read
 * fallback: catalog sync uses this resolver-backed legacy_store source, while
 * the direct wrapper remains only as a compatibility/characterization helper.
 */
export function createOpenRouterCatalogLegacyStoreCredentialResolver(
  store: OpenRouterCatalogCredentialStoreReader,
): ProviderCredentialResolver {
  return (ref) => {
    if (
      ref.kind !== OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF.kind ||
      ref.id !== OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF.id
    ) {
      return providerCredentialResolutionFailure('credential_unresolved')
    }

    const apiKey = String(store.get(OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY) ?? '').trim()
    if (!apiKey) {
      return providerCredentialResolutionFailure('credential_unresolved')
    }

    return providerCredentialResolutionFromCredential(createBearerCredential(apiKey))
  }
}

export function resolveOpenRouterCatalogCredentialFromLegacyStore(
  store: OpenRouterCatalogCredentialStoreReader,
): OpenRouterCatalogCredentialSourceResult {
  const resolved = resolveOpenRouterCatalogLegacyCredential({
    credentialRef: OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF,
    resolveCredential: createOpenRouterCatalogLegacyStoreCredentialResolver(store),
  })

  if (resolved.kind === 'openrouter_catalog_credential_resolution_error') {
    return {
      ok: false,
      source: 'legacy_store',
      failure: resolved,
      diagnostics: toSafeOpenRouterCatalogCredentialDiagnostics(resolved),
    }
  }

  const rawBaseUrl = String(store.get(OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY) ?? '').trim()
  const baseUrl = rawBaseUrl ? validateOpenRouterOfficialBaseUrl(rawBaseUrl) : null
  if (baseUrl && !baseUrl.ok) {
    const failure = openRouterCatalogBaseUrlPolicyFailure()
    return {
      ok: false,
      source: 'legacy_store',
      failure,
      diagnostics: toSafeOpenRouterCatalogCredentialDiagnostics(failure),
    }
  }

  const credential = {
    ...resolved,
    baseUrl: baseUrl?.baseUrl ?? null,
  }
  return {
    ok: true,
    source: 'legacy_store',
    credential,
    diagnostics: toSafeOpenRouterCatalogCredentialDiagnostics(credential),
  }
}

export function toSafeOpenRouterCatalogCredentialDiagnostics(
  credential: OpenRouterCatalogCredentialResolution | null,
): SafeOpenRouterCatalogCredentialDiagnostics {
  if (credential?.kind === 'openrouter_catalog_credential_resolution_error') {
    return {
      kind: 'openrouter_catalog_legacy_credential',
      status: credential.status,
      code: safeDiagnosticCodeForResolutionFailure(credential),
      baseUrlConfigured: false,
    }
  }

  return {
    kind: 'openrouter_catalog_legacy_credential',
    status: credential ? 'configured' : 'missing',
    code: credential ? 'credential_configured' : 'credential_missing',
    baseUrlConfigured: typeof credential?.baseUrl === 'string' && credential.baseUrl.length > 0,
  }
}
