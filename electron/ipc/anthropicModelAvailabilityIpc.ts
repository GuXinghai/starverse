import type { RegisterInvoke } from './types'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import {
  ANTHROPIC_MESSAGES_ENDPOINT_ID,
  ANTHROPIC_MESSAGES_PROFILE_ID,
  ANTHROPIC_MESSAGES_PROVIDER_KEY,
  listAnthropicProviderModelAvailability,
  type AnthropicModelAvailabilityFailure,
  type AnthropicModelAvailabilityResult,
} from '../../src/next/provider/anthropic/anthropicModelSource'

export const ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS = [
  'anthropic-models:list-availability',
] as const

type RegisterAnthropicModelAvailabilityIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
  fetchImpl?: typeof fetch
}>

type AnthropicModelAvailabilityPayload = Readonly<{
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
  'xapikey',
  'x_api_key',
  'anthropicapikey',
  'anthropic_api_key',
])

function safeFailure(
  code: AnthropicModelAvailabilityFailure['code'],
  message: string,
  observedAtMs = Date.now(),
): AnthropicModelAvailabilityFailure {
  return {
    ok: false,
    providerKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
    endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID,
    profileId: ANTHROPIC_MESSAGES_PROFILE_ID,
    observedAtMs,
    code,
    message,
  }
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function validatePayload(payload: unknown): AnthropicModelAvailabilityPayload | AnthropicModelAvailabilityFailure {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return safeFailure('invalid_payload', 'Anthropic model availability payload is invalid.')
  }

  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const normalized = key.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()
    if (FORBIDDEN_RENDERER_PAYLOAD_KEYS.has(normalized)) {
      return safeFailure('invalid_payload', 'Anthropic model availability payload must not include credentials.')
    }
  }

  return { timeoutMs: record.timeoutMs }
}

function isAnthropicModelAvailabilityFailure(
  value: AnthropicModelAvailabilityPayload | AnthropicModelAvailabilityFailure,
): value is AnthropicModelAvailabilityFailure {
  return (value as { ok?: unknown }).ok === false
}

function readAnthropicApiKey(credentialService: ProviderCredentialService): string | AnthropicModelAvailabilityFailure {
  const result = credentialService.readApiKey('anthropic')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return safeFailure('credential_missing', 'Anthropic API key is not configured.')
  }
  return safeFailure('store_unavailable', 'Anthropic credential store is unavailable.')
}

export function registerAnthropicModelAvailabilityIpc(
  input: RegisterAnthropicModelAvailabilityIpcInput,
): string[] {
  input.registerInvoke('anthropic-models:list-availability', async (_event: unknown, payload: unknown): Promise<AnthropicModelAvailabilityResult> => {
    const validated = validatePayload(payload)
    if (isAnthropicModelAvailabilityFailure(validated)) return validated

    const apiKey = readAnthropicApiKey(input.credentialService)
    if (typeof apiKey !== 'string') return apiKey

    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      return safeFailure('invalid_payload', 'Anthropic model availability bridge is unavailable.')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), normalizeTimeoutMs(validated.timeoutMs))
    try {
      return await listAnthropicProviderModelAvailability({
        apiKey,
        fetchImpl,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  })

  return [...ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS]
}
