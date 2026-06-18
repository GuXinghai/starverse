import type Store from 'electron-store'
import type { RegisterInvoke } from './types'

export const ANTHROPIC_API_KEY_STORE_KEY = 'anthropicApiKey'

export const ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'anthropic-credential:get-status',
  'anthropic-credential:update',
  'anthropic-credential:clear',
] as const

export type AnthropicCredentialSettingsStatus = Readonly<{
  source: 'legacy_store'
  providerId: 'anthropic'
  profileId: 'anthropic_messages_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  defaultBaseUrl: 'https://api.anthropic.com/v1'
  rendererVisible: true
}>

export type AnthropicCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
}>

export type AnthropicCredentialSettingsResult =
  | Readonly<{ ok: true; status: AnthropicCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

type RegisterAnthropicCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
}>

function readStatus(store: Store): AnthropicCredentialSettingsStatus {
  const apiKey = String(store.get(ANTHROPIC_API_KEY_STORE_KEY) ?? '').trim()
  return {
    source: 'legacy_store',
    providerId: 'anthropic',
    profileId: 'anthropic_messages_v1',
    apiKeyConfigured: apiKey.length > 0,
    ...(apiKey.length > 0 ? { maskedApiKey: '***' as const } : {}),
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    rendererVisible: true,
  }
}

function isUpdatePayload(payload: unknown): payload is AnthropicCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return !('apiKey' in value) || value.apiKey === undefined || typeof value.apiKey === 'string'
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable'): AnthropicCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'Anthropic credential settings payload is invalid.'
      : 'Anthropic credential settings store is unavailable.',
  }
}

export function registerAnthropicCredentialSettingsIpc(
  input: RegisterAnthropicCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, store } = input

  registerInvoke('anthropic-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('anthropic-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) store.set(ANTHROPIC_API_KEY_STORE_KEY, apiKey)
      return { ok: true, status: readStatus(store) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('anthropic-credential:clear', () => {
    try {
      store.delete(ANTHROPIC_API_KEY_STORE_KEY)
      return { ok: true, status: readStatus(store) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
