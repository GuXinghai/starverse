import type Store from 'electron-store'
import type { RegisterInvoke } from './types'

export const OPENAI_RESPONSES_API_KEY_STORE_KEY = 'openAIResponsesApiKey'

export const OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'openai-responses-credential:get-status',
  'openai-responses-credential:update',
  'openai-responses-credential:clear',
] as const

export type OpenAIResponsesCredentialSettingsStatus = Readonly<{
  source: 'legacy_store'
  providerId: 'openai'
  profileId: 'openai_responses_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
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
  store: Store
}>

function readStatus(store: Store): OpenAIResponsesCredentialSettingsStatus {
  const apiKey = String(store.get(OPENAI_RESPONSES_API_KEY_STORE_KEY) ?? '').trim()
  return {
    source: 'legacy_store',
    providerId: 'openai',
    profileId: 'openai_responses_v1',
    apiKeyConfigured: apiKey.length > 0,
    ...(apiKey.length > 0 ? { maskedApiKey: '***' as const } : {}),
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
  const { registerInvoke, store } = input

  registerInvoke('openai-responses-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openai-responses-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) store.set(OPENAI_RESPONSES_API_KEY_STORE_KEY, apiKey)
      return { ok: true, status: readStatus(store) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('openai-responses-credential:clear', () => {
    try {
      store.delete(OPENAI_RESPONSES_API_KEY_STORE_KEY)
      return { ok: true, status: readStatus(store) } satisfies OpenAIResponsesCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...OPENAI_RESPONSES_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
