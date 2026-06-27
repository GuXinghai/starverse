import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'

export const OLLAMA_LOCAL_PROVIDER_IPC_CHANNELS = [
  'ollama:probe',
  'ollama:load-model',
  'ollama:unload-model',
  'ollama-chat:stream-text',
  'ollama-chat:abort',
] as const

export const OLLAMA_DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:11434'

export type OllamaChatMode = 'native_rest' | 'openai_compatible'
export type OllamaNativePreferredEndpoint = 'chat' | 'generate'
export type OllamaOpenAICompatiblePreferredEndpoint = 'chat_completions' | 'responses'

export type OllamaNativeControls = Readonly<{
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled?: boolean
}>

export type OllamaLocalProviderConfig = Readonly<{
  providerKey: 'ollama_local'
  endpointUrl: string
  nativeControls: OllamaNativeControls
  chatMode: OllamaChatMode
  nativeRest: Readonly<{
    basePath: '/api'
    preferredEndpoint: OllamaNativePreferredEndpoint
  }>
  openAICompatible: Readonly<{
    basePath: '/v1'
    preferredEndpoint: OllamaOpenAICompatiblePreferredEndpoint
  }>
}>

export type OllamaTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

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

export type OllamaTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  config?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type OllamaTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }>

export type OllamaTextChatWireErrorKind = 'http_error' | 'transport_error' | 'aborted'

export type OllamaTextChatWireEvent =
  | Readonly<{ type: 'responseMeta'; status: number; requestId?: string; provider?: 'ollama_local'; headers?: Record<string, string> }>
  | Readonly<{ type: 'chunk'; data: string }>
  | Readonly<{
    type: 'error'
    error: Readonly<{
      kind: OllamaTextChatWireErrorKind
      message: string
      code?: string | number
      status?: number
      statusText?: string
      headers?: Record<string, string>
    }>
  }>
  | Readonly<{ type: 'end' }>

type RegisterOllamaLocalProviderIpcInput = Readonly<{
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

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  config: OllamaLocalProviderConfig
  endpoint: URL
  safeBaseUrl: string
  model: string
  messages: OllamaTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | Exclude<OllamaTextChatStartResult, Readonly<{ ok: true }>>

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
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const activeControllers = new Map<string, AbortController>()

export const DEFAULT_OLLAMA_LOCAL_PROVIDER_CONFIG: OllamaLocalProviderConfig = {
  providerKey: 'ollama_local',
  endpointUrl: OLLAMA_DEFAULT_ENDPOINT_URL,
  nativeControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  chatMode: 'native_rest',
  nativeRest: {
    basePath: '/api',
    preferredEndpoint: 'chat',
  },
  openAICompatible: {
    basePath: '/v1',
    preferredEndpoint: 'chat_completions',
  },
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticStartFailure(
  code: Exclude<OllamaTextChatStartResult, Readonly<{ ok: true }>>['code'],
  error: string,
  safeUrl?: string,
): Exclude<OllamaTextChatStartResult, Readonly<{ ok: true }>> {
  return {
    ok: false,
    code,
    error,
    ...(safeUrl ? { safeUrl } : {}),
  }
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

function ollamaUrl(base: URL, pathname: '/api/tags' | '/api/ps' | '/api/version' | '/api/chat' | '/api/generate' | '/v1/models' | '/v1/chat/completions' | '/v1/responses'): string {
  const url = new URL(base.toString())
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = pathname
  return url.toString()
}

function normalizeConfig(raw: unknown): OllamaLocalProviderConfig {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, any>
    : {}
  const controls = record.nativeControls && typeof record.nativeControls === 'object'
    ? record.nativeControls as Record<string, unknown>
    : {}
  const nativeRest = record.nativeRest && typeof record.nativeRest === 'object'
    ? record.nativeRest as Record<string, unknown>
    : {}
  const openAICompatible = record.openAICompatible && typeof record.openAICompatible === 'object'
    ? record.openAICompatible as Record<string, unknown>
    : {}

  return {
    providerKey: 'ollama_local',
    endpointUrl: String(record.endpointUrl ?? OLLAMA_DEFAULT_ENDPOINT_URL).trim() || OLLAMA_DEFAULT_ENDPOINT_URL,
    nativeControls: {
      diagnosticsEnabled: controls.diagnosticsEnabled !== false,
      manualLoadUnloadEnabled: controls.manualLoadUnloadEnabled !== false,
      autoLoadBeforeSendEnabled: controls.autoLoadBeforeSendEnabled === true,
      autoUnloadAfterSendEnabled: controls.autoUnloadAfterSendEnabled === true,
      autoUnloadAfterIdleEnabled: controls.autoUnloadAfterIdleEnabled === true,
    },
    chatMode: record.chatMode === 'openai_compatible' ? 'openai_compatible' : 'native_rest',
    nativeRest: {
      basePath: '/api',
      preferredEndpoint: nativeRest.preferredEndpoint === 'generate' ? 'generate' : 'chat',
    },
    openAICompatible: {
      basePath: '/v1',
      preferredEndpoint: openAICompatible.preferredEndpoint === 'responses' ? 'responses' : 'chat_completions',
    },
  }
}

function normalizeMessages(raw: unknown): OllamaTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: OllamaTextChatMessage[] = []
  for (const item of raw.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== 'object') return null
    const role = (item as Record<string, unknown>).role
    if (role !== 'user' && role !== 'assistant') return null
    const content = String((item as Record<string, unknown>).content ?? '').trim()
    if (!content) continue
    out.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) })
  }
  if (out.length === 0 || out[out.length - 1]?.role !== 'user') return null
  return out
}

export function validateOllamaTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticStartFailure('invalid_payload', 'Ollama text chat payload is invalid.')
  }
  const record = payload as OllamaTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticStartFailure('invalid_payload', 'Ollama text chat payload is invalid.')
  }

  const config = normalizeConfig(record.config)
  const endpoint = validateOllamaEndpointUrl(config.endpointUrl)
  if (!endpoint.ok) {
    return staticStartFailure(endpoint.code, endpoint.message, endpoint.safeUrl)
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticStartFailure('invalid_payload', 'Ollama text chat requires text-only user and assistant messages.')
  }

  return {
    ok: true,
    requestId,
    assistantMessageId,
    config,
    endpoint: endpoint.url,
    safeBaseUrl: endpoint.safeBaseUrl,
    model,
    messages,
    timeoutMs: normalizeTimeoutMs(record.timeoutMs),
  }
}

function pickSafeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  const contentType = headers.get('content-type')
  const requestId = headers.get('x-request-id')
  if (contentType) out['content-type'] = contentType
  if (requestId) out['x-request-id'] = requestId
  return out
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

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
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
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
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
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return chatControlInternal({
    fetchImpl,
    endpoint: endpoint.url,
    operation: 'unload',
    model,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

function sendWireEvent(sender: WebContents, requestId: string, event: OllamaTextChatWireEvent) {
  sender.send(`ollama-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`ollama-chat:chunk:${requestId}`, { type: 'end' } satisfies OllamaTextChatWireEvent)
  sender.send(`ollama-chat:end:${requestId}`)
}

function makeAbortError(reason: 'timeout' | 'user_abort'): OllamaTextChatWireEvent {
  if (reason === 'user_abort') {
    return {
      type: 'error',
      error: {
        kind: 'aborted',
        code: 'aborted',
        message: 'Ollama text chat was aborted.',
      },
    }
  }
  return {
    type: 'error',
    error: {
      kind: 'transport_error',
      code: 'timeout',
      message: 'Ollama text chat timed out.',
    },
  }
}

function makeSafeTransportError(code: string, message = 'Ollama text chat failed safely.'): OllamaTextChatWireEvent {
  return {
    type: 'error',
    error: {
      kind: 'transport_error',
      code,
      message,
    },
  }
}

function openAIChatBody(request: ValidatedTextChatSuccess): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    stream: true,
  }
}

function responsesBody(request: ValidatedTextChatSuccess): Record<string, unknown> {
  return {
    model: request.model,
    input: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      type: 'message',
    })),
    stream: true,
  }
}

function generatePrompt(request: ValidatedTextChatSuccess): string {
  return request.messages
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
    .trim()
}

function nativeRestBody(request: ValidatedTextChatSuccess): Record<string, unknown> {
  if (request.config.nativeRest.preferredEndpoint === 'generate') {
    return {
      model: request.model,
      prompt: generatePrompt(request),
      stream: true,
    }
  }
  return {
    model: request.model,
    messages: request.messages,
    stream: true,
  }
}

function syntheticOpenAITextDelta(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`
}

function syntheticOpenAIDone(): string {
  return 'data: [DONE]\n\n'
}

function parseSseFrame(frame: string): Readonly<{ event: string; data: string }> | null {
  let event = ''
  const data: string[] = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trimStart())
    }
  }
  if (data.length === 0) return null
  return { event, data: data.join('\n') }
}

function nativeJsonToWireEvents(parsed: Record<string, any>): OllamaTextChatWireEvent[] {
  if (parsed.error) {
    return [makeSafeTransportError('provider_error', 'Ollama native REST stream returned an error.')]
  }
  const out: OllamaTextChatWireEvent[] = []
  const message = parsed.message && typeof parsed.message === 'object'
    ? parsed.message as Record<string, unknown>
    : null
  const content = stringOrUndefined(message?.content) ?? stringOrUndefined(parsed.response)
  if (content) out.push({ type: 'chunk', data: syntheticOpenAITextDelta(content) })
  if (parsed.done === true) out.push({ type: 'chunk', data: syntheticOpenAIDone() })
  return out
}

function responsesFrameToWireEvents(frame: Readonly<{ event: string; data: string }>): OllamaTextChatWireEvent[] {
  if (frame.data.trim() === '[DONE]') return [{ type: 'chunk', data: syntheticOpenAIDone() }]
  let parsed: Record<string, any> | null = null
  try {
    parsed = JSON.parse(frame.data) as Record<string, any>
  } catch {
    return []
  }
  if (frame.event === 'response.output_text.delta') {
    const delta = stringOrUndefined(parsed.delta)
    return delta ? [{ type: 'chunk', data: syntheticOpenAITextDelta(delta) }] : []
  }
  if (frame.event === 'response.completed' || frame.event === 'response.done') {
    return [{ type: 'chunk', data: syntheticOpenAIDone() }]
  }
  if (frame.event === 'error' || parsed.error) {
    return [makeSafeTransportError('provider_error', 'Ollama OpenAI-compatible Responses stream returned an error.')]
  }
  return []
}

async function forwardOpenAICompatibleStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
  controller: AbortController
}>): Promise<boolean> {
  const preferred = input.request.config.openAICompatible.preferredEndpoint
  const response = await input.fetchImpl(
    ollamaUrl(input.request.endpoint, preferred === 'responses' ? '/v1/responses' : '/v1/chat/completions'),
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferred === 'responses' ? responsesBody(input.request) : openAIChatBody(input.request)),
      redirect: 'error',
      signal: input.controller.signal,
    },
  )

  sendWireEvent(input.sender, input.request.requestId, {
    type: 'responseMeta',
    status: response.status,
    requestId: input.request.requestId,
    provider: 'ollama_local',
    headers: pickSafeHeaders(response.headers),
  })

  if (!response.ok) {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'error',
      error: {
        kind: 'http_error',
        status: response.status,
        statusText: response.statusText,
        message: 'Ollama OpenAI-compatible chat returned an HTTP error.',
      },
    })
    return false
  }

  if (!response.body) {
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('missing_body', 'Ollama response did not include a stream body.'))
    return false
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  if (preferred !== 'responses') {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      if (text) sendWireEvent(input.sender, input.request.requestId, { type: 'chunk', data: text })
    }
    const tail = decoder.decode()
    if (tail) sendWireEvent(input.sender, input.request.requestId, { type: 'chunk', data: tail })
    return true
  }

  let buffer = ''
  let sawTerminal = false
  const drainFrames = () => {
    buffer = buffer.replace(/\r\n/g, '\n')
    while (true) {
      const idx = buffer.indexOf('\n\n')
      if (idx < 0) break
      const rawFrame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const frame = parseSseFrame(rawFrame)
      if (!frame) continue
      for (const wire of responsesFrameToWireEvents(frame)) {
        sendWireEvent(input.sender, input.request.requestId, wire)
        if (wire.type === 'chunk' && wire.data.includes('[DONE]')) sawTerminal = true
        if (wire.type === 'error') sawTerminal = true
      }
    }
  }

  while (!sawTerminal) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    drainFrames()
  }
  buffer += decoder.decode()
  drainFrames()
  if (!sawTerminal) sendWireEvent(input.sender, input.request.requestId, { type: 'chunk', data: syntheticOpenAIDone() })
  return true
}

async function forwardNativeRestStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
  controller: AbortController
}>): Promise<boolean> {
  const preferred = input.request.config.nativeRest.preferredEndpoint
  const response = await input.fetchImpl(ollamaUrl(input.request.endpoint, preferred === 'generate' ? '/api/generate' : '/api/chat'), {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nativeRestBody(input.request)),
    redirect: 'error',
    signal: input.controller.signal,
  })

  sendWireEvent(input.sender, input.request.requestId, {
    type: 'responseMeta',
    status: response.status,
    requestId: input.request.requestId,
    provider: 'ollama_local',
    headers: pickSafeHeaders(response.headers),
  })

  if (!response.ok) {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'error',
      error: {
        kind: 'http_error',
        status: response.status,
        statusText: response.statusText,
        message: 'Ollama native REST chat returned an HTTP error.',
      },
    })
    return false
  }

  if (!response.body) {
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('missing_body', 'Ollama response did not include a stream body.'))
    return false
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawTerminal = false
  const drainLines = (flush = false) => {
    buffer = buffer.replace(/\r\n/g, '\n')
    while (true) {
      const idx = buffer.indexOf('\n')
      if (idx < 0) break
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const line = rawLine.trim()
      if (!line) continue
      let parsed: Record<string, any> | null = null
      try {
        parsed = JSON.parse(line) as Record<string, any>
      } catch {
        continue
      }
      for (const wire of nativeJsonToWireEvents(parsed)) {
        sendWireEvent(input.sender, input.request.requestId, wire)
        if (wire.type === 'chunk' && wire.data.includes('[DONE]')) sawTerminal = true
        if (wire.type === 'error') sawTerminal = true
      }
    }
    if (flush && buffer.trim()) {
      const line = buffer.trim()
      buffer = ''
      try {
        const parsed = JSON.parse(line) as Record<string, any>
        for (const wire of nativeJsonToWireEvents(parsed)) {
          sendWireEvent(input.sender, input.request.requestId, wire)
          if (wire.type === 'chunk' && wire.data.includes('[DONE]')) sawTerminal = true
          if (wire.type === 'error') sawTerminal = true
        }
      } catch {
        // Ignore incomplete provider metadata fragments rather than surfacing raw response text.
      }
    }
  }

  while (!sawTerminal) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    drainLines()
  }
  buffer += decoder.decode()
  drainLines(true)
  if (!sawTerminal) sendWireEvent(input.sender, input.request.requestId, { type: 'chunk', data: syntheticOpenAIDone() })
  return true
}

async function maybeAutoLoadBeforeSend(input: Readonly<{
  request: ValidatedTextChatSuccess
  fetchImpl: typeof fetch
}>): Promise<
  | Readonly<{ ok: true; autoLoadedModel?: string }>
  | Readonly<{ ok: false; event: OllamaTextChatWireEvent }>
> {
  const controls = input.request.config.nativeControls
  const state = await resolveModelRunningState(input.fetchImpl, input.request.endpoint, input.request.model, input.request.timeoutMs)
  if (!state.ok) {
    if (controls.autoLoadBeforeSendEnabled) {
      return { ok: false, event: makeSafeTransportError(state.code, 'Ollama native REST control plane is unavailable.') }
    }
    return { ok: true }
  }
  if (state.known && state.running) return { ok: true }
  if (!controls.autoLoadBeforeSendEnabled) {
    return { ok: false, event: makeSafeTransportError('model_not_loaded', 'Ollama selected model is not running. Enable auto-load or load it manually.') }
  }
  const loaded = await chatControlInternal({
    fetchImpl: input.fetchImpl,
    endpoint: input.request.endpoint,
    operation: 'load',
    model: input.request.model,
    timeoutMs: input.request.timeoutMs,
  })
  if (!loaded.ok) return { ok: false, event: makeSafeTransportError(loaded.code, loaded.message) }
  return { ok: true, autoLoadedModel: input.request.model }
}

async function forwardOllamaTextChat(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
}>): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(input.request.requestId, controller)
  const timer = setTimeout(() => controller.abort('timeout'), input.request.timeoutMs)
  let completedNormally = false
  let autoLoadedModel: string | undefined

  try {
    const loadResult = await maybeAutoLoadBeforeSend({ request: input.request, fetchImpl: input.fetchImpl })
    if (!loadResult.ok) {
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'responseMeta',
        status: 0,
        requestId: input.request.requestId,
        provider: 'ollama_local',
        headers: {},
      })
      sendWireEvent(input.sender, input.request.requestId, loadResult.event)
      return
    }
    autoLoadedModel = loadResult.autoLoadedModel

    completedNormally = input.request.config.chatMode === 'native_rest'
      ? await forwardNativeRestStream({ ...input, controller })
      : await forwardOpenAICompatibleStream({ ...input, controller })
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      sendWireEvent(input.sender, input.request.requestId, makeAbortError(controller.signal.reason === 'user_abort' ? 'user_abort' : 'timeout'))
      return
    }
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('network_error', 'Ollama text chat could not reach the service.'))
  } finally {
    clearTimeout(timer)
    activeControllers.delete(input.request.requestId)
    if (
      completedNormally &&
      autoLoadedModel &&
      input.request.config.nativeControls.autoUnloadAfterSendEnabled &&
      !controller.signal.aborted
    ) {
      await chatControlInternal({
        fetchImpl: input.fetchImpl,
        endpoint: input.request.endpoint,
        operation: 'unload',
        model: autoLoadedModel,
        timeoutMs: input.request.timeoutMs,
      }).catch(() => undefined)
    }
    sendWireEnd(input.sender, input.request.requestId)
  }
}

export function abortOllamaTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerOllamaLocalProviderIpc(
  input: RegisterOllamaLocalProviderIpcInput,
): string[] {
  input.registerInvoke('ollama:probe', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return probeOllamaLocalProvider(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('ollama:load-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return loadOllamaModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('ollama:unload-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return unloadOllamaModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('ollama-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateOllamaTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticStartFailure('invalid_payload', 'Ollama text chat bridge is unavailable.')
    }

    void forwardOllamaTextChat({ request: validated, sender, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('ollama-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortOllamaTextChat(requestId)
  })

  return [...OLLAMA_LOCAL_PROVIDER_IPC_CHANNELS]
}
