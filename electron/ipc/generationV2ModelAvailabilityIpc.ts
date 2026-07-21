import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import {
  OPENAI_RESPONSES_ENDPOINT_ID, OPENAI_RESPONSES_PROFILE_ID, OPENAI_RESPONSES_PROVIDER_KEY,
  listOpenAIProviderModelAvailability,
} from '../../src/next/provider/openai-responses/openAIResponsesModelSource'
import {
  ANTHROPIC_MESSAGES_ENDPOINT_ID, ANTHROPIC_MESSAGES_PROFILE_ID, ANTHROPIC_MESSAGES_PROVIDER_KEY,
  listAnthropicProviderModelAvailability,
} from '../../src/next/provider/anthropic/anthropicModelSource'
import {
  GOOGLE_AI_STUDIO_ENDPOINT_ID, GOOGLE_AI_STUDIO_PROFILE_ID, GOOGLE_AI_STUDIO_PROVIDER_KEY,
  listGeminiProviderModelAvailability,
} from '../../src/next/provider/gemini/geminiModelSource'
import {
  DEEPSEEK_OFFICIAL_ENDPOINT_ID, DEEPSEEK_OFFICIAL_PROFILE_ID, DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  listDeepSeekProviderModelAvailability,
} from '../../src/next/provider/deepseek/deepSeekModelSource'
import type { RegisterInvoke } from './types'
import { decodeOpenRouterChatModelsEvidenceV1, OPENROUTER_CHAT_MODELS_MAX_BYTES_V1 } from '../../src/next/generation-v2/providers/openrouter/chatModelsEvidenceV1'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'

export const GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS = Object.freeze([
  'openai-responses-models:list-availability',
  'anthropic-models:list-availability',
  'google-ai-studio-models:list-availability',
  'deepseek-models:list-availability',
  'generation-v2:openrouter-models:list',
] as const)

const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000

function timeout(payload: unknown): number {
  if (payload === undefined || payload === null) return DEFAULT_TIMEOUT_MS
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new Error('invalid_payload')
  }
  const descriptors = Object.getOwnPropertyDescriptors(payload)
  if (Reflect.ownKeys(payload).some((key) => key !== 'timeoutMs') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) {
    throw new Error('invalid_payload')
  }
  const value = descriptors.timeoutMs?.value
  if (value === undefined) return DEFAULT_TIMEOUT_MS
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid_payload')
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(value)))
}

async function withCredential<T extends object>(input: Readonly<{
  service: Epoch2RuntimeCredentialService
  providerKey: ProviderCredentialKey
  consume: (credential: string) => Promise<T>
}>): Promise<T | 'credential_missing' | 'store_unavailable'> {
  try {
    const status = await input.service.getStatus(input.providerKey)
    if (!status.configured || !status.credentialScopeId) return 'credential_missing'
    return await input.service.withCredential({
      providerKey: input.providerKey,
      expectedRevision: status.revision,
      expectedCredentialScopeId: status.credentialScopeId,
      consume: (lease) => input.consume(lease.credential),
    })
  } catch {
    return 'store_unavailable'
  }
}

export function registerGenerationV2ModelAvailabilityIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: ProviderFetch
}>): readonly string[] {
  const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
  const register = <T extends object>(channel: typeof GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[number], options: Readonly<{
    providerKey: ProviderCredentialKey
    providerId: string
    endpointId: string
    profileId: string
    list: (credential: string, signal: AbortSignal) => Promise<T>
  }>) => input.registerInvoke(channel, async (_event: unknown, payload: unknown) => {
    const observedAtMs = Date.now()
    let timeoutMs: number
    try { timeoutMs = timeout(payload) } catch {
      return Object.freeze({ ok: false, providerKey: options.providerId, endpointId: options.endpointId,
        profileId: options.profileId, observedAtMs, code: 'invalid_payload', message: 'Model availability payload is invalid.' })
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const result = await withCredential({ service: input.credentialService, providerKey: options.providerKey,
        consume: (credential) => options.list(credential, controller.signal) })
      if (result === 'credential_missing') return Object.freeze({ ok: false, providerKey: options.providerId,
        endpointId: options.endpointId, profileId: options.profileId, observedAtMs,
        code: 'credential_missing', message: 'Provider API key is not configured.' })
      if (result === 'store_unavailable') return Object.freeze({ ok: false, providerKey: options.providerId,
        endpointId: options.endpointId, profileId: options.profileId, observedAtMs,
        code: 'store_unavailable', message: 'Provider credential store is unavailable.' })
      return result
    } finally { clearTimeout(timer) }
  })

  register(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[0], { providerKey: 'openai_responses',
    providerId: OPENAI_RESPONSES_PROVIDER_KEY, endpointId: OPENAI_RESPONSES_ENDPOINT_ID, profileId: OPENAI_RESPONSES_PROFILE_ID,
    list: (apiKey, signal) => listOpenAIProviderModelAvailability({ apiKey, fetchImpl, signal }) })
  register(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[1], { providerKey: 'anthropic',
    providerId: ANTHROPIC_MESSAGES_PROVIDER_KEY, endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID, profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
    list: (apiKey, signal) => listAnthropicProviderModelAvailability({ apiKey, fetchImpl, signal }) })
  register(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[2], { providerKey: 'google_ai_studio',
    providerId: GOOGLE_AI_STUDIO_PROVIDER_KEY, endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID, profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
    list: (apiKey, signal) => listGeminiProviderModelAvailability({ apiKey, fetchImpl, signal }) })
  register(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[3], { providerKey: 'deepseek',
    providerId: DEEPSEEK_OFFICIAL_PROVIDER_KEY, endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID, profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
    list: (apiKey, signal) => listDeepSeekProviderModelAvailability({ apiKey, fetchImpl, signal }) })
  input.registerInvoke(GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[4], async (_event: unknown, payload: unknown) => {
    let timeoutMs: number
    try { timeoutMs = timeout(payload) } catch {
      return Object.freeze({ ok: false, code: 'invalid_payload' })
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
    try {
      const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
      const result = await withCredential({ service: input.credentialService, providerKey: 'openrouter', consume: async (apiKey) => {
        let response: Response
        try {
          response = await fetchImpl(profile.operations.chat_completions.modelsUrl, { method: 'GET',
            headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }, redirect: 'error',
            credentials: 'omit', cache: 'no-store', signal: controller.signal })
        } catch { return Object.freeze({ ok: false as const, code: 'network_error' }) }
        const contentLength = response.headers.get('content-length')
        if (!response.ok || contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1)) {
          try { await response.body?.cancel() } catch { /* best effort */ }
          return Object.freeze({ ok: false as const, code: response.status === 401 || response.status === 403 ? 'credential_invalid' : 'http_error' })
        }
        let body: string
        try { body = await response.text() } catch { return Object.freeze({ ok: false as const, code: 'invalid_response' }) }
        if (Buffer.byteLength(body, 'utf8') > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1) return Object.freeze({ ok: false as const, code: 'invalid_response' })
        try {
          const decoded = decodeOpenRouterChatModelsEvidenceV1(JSON.parse(body))
          return Object.freeze({ ok: true as const, responseDigest: decoded.responseDigest,
            items: Object.freeze(decoded.models.map((model) => {
              const slash = model.modelId.indexOf('/')
              return Object.freeze({ modelId: model.modelId, name: slash >= 0 ? model.modelId.slice(slash + 1) : model.modelId,
                vendor: slash >= 0 ? model.modelId.slice(0, slash) : 'openrouter', status: 'visible' as const,
                supportedParameters: Object.freeze([...model.supportedParameters]),
                inputModalities: Object.freeze([...model.inputModalities]), outputModalities: Object.freeze([...model.outputModalities]),
                lastSeenSnapshotId: decoded.responseDigest })
            })) })
        } catch { return Object.freeze({ ok: false as const, code: 'invalid_response' }) }
      } })
      if (result === 'credential_missing' || result === 'store_unavailable') return Object.freeze({ ok: false, code: result })
      return result
    } finally { clearTimeout(timer) }
  })
  return GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS
}
