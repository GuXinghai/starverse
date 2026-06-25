import type Store from 'electron-store'
import type { RegisterInvoke } from './types'
import { DEEPSEEK_API_KEY_STORE_KEY } from './deepSeekCredentialSettingsIpc'
import {
  DEEPSEEK_OFFICIAL_ENDPOINT_ID,
  DEEPSEEK_OFFICIAL_PROFILE_ID,
  DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  listDeepSeekProviderModelAvailability,
  type DeepSeekModelAvailabilityFailure,
  type DeepSeekModelAvailabilityResult,
} from '../../src/next/provider/deepseek/deepSeekModelSource'

export const DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS = [
  'deepseek-models:list-availability',
] as const

type RegisterDeepSeekModelAvailabilityIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  fetchImpl?: typeof fetch
}>

type DeepSeekModelAvailabilityPayload = Readonly<{
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
  'deepseekapikey',
  'deep_seek_api_key',
])

function safeFailure(
  code: DeepSeekModelAvailabilityFailure['code'],
  message: string,
  observedAtMs = Date.now(),
): DeepSeekModelAvailabilityFailure {
  return {
    ok: false,
    providerKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
    endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID,
    profileId: DEEPSEEK_OFFICIAL_PROFILE_ID,
    observedAtMs,
    code,
    message,
  }
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function validatePayload(payload: unknown): DeepSeekModelAvailabilityPayload | DeepSeekModelAvailabilityFailure {
  if (payload === undefined || payload === null) return {}
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return safeFailure('invalid_payload', 'DeepSeek model availability payload is invalid.')
  }

  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const normalized = key.replace(/[^A-Za-z0-9_]/g, '').toLowerCase()
    if (FORBIDDEN_RENDERER_PAYLOAD_KEYS.has(normalized)) {
      return safeFailure('invalid_payload', 'DeepSeek model availability payload must not include credentials.')
    }
  }

  return { timeoutMs: record.timeoutMs }
}

function isDeepSeekModelAvailabilityFailure(
  value: DeepSeekModelAvailabilityPayload | DeepSeekModelAvailabilityFailure,
): value is DeepSeekModelAvailabilityFailure {
  return (value as { ok?: unknown }).ok === false
}

function readDeepSeekApiKey(store: Store): string | DeepSeekModelAvailabilityFailure {
  try {
    const apiKey = String(store.get(DEEPSEEK_API_KEY_STORE_KEY) ?? '').trim()
    if (!apiKey) {
      return safeFailure('credential_missing', 'DeepSeek API key is not configured.')
    }
    return apiKey
  } catch {
    return safeFailure('store_unavailable', 'DeepSeek credential store is unavailable.')
  }
}

export function registerDeepSeekModelAvailabilityIpc(
  input: RegisterDeepSeekModelAvailabilityIpcInput,
): string[] {
  input.registerInvoke('deepseek-models:list-availability', async (_event: unknown, payload: unknown): Promise<DeepSeekModelAvailabilityResult> => {
    const validated = validatePayload(payload)
    if (isDeepSeekModelAvailabilityFailure(validated)) return validated

    const apiKey = readDeepSeekApiKey(input.store)
    if (typeof apiKey !== 'string') return apiKey

    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      return safeFailure('invalid_payload', 'DeepSeek model availability bridge is unavailable.')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), normalizeTimeoutMs(validated.timeoutMs))
    try {
      return await listDeepSeekProviderModelAvailability({
        apiKey,
        fetchImpl,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  })

  return [...DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS]
}
