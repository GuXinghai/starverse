import {
  PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS,
  type ProviderCredentialService,
  type ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import type { RegisterInvoke } from './types'

export const GOOGLE_AI_STUDIO_API_KEY_STORE_KEY = PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.google_ai_studio

export const GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'google-ai-studio-credential:get-status',
  'google-ai-studio-credential:update',
  'google-ai-studio-credential:clear',
] as const

export type GoogleAIStudioCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  providerId: 'google-ai-studio'
  profileId: 'gemini_api_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
  defaultBaseUrl: 'https://generativelanguage.googleapis.com'
  rendererVisible: true
}>

export type GoogleAIStudioCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
}>

export type GoogleAIStudioCredentialSettingsResult =
  | Readonly<{ ok: true; status: GoogleAIStudioCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

type RegisterGoogleAIStudioCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
}>

function readStatus(credentialService: ProviderCredentialService): GoogleAIStudioCredentialSettingsStatus {
  const status = credentialService.getStatus('google_ai_studio')
  return {
    source: status.source,
    backend: status.backend,
    providerId: 'google-ai-studio',
    profileId: 'gemini_api_v1',
    apiKeyConfigured: status.apiKeyConfigured,
    ...(status.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(status.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: status.warnings,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    rendererVisible: true,
  }
}

function isUpdatePayload(payload: unknown): payload is GoogleAIStudioCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return !('apiKey' in value) || value.apiKey === undefined || typeof value.apiKey === 'string'
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable'): GoogleAIStudioCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'Google AI Studio credential settings payload is invalid.'
      : 'Google AI Studio credential settings store is unavailable.',
  }
}

export function registerGoogleAIStudioCredentialSettingsIpc(
  input: RegisterGoogleAIStudioCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, credentialService } = input

  registerInvoke('google-ai-studio-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(credentialService) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('google-ai-studio-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) credentialService.updateApiKey('google_ai_studio', apiKey)
      return { ok: true, status: readStatus(credentialService) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('google-ai-studio-credential:clear', () => {
    try {
      credentialService.clearApiKey('google_ai_studio')
      return { ok: true, status: readStatus(credentialService) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
