import type { RegisterInvoke } from './types'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import {
  OPENAI_RESPONSES_ENDPOINT_ID,
  OPENAI_RESPONSES_PROFILE_ID,
  OPENAI_RESPONSES_PROVIDER_KEY,
  listOpenAIProviderModelAvailability,
  type OpenAIModelAvailabilityFailure,
  type OpenAIModelAvailabilityResult,
} from '../../src/next/provider/openai-responses/openAIResponsesModelSource'

export const OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS = [
  'openai-responses-models:list-availability',
] as const

type RegisterOpenAIResponsesModelAvailabilityIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
  fetchImpl?: typeof fetch
}>

type OpenAIResponsesModelAvailabilityPayload = Readonly<{
  timeoutMs?: unknown
}>

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const FORBIDDEN_RENDERER_PAYLOAD_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'headers',
  'openairesponsesapikey',
  'openai_responses_api_key',
  'openaiapikey',
  'openai_api_key',
])

function safeFailure(
  code: OpenAIModelAvailabilityFailure['code'],
  message: string,
  observedAtMs = Date.now(),
): OpenAIModelAvailabilityFailure {
  return {
    ok: false,
    providerKey: OPENAI_RESPONSES_PROVIDER_KEY,
    endpointId: OPENAI_RESPONSES_ENDPOINT_ID,
    profileId: OPENAI_RESPONSES_PROFILE_ID,
    observedAtMs,
    code,
    message,
  }
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function validatePayload(payload: unknown): OpenAIResponsesModelAvailabilityPayload | OpenAIModelAvailabilityFailure {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return safeFailure('invalid_payload', 'OpenAI Responses model availability payload is invalid.')
  }

  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const normalized = key.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()
    if (FORBIDDEN_RENDERER_PAYLOAD_KEYS.has(normalized)) {
      return safeFailure('invalid_payload', 'OpenAI Responses model availability payload must not include credentials.')
    }
  }

  return { timeoutMs: record.timeoutMs }
}

function isOpenAIResponsesModelAvailabilityFailure(
  value: OpenAIResponsesModelAvailabilityPayload | OpenAIModelAvailabilityFailure,
): value is OpenAIModelAvailabilityFailure {
  return (value as { ok?: unknown }).ok === false
}

function readOpenAIResponsesApiKey(credentialService: ProviderCredentialService): string | OpenAIModelAvailabilityFailure {
  const result = credentialService.readApiKey('openai_responses')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return safeFailure('credential_missing', 'OpenAI Responses API key is not configured.')
  }
  return safeFailure('store_unavailable', 'OpenAI Responses credential store is unavailable.')
}

export function registerOpenAIResponsesModelAvailabilityIpc(
  input: RegisterOpenAIResponsesModelAvailabilityIpcInput,
): string[] {
  input.registerInvoke('openai-responses-models:list-availability', async (_event: unknown, payload: unknown): Promise<OpenAIModelAvailabilityResult> => {
    const validated = validatePayload(payload)
    if (isOpenAIResponsesModelAvailabilityFailure(validated)) return validated

    const apiKey = readOpenAIResponsesApiKey(input.credentialService)
    if (typeof apiKey !== 'string') return apiKey

    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      return safeFailure('invalid_payload', 'OpenAI Responses model availability bridge is unavailable.')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), normalizeTimeoutMs(validated.timeoutMs))
    try {
      return await listOpenAIProviderModelAvailability({
        apiKey,
        fetchImpl,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  })

  return [...OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS]
}
