import {
  PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS,
  type ProviderCredentialService,
  type ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import type { RegisterInvoke } from './types'

export const DEEPSEEK_API_KEY_STORE_KEY = PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.deepseek

export const DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'deepseek-credential:get-status',
  'deepseek-credential:update',
  'deepseek-credential:clear',
] as const

export type DeepSeekCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  providerId: 'deepseek'
  profileId: 'deepseek_official_openai_compat'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
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
  credentialService: ProviderCredentialService
}>

function readStatus(credentialService: ProviderCredentialService): DeepSeekCredentialSettingsStatus {
  const status = credentialService.getStatus('deepseek')
  return {
    source: status.source,
    backend: status.backend,
    providerId: 'deepseek',
    profileId: 'deepseek_official_openai_compat',
    apiKeyConfigured: status.apiKeyConfigured,
    ...(status.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(status.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: status.warnings,
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
  const { registerInvoke, credentialService } = input

  registerInvoke('deepseek-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(credentialService) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('deepseek-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) credentialService.updateApiKey('deepseek', apiKey)
      return { ok: true, status: readStatus(credentialService) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('deepseek-credential:clear', () => {
    try {
      credentialService.clearApiKey('deepseek')
      return { ok: true, status: readStatus(credentialService) } satisfies DeepSeekCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...DEEPSEEK_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
