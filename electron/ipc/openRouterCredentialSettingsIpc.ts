import type {
  ProviderCredentialService,
  ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import { OPENROUTER_DEFAULT_BASE_URL } from '../openrouter/openRouterEndpointPolicy'
import type { RegisterInvoke } from './types'

export const OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'openrouter-credential:get-status',
  'openrouter-credential:reveal',
  'openrouter-credential:update',
  'openrouter-credential:clear',
] as const

const OPENROUTER_PROFILE_ID = 'openrouter_v1_chat'
const OPENROUTER_CHAT_CREDENTIAL_METADATA_REF = {
  kind: 'credential_ref',
  id: 'openrouter-chat-legacy-store',
} as const
const OPENROUTER_CATALOG_CREDENTIAL_METADATA_REF = {
  kind: 'credential_ref',
  id: 'openrouter-catalog-legacy-store',
} as const

export type OpenRouterEndpointMetadata = Readonly<{
  kind: 'openrouter_endpoint'
  endpointId: 'openrouter-official'
  endpointStatus: 'official'
  providerId: 'openrouter'
  profileId: typeof OPENROUTER_PROFILE_ID
  displayName: 'OpenRouter official endpoint'
  source: ProviderCredentialStatusSource
  defaultBaseUrl: typeof OPENROUTER_DEFAULT_BASE_URL
  displayBaseUrl: typeof OPENROUTER_DEFAULT_BASE_URL
  baseUrlConfigured: false
  credentialRef: typeof OPENROUTER_CHAT_CREDENTIAL_METADATA_REF
  catalogCredentialRef: typeof OPENROUTER_CATALOG_CREDENTIAL_METADATA_REF
  rendererVisible: true
}>

export type OpenRouterCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  baseUrlConfigured: false
  displayBaseUrl: typeof OPENROUTER_DEFAULT_BASE_URL
  defaultBaseUrl: typeof OPENROUTER_DEFAULT_BASE_URL
  endpoint: OpenRouterEndpointMetadata
}>

export type OpenRouterCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
}>

export type OpenRouterCredentialSettingsResult =
  | Readonly<{ ok: true; status: OpenRouterCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

export type OpenRouterCredentialRevealResult =
  | Readonly<{ ok: true; apiKey: string }>
  | Readonly<{ ok: false; code: 'credential_missing' | 'store_unavailable'; message: string }>

type RegisterOpenRouterCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
}>

function buildOfficialEndpoint(source: ProviderCredentialStatusSource): OpenRouterEndpointMetadata {
  return {
    kind: 'openrouter_endpoint',
    endpointId: 'openrouter-official',
    endpointStatus: 'official',
    providerId: 'openrouter',
    profileId: OPENROUTER_PROFILE_ID,
    displayName: 'OpenRouter official endpoint',
    source,
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    displayBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    baseUrlConfigured: false,
    credentialRef: OPENROUTER_CHAT_CREDENTIAL_METADATA_REF,
    catalogCredentialRef: OPENROUTER_CATALOG_CREDENTIAL_METADATA_REF,
    rendererVisible: true,
  }
}

function readStatus(credentialService: ProviderCredentialService): OpenRouterCredentialSettingsStatus {
  const credentialStatus = credentialService.getStatus('openrouter')
  return {
    source: credentialStatus.source,
    backend: credentialStatus.backend,
    apiKeyConfigured: credentialStatus.apiKeyConfigured,
    ...(credentialStatus.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(credentialStatus.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: credentialStatus.warnings,
    baseUrlConfigured: false,
    displayBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    endpoint: buildOfficialEndpoint(credentialStatus.source),
  }
}

function isUpdatePayload(payload: unknown): payload is OpenRouterCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  if (Object.keys(value).some((key) => key !== 'apiKey')) return false
  return !('apiKey' in value) || value.apiKey === undefined || typeof value.apiKey === 'string'
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

function safeRevealFailure(code: 'credential_missing' | 'store_unavailable'): OpenRouterCredentialRevealResult {
  return {
    ok: false,
    code,
    message: code === 'credential_missing'
      ? 'OpenRouter API key is not configured.'
      : 'OpenRouter credential settings store is unavailable.',
  }
}

export function registerOpenRouterCredentialSettingsIpc(
  input: RegisterOpenRouterCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, credentialService } = input

  registerInvoke('openrouter-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:reveal', () => {
    try {
      const result = credentialService.readApiKey('openrouter')
      if (!result.ok) return safeRevealFailure(result.code === 'credential_missing' ? 'credential_missing' : 'store_unavailable')
      return { ok: true, apiKey: result.apiKey } satisfies OpenRouterCredentialRevealResult
    } catch {
      return safeRevealFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')
    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) credentialService.updateApiKey('openrouter', apiKey)
      return { ok: true, status: readStatus(credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openrouter-credential:clear', () => {
    try {
      credentialService.clearApiKey('openrouter')
      return { ok: true, status: readStatus(credentialService) } satisfies OpenRouterCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
