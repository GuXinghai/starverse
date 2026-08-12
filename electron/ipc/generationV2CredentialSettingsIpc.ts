import {
  Epoch2RuntimeCredentialError,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import type { RegisterInvoke } from './types'
import {
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
} from '../../src/shared/provider/providerFailureV2'

export const GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS = Object.freeze([
  'generation-v2:credentials:openrouter:get-status',
  'generation-v2:credentials:openrouter:update', 'generation-v2:credentials:openrouter:clear',
  'generation-v2:credentials:openai-responses:get-status',
  'generation-v2:credentials:openai-responses:update', 'generation-v2:credentials:openai-responses:clear',
  'generation-v2:credentials:google-ai-studio:get-status',
  'generation-v2:credentials:google-ai-studio:update', 'generation-v2:credentials:google-ai-studio:clear',
  'generation-v2:credentials:anthropic:get-status',
  'generation-v2:credentials:anthropic:update', 'generation-v2:credentials:anthropic:clear',
  'generation-v2:credentials:deepseek:get-status',
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

function validUpdate(payload: unknown): payload is Readonly<{ apiKey?: string; storageMode?: 'system_secure' | 'session' | 'plaintext' }> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return false
  const descriptors = Object.getOwnPropertyDescriptors(payload)
  if (Reflect.ownKeys(payload).some((key) => key !== 'apiKey' && key !== 'storageMode') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) return false
  return (descriptors.apiKey === undefined || descriptors.apiKey.value === undefined || typeof descriptors.apiKey.value === 'string') &&
    (descriptors.storageMode === undefined || descriptors.storageMode.value === undefined ||
      descriptors.storageMode.value === 'system_secure' || descriptors.storageMode.value === 'session' || descriptors.storageMode.value === 'plaintext')
}

function failure(code: 'invalid_payload') {
  return Object.freeze({ ok: false, code, message: 'Provider credential settings payload is invalid.' })
}

function credentialStoreFailure(provider: ProviderSettings, operation: string, error: unknown) {
  const diagnosticCode = error instanceof Epoch2RuntimeCredentialError
    ? error.code
    : 'PROVIDER_CREDENTIAL_STORE_FAILED'
  const providerFailure = providerFailureFromUnknownV2(error, {
    origin: 'secure_storage',
    phase: 'terminal_persistence',
    providerId: provider.providerId,
    contractId: `credential-settings:${provider.profileId}`,
    operationId: `credential:${operation}:${provider.providerKey}`,
    requestSequence: 1,
    starverseDiagnosticCode: diagnosticCode,
  })
  return Object.freeze({
    ok: false,
    code: providerFailure.starverseDiagnosticCode,
    message: providerFailurePrimaryMessageV2(providerFailure),
    providerFailure,
  })
}

async function status(service: Epoch2RuntimeCredentialService, provider: ProviderSettings) {
  const value = await service.getStatus(provider.providerKey)
  const common = {
    source: value.configured ? (value.storageBackend === 'plaintext' ? 'plaintext' as const : 'secure_store' as const) : 'missing' as const,
    ...(value.storageBackend ? { backend: value.storageBackend } : {}),
    providerId: provider.providerId,
    profileId: provider.profileId,
    apiKeyConfigured: value.configured,
    ...(value.configured ? { maskedApiKey: '***' as const } : {}),
    credentialAvailability: value.availability,
    sessionOverridesPersistent: value.sessionOverridesPersistent,
    ...(value.diagnosticCode ? { credentialDiagnosticCode: value.diagnosticCode } : {}),
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
      catch (error) { return credentialStoreFailure(provider, 'status', error) }
    })
    input.registerInvoke(`${provider.channelPrefix}:update`, async (_event: unknown, payload: unknown) => {
      if (!validUpdate(payload)) return failure('invalid_payload')
      try {
        const current = await input.credentialService.getStatus(provider.providerKey)
        const apiKey = payload.apiKey?.trim()
        if (apiKey) await input.credentialService.updateCredential({ providerKey: provider.providerKey,
          credential: apiKey, expectedRevision: current.revision, storageMode: payload.storageMode })
        return Object.freeze({ ok: true, status: await status(input.credentialService, provider) })
      } catch (error) { return credentialStoreFailure(provider, 'update', error) }
    })
    input.registerInvoke(`${provider.channelPrefix}:clear`, async () => {
      try {
        const current = await input.credentialService.getStatus(provider.providerKey)
        if (current.configured) await input.credentialService.clearCredential({ providerKey: provider.providerKey,
          expectedRevision: current.revision })
        return Object.freeze({ ok: true, status: await status(input.credentialService, provider) })
      } catch (error) { return credentialStoreFailure(provider, 'clear', error) }
    })
  }
  return GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS
}
