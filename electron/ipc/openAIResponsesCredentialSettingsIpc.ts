import {
  PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS,
  type ProviderCredentialService,
  type ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import type { RegisterInvoke } from './types'

export const OPENAI_RESPONSES_API_KEY_STORE_KEY = PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openai_responses

export const OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'openai-responses-credential:get-status',
  'openai-responses-credential:update',
  'openai-responses-credential:clear',
] as const

export type OpenAIResponsesCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  providerId: 'openai'
  profileId: 'openai_responses_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://api.openai.com/v1'
  rendererVisible: true
}>

export type OpenAIResponsesCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
}>

export type OpenAIResponsesCredentialSettingsResult =
  | Readonly<{ ok: true; status: OpenAIResponsesCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

type RegisterOpenAIResponsesCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
}>

function readStatus(credentialService: ProviderCredentialService): OpenAIResponsesCredentialSettingsStatus {
  const status = credentialService.getStatus('openai_responses')
  return {
    source: status.source,
    backend: status.backend,
    providerId: 'openai',
    profileId: 'openai_responses_v1',
    apiKeyConfigured: status.apiKeyConfigured,
    ...(status.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(status.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: status.warnings,
    defaultBaseUrl: 'https://api.openai.com/v1',
    rendererVisible: true,
  }
}

function isUpdatePayload(payload: unknown): payload is OpenAIResponsesCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return !('apiKey' in value) || value.apiKey === undefined || typeof value.apiKey === 'string'
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable'): OpenAIResponsesCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'OpenAI Responses credential settings payload is invalid.'
      : 'OpenAI Responses credential settings store is unavailable.',
  }
}

export function registerOpenAIResponsesCredentialSettingsIpc(
  input: RegisterOpenAIResponsesCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, credentialService } = input

  registerInvoke('openai-responses-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(credentialService) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openai-responses-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) credentialService.updateApiKey('openai_responses', apiKey)
      return { ok: true, status: readStatus(credentialService) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openai-responses-credential:clear', () => {
    try {
      credentialService.clearApiKey('openai_responses')
      return { ok: true, status: readStatus(credentialService) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
