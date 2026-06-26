import {
  PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS,
  type ProviderCredentialService,
  type ProviderCredentialStatusSource,
} from '../credentials/providerCredentialService'
import type { RegisterInvoke } from './types'

export const ANTHROPIC_API_KEY_STORE_KEY = PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.anthropic

export const ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS = [
  'anthropic-credential:get-status',
  'anthropic-credential:update',
  'anthropic-credential:clear',
] as const

export type AnthropicCredentialSettingsStatus = Readonly<{
  source: ProviderCredentialStatusSource
  backend: 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'
  providerId: 'anthropic'
  profileId: 'anthropic_messages_v1'
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
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
  credentialService: ProviderCredentialService
}>

function readStatus(credentialService: ProviderCredentialService): AnthropicCredentialSettingsStatus {
  const status = credentialService.getStatus('anthropic')
  return {
    source: status.source,
    backend: status.backend,
    providerId: 'anthropic',
    profileId: 'anthropic_messages_v1',
    apiKeyConfigured: status.apiKeyConfigured,
    ...(status.apiKeyConfigured ? { maskedApiKey: '***' as const } : {}),
    ...(status.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
    warnings: status.warnings,
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
  const { registerInvoke, credentialService } = input

  registerInvoke('anthropic-credential:get-status', () => {
    try {
      return { ok: true, status: readStatus(credentialService) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('anthropic-credential:update', (_event: unknown, payload: unknown) => {
    if (!isUpdatePayload(payload)) return safeFailure('invalid_payload')

    try {
      const apiKey = payload.apiKey?.trim()
      if (apiKey) credentialService.updateApiKey('anthropic', apiKey)
      return { ok: true, status: readStatus(credentialService) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  registerInvoke('anthropic-credential:clear', () => {
    try {
      credentialService.clearApiKey('anthropic')
      return { ok: true, status: readStatus(credentialService) } satisfies AnthropicCredentialSettingsResult
    } catch {
      return safeFailure('store_unavailable')
    }
  })

  return [...ANTHROPIC_CREDENTIAL_SETTINGS_IPC_CHANNELS]
}
