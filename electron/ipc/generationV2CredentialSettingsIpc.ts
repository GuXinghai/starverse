import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS = Object.freeze([
  'generation-v2:credentials:openrouter:get-status', 'generation-v2:credentials:openrouter:reveal',
  'generation-v2:credentials:openrouter:update', 'generation-v2:credentials:openrouter:clear',
  'generation-v2:credentials:openai-responses:get-status', 'generation-v2:credentials:openai-responses:reveal',
  'generation-v2:credentials:openai-responses:update', 'generation-v2:credentials:openai-responses:clear',
  'generation-v2:credentials:google-ai-studio:get-status', 'generation-v2:credentials:google-ai-studio:reveal',
  'generation-v2:credentials:google-ai-studio:update', 'generation-v2:credentials:google-ai-studio:clear',
  'generation-v2:credentials:anthropic:get-status', 'generation-v2:credentials:anthropic:reveal',
  'generation-v2:credentials:anthropic:update', 'generation-v2:credentials:anthropic:clear',
  'generation-v2:credentials:deepseek:get-status', 'generation-v2:credentials:deepseek:reveal',
  'generation-v2:credentials:deepseek:update', 'generation-v2:credentials:deepseek:clear',
] as const)

type ProviderSettings = Readonly<{
  channelPrefix: string
  providerKey: ProviderCredentialKey
  providerId: string
  profileId: string
  defaultBaseUrl: string
}>

const PROVIDERS: readonly ProviderSettings[] = Object.freeze([
  Object.freeze({ channelPrefix: 'generation-v2:credentials:openrouter', providerKey: 'openrouter', providerId: 'openrouter',
    profileId: 'openrouter-first-party-v1', defaultBaseUrl: 'https://openrouter.ai/api/v1' }),
  Object.freeze({ channelPrefix: 'generation-v2:credentials:openai-responses', providerKey: 'openai_responses', providerId: 'openai',
    profileId: 'openai-responses-v1', defaultBaseUrl: 'https://api.openai.com/v1' }),
  Object.freeze({ channelPrefix: 'generation-v2:credentials:google-ai-studio', providerKey: 'google_ai_studio', providerId: 'google-ai-studio',
    profileId: 'gemini-developer-api-v1beta', defaultBaseUrl: 'https://generativelanguage.googleapis.com' }),
  Object.freeze({ channelPrefix: 'generation-v2:credentials:anthropic', providerKey: 'anthropic', providerId: 'anthropic',
    profileId: 'anthropic-messages-2023-06-01', defaultBaseUrl: 'https://api.anthropic.com/v1' }),
  Object.freeze({ channelPrefix: 'generation-v2:credentials:deepseek', providerKey: 'deepseek', providerId: 'deepseek',
    profileId: 'deepseek-stable-chat-v1', defaultBaseUrl: 'https://api.deepseek.com' }),
])

function validUpdate(payload: unknown): payload is Readonly<{ apiKey?: string }> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return false
  const descriptors = Object.getOwnPropertyDescriptors(payload)
  if (Reflect.ownKeys(payload).some((key) => key !== 'apiKey') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) return false
  return descriptors.apiKey === undefined || descriptors.apiKey.value === undefined || typeof descriptors.apiKey.value === 'string'
}

function failure(code: 'invalid_payload' | 'store_unavailable') {
  return Object.freeze({ ok: false, code, message: code === 'invalid_payload'
    ? 'Provider credential settings payload is invalid.' : 'Provider credential settings store is unavailable.' })
}

async function status(service: Epoch2RuntimeCredentialService, provider: ProviderSettings) {
  const value = await service.getStatus(provider.providerKey)
  const common = {
    source: value.configured ? 'secure_store' as const : 'missing' as const,
    backend: 'electron_safe_storage' as const,
    providerId: provider.providerId,
    profileId: provider.profileId,
    apiKeyConfigured: value.configured,
    ...(value.configured ? { maskedApiKey: '***' as const } : {}),
    warnings: Object.freeze([]) as readonly string[],
    defaultBaseUrl: provider.defaultBaseUrl,
    rendererVisible: true as const,
  }
  if (provider.providerKey !== 'openrouter') return Object.freeze(common)
  return Object.freeze({ ...common, baseUrlConfigured: false as const, displayBaseUrl: provider.defaultBaseUrl,
    endpoint: Object.freeze({ kind: 'openrouter_endpoint' as const, endpointId: 'openrouter-official' as const,
      endpointStatus: 'official' as const, providerId: 'openrouter' as const, profileId: provider.profileId,
      displayName: 'OpenRouter official endpoint' as const, source: common.source,
      defaultBaseUrl: provider.defaultBaseUrl, displayBaseUrl: provider.defaultBaseUrl, baseUrlConfigured: false as const,
      credentialRef: Object.freeze({ kind: 'credential_ref' as const, id: 'openrouter-first-party-v1' as const }),
      catalogCredentialRef: Object.freeze({ kind: 'credential_ref' as const, id: 'openrouter-first-party-v1' as const }),
      rendererVisible: true as const }) })
}

export function registerGenerationV2CredentialSettingsIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: Epoch2RuntimeCredentialService
}>): readonly string[] {
  for (const provider of PROVIDERS) {
    input.registerInvoke(`${provider.channelPrefix}:get-status`, async () => {
      try { return Object.freeze({ ok: true, status: await status(input.credentialService, provider) }) }
      catch { return failure('store_unavailable') }
    })
    input.registerInvoke(`${provider.channelPrefix}:reveal`, async () => {
      try {
        const current = await input.credentialService.getStatus(provider.providerKey)
        if (!current.configured || !current.credentialScopeId) {
          return Object.freeze({ ok: false, code: 'credential_missing', message: 'Provider API key is not configured.' })
        }
        return await input.credentialService.withCredential({ providerKey: provider.providerKey,
          expectedRevision: current.revision, expectedCredentialScopeId: current.credentialScopeId,
          consume: (lease) => Object.freeze({ ok: true as const, apiKey: lease.credential }) })
      } catch { return Object.freeze({ ok: false, code: 'store_unavailable', message: 'Provider credential settings store is unavailable.' }) }
    })
    input.registerInvoke(`${provider.channelPrefix}:update`, async (_event: unknown, payload: unknown) => {
      if (!validUpdate(payload)) return failure('invalid_payload')
      try {
        const current = await input.credentialService.getStatus(provider.providerKey)
        const apiKey = payload.apiKey?.trim()
        if (apiKey) await input.credentialService.updateCredential({ providerKey: provider.providerKey,
          credential: apiKey, expectedRevision: current.revision })
        return Object.freeze({ ok: true, status: await status(input.credentialService, provider) })
      } catch { return failure('store_unavailable') }
    })
    input.registerInvoke(`${provider.channelPrefix}:clear`, async () => {
      try {
        const current = await input.credentialService.getStatus(provider.providerKey)
        if (current.configured) await input.credentialService.clearCredential({ providerKey: provider.providerKey,
          expectedRevision: current.revision })
        return Object.freeze({ ok: true, status: await status(input.credentialService, provider) })
      } catch { return failure('store_unavailable') }
    })
  }
  return GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS
}
