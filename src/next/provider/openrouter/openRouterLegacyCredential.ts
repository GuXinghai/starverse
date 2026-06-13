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
  resolveProviderCredential,
  type ProviderCredentialRef,
  type ProviderCredentialResolutionError,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'

export type OpenRouterLegacyCredentialMaterial = Readonly<{
  kind: 'openrouter_legacy_api_key'
  apiKey: string
  baseUrl?: string
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
