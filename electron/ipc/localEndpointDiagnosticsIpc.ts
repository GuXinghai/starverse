import type { RegisterInvoke } from './types'

export const LOCAL_ENDPOINT_DIAGNOSTICS_IPC_CHANNELS = [
  'local-endpoint-diagnostics:probe',
] as const

export type LocalEndpointProbePayload = Readonly<{
  url?: unknown
  timeoutMs?: unknown
}>

export type LocalEndpointFamily = 'openai_compatible' | 'ollama' | 'unknown'

export type LocalEndpointProbeModelList =
  | Readonly<{
    ok: true
    source: 'openai_v1_models' | 'ollama_api_tags'
    models: string[]
    truncated: boolean
  }>
  | Readonly<{
    ok: false
    code: 'unavailable' | 'invalid_response' | 'timeout' | 'network_error'
    message: string
  }>

export type LocalEndpointProbeDiagnostics = Readonly<{
  kind: 'local_endpoint_diagnostics'
  status: 'reachable' | 'unreachable'
  endpointFamily: LocalEndpointFamily
  safeBaseUrl: string
  modelList: LocalEndpointProbeModelList
  capabilitySummary: Readonly<{
    chatSendAvailable: false
    textChat: 'diagnostics_only'
    streaming: 'not_probed'
    tools: false
    files: false
    reasoning: false
    webSearch: false
  }>
  message: string
}>

export type LocalEndpointProbeResult =
  | Readonly<{ ok: true; diagnostics: LocalEndpointProbeDiagnostics }>
  | Readonly<{
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected' | 'timeout' | 'network_error' | 'invalid_response'
    message: string
    safeUrl?: string
  }>

type LocalEndpointProbeFailureCode = 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected' | 'timeout' | 'network_error' | 'invalid_response'
type LocalEndpointModelListFailureCode = 'unavailable' | 'invalid_response' | 'timeout' | 'network_error'

type RegisterLocalEndpointDiagnosticsIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  fetchImpl?: typeof fetch
}>

type ValidatedLocalEndpointUrl =
  | Readonly<{ ok: true; url: URL; safeBaseUrl: string }>
  | Readonly<{
    ok: false
    code: 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    message: string
    safeUrl?: string
  }>

const DEFAULT_TIMEOUT_MS = 5000
const MIN_TIMEOUT_MS = 500
const MAX_TIMEOUT_MS = 15000
const MAX_MODEL_IDS = 20

function capabilitySummary(): LocalEndpointProbeDiagnostics['capabilitySummary'] {
  return {
    chatSendAvailable: false,
    textChat: 'diagnostics_only',
    streaming: 'not_probed',
    tools: false,
    files: false,
    reasoning: false,
    webSearch: false,
  }
}

function safeFailure(
  code: LocalEndpointProbeFailureCode,
  safeUrl?: string,
): LocalEndpointProbeResult {
  const messages: Record<string, string> = {
    invalid_url: 'Local endpoint URL is invalid.',
    remote_host_rejected: 'Local endpoint diagnostics only allow localhost URLs.',
    embedded_credentials_rejected: 'Local endpoint URL must not include embedded credentials.',
    timeout: 'Local endpoint probe timed out.',
    network_error: 'Local endpoint probe could not reach the service.',
    invalid_response: 'Local endpoint probe received an unsupported response.',
  }
  return {
    ok: false,
    code,
    message: messages[code],
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function safeModelListFailure(code: LocalEndpointModelListFailureCode): LocalEndpointProbeModelList {
  const messages: Record<string, string> = {
    unavailable: 'Model list is unavailable for this endpoint.',
    invalid_response: 'Model list response was not recognized.',
    timeout: 'Model list probe timed out.',
    network_error: 'Model list probe could not reach the service.',
  }
  return { ok: false, code, message: messages[code] }
}

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
}

function toSafeUrl(url: URL): string {
  const safe = new URL(url.toString())
  safe.username = ''
  safe.password = ''
  safe.search = ''
  safe.hash = ''
  return safe.toString()
}

export function validateLocalEndpointProbeUrl(raw: unknown): ValidatedLocalEndpointUrl {
  const value = String(raw ?? '').trim()
  if (!value) return safeFailure('invalid_url') as ValidatedLocalEndpointUrl

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return safeFailure('invalid_url') as ValidatedLocalEndpointUrl
  }

  const safeUrl = toSafeUrl(url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return safeFailure('invalid_url', safeUrl) as ValidatedLocalEndpointUrl
  }
  if (url.username || url.password) {
    return safeFailure('embedded_credentials_rejected', safeUrl) as ValidatedLocalEndpointUrl
  }
  if (!isLoopbackHost(url.hostname)) {
    return safeFailure('remote_host_rejected', safeUrl) as ValidatedLocalEndpointUrl
  }

  return { ok: true, url, safeBaseUrl: safeUrl }
}

function openAiModelsUrl(base: URL): string {
  const url = new URL(base.toString())
  url.search = ''
  url.hash = ''
  const normalizedPath = url.pathname.replace(/\/+$/, '')
  url.pathname = normalizedPath.endsWith('/v1') ? `${normalizedPath}/models` : '/v1/models'
  return url.toString()
}

function ollamaTagsUrl(base: URL): string {
  const url = new URL(base.toString())
  url.search = ''
  url.hash = ''
  url.pathname = '/api/tags'
  return url.toString()
}

function normalizeModelIds(rawIds: unknown[]): { models: string[]; truncated: boolean } {
  const ids = rawIds
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0)
  return {
    models: ids.slice(0, MAX_MODEL_IDS),
    truncated: ids.length > MAX_MODEL_IDS,
  }
}

export function parseOpenAiModelsResponse(payload: unknown): LocalEndpointProbeModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).data)) {
    return safeModelListFailure('invalid_response')
  }
  const { models, truncated } = normalizeModelIds((payload as any).data.map((item: unknown) => (item as any)?.id))
  return { ok: true, source: 'openai_v1_models', models, truncated }
}

export function parseOllamaModelsResponse(payload: unknown): LocalEndpointProbeModelList {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).models)) {
    return safeModelListFailure('invalid_response')
  }
  const { models, truncated } = normalizeModelIds((payload as any).models.map((item: unknown) => (item as any)?.name))
  return { ok: true, source: 'ollama_api_tags', models, truncated }
}

async function fetchJson(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<
  | Readonly<{ ok: true; payload: unknown }>
  | Readonly<{ ok: false; code: 'timeout' | 'network_error' | 'invalid_response' }>
> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, code: 'network_error' }
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

export async function probeLocalEndpointDiagnostics(
  payload: LocalEndpointProbePayload,
  options?: Readonly<{ fetchImpl?: typeof fetch }>,
): Promise<LocalEndpointProbeResult> {
  const validation = validateLocalEndpointProbeUrl(payload.url)
  if (!validation.ok) return validation

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return safeFailure('network_error', validation.safeBaseUrl)
  }

  const timeoutMs = normalizeTimeoutMs(payload.timeoutMs)
  const openAi = await fetchJson(fetchImpl, openAiModelsUrl(validation.url), timeoutMs)
  if (openAi.ok) {
    const modelList = parseOpenAiModelsResponse(openAi.payload)
    if (modelList.ok) {
      return {
        ok: true,
        diagnostics: {
          kind: 'local_endpoint_diagnostics',
          status: 'reachable',
          endpointFamily: 'openai_compatible',
          safeBaseUrl: validation.safeBaseUrl,
          modelList,
          capabilitySummary: capabilitySummary(),
          message: 'Local endpoint is reachable through OpenAI-compatible model listing.',
        },
      }
    }
  }

  const ollama = await fetchJson(fetchImpl, ollamaTagsUrl(validation.url), timeoutMs)
  if (ollama.ok) {
    const modelList = parseOllamaModelsResponse(ollama.payload)
    if (modelList.ok) {
      return {
        ok: true,
        diagnostics: {
          kind: 'local_endpoint_diagnostics',
          status: 'reachable',
          endpointFamily: 'ollama',
          safeBaseUrl: validation.safeBaseUrl,
          modelList,
          capabilitySummary: capabilitySummary(),
          message: 'Local endpoint is reachable through Ollama model listing.',
        },
      }
    }
  }

  const failureCode = openAi.ok || ollama.ok
    ? 'invalid_response'
    : openAi.code === 'timeout' || ollama.code === 'timeout'
      ? 'timeout'
      : 'network_error'

  return {
    ok: true,
    diagnostics: {
      kind: 'local_endpoint_diagnostics',
      status: 'unreachable',
      endpointFamily: 'unknown',
      safeBaseUrl: validation.safeBaseUrl,
      modelList: safeModelListFailure(failureCode === 'invalid_response' ? 'invalid_response' : failureCode),
      capabilitySummary: capabilitySummary(),
      message: failureCode === 'timeout'
        ? 'Local endpoint probe timed out.'
        : failureCode === 'invalid_response'
          ? 'Local endpoint responded, but model listing was not recognized.'
          : 'Local endpoint probe could not reach the service.',
    },
  }
}

export function registerLocalEndpointDiagnosticsIpc(
  input: RegisterLocalEndpointDiagnosticsIpcInput,
): string[] {
  input.registerInvoke('local-endpoint-diagnostics:probe', (_event: unknown, payload: unknown) => {
    const safePayload = (payload && typeof payload === 'object' && !Array.isArray(payload))
      ? payload as LocalEndpointProbePayload
      : {}
    return probeLocalEndpointDiagnostics(safePayload, { fetchImpl: input.fetchImpl })
  })

  return [...LOCAL_ENDPOINT_DIAGNOSTICS_IPC_CHANNELS]
}
