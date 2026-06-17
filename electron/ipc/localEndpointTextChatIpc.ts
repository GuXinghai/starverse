import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import { openAiChatCompletionsUrl, validateLocalEndpointProbeUrl } from './localEndpointDiagnosticsIpc'

export const LOCAL_ENDPOINT_TEXT_CHAT_IPC_CHANNELS = [
  'local-endpoint-chat:stream-text',
  'local-endpoint-chat:abort',
] as const

export type LocalEndpointTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type LocalEndpointTextChatPayload = Readonly<{
  requestId?: unknown
  url?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type LocalEndpointTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'invalid_url' | 'remote_host_rejected' | 'embedded_credentials_rejected'
    error: string
    safeUrl?: string
  }>

type LocalEndpointTextChatStartFailure = Exclude<LocalEndpointTextChatStartResult, Readonly<{ ok: true }>>

export type LocalEndpointTextChatWireErrorKind = 'http_error' | 'transport_error' | 'aborted'

export type LocalEndpointTextChatWireEvent =
  | Readonly<{ type: 'responseMeta'; status: number; requestId?: string; provider?: 'local_endpoint'; headers?: Record<string, string> }>
  | Readonly<{ type: 'chunk'; data: string }>
  | Readonly<{
    type: 'error'
    error: Readonly<{
      kind: LocalEndpointTextChatWireErrorKind
      message: string
      code?: string | number
      status?: number
      statusText?: string
      headers?: Record<string, string>
    }>
  }>
  | Readonly<{ type: 'end' }>

type RegisterLocalEndpointTextChatIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  fetchImpl?: typeof fetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  url: URL
  safeBaseUrl: string
  model: string
  messages: LocalEndpointTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | LocalEndpointTextChatStartFailure

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const activeControllers = new Map<string, AbortController>()

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticFailure(
  code: LocalEndpointTextChatStartFailure['code'],
  error: string,
  safeUrl?: string,
): LocalEndpointTextChatStartFailure {
  return {
    ok: false,
    code,
    error,
    ...(safeUrl ? { safeUrl } : {}),
  }
}

function normalizeMessages(raw: unknown): LocalEndpointTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: LocalEndpointTextChatMessage[] = []
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

export function validateLocalEndpointTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'Local endpoint text chat payload is invalid.')
  }
  const record = payload as LocalEndpointTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !model) {
    return staticFailure('invalid_payload', 'Local endpoint text chat payload is invalid.')
  }

  const urlValidation = validateLocalEndpointProbeUrl(record.url)
  if (!urlValidation.ok) {
    return staticFailure(urlValidation.code, urlValidation.message, urlValidation.safeUrl)
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticFailure('invalid_payload', 'Local endpoint text chat requires text-only user and assistant messages.')
  }

  return {
    ok: true,
    requestId,
    url: urlValidation.url,
    safeBaseUrl: urlValidation.safeBaseUrl,
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

function sendWireEvent(sender: WebContents, requestId: string, event: LocalEndpointTextChatWireEvent) {
  sender.send(`local-endpoint-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`local-endpoint-chat:chunk:${requestId}`, { type: 'end' } satisfies LocalEndpointTextChatWireEvent)
  sender.send(`local-endpoint-chat:end:${requestId}`)
}

function makeAbortError(reason: 'timeout' | 'user_abort'): LocalEndpointTextChatWireEvent {
  if (reason === 'user_abort') {
    return {
      type: 'error',
      error: {
        kind: 'aborted',
        code: 'aborted',
        message: 'Local endpoint text chat was aborted.',
      },
    }
  }
  return {
    type: 'error',
    error: {
      kind: 'transport_error',
      code: 'timeout',
      message: 'Local endpoint text chat timed out.',
    },
  }
}

async function forwardFetchStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  fetchImpl: typeof fetch
}>): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(input.request.requestId, controller)
  const timer = setTimeout(() => controller.abort('timeout'), input.request.timeoutMs)
  const emit = (event: LocalEndpointTextChatWireEvent) => sendWireEvent(input.sender, input.request.requestId, event)

  try {
    const response = await input.fetchImpl(openAiChatCompletionsUrl(input.request.url), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.request.model,
        messages: input.request.messages,
        stream: true,
      }),
      redirect: 'error',
      signal: controller.signal,
    })

    emit({
      type: 'responseMeta',
      status: response.status,
      requestId: input.request.requestId,
      provider: 'local_endpoint',
      headers: pickSafeHeaders(response.headers),
    })

    if (!response.ok) {
      emit({
        type: 'error',
        error: {
          kind: 'http_error',
          status: response.status,
          statusText: response.statusText,
          message: 'Local endpoint returned an HTTP error.',
        },
      })
      return
    }

    if (!response.body) {
      emit({
        type: 'error',
        error: {
          kind: 'transport_error',
          code: 'missing_body',
          message: 'Local endpoint response did not include a stream body.',
        },
      })
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      if (text) emit({ type: 'chunk', data: text })
    }
    const tail = decoder.decode()
    if (tail) emit({ type: 'chunk', data: tail })
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      emit(makeAbortError(controller.signal.reason === 'user_abort' ? 'user_abort' : 'timeout'))
      return
    }
    emit({
      type: 'error',
      error: {
        kind: 'transport_error',
        code: 'network_error',
        message: 'Local endpoint text chat could not reach the service.',
      },
    })
  } finally {
    clearTimeout(timer)
    activeControllers.delete(input.request.requestId)
    sendWireEnd(input.sender, input.request.requestId)
  }
}

export function abortLocalEndpointTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerLocalEndpointTextChatIpc(
  input: RegisterLocalEndpointTextChatIpcInput,
): string[] {
  input.registerInvoke('local-endpoint-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateLocalEndpointTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'Local endpoint text chat bridge is unavailable.')
    }

    void forwardFetchStream({ request: validated, sender, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('local-endpoint-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortLocalEndpointTextChat(requestId)
  })

  return [...LOCAL_ENDPOINT_TEXT_CHAT_IPC_CHANNELS]
}
