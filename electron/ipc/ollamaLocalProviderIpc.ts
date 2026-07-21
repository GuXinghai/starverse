import type { RegisterInvoke } from './types'
import { createLocalEndpointDirectFetch } from '../net/localEndpointTransport'

export const OLLAMA_RUNTIME_MANAGEMENT_V2_IPC_CHANNELS = [
  'generation-v2:local-runtime:ollama:probe',
  'generation-v2:local-runtime:ollama:load-model',
  'generation-v2:local-runtime:ollama:unload-model',
] as const

export const OLLAMA_DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:11434'

export type OllamaModelSummary = Readonly<{
  key: string
  displayName: string
  running: boolean
  digest?: string
  sizeBytes?: number
  sizeVramBytes?: number
  expiresAt?: string
  details?: Readonly<{
    format?: string
    family?: string
    families?: readonly string[]
    parameterSize?: string
    quantizationLevel?: string
  }>
}>

export type OllamaModelList =
  | Readonly<{
    ok: true
    source: 'ollama_api_tags' | 'ollama_api_ps' | 'ollama_openai_v1_models'
    models: readonly OllamaModelSummary[]
    modelIds: readonly string[]
    count: number
  }>
  | Readonly<{
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }>

export type OllamaVersionProbe =
  | Readonly<{ ok: true; version: string }>
  | Readonly<{
    ok: false
    code: 'unavailable' | 'http_error' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }>

export type OllamaProbeDiagnostics = Readonly<{
  kind: 'ollama_local_provider_diagnostics'
  providerKey: 'ollama_local'
  safeBaseUrl: string
  nativeRestAvailable: boolean
  openAICompatibleAvailable: boolean
  localModels: OllamaModelList
  runningModels: OllamaModelList
  version: OllamaVersionProbe
  openAICompatible: OllamaModelList
  selectedModelKnown?: boolean
  selectedModelRunning?: boolean
  warnings: readonly string[]
  message: string
}>

export type OllamaProbeResult =
  | Readonly<{ ok: true; diagnostics: OllamaProbeDiagnostics }>
  | Readonly<{
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }>

export type OllamaControlResult =
  | Readonly<{
    ok: true
    operation: 'load' | 'unload'
    model: string
    status: 'loaded' | 'unloaded'
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

type RegisterOllamaRuntimeManagementV2IpcInput = Readonly<{
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

type ModelRunningState =
  | Readonly<{ ok: true; known: true; running: boolean }>
  | Readonly<{ ok: true; known: false }>
  | Readonly<{ ok: false; code: 'timeout' | 'network_error' | 'http_error' | 'invalid_response'; message: string }>

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
    invalid_url: 'Ollama endpoint URL is invalid.',
    remote_host_rejected: 'Ollama endpoint must be localhost, 127.0.0.1, or [::1].',
    embedded_credentials_rejected: 'Ollama endpoint URL must not include embedded credentials.',
  } as const
  return {
    ok: false,
    code,
    message: messages[code],
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function safeControlFailure(
  code: Exclude<OllamaControlResult, Readonly<{ ok: true }>>['code'],
  safeUrl?: string,
): Exclude<OllamaControlResult, Readonly<{ ok: true }>> {
  const messages: Record<Exclude<OllamaControlResult, Readonly<{ ok: true }>>['code'], string> = {
    invalid_payload: 'Ollama control payload is invalid.',
    invalid_url: 'Ollama endpoint URL is invalid.',
    remote_host_rejected: 'Ollama endpoint must be localhost, 127.0.0.1, or [::1].',
    embedded_credentials_rejected: 'Ollama endpoint URL must not include embedded credentials.',
    controls_disabled: 'Ollama manual load/unload controls are disabled.',
    timeout: 'Ollama control request timed out.',
    network_error: 'Ollama control request could not reach the service.',
    http_error: 'Ollama control request returned an HTTP error.',
    invalid_response: 'Ollama control request returned an unsupported response.',
  }
  return {
    ok: false,
    code,
    message: messages[code],
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function safeModelListFailure(code: Exclude<OllamaModelList, Readonly<{ ok: true }>>['code']): OllamaModelList {
  const messages: Record<Exclude<OllamaModelList, Readonly<{ ok: true }>>['code'], string> = {
    unavailable: 'Ollama model list is unavailable.',
    http_error: 'Ollama model list returned an HTTP error.',
    invalid_response: 'Ollama model list response was not recognized.',
    timeout: 'Ollama model list probe timed out.',
    network_error: 'Ollama model list probe could not reach the service.',
  }
  return { ok: false, code, message: messages[code] }
}

function safeVersionFailure(code: Exclude<OllamaVersionProbe, Readonly<{ ok: true }>>['code']): OllamaVersionProbe {
  const messages: Record<Exclude<OllamaVersionProbe, Readonly<{ ok: true }>>['code'], string> = {
    unavailable: 'Ollama version probe is unavailable.',
    http_error: 'Ollama version probe returned an HTTP error.',
    invalid_response: 'Ollama version response was not recognized.',
    timeout: 'Ollama version probe timed out.',
    network_error: 'Ollama version probe could not reach the service.',
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

export function validateOllamaEndpointUrl(raw: unknown): ValidatedEndpointUrl {
  const value = String(raw ?? '').trim() || OLLAMA_DEFAULT_ENDPOINT_URL
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

function ollamaUrl(base: URL, pathname: '/api/tags' | '/api/ps' | '/api/version' | '/api/chat' | '/v1/models'): string {
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

function parseDetails(value: unknown): OllamaModelSummary['details'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const details = {
    ...(stringOrUndefined(record.format) ? { format: stringOrUndefined(record.format) } : {}),
    ...(stringOrUndefined(record.family) ? { family: stringOrUndefined(record.family) } : {}),
    ...(Array.isArray(record.families) ? { families: record.families.map(String) } : {}),
    ...(stringOrUndefined(record.parameter_size) ? { parameterSize: stringOrUndefined(record.parameter_size) } : {}),
    ...(stringOrUndefined(record.quantization_level) ? { quantizationLevel: stringOrUndefined(record.quantization_level) } : {}),
  }
  return Object.keys(details).length > 0 ? details : undefined
}

function parseOllamaModel(item: unknown, running: boolean): OllamaModelSummary | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const key = stringOrUndefined(record.name) ?? stringOrUndefined(record.model)
  if (!key) return null
  return {
    key,
    displayName: stringOrUndefined(record.model) ?? key,
    running,
    ...(stringOrUndefined(record.digest) ? { digest: stringOrUndefined(record.digest) } : {}),
    ...(numberOrUndefined(record.size) ? { sizeBytes: numberOrUndefined(record.size) } : {}),
    ...(numberOrUndefined(record.size_vram) ? { sizeVramBytes: numberOrUndefined(record.size_vram) } : {}),
    ...(stringOrUndefined(record.expires_at) ? { expiresAt: stringOrUndefined(record.expires_at) } : {}),
    ...(parseDetails(record.details) ? { details: parseDetails(record.details) } : {}),
  }
}

export function parseOllamaTagsResponse(payload: unknown): OllamaModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).models)) {
    return safeModelListFailure('invalid_response')
  }
  const rawModels = (payload as { models: unknown[] }).models
  const models = rawModels
    .map((item) => parseOllamaModel(item, false))
    .filter((model: OllamaModelSummary | null): model is OllamaModelSummary => !!model)
  if (models.length === 0 && rawModels.length > 0) return safeModelListFailure('invalid_response')
  return {
    ok: true,
    source: 'ollama_api_tags',
    models,
    modelIds: models.map((model) => model.key),
    count: models.length,
  }
}

export function parseOllamaPsResponse(payload: unknown): OllamaModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).models)) {
    return safeModelListFailure('invalid_response')
  }
  const rawModels = (payload as { models: unknown[] }).models
  const models = rawModels
    .map((item) => parseOllamaModel(item, true))
    .filter((model: OllamaModelSummary | null): model is OllamaModelSummary => !!model)
  if (models.length === 0 && rawModels.length > 0) return safeModelListFailure('invalid_response')
  return {
    ok: true,
    source: 'ollama_api_ps',
    models,
    modelIds: models.map((model) => model.key),
    count: models.length,
  }
}

export function parseOllamaOpenAIModelsResponse(payload: unknown): OllamaModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).data)) {
    return safeModelListFailure('invalid_response')
  }
  const rawModels = (payload as { data: unknown[] }).data
  const models = rawModels
    .map((item: unknown): OllamaModelSummary | null => {
      const id = stringOrUndefined((item as Record<string, unknown> | null)?.id)
      if (!id) return null
      return {
        key: id,
        displayName: id,
        running: false,
      }
    })
    .filter((model: OllamaModelSummary | null): model is OllamaModelSummary => !!model)
  if (models.length === 0 && rawModels.length > 0) return safeModelListFailure('invalid_response')
  return {
    ok: true,
    source: 'ollama_openai_v1_models',
    models,
    modelIds: models.map((model) => model.key),
    count: models.length,
  }
}

export function parseOllamaVersionResponse(payload: unknown): OllamaVersionProbe {
  const version = stringOrUndefined((payload as Record<string, unknown> | null)?.version)
  if (!version) return safeVersionFailure('invalid_response')
  return { ok: true, version }
}

async function fetchLocalModels(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<OllamaModelList> {
  const result = await fetchJson(fetchImpl, ollamaUrl(endpoint, '/api/tags'), timeoutMs)
  if (!result.ok) return safeModelListFailure(result.code)
  return parseOllamaTagsResponse(result.payload)
}

async function fetchRunningModels(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<OllamaModelList> {
  const result = await fetchJson(fetchImpl, ollamaUrl(endpoint, '/api/ps'), timeoutMs)
  if (!result.ok) return safeModelListFailure(result.code)
  return parseOllamaPsResponse(result.payload)
}

async function fetchVersion(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<OllamaVersionProbe> {
  const result = await fetchJson(fetchImpl, ollamaUrl(endpoint, '/api/version'), timeoutMs)
  if (!result.ok) return safeVersionFailure(result.code)
  return parseOllamaVersionResponse(result.payload)
}

async function fetchOpenAIModels(fetchImpl: typeof fetch, endpoint: URL, timeoutMs: number): Promise<OllamaModelList> {
  const result = await fetchJson(fetchImpl, ollamaUrl(endpoint, '/v1/models'), timeoutMs)
  if (!result.ok) return safeModelListFailure(result.code)
  return parseOllamaOpenAIModelsResponse(result.payload)
}

export async function probeOllamaLocalProvider(
  payload: Readonly<{ endpointUrl?: unknown; selectedModel?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<OllamaProbeResult> {
  const endpoint = validateOllamaEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return endpoint

  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') {
    return {
      ok: true,
      diagnostics: {
        kind: 'ollama_local_provider_diagnostics',
        providerKey: 'ollama_local',
        safeBaseUrl: endpoint.safeBaseUrl,
        nativeRestAvailable: false,
        openAICompatibleAvailable: false,
        localModels: safeModelListFailure('network_error'),
        runningModels: safeModelListFailure('network_error'),
        version: safeVersionFailure('network_error'),
        openAICompatible: safeModelListFailure('network_error'),
        warnings: ['Ollama probe bridge has no fetch implementation.'],
        message: 'Ollama provider probe could not reach the service.',
      },
    }
  }

  const timeoutMs = normalizeTimeoutMs(payload.timeoutMs)
  const [localModels, runningModels, version, openAICompatible] = await Promise.all([
    fetchLocalModels(fetchImpl, endpoint.url, timeoutMs),
    fetchRunningModels(fetchImpl, endpoint.url, timeoutMs),
    fetchVersion(fetchImpl, endpoint.url, timeoutMs),
    fetchOpenAIModels(fetchImpl, endpoint.url, timeoutMs),
  ])
  const nativeRestAvailable = localModels.ok || runningModels.ok || version.ok
  const selectedModel = String(payload.selectedModel ?? '').trim()
  const selectedKnown = selectedModel
    ? (localModels.ok && localModels.modelIds.includes(selectedModel)) ||
      (openAICompatible.ok && openAICompatible.modelIds.includes(selectedModel)) ||
      (runningModels.ok && runningModels.modelIds.includes(selectedModel))
    : undefined
  const selectedRunning = selectedModel && runningModels.ok
    ? runningModels.modelIds.includes(selectedModel)
    : undefined
  const warnings = [
    ...(!localModels.ok ? ['Native REST /api/tags is unavailable or unsupported.'] : []),
    ...(!runningModels.ok ? ['Native REST /api/ps is unavailable or unsupported.'] : []),
    ...(!version.ok ? ['Native REST /api/version is unavailable or unsupported.'] : []),
    ...(!openAICompatible.ok ? ['OpenAI-compatible /v1/models is unavailable or unsupported.'] : []),
  ]

  return {
    ok: true,
    diagnostics: {
      kind: 'ollama_local_provider_diagnostics',
      providerKey: 'ollama_local',
      safeBaseUrl: endpoint.safeBaseUrl,
      nativeRestAvailable,
      openAICompatibleAvailable: openAICompatible.ok,
      localModels,
      runningModels,
      version,
      openAICompatible,
      ...(typeof selectedKnown === 'boolean' ? { selectedModelKnown: selectedKnown } : {}),
      ...(typeof selectedRunning === 'boolean' ? { selectedModelRunning: selectedRunning } : {}),
      warnings,
      message: nativeRestAvailable || openAICompatible.ok
        ? 'Ollama endpoint probe completed.'
        : 'Ollama endpoint is unavailable or did not expose recognized APIs.',
    },
  }
}

async function resolveModelRunningState(
  fetchImpl: typeof fetch,
  endpoint: URL,
  modelId: string,
  timeoutMs: number,
): Promise<ModelRunningState> {
  const list = await fetchRunningModels(fetchImpl, endpoint, timeoutMs)
  if (!list.ok) {
    const code = list.code === 'unavailable' ? 'network_error' : list.code
    return { ok: false, code, message: list.message }
  }
  const running = list.modelIds.includes(modelId)
  if (running) return { ok: true, known: true, running: true }

  const localModels = await fetchLocalModels(fetchImpl, endpoint, timeoutMs)
  if (!localModels.ok) return { ok: true, known: false }
  return localModels.modelIds.includes(modelId)
    ? { ok: true, known: true, running: false }
    : { ok: true, known: false }
}

async function chatControlInternal(input: Readonly<{
  fetchImpl: typeof fetch
  endpoint: URL
  operation: 'load' | 'unload'
  model: string
  timeoutMs: number
}>): Promise<OllamaControlResult> {
  const result = await postJson(input.fetchImpl, ollamaUrl(input.endpoint, '/api/chat'), {
    model: input.model,
    messages: [],
    stream: false,
    ...(input.operation === 'unload' ? { keep_alive: 0 } : {}),
  }, input.timeoutMs)
  if (!result.ok) return safeControlFailure(result.code)
  if (!result.payload || typeof result.payload !== 'object') return safeControlFailure('invalid_response')
  const payload = result.payload as Record<string, unknown>
  if (payload.error) return safeControlFailure('invalid_response')
  return {
    ok: true,
    operation: input.operation,
    model: input.model,
    status: input.operation === 'load' ? 'loaded' : 'unloaded',
    warnings: [],
  }
}

export async function loadOllamaModel(
  payload: Readonly<{ endpointUrl?: unknown; model?: unknown; manualLoadUnloadEnabled?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<OllamaControlResult> {
  if (payload.manualLoadUnloadEnabled === false) return safeControlFailure('controls_disabled')
  const endpoint = validateOllamaEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return safeControlFailure(endpoint.code, endpoint.safeUrl)
  const model = String(payload.model ?? '').trim()
  if (!model) return safeControlFailure('invalid_payload', endpoint.safeBaseUrl)
  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return chatControlInternal({
    fetchImpl,
    endpoint: endpoint.url,
    operation: 'load',
    model,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

export async function unloadOllamaModel(
  payload: Readonly<{ endpointUrl?: unknown; model?: unknown; manualLoadUnloadEnabled?: unknown; timeoutMs?: unknown }>,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<OllamaControlResult> {
  if (payload.manualLoadUnloadEnabled === false) return safeControlFailure('controls_disabled')
  const endpoint = validateOllamaEndpointUrl(payload.endpointUrl)
  if (!endpoint.ok) return safeControlFailure(endpoint.code, endpoint.safeUrl)
  const model = String(payload.model ?? '').trim()
  if (!model) return safeControlFailure('invalid_payload', endpoint.safeBaseUrl)
  const fetchImpl = options?.fetchImpl ?? createLocalEndpointDirectFetch()
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return chatControlInternal({
    fetchImpl,
    endpoint: endpoint.url,
    operation: 'unload',
    model,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

export function registerOllamaRuntimeManagementV2Ipc(
  input: RegisterOllamaRuntimeManagementV2IpcInput,
): string[] {
  input.registerInvoke('generation-v2:local-runtime:ollama:probe', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return probeOllamaLocalProvider(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('generation-v2:local-runtime:ollama:load-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return loadOllamaModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('generation-v2:local-runtime:ollama:unload-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return unloadOllamaModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  return [...OLLAMA_RUNTIME_MANAGEMENT_V2_IPC_CHANNELS]
}
