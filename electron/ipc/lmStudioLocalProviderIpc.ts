import type { RegisterInvoke } from './types'
import { createLocalEndpointDirectFetch } from '../net/localEndpointTransport'

export const LM_STUDIO_RUNTIME_MANAGEMENT_V2_IPC_CHANNELS = [
  'generation-v2:local-runtime:lmstudio:probe',
  'generation-v2:local-runtime:lmstudio:load-model',
  'generation-v2:local-runtime:lmstudio:unload-model',
] as const

export const LM_STUDIO_DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:1234'

export type LMStudioModelSummary = Readonly<{
  key: string
  displayName: string
  type: 'llm' | 'embedding' | 'unknown'
  loaded: boolean
  loadedInstances: readonly string[]
  publisher?: string
  architecture?: string
  quantization?: string
  sizeBytes?: number
  paramsString?: string
  maxContextLength?: number
  format?: string
  capabilities?: Readonly<{
    vision?: boolean
    trainedForToolUse?: boolean
    reasoningDefault?: string
    reasoningOptions?: readonly string[]
  }>
}>

export type LMStudioModelList =
  | Readonly<{
    ok: true
    source: 'lm_studio_api_v1_models' | 'lm_studio_openai_v1_models'
    models: readonly LMStudioModelSummary[]
    modelIds: readonly string[]
    loadedCount: number
    unloadedCount: number
  }>
  | Readonly<{
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }>

export type LMStudioProbeDiagnostics = Readonly<{
  kind: 'lm_studio_local_provider_diagnostics'
  providerKey: 'lm_studio'
  safeBaseUrl: string
  nativeRestAvailable: boolean
  openAICompatibleAvailable: boolean
  nativeRest: LMStudioModelList
  openAICompatible: LMStudioModelList
  selectedModelLoaded?: boolean
  selectedModelLoadedInstances?: readonly string[]
  warnings: readonly string[]
  message: string
}>

export type LMStudioProbeResult =
  | Readonly<{ ok: true; diagnostics: LMStudioProbeDiagnostics }>
  | Readonly<{
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }>

export type LMStudioControlResult =
  | Readonly<{
    ok: true
    operation: 'load' | 'unload'
    model?: string
    instanceId: string
    status?: 'loaded'
    type?: 'llm' | 'embedding' | 'unknown'
    loadTimeSeconds?: number
    warnings: readonly string[]
  }>
  | Readonly<{
    ok: false
    code:
      | 'invalid_payload'
      | 'invalid_url'
      | 'remote_host_rejected'
      | 'embedded_credentials_rejected'
      | 'controls_disabled'
      | 'timeout'
      | 'network_error'
      | 'http_error'
      | 'invalid_response'
    message: string
    safeUrl?: string
  }>

type RegisterLMStudioRuntimeManagementV2IpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  fetchImpl?: typeof fetch
}>

type ValidatedEndpointUrl =
  | Readonly<{ ok: true; url: URL; safeBaseUrl: string }>
  | Readonly<{
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }>

type JsonFetchResult =
  | Readonly<{ ok: true; payload: unknown }>
  | Readonly<{ ok: false; code: 'timeout' | 'network_error' | 'http_error' | 'invalid_response'; status?: number }>

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function safeEndpointFailure(
  code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected',
  safeUrl?: string,
): Exclude<ValidatedEndpointUrl, Readonly<{ ok: true }>> {
  const messages = {
    invalid_url: 'LM Studio endpoint URL is invalid.',
    remote_host_rejected: 'LM Studio endpoint must be localhost, 127.0.0.1, or [::1].',
    embedded_credentials_rejected: 'LM Studio endpoint URL must not include embedded credentials.',
  } as const
  return {
    ok: false,
    code,
    message: messages[code],
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function safeControlFailure(
  code: Exclude<LMStudioControlResult, Readonly<{ ok: true }>>['code'],
  safeUrl?: string,
): Exclude<LMStudioControlResult, Readonly<{ ok: true }>> {
  const messages: Record<Exclude<LMStudioControlResult, Readonly<{ ok: true }>>['code'], string> = {
    invalid_payload: 'LM Studio control payload is invalid.',
    invalid_url: 'LM Studio endpoint URL is invalid.',
    remote_host_rejected: 'LM Studio endpoint must be localhost, 127.0.0.1, or [::1].',
    embedded_credentials_rejected: 'LM Studio endpoint URL must not include embedded credentials.',
    controls_disabled: 'LM Studio manual load/unload controls are disabled.',
    timeout: 'LM Studio control request timed out.',
    network_error: 'LM Studio control request could not reach the service.',
    http_error: 'LM Studio control request returned an HTTP error.',
    invalid_response: 'LM Studio control request returned an unsupported response.',
  }
  return {
    ok: false,
    code,
    message: messages[code],
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function safeModelListFailure(code: Exclude<LMStudioModelList, Readonly<{ ok: true }>>['code']): LMStudioModelList {
  const messages: Record<Exclude<LMStudioModelList, Readonly<{ ok: true }>>['code'], string> = {
    unavailable: 'LM Studio model list is unavailable.',
    http_error: 'LM Studio model list returned an HTTP error.',
    invalid_response: 'LM Studio model list response was not recognized.',
    timeout: 'LM Studio model list probe timed out.',
    network_error: 'LM Studio model list probe could not reach the service.',
  }
  return { ok: false, code, message: messages[code] }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]'
}

function toSafeBaseUrl(url: URL): string {
  const safe = new URL(url.toString())
  safe.username = ''
  safe.password = ''
  safe.search = ''
  safe.hash = ''
  safe.pathname = '/'
  const text = safe.toString()
  return text.endsWith('/') ? text.slice(0, -1) : text
}

export function validateLMStudioEndpointUrl(raw: unknown): ValidatedEndpointUrl {
  const value = String(raw ?? '').trim() || LM_STUDIO_DEFAULT_ENDPOINT_URL
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return safeEndpointFailure('invalid_url')
  }

  const safeUrl = toSafeBaseUrl(url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return safeEndpointFailure('invalid_url', safeUrl)
  }
  if (url.username || url.password) {
    return safeEndpointFailure('embedded_credentials_rejected', safeUrl)
  }
  if (!isLoopbackHost(url.hostname)) {
    return safeEndpointFailure('remote_host_rejected', safeUrl)
  }

  return { ok: true, url, safeBaseUrl: safeUrl }
}

function lmStudioUrl(base: URL, pathname: '/api/v1/models' | '/api/v1/models/load' | '/api/v1/models/unload' | '/v1/models'): string {
  const url = new URL(base.toString())
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = pathname
  return url.toString()
}

async function fetchJson(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<JsonFetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, code: 'http_error', status: response.status }
    try {
      return { ok: true, payload: await response.json() }
    } catch {
      return { ok: false, code: 'invalid_response' }
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return { ok: false, code: 'timeout' }
    return { ok: false, code: 'network_error' }
  } finally {
    clearTimeout(timer)
  }
}

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown, timeoutMs: number): Promise<JsonFetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, code: 'http_error', status: response.status }
    try {
      return { ok: true, payload: await response.json() }
    } catch {
      return { ok: false, code: 'invalid_response' }
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') return { ok: false, code: 'timeout' }
    return { ok: false, code: 'network_error' }
  } finally {
    clearTimeout(timer)
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? '').trim()
  return text ? text : undefined
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseNativeModel(item: unknown): LMStudioModelSummary | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, any>
  const key = stringOrUndefined(record.key)
  if (!key) return null
  const loadedInstancesRaw = Array.isArray(record.loaded_instances) ? record.loaded_instances : []
  const loadedInstances = loadedInstancesRaw
    .map((instance) => stringOrUndefined((instance as Record<string, unknown> | null)?.id))
    .filter((value): value is string => !!value)
  const capabilities = record.capabilities && typeof record.capabilities === 'object'
    ? record.capabilities as Record<string, any>
    : null
  const reasoning = capabilities?.reasoning && typeof capabilities.reasoning === 'object'
    ? capabilities.reasoning as Record<string, any>
    : null
  const quantization = record.quantization && typeof record.quantization === 'object'
    ? stringOrUndefined((record.quantization as Record<string, unknown>).name)
    : undefined
  const type = record.type === 'llm' || record.type === 'embedding' ? record.type : 'unknown'

  return {
    key,
    displayName: stringOrUndefined(record.display_name) ?? key,
    type,
    loaded: loadedInstances.length > 0,
    loadedInstances,
    ...(stringOrUndefined(record.publisher) ? { publisher: stringOrUndefined(record.publisher) } : {}),
    ...(stringOrUndefined(record.architecture) ? { architecture: stringOrUndefined(record.architecture) } : {}),
    ...(quantization ? { quantization } : {}),
    ...(numberOrUndefined(record.size_bytes) ? { sizeBytes: numberOrUndefined(record.size_bytes) } : {}),
    ...(stringOrUndefined(record.params_string) ? { paramsString: stringOrUndefined(record.params_string) } : {}),
    ...(numberOrUndefined(record.max_context_length) ? { maxContextLength: numberOrUndefined(record.max_context_length) } : {}),
    ...(stringOrUndefined(record.format) ? { format: stringOrUndefined(record.format) } : {}),
    ...(capabilities ? {
      capabilities: {
        ...(typeof capabilities.vision === 'boolean' ? { vision: capabilities.vision } : {}),
        ...(typeof capabilities.trained_for_tool_use === 'boolean' ? { trainedForToolUse: capabilities.trained_for_tool_use } : {}),
        ...(stringOrUndefined(reasoning?.default) ? { reasoningDefault: stringOrUndefined(reasoning?.default) } : {}),
        ...(Array.isArray(reasoning?.allowed_options) ? { reasoningOptions: reasoning.allowed_options.map(String) } : {}),
      },
    } : {}),
  }
}

export function parseLMStudioNativeModelsResponse(payload: unknown): LMStudioModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).models)) {
    return safeModelListFailure('invalid_response')
  }
  const rawModels = (payload as { models: unknown[] }).models
  const models: LMStudioModelSummary[] = rawModels
    .map(parseNativeModel)
    .filter((model: LMStudioModelSummary | null): model is LMStudioModelSummary => !!model)
  if (models.length === 0 && rawModels.length > 0) return safeModelListFailure('invalid_response')
  const loadedCount = models.filter((model) => model.loaded).length
  return {
    ok: true,
    source: 'lm_studio_api_v1_models',
    models,
    modelIds: models.map((model) => model.key),
    loadedCount,
    unloadedCount: models.length - loadedCount,
  }
}

export function parseLMStudioOpenAIModelsResponse(payload: unknown): LMStudioModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).data)) {
    return safeModelListFailure('invalid_response')
  }
  const rawModels = (payload as { data: unknown[] }).data
  const models: LMStudioModelSummary[] = rawModels
    .map((item: unknown): LMStudioModelSummary | null => {
      const id = stringOrUndefined((item as Record<string, unknown> | null)?.id)
      if (!id) return null
      return {
        key: id,
        displayName: id,
        type: 'unknown',
        loaded: false,
        loadedInstances: [],
      }
    })
    .filter((model: LMStudioModelSummary | null): model is LMStudioModelSummary => !!model)
  if (models.length === 0 && rawModels.length > 0) return safeModelListFailure('invalid_response')
  return {
    ok: true,
    source: 'lm_studio_openai_v1_models',
    models,
    modelIds: models.map((model) => model.key),
    loadedCount: 0,
    unloadedCount: models.length,
  }
}

async function fetchNativeModels(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<LMStudioModelList> {
  const result = await fetchJson(fetchImpl, lmStudioUrl(endpoint, '/api/v1/models'), timeoutMs)
  if (!result.ok) return safeModelListFailure(result.code)
  return parseLMStudioNativeModelsResponse(result.payload)
}

async function fetchOpenAIModels(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<LMStudioModelList> {
  const result = await fetchJson(fetchImpl, lmStudioUrl(endpoint, '/v1/models'), timeoutMs)
  if (!result.ok) return safeModelListFailure(result.code)
  return parseLMStudioOpenAIModelsResponse(result.payload)
}

export async function probeLMStudioLocalProvider(
  payload: Readonly<{ endpointUrl?: unknown; selectedModel?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<LMStudioProbeResult> {
  const endpoint = validateLMStudioEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return endpoint

  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') {
    return {
      ok: true,
      diagnostics: {
        kind: 'lm_studio_local_provider_diagnostics',
        providerKey: 'lm_studio',
        safeBaseUrl: endpoint.safeBaseUrl,
        nativeRestAvailable: false,
        openAICompatibleAvailable: false,
        nativeRest: safeModelListFailure('network_error'),
        openAICompatible: safeModelListFailure('network_error'),
        warnings: ['LM Studio probe bridge has no fetch implementation.'],
        message: 'LM Studio provider probe could not reach the service.',
      },
    }
  }

  const timeoutMs = normalizeTimeoutMs(payload.timeoutMs)
  const [nativeRest, openAICompatible] = await Promise.all([
    fetchNativeModels(fetchImpl, endpoint.url, timeoutMs),
    fetchOpenAIModels(fetchImpl, endpoint.url, timeoutMs),
  ])
  const selectedModel = String(payload.selectedModel ?? '').trim()
  const selectedNativeModel = nativeRest.ok && selectedModel
    ? nativeRest.models.find((model) => model.key === selectedModel || model.loadedInstances.includes(selectedModel))
    : undefined
  const warnings = [
    ...(!nativeRest.ok ? ['Native REST /api/v1/models is unavailable or unsupported.'] : []),
    ...(!openAICompatible.ok ? ['OpenAI-compatible /v1/models is unavailable or unsupported.'] : []),
  ]

  return {
    ok: true,
    diagnostics: {
      kind: 'lm_studio_local_provider_diagnostics',
      providerKey: 'lm_studio',
      safeBaseUrl: endpoint.safeBaseUrl,
      nativeRestAvailable: nativeRest.ok,
      openAICompatibleAvailable: openAICompatible.ok,
      nativeRest,
      openAICompatible,
      ...(selectedNativeModel ? {
        selectedModelLoaded: selectedNativeModel.loaded,
        selectedModelLoadedInstances: selectedNativeModel.loadedInstances,
      } : {}),
      warnings,
      message: nativeRest.ok || openAICompatible.ok
        ? 'LM Studio endpoint probe completed.'
        : 'LM Studio endpoint is unavailable or did not expose recognized model APIs.',
    },
  }
}

async function loadLMStudioModelInternal(input: Readonly<{
  fetchImpl: typeof fetch
  endpoint: URL
  model: string
  timeoutMs: number
}>): Promise<LMStudioControlResult> {
  const result = await postJson(input.fetchImpl, lmStudioUrl(input.endpoint, '/api/v1/models/load'), {
    model: input.model,
    echo_load_config: true,
  }, input.timeoutMs)
  if (!result.ok) return safeControlFailure(result.code)
  const payload = result.payload && typeof result.payload === 'object'
    ? result.payload as Record<string, unknown>
    : null
  const instanceId = stringOrUndefined(payload?.instance_id)
  if (!payload || !instanceId) return safeControlFailure('invalid_response')
  const typeRaw = payload.type
  const type = typeRaw === 'llm' || typeRaw === 'embedding' ? typeRaw : 'unknown'
  return {
    ok: true,
    operation: 'load',
    model: input.model,
    instanceId,
    status: payload.status === 'loaded' ? 'loaded' : undefined,
    type,
    ...(numberOrUndefined(payload.load_time_seconds) ? { loadTimeSeconds: numberOrUndefined(payload.load_time_seconds) } : {}),
    warnings: [],
  }
}

async function unloadLMStudioModelInternal(input: Readonly<{
  fetchImpl: typeof fetch
  endpoint: URL
  instanceId: string
  timeoutMs: number
}>): Promise<LMStudioControlResult> {
  const result = await postJson(input.fetchImpl, lmStudioUrl(input.endpoint, '/api/v1/models/unload'), {
    instance_id: input.instanceId,
  }, input.timeoutMs)
  if (!result.ok) return safeControlFailure(result.code)
  const payload = result.payload && typeof result.payload === 'object'
    ? result.payload as Record<string, unknown>
    : null
  const instanceId = stringOrUndefined(payload?.instance_id)
  if (!payload || !instanceId) return safeControlFailure('invalid_response')
  return {
    ok: true,
    operation: 'unload',
    instanceId,
    warnings: [],
  }
}

export async function loadLMStudioModel(
  payload: Readonly<{ endpointUrl?: unknown; model?: unknown; manualLoadUnloadEnabled?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<LMStudioControlResult> {
  if (payload.manualLoadUnloadEnabled === false) return safeControlFailure('controls_disabled')
  const endpoint = validateLMStudioEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return safeControlFailure(endpoint.code, endpoint.safeUrl)
  const model = String(payload.model ?? '').trim()
  if (!model) return safeControlFailure('invalid_payload', endpoint.safeBaseUrl)
  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return loadLMStudioModelInternal({
    fetchImpl,
    endpoint: endpoint.url,
    model,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

export async function unloadLMStudioModel(
  payload: Readonly<{ endpointUrl?: unknown; instanceId?: unknown; manualLoadUnloadEnabled?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<LMStudioControlResult> {
  if (payload.manualLoadUnloadEnabled === false) return safeControlFailure('controls_disabled')
  const endpoint = validateLMStudioEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return safeControlFailure(endpoint.code, endpoint.safeUrl)
  const instanceId = String(payload.instanceId ?? '').trim()
  if (!instanceId) return safeControlFailure('invalid_payload', endpoint.safeBaseUrl)
  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return unloadLMStudioModelInternal({
    fetchImpl,
    endpoint: endpoint.url,
    instanceId,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

export function registerLMStudioRuntimeManagementV2Ipc(
  input: RegisterLMStudioRuntimeManagementV2IpcInput,
): string[] {
  input.registerInvoke('generation-v2:local-runtime:lmstudio:probe', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return probeLMStudioLocalProvider(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('generation-v2:local-runtime:lmstudio:load-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return loadLMStudioModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('generation-v2:local-runtime:lmstudio:unload-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return unloadLMStudioModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  return [...LM_STUDIO_RUNTIME_MANAGEMENT_V2_IPC_CHANNELS]
}
