import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'

export const LM_STUDIO_LOCAL_PROVIDER_IPC_CHANNELS = [
  'lm-studio:probe',
  'lm-studio:load-model',
  'lm-studio:unload-model',
  'lm-studio-chat:stream-text',
  'lm-studio-chat:abort',
] as const

export const LM_STUDIO_DEFAULT_ENDPOINT_URL = 'http://127.0.0.1:1234'

export type LMStudioChatMode = 'openai_compatible' | 'native_rest'
export type LMStudioOpenAICompatiblePreferredEndpoint = 'chat_completions' | 'responses'

export type LMStudioNativeRestControls = Readonly<{
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled?: boolean
}>

export type LMStudioLocalProviderConfig = Readonly<{
  providerKey: 'lm_studio'
  endpointUrl: string
  nativeRestControls: LMStudioNativeRestControls
  chatMode: LMStudioChatMode
  openAICompatible: Readonly<{
    basePath: '/v1'
    preferredEndpoint: LMStudioOpenAICompatiblePreferredEndpoint
  }>
  nativeRest: Readonly<{
    basePath: '/api/v1'
  }>
}>

export type LMStudioTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

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

export type LMStudioTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  config?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type LMStudioTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }>

export type LMStudioTextChatWireErrorKind = 'http_error' | 'transport_error' | 'aborted'

export type LMStudioTextChatWireEvent =
  | Readonly<{ type: 'responseMeta'; status: number; requestId?: string; provider?: 'lm_studio'; headers?: Record<string, string> }>
  | Readonly<{ type: 'chunk'; data: string }>
  | Readonly<{
    type: 'error'
    error: Readonly<{
      kind: LMStudioTextChatWireErrorKind
      message: string
      code?: string | number
      status?: number
      statusText?: string
      headers?: Record<string, string>
    }>
  }>
  | Readonly<{ type: 'end' }>

type RegisterLMStudioLocalProviderIpcInput = Readonly<{
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
  config: LMStudioLocalProviderConfig
  endpoint: URL
  safeBaseUrl: string
  model: string
  messages: LMStudioTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | Exclude<LMStudioTextChatStartResult, Readonly<{ ok: true }>>

type JsonFetchResult =
  | Readonly<{ ok: true; payload: unknown }>
  | Readonly<{ ok: false; code: 'timeout' | 'network_error' | 'http_error' | 'invalid_response'; status?: number }>

type ModelLoadedState =
  | Readonly<{ ok: true; known: true; model: LMStudioModelSummary; loaded: boolean; instanceId?: string }>
  | Readonly<{ ok: true; known: false }>
  | Readonly<{ ok: false; code: 'timeout' | 'network_error' | 'http_error' | 'invalid_response'; message: string }>

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const activeControllers = new Map<string, AbortController>()

export const DEFAULT_LM_STUDIO_LOCAL_PROVIDER_CONFIG: LMStudioLocalProviderConfig = {
  providerKey: 'lm_studio',
  endpointUrl: LM_STUDIO_DEFAULT_ENDPOINT_URL,
  nativeRestControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  chatMode: 'openai_compatible',
  openAICompatible: {
    basePath: '/v1',
    preferredEndpoint: 'chat_completions',
  },
  nativeRest: {
    basePath: '/api/v1',
  },
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticStartFailure(
  code: Exclude<LMStudioTextChatStartResult, Readonly<{ ok: true }>>['code'],
  error: string,
  safeUrl?: string,
): Exclude<LMStudioTextChatStartResult, Readonly<{ ok: true }>> {
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

function lmStudioUrl(base: URL, pathname: '/api/v1/models' | '/api/v1/models/load' | '/api/v1/models/unload' | '/api/v1/chat' | '/v1/models' | '/v1/chat/completions' | '/v1/responses'): string {
  const url = new URL(base.toString())
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.pathname = pathname
  return url.toString()
}

function normalizeConfig(raw: unknown): LMStudioLocalProviderConfig {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, any>
    : {}
  const controls = record.nativeRestControls && typeof record.nativeRestControls === 'object'
    ? record.nativeRestControls as Record<string, unknown>
    : {}
  const openAICompatible = record.openAICompatible && typeof record.openAICompatible === 'object'
    ? record.openAICompatible as Record<string, unknown>
    : {}

  return {
    providerKey: 'lm_studio',
    endpointUrl: String(record.endpointUrl ?? LM_STUDIO_DEFAULT_ENDPOINT_URL).trim() || LM_STUDIO_DEFAULT_ENDPOINT_URL,
    nativeRestControls: {
      diagnosticsEnabled: controls.diagnosticsEnabled !== false,
      manualLoadUnloadEnabled: controls.manualLoadUnloadEnabled !== false,
      autoLoadBeforeSendEnabled: controls.autoLoadBeforeSendEnabled === true,
      autoUnloadAfterSendEnabled: controls.autoUnloadAfterSendEnabled === true,
      autoUnloadAfterIdleEnabled: controls.autoUnloadAfterIdleEnabled === true,
    },
    chatMode: record.chatMode === 'native_rest' ? 'native_rest' : 'openai_compatible',
    openAICompatible: {
      basePath: '/v1',
      preferredEndpoint: openAICompatible.preferredEndpoint === 'responses' ? 'responses' : 'chat_completions',
    },
    nativeRest: {
      basePath: '/api/v1',
    },
  }
}

function normalizeMessages(raw: unknown): LMStudioTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: LMStudioTextChatMessage[] = []
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

export function validateLMStudioTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticStartFailure('invalid_payload', 'LM Studio text chat payload is invalid.')
  }
  const record = payload as LMStudioTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticStartFailure('invalid_payload', 'LM Studio text chat payload is invalid.')
  }

  const config = normalizeConfig(record.config)
  const endpoint = validateLMStudioEndpointUrl(config.endpointUrl)
  if (!endpoint.ok) {
    return staticStartFailure(endpoint.code, endpoint.message, endpoint.safeUrl)
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticStartFailure('invalid_payload', 'LM Studio text chat requires text-only user and assistant messages.')
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

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
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

async function resolveModelLoadedState(
  fetchImpl: typeof fetch,
  endpoint: URL,
  modelId: string,
  timeoutMs: number,
): Promise<ModelLoadedState> {
  const list = await fetchNativeModels(fetchImpl, endpoint, timeoutMs)
  if (!list.ok) {
    const code = list.code === 'unavailable' ? 'network_error' : list.code
    return { ok: false, code, message: list.message }
  }
  const match = list.models.find((model) => model.key === modelId || model.loadedInstances.includes(modelId))
  if (!match) return { ok: true, known: false }
  return {
    ok: true,
    known: true,
    model: match,
    loaded: match.loaded,
    ...(match.loadedInstances[0] ? { instanceId: match.loadedInstances[0] } : {}),
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
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
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
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') return safeControlFailure('network_error', endpoint.safeBaseUrl)
  return unloadLMStudioModelInternal({
    fetchImpl,
    endpoint: endpoint.url,
    instanceId,
    timeoutMs: normalizeTimeoutMs(payload.timeoutMs),
  })
}

function sendWireEvent(sender: WebContents, requestId: string, event: LMStudioTextChatWireEvent) {
  sender.send(`lm-studio-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`lm-studio-chat:chunk:${requestId}`, { type: 'end' } satisfies LMStudioTextChatWireEvent)
  sender.send(`lm-studio-chat:end:${requestId}`)
}

function makeAbortError(reason: 'timeout' | 'user_abort'): LMStudioTextChatWireEvent {
  if (reason === 'user_abort') {
    return {
      type: 'error',
      error: {
        kind: 'aborted',
        code: 'aborted',
        message: 'LM Studio text chat was aborted.',
      },
    }
  }
  return {
    type: 'error',
    error: {
      kind: 'transport_error',
      code: 'timeout',
      message: 'LM Studio text chat timed out.',
    },
  }
}

function makeSafeTransportError(code: string, message = 'LM Studio text chat failed safely.'): LMStudioTextChatWireEvent {
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

function nativeRestChatBody(request: ValidatedTextChatSuccess): Record<string, unknown> {
  const previous = request.messages.slice(0, -1)
  const current = request.messages[request.messages.length - 1]
  const contextText = previous
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n')
    .trim()
  return {
    model: request.model,
    input: contextText ? `${contextText}\nuser: ${current?.content ?? ''}` : current?.content ?? '',
    stream: true,
    store: false,
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

function nativeRestFrameToWire(frame: Readonly<{ event: string; data: string }>): LMStudioTextChatWireEvent | null {
  let parsed: Record<string, any> | null = null
  try {
    parsed = JSON.parse(frame.data) as Record<string, any>
  } catch {
    return null
  }
  const eventType = frame.event || String(parsed?.type ?? '')
  if (eventType === 'message.delta') {
    const content = String(parsed?.content ?? '')
    return content ? { type: 'chunk', data: syntheticOpenAITextDelta(content) } : null
  }
  if (eventType === 'error') {
    const code = stringOrUndefined(parsed?.error?.code) ?? stringOrUndefined(parsed?.error?.type) ?? 'provider_error'
    return makeSafeTransportError(code, 'LM Studio native REST stream returned an error.')
  }
  if (eventType === 'chat.end') {
    return { type: 'chunk', data: syntheticOpenAIDone() }
  }
  return null
}

async function forwardOpenAICompatibleStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
  controller: AbortController
}>): Promise<boolean> {
  const preferred = input.request.config.openAICompatible.preferredEndpoint
  const response = await input.fetchImpl(
    lmStudioUrl(input.request.endpoint, preferred === 'responses' ? '/v1/responses' : '/v1/chat/completions'),
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
    provider: 'lm_studio',
    headers: pickSafeHeaders(response.headers),
  })

  if (!response.ok) {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'error',
      error: {
        kind: 'http_error',
        status: response.status,
        statusText: response.statusText,
        message: 'LM Studio OpenAI-compatible chat returned an HTTP error.',
      },
    })
    return false
  }

  if (!response.body) {
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('missing_body', 'LM Studio response did not include a stream body.'))
    return false
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
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

async function forwardNativeRestStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
  controller: AbortController
}>): Promise<boolean> {
  const response = await input.fetchImpl(lmStudioUrl(input.request.endpoint, '/api/v1/chat'), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nativeRestChatBody(input.request)),
    redirect: 'error',
    signal: input.controller.signal,
  })

  sendWireEvent(input.sender, input.request.requestId, {
    type: 'responseMeta',
    status: response.status,
    requestId: input.request.requestId,
    provider: 'lm_studio',
    headers: pickSafeHeaders(response.headers),
  })

  if (!response.ok) {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'error',
      error: {
        kind: 'http_error',
        status: response.status,
        statusText: response.statusText,
        message: 'LM Studio native REST chat returned an HTTP error.',
      },
    })
    return false
  }

  if (!response.body) {
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('missing_body', 'LM Studio response did not include a stream body.'))
    return false
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
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
      const wire = nativeRestFrameToWire(frame)
      if (!wire) continue
      sendWireEvent(input.sender, input.request.requestId, wire)
      if (wire.type === 'chunk' && wire.data.includes('[DONE]')) sawTerminal = true
      if (wire.type === 'error') sawTerminal = true
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
  return sawTerminal
}

async function maybeAutoLoadBeforeSend(input: Readonly<{
  request: ValidatedTextChatSuccess
  fetchImpl: typeof fetch
}>): Promise<
  | Readonly<{ ok: true; autoLoadedInstanceId?: string }>
  | Readonly<{ ok: false; event: LMStudioTextChatWireEvent }>
> {
  const controls = input.request.config.nativeRestControls
  const state = await resolveModelLoadedState(input.fetchImpl, input.request.endpoint, input.request.model, input.request.timeoutMs)
  if (!state.ok) {
    if (controls.autoLoadBeforeSendEnabled) {
      return { ok: false, event: makeSafeTransportError(state.code, 'LM Studio native REST control plane is unavailable.') }
    }
    return { ok: true }
  }
  if (!state.known) {
    if (controls.autoLoadBeforeSendEnabled) {
      const loaded = await loadLMStudioModelInternal({
        fetchImpl: input.fetchImpl,
        endpoint: input.request.endpoint,
        model: input.request.model,
        timeoutMs: input.request.timeoutMs,
      })
      if (!loaded.ok) return { ok: false, event: makeSafeTransportError(loaded.code, loaded.message) }
      return { ok: true, autoLoadedInstanceId: loaded.instanceId }
    }
    return { ok: false, event: makeSafeTransportError('model_not_loaded', 'LM Studio selected model is not loaded. Enable auto-load or load it manually.') }
  }
  if (state.loaded) return { ok: true }
  if (!controls.autoLoadBeforeSendEnabled) {
    return { ok: false, event: makeSafeTransportError('model_not_loaded', 'LM Studio selected model is not loaded. Enable auto-load or load it manually.') }
  }
  const loaded = await loadLMStudioModelInternal({
    fetchImpl: input.fetchImpl,
    endpoint: input.request.endpoint,
    model: input.request.model,
    timeoutMs: input.request.timeoutMs,
  })
  if (!loaded.ok) return { ok: false, event: makeSafeTransportError(loaded.code, loaded.message) }
  return { ok: true, autoLoadedInstanceId: loaded.instanceId }
}

async function forwardLMStudioTextChat(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
}>): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(input.request.requestId, controller)
  const timer = setTimeout(() => controller.abort('timeout'), input.request.timeoutMs)
  let completedNormally = false
  let autoLoadedInstanceId: string | undefined

  try {
    const loadResult = await maybeAutoLoadBeforeSend({ request: input.request, fetchImpl: input.fetchImpl })
    if (!loadResult.ok) {
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'responseMeta',
        status: 0,
        requestId: input.request.requestId,
        provider: 'lm_studio',
        headers: {},
      })
      sendWireEvent(input.sender, input.request.requestId, loadResult.event)
      return
    }
    autoLoadedInstanceId = loadResult.autoLoadedInstanceId

    completedNormally = input.request.config.chatMode === 'native_rest'
      ? await forwardNativeRestStream({ ...input, controller })
      : await forwardOpenAICompatibleStream({ ...input, controller })
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      sendWireEvent(input.sender, input.request.requestId, makeAbortError(controller.signal.reason === 'user_abort' ? 'user_abort' : 'timeout'))
      return
    }
    sendWireEvent(input.sender, input.request.requestId, makeSafeTransportError('network_error', 'LM Studio text chat could not reach the service.'))
  } finally {
    clearTimeout(timer)
    activeControllers.delete(input.request.requestId)
    if (
      completedNormally &&
      autoLoadedInstanceId &&
      input.request.config.nativeRestControls.autoUnloadAfterSendEnabled &&
      !controller.signal.aborted
    ) {
      await unloadLMStudioModelInternal({
        fetchImpl: input.fetchImpl,
        endpoint: input.request.endpoint,
        instanceId: autoLoadedInstanceId,
        timeoutMs: input.request.timeoutMs,
      }).catch(() => undefined)
    }
    sendWireEnd(input.sender, input.request.requestId)
  }
}

export function abortLMStudioTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerLMStudioLocalProviderIpc(
  input: RegisterLMStudioLocalProviderIpcInput,
): string[] {
  input.registerInvoke('lm-studio:probe', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return probeLMStudioLocalProvider(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('lm-studio:load-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return loadLMStudioModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('lm-studio:unload-model', (_event: unknown, payload: unknown) => {
    const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {}
    return unloadLMStudioModel(safePayload, { fetchImpl: input.fetchImpl })
  })

  input.registerInvoke('lm-studio-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateLMStudioTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticStartFailure('invalid_payload', 'LM Studio text chat bridge is unavailable.')
    }

    void forwardLMStudioTextChat({ request: validated, sender, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('lm-studio-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortLMStudioTextChat(requestId)
  })

  return [...LM_STUDIO_LOCAL_PROVIDER_IPC_CHANNELS]
}
