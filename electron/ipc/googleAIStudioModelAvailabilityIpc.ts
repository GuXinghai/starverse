import type { RegisterInvoke } from './types'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import {
  GOOGLE_AI_STUDIO_ENDPOINT_ID,
  GOOGLE_AI_STUDIO_PROFILE_ID,
  GOOGLE_AI_STUDIO_PROVIDER_KEY,
  listGeminiProviderModelAvailability,
  type GeminiModelAvailabilityFailure,
  type GeminiModelAvailabilityResult,
} from '../../src/next/provider/gemini/geminiModelSource'

export const GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS = [
  'google-ai-studio-models:list-availability',
] as const

type RegisterGoogleAIStudioModelAvailabilityIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
  fetchImpl?: ProviderFetch
}>

type GoogleAIStudioModelAvailabilityPayload = Readonly<{
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
  'googleaistudioapikey',
  'google_ai_studio_api_key',
  'geminiapikey',
  'gemini_api_key',
])

function safeFailure(
  code: GeminiModelAvailabilityFailure['code'],
  message: string,
  observedAtMs = Date.now(),
): GeminiModelAvailabilityFailure {
  return {
    ok: false,
    providerKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
    endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID,
    profileId: GOOGLE_AI_STUDIO_PROFILE_ID,
    observedAtMs,
    code,
    message,
  }
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function validatePayload(payload: unknown): GoogleAIStudioModelAvailabilityPayload | GeminiModelAvailabilityFailure {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return safeFailure('invalid_payload', 'Google AI Studio model availability payload is invalid.')
  }

  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const normalized = key.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()
    if (FORBIDDEN_RENDERER_PAYLOAD_KEYS.has(normalized)) {
      return safeFailure('invalid_payload', 'Google AI Studio model availability payload must not include credentials.')
    }
  }

  return { timeoutMs: record.timeoutMs }
}

function isGoogleAIStudioModelAvailabilityFailure(
  value: GoogleAIStudioModelAvailabilityPayload | GeminiModelAvailabilityFailure,
): value is GeminiModelAvailabilityFailure {
  return (value as { ok?: unknown }).ok === false
}

function readGoogleAIStudioApiKey(credentialService: ProviderCredentialService): string | GeminiModelAvailabilityFailure {
  const result = credentialService.readApiKey('google_ai_studio')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return safeFailure('credential_missing', 'Google AI Studio API key is not configured.')
  }
  return safeFailure('store_unavailable', 'Google AI Studio credential store is unavailable.')
}

export function registerGoogleAIStudioModelAvailabilityIpc(
  input: RegisterGoogleAIStudioModelAvailabilityIpcInput,
): string[] {
  input.registerInvoke('google-ai-studio-models:list-availability', async (_event: unknown, payload: unknown): Promise<GeminiModelAvailabilityResult> => {
    const validated = validatePayload(payload)
    if (isGoogleAIStudioModelAvailabilityFailure(validated)) return validated

    const apiKey = readGoogleAIStudioApiKey(input.credentialService)
    if (typeof apiKey !== 'string') return apiKey

    const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
    if (typeof fetchImpl !== 'function') {
      return safeFailure('invalid_payload', 'Google AI Studio model availability bridge is unavailable.')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), normalizeTimeoutMs(validated.timeoutMs))
    try {
      return await listGeminiProviderModelAvailability({
        apiKey,
        fetchImpl,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  })

  return [...GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS]
}
