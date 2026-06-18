import type Store from 'electron-store'
import type { RegisterInvoke } from './types'

export const GOOGLE_AI_STUDIO_API_KEY_STORE_KEY = 'googleAIStudioApiKey'

export const GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'google-ai-studio-credential:get-status',
  'google-ai-studio-credential:update',
  'google-ai-studio-credential:clear',
] as const

export type GoogleAIStudioCredentialSettingsStatus = Readonly<{
  source: 'legacy_store'
  providerId: 'google-ai-studio'
  profileId: 'gemini_api_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
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
  store: Store
}>

function readStatus(store: Store): GoogleAIStudioCredentialSettingsStatus {
  const apiKey = String(store.get(GOOGLE_AI_STUDIO_API_KEY_STORE_KEY) ?? '').trim()
  return {
    source: 'legacy_store',
    providerId: 'google-ai-studio',
    profileId: 'gemini_api_v1',
    apiKeyConfigured: apiKey.length > 0,
    ...(apiKey.length > 0 ? { maskedApiKey: '***' as const } : {}),
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
  const { registerInvoke, store } = input

  registerInvoke('google-ai-studio-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('google-ai-studio-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) store.set(GOOGLE_AI_STUDIO_API_KEY_STORE_KEY, apiKey)
      return { ok: true, status: readStatus(store) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('google-ai-studio-credential:clear', () => {
    try {
      store.delete(GOOGLE_AI_STUDIO_API_KEY_STORE_KEY)
      return { ok: true, status: readStatus(store) } satisfies GoogleAIStudioCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...GOOGLE_AI_STUDIO_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
