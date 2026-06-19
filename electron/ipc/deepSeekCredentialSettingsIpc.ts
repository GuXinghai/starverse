import type Store from 'electron-store'
import type { RegisterInvoke } from './types'

export const DEEPSEEK_API_KEY_STORE_KEY = 'deepSeekApiKey'

export const DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'deepseek-credential:get-status',
  'deepseek-credential:update',
  'deepseek-credential:clear',
] as const

export type DeepSeekCredentialSettingsStatus = Readonly<{
  source: 'legacy_store'
  providerId: 'deepseek'
  profileId: 'deepseek_official_openai_compat'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  defaultBaseUrl: 'https://api.deepseek.com/v1'
  rendererVisible: true
}>

export type DeepSeekCredentialSettingsUpdatePayload = Readonly<{
  apiKey?: string
}>

export type DeepSeekCredentialSettingsResult =
  | Readonly<{ ok: true; status: DeepSeekCredentialSettingsStatus }>
  | Readonly<{ ok: false; code: 'invalid_payload' | 'store_unavailable'; message: string }>

type RegisterDeepSeekCredentialSettingsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
}>

function readStatus(store: Store): DeepSeekCredentialSettingsStatus {
  const apiKey = String(store.get(DEEPSEEK_API_KEY_STORE_KEY) ?? '').trim()
  return {
    source: 'legacy_store',
    providerId: 'deepseek',
    profileId: 'deepseek_official_openai_compat',
    apiKeyConfigured: apiKey.length > 0,
    ...(apiKey.length > 0 ? { maskedApiKey: '***' as const } : {}),
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    rendererVisible: true,
  }
}

function isUpdatePayload(payload: unknown): payload is DeepSeekCredentialSettingsUpdatePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return !('apiKey' in value) || value.apiKey === undefined || typeof value.apiKey === 'string'
}

function safeFailure(code: 'invalid_payload' | 'store_unavailable'): DeepSeekCredentialSettingsResult {
  return {
    ok: false,
    code,
    message: code === 'invalid_payload'
      ? 'DeepSeek credential settings payload is invalid.'
      : 'DeepSeek credential settings store is unavailable.',
  }
}

export function registerDeepSeekCredentialSettingsIpc(
  input: RegisterDeepSeekCredentialSettingsIpcInput,
): string[] {
  const { registerInvoke, store } = input

  registerInvoke('deepseek-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(store) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('deepseek-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) store.set(DEEPSEEK_API_KEY_STORE_KEY, apiKey)
      return { ok: true, status: readStatus(store) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('deepseek-credential:clear', () => {
    try {
      store.delete(DEEPSEEK_API_KEY_STORE_KEY)
      return { ok: true, status: readStatus(store) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
