import type Store from 'electron-store'
import type {
  ProviderCredentialService,
  ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import {
  OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY,
} from '../../src/next/provider/openrouter/openRouterLegacyCredential'
import type { RegisterInvoke } from './types'
import {
  OPENROUTER_DEFAULT_BASE_URL,
  validateOpenRouterOfficialBaseUrl,
} from '../openrouter/openRouterEndpointPolicy'

export const OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'openrouter-credential:get-status',
  'openrouter-credential:update',
  'openrouter-credential:clear',
] as const

export type OpenRouterCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  baseUrlConfigured: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
  defaultBaseUrl: string
  endpoint: OpenRouterEndpointMetadata
}>

export type OpenRouterCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
  baseUrl?: string | null
}>

export type OpenRouterCredentialSettingsResult =
  | Readonly<{ ok: true; status: OpenRouterCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable' | 'untrusted_base_url'; message: string }>

type RegisterOpenRouterCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  credentialService: ProviderCredentialService
}>

const DEFAULT_OPENROUTER_BASE_URL = OPENROUTER_DEFAULT_BASE_URL
const OPENROUTER_OFFICIAL_ENDPOINT_ID = 'openrouter-official'
const OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID = 'openrouter-custom-legacy-store'
const OPENROUTER_PROFILE_ID = 'openrouter_v1_chat'

const OPENROUTER_CHAT_LEGACY_CREDENTIAL_METADATA_REF = {
  kind: 'credential_ref',
  id: 'openrouter-chat-legacy-store',
} as const

const OPENROUTER_CATALOG_LEGACY_CREDENTIAL_METADATA_REF = {
  kind: 'credential_ref',
  id: 'openrouter-catalog-legacy-store',
} as const

type OpenRouterEndpointMetadataBase = Readonly<{
  kind: 'openrouter_endpoint'
  providerId: 'openrouter'
  profileId: typeof OPENROUTER_PROFILE_ID
  source: ProviderCredentialStatusSource
  defaultBaseUrl: string
  credentialRef: typeof OPENROUTER_CHAT_LEGACY_CREDENTIAL_METADATA_REF
  catalogCredentialRef: typeof OPENROUTER_CATALOG_LEGACY_CREDENTIAL_METADATA_REF
  rendererVisible: true
}>

export type OpenRouterEndpointMetadata =
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: typeof OPENROUTER_OFFICIAL_ENDPOINT_ID
    endpointStatus: 'official'
    displayName: 'OpenRouter official endpoint'
    baseUrlConfigured: false
    baseUrlInvalid?: false
    displayBaseUrl: typeof DEFAULT_OPENROUTER_BASE_URL
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: typeof OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID
    endpointStatus: 'custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid?: false
    displayBaseUrl: string
  }>
  | Readonly<OpenRouterEndpointMetadataBase & {
    endpointId: typeof OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID
    endpointStatus: 'invalid_custom'
    displayName: 'OpenRouter custom endpoint'
    baseUrlConfigured: true
    baseUrlInvalid: true
    displayBaseUrl?: never
  }>

type SafeDisplayBaseUrl = Readonly<{
  displayBaseUrl?: string
  invalid: boolean
}>

function sanitizeDisplayBaseUrl(raw: unknown): SafeDisplayBaseUrl {
  const value = String(raw ?? '').trim()
  if (!value) return { invalid: false }

  try {
    const official = validateOpenRouterOfficialBaseUrl(value)
    if (!official.ok) return { invalid: true }
    return { displayBaseUrl: official.baseUrl, invalid: false }
  } catch {
    return { invalid: true }
  }
}

export function buildOpenRouterEndpointMetadataFromLegacyStoreState(input: Readonly<{
  baseUrlConfigured: boolean
  safeBaseUrl: SafeDisplayBaseUrl
  credentialSource?: ProviderCredentialStatusSource
}>): OpenRouterEndpointMetadata {
  const base = {
    kind: 'openrouter_endpoint',
    providerId: 'openrouter',
    profileId: OPENROUTER_PROFILE_ID,
    source: input.credentialSource ?? 'missing',
    defaultBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    credentialRef: OPENROUTER_CHAT_LEGACY_CREDENTIAL_METADATA_REF,
    catalogCredentialRef: OPENROUTER_CATALOG_LEGACY_CREDENTIAL_METADATA_REF,
    rendererVisible: true,
  } as const satisfies OpenRouterEndpointMetadataBase

  if (!input.baseUrlConfigured) {
    return {
      ...base,
      endpointId: OPENROUTER_OFFICIAL_ENDPOINT_ID,
      endpointStatus: 'official',
      displayName: 'OpenRouter official endpoint',
      baseUrlConfigured: false,
      displayBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    }
  }

  if (input.safeBaseUrl.invalid || !input.safeBaseUrl.displayBaseUrl) {
    return {
      ...base,
      endpointId: OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID,
      endpointStatus: 'invalid_custom',
      displayName: 'OpenRouter custom endpoint',
      baseUrlConfigured: true,
      baseUrlInvalid: true,
    }
  }

  return {
    ...base,
    endpointId: OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID,
    endpointStatus: 'custom',
    displayName: 'OpenRouter custom endpoint',
    baseUrlConfigured: true,
    displayBaseUrl: input.safeBaseUrl.displayBaseUrl,
  }
}

function readStatus(store: Store, credentialService: ProviderCredentialService): OpenRouterCredentialSettingsStatus {
  const credentialStatus = credentialService.getStatus('openrouter')
  const baseUrl = String(store.get(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY) ?? '').trim()
  const safeBaseUrl = sanitizeDisplayBaseUrl(baseUrl)
  const baseUrlConfigured = baseUrl.length > 0

  return {
    source: credentialStatus.source,
    backend: credentialStatus.backend,
    apiKeyConfigured: credentialStatus.apiKeyConfigured,
    ...(credentialStatus.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(credentialStatus.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: credentialStatus.warnings,
    baseUrlConfigured,
    ...(safeBaseUrl.invalid ? { baseUrlInvalid: true } : {}),
    ...(safeBaseUrl.displayBaseUrl ? { displayBaseUrl: safeBaseUrl.displayBaseUrl } : {}),
    defaultBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    endpoint: buildOpenRouterEndpointMetadataFromLegacyStoreState({
      baseUrlConfigured,
      safeBaseUrl,
      credentialSource: credentialStatus.source,
    }),
  }
}

function isUpdatePayload(payload: unknown): payload is OpenRouterCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  if ('apiKey' in value && value.apiKey !== undefined && typeof value.apiKey !== 'string') return false
  if ('baseUrl' in value && value.baseUrl !== undefined && value.baseUrl !== null && typeof value.baseUrl !== 'string') return false
  return true
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable' | 'untrusted_base_url'): OpenRouterCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'OpenRouter credential settings payload is invalid.'
      : code === 'untrusted_base_url'
        ? 'OpenRouter base URL is not trusted for the saved official credential.'
        : 'OpenRouter credential settings store is unavailable.',
  }
}

export function registerOpenRouterCredentialSettingsIpc(
  input: RegisterOpenRouterCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, store, credentialService } = input

  registerInvoke('openrouter-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store, credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const baseUrlValidation = typeof payload.baseUrl === 'string'
        ? validateOpenRouterOfficialBaseUrl(payload.baseUrl)
        : null
      if (baseUrlValidation && !baseUrlValidation.ok) return safeFailure('untrusted_base_url')

      const apiKey = payload.apiKey?.trim()
      if (apiKey) {
        credentialService.updateApiKey('openrouter', apiKey)
      }

      if (payload.baseUrl === null) {
        store.delete(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY)
      } else if (baseUrlValidation?.ok) {
        store.set(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY, baseUrlValidation.baseUrl)
      }

      return { ok: true, status: readStatus(store, credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:clear', () => {
    try {
      // Clear only API key credential material. Custom base URL endpoint material is
      // preserved here and cleared explicitly through update({ baseUrl: null }).
      credentialService.clearApiKey('openrouter')
      return { ok: true, status: readStatus(store, credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
