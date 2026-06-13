/**
 * OpenRouter legacy credential facade.
 *
 * This is a narrow wrapper around the current OpenRouter legacy exception:
 * callers still pass raw apiKey/baseUrl material to the adapter side and the
 * active runtime behavior stays unchanged.
 *
 * Not a secure store, not a renderer API, not a Generic credential path, and
 * not a provider/endpoint registry.
 */

import {
  createBearerCredential,
} from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFailure,
  providerCredentialResolutionFromCredential,
  resolveProviderCredential,
  type ProviderCredentialRef,
  type ProviderCredentialResolutionError,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'

export const OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY = 'openRouterApiKey'
export const OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY = 'openRouterBaseUrl'
export const OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF: ProviderCredentialRef = {
  kind: 'credential_ref',
  id: 'openrouter-chat-legacy-store',
}

export type OpenRouterLegacyCredentialMaterial = Readonly<{
  kind: 'openrouter_legacy_api_key'
  apiKey: string
  baseUrl?: string
}>

export type OpenRouterChatCredentialStoreReader = Readonly<{
  get: (key: string) => unknown
}>

export type OpenRouterChatCredentialSource = 'legacy_store'

export type OpenRouterChatCredentialResolutionFailure = Readonly<{
  kind: 'openrouter_chat_credential_resolution_error'
  code: ProviderCredentialResolutionError['code']
  status: 'missing' | 'invalid' | 'error'
  message: string
}>

export type OpenRouterChatCredentialSourceResult =
  | Readonly<{
    ok: true
    source: OpenRouterChatCredentialSource
    credential: OpenRouterLegacyCredentialMaterial
    diagnostics: SafeOpenRouterLegacyCredentialDiagnostics
  }>
  | Readonly<{
    ok: false
    source: OpenRouterChatCredentialSource
    failure: OpenRouterChatCredentialResolutionFailure
    diagnostics: SafeOpenRouterLegacyCredentialDiagnostics
  }>

export type SafeOpenRouterLegacyCredentialDiagnostics = Readonly<{
  kind: 'openrouter_legacy_credential'
  status: 'configured' | 'missing'
  code: 'credential_configured' | 'credential_missing'
  maskedApiKey: '***'
  baseUrlConfigured: boolean
  maskedBaseUrl?: string
}>

export function openRouterLegacyCredentialFromRaw(
  input: Readonly<{ apiKey: string; baseUrl?: string }>,
): OpenRouterLegacyCredentialMaterial {
  return {
    kind: 'openrouter_legacy_api_key',
    apiKey: input.apiKey,
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
  }
}

export type OpenRouterLegacyCredentialResolutionInput = Readonly<{
  credentialRef: ProviderCredentialRef
  resolveCredential: ProviderCredentialResolver
  baseUrl?: string
}>

/**
 * OpenRouter C3 migration seam fixture.
 *
 * Resolves a provider credential ref through the shared provider credential
 * resolver boundary, then adapts the bearer credential to the existing
 * OpenRouter legacy facade material. This does not read store/env/IPC and does
 * not migrate the active OpenRouter renderer/settings path.
 */
export function resolveOpenRouterLegacyCredential(
  input: OpenRouterLegacyCredentialResolutionInput,
): OpenRouterLegacyCredentialMaterial | ProviderCredentialResolutionError {
  const resolution = resolveProviderCredential(input.credentialRef, input.resolveCredential)
  if (!resolution.ok) return resolution.error

  return openRouterLegacyCredentialFromRaw({
    apiKey: resolution.credential.token,
    ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
  })
}

function readOpenRouterChatLegacyBaseUrlFromStore(
  store: OpenRouterChatCredentialStoreReader,
): string | undefined {
  return String(store.get(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY) ?? '').trim() || undefined
}

function openRouterChatCredentialResolutionFailure(
  code: ProviderCredentialResolutionError['code'],
): OpenRouterChatCredentialResolutionFailure {
  if (code === 'credential_invalid') {
    return {
      kind: 'openrouter_chat_credential_resolution_error',
      code,
      status: 'invalid',
      message: 'Credential material is invalid.',
    }
  }
  if (code === 'invalid_credential_ref') {
    return {
      kind: 'openrouter_chat_credential_resolution_error',
      code,
      status: 'error',
      message: 'Credential reference is invalid.',
    }
  }
  return {
    kind: 'openrouter_chat_credential_resolution_error',
    code: 'credential_unresolved',
    status: 'missing',
    message: 'Credential could not be resolved.',
  }
}

/**
 * C3c main-process OpenRouter chat/send credential resolver source with
 * legacy backing.
 *
 * The active chat/send migration uses this source as canonical C3 backing.
 * It still reads the existing legacy store keys and is not a secure store.
 * There is no direct raw-key fallback when this source is selected.
 */
export function createOpenRouterChatLegacyStoreCredentialResolver(
  store: OpenRouterChatCredentialStoreReader,
): ProviderCredentialResolver {
  return (ref) => {
    if (
      ref.kind !== OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF.kind ||
      ref.id !== OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF.id
    ) {
      return providerCredentialResolutionFailure('credential_unresolved')
    }

    const apiKey = String(store.get(OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY) ?? '').trim()
    if (!apiKey) {
      return providerCredentialResolutionFailure('credential_unresolved')
    }

    return providerCredentialResolutionFromCredential(createBearerCredential(apiKey))
  }
}

export function resolveOpenRouterChatCredentialFromLegacyStore(
  store: OpenRouterChatCredentialStoreReader,
): OpenRouterChatCredentialSourceResult {
  const resolved = resolveOpenRouterLegacyCredential({
    credentialRef: OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF,
    resolveCredential: createOpenRouterChatLegacyStoreCredentialResolver(store),
  })

  if ('code' in resolved) {
    const failure = openRouterChatCredentialResolutionFailure(resolved.code)
    return {
      ok: false,
      source: 'legacy_store',
      failure,
      diagnostics: {
        kind: 'openrouter_legacy_credential',
        status: 'missing',
        code: 'credential_missing',
        maskedApiKey: '***',
        baseUrlConfigured: false,
      },
    }
  }

  const baseUrl = readOpenRouterChatLegacyBaseUrlFromStore(store)
  const credential = openRouterLegacyCredentialFromRaw({
    apiKey: resolved.apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  })
  return {
    ok: true,
    source: 'legacy_store',
    credential,
    diagnostics: toSafeOpenRouterLegacyCredentialDiagnostics(credential),
  }
}

function maskOpenRouterLegacyBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    const host = url.hostname
    if (host.length <= 2) {
      return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`
    }
    return `${url.protocol}//${host[0]}***${host[host.length - 1]}${url.port ? `:${url.port}` : ''}`
  } catch {
    return '[invalid-url]'
  }
}

export function toSafeOpenRouterLegacyCredentialDiagnostics(
  material: OpenRouterLegacyCredentialMaterial,
): SafeOpenRouterLegacyCredentialDiagnostics {
  const configured = typeof material.apiKey === 'string' && material.apiKey.trim().length > 0
  const baseUrlConfigured = typeof material.baseUrl === 'string' && material.baseUrl.trim().length > 0

  return {
    kind: 'openrouter_legacy_credential',
    status: configured ? 'configured' : 'missing',
    code: configured ? 'credential_configured' : 'credential_missing',
    maskedApiKey: '***',
    baseUrlConfigured,
    ...(baseUrlConfigured ? { maskedBaseUrl: maskOpenRouterLegacyBaseUrl(material.baseUrl!) } : {}),
  }
}
