import type Store from 'electron-store'
import {
  OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF,
} from '../jobs/openRouterCatalogCredential'
import {
  OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF,
  OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY,
  OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY,
} from '../../src/next/provider/openrouter/openRouterLegacyCredential'
import type { RegisterInvoke } from './types'

export const OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'openrouter-credential:get-status',
  'openrouter-credential:update',
  'openrouter-credential:clear',
] as const

export type OpenRouterCredentialSettingsStatus = Readonly<{
  source: 'legacy_store'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
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
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

type RegisterOpenRouterCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
}>

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENROUTER_OFFICIAL_ENDPOINT_ID = 'openrouter-official'
const OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID = 'openrouter-custom-legacy-store'
const OPENROUTER_PROFILE_ID = 'openrouter_v1_chat'

export type OpenRouterEndpointMetadata = Readonly<{
  kind: 'openrouter_endpoint'
  endpointId: typeof OPENROUTER_OFFICIAL_ENDPOINT_ID | typeof OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID
  providerId: 'openrouter'
  profileId: typeof OPENROUTER_PROFILE_ID
  displayName: string
  source: 'legacy_store'
  baseUrlConfigured: boolean
  baseUrlInvalid?: boolean
  displayBaseUrl?: string
  defaultBaseUrl: string
  credentialRef: typeof OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF
  catalogCredentialRef: typeof OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF
  rendererVisible: true
}>

type SafeDisplayBaseUrl = Readonly<{
  displayBaseUrl?: string
  invalid: boolean
}>

function sanitizeDisplayBaseUrl(raw: unknown): SafeDisplayBaseUrl {
  const value = String(raw ?? '').trim()
  if (!value) return { invalid: false }

  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return { displayBaseUrl: url.toString(), invalid: false }
  } catch {
    return { invalid: true }
  }
}

function buildOpenRouterEndpointMetadata(input: Readonly<{
  baseUrlConfigured: boolean
  safeBaseUrl: SafeDisplayBaseUrl
}>): OpenRouterEndpointMetadata {
  const customEndpoint = input.baseUrlConfigured
  const displayBaseUrl = input.safeBaseUrl.displayBaseUrl ?? (customEndpoint ? undefined : DEFAULT_OPENROUTER_BASE_URL)

  return {
    kind: 'openrouter_endpoint',
    endpointId: customEndpoint ? OPENROUTER_CUSTOM_LEGACY_ENDPOINT_ID : OPENROUTER_OFFICIAL_ENDPOINT_ID,
    providerId: 'openrouter',
    profileId: OPENROUTER_PROFILE_ID,
    displayName: customEndpoint ? 'OpenRouter custom endpoint' : 'OpenRouter official endpoint',
    source: 'legacy_store',
    baseUrlConfigured: customEndpoint,
    ...(input.safeBaseUrl.invalid ? { baseUrlInvalid: true } : {}),
    ...(displayBaseUrl ? { displayBaseUrl } : {}),
    defaultBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    credentialRef: OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF,
    catalogCredentialRef: OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF,
    rendererVisible: true,
  }
}

function readStatus(store: Store): OpenRouterCredentialSettingsStatus {
  const apiKey = String(store.get(OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY) ?? '').trim()
  const baseUrl = String(store.get(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY) ?? '').trim()
  const safeBaseUrl = sanitizeDisplayBaseUrl(baseUrl)
  const baseUrlConfigured = baseUrl.length > 0

  return {
    source: 'legacy_store',
    apiKeyConfigured: apiKey.length > 0,
    ...(apiKey.length > 0 ? { maskedApiKey: '***' as const } : {}),
    baseUrlConfigured,
    ...(safeBaseUrl.invalid ? { baseUrlInvalid: true } : {}),
    ...(safeBaseUrl.displayBaseUrl ? { displayBaseUrl: safeBaseUrl.displayBaseUrl } : {}),
    defaultBaseUrl: DEFAULT_OPENROUTER_BASE_URL,
    endpoint: buildOpenRouterEndpointMetadata({ baseUrlConfigured, safeBaseUrl }),
  }
}

function isUpdatePayload(payload: unknown): payload is OpenRouterCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  if ('apiKey' in value && value.apiKey !== undefined && typeof value.apiKey !== 'string') return false
  if ('baseUrl' in value && value.baseUrl !== undefined && value.baseUrl !== null && typeof value.baseUrl !== 'string') return false
  return true
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable'): OpenRouterCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'OpenRouter credential settings payload is invalid.'
      : 'OpenRouter credential settings store is unavailable.',
  }
}

export function registerOpenRouterCredentialSettingsIpc(
  input: RegisterOpenRouterCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, store } = input

  registerInvoke('openrouter-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) {
        store.set(OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY, apiKey)
      }

      if (payload.baseUrl === null) {
        store.delete(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY)
      } else if (typeof payload.baseUrl === 'string') {
        store.set(OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY, payload.baseUrl.trim())
      }

      return { ok: true, status: readStatus(store) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:clear', () => {
    try {
      // Clear only API key credential material. Custom base URL endpoint material is
      // preserved here and cleared explicitly through update({ baseUrl: null }).
      store.delete(OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY)
      return { ok: true, status: readStatus(store) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
