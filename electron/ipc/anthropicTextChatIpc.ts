import type { WebContents } from 'electron'
import type Store from 'electron-store'
import type { RegisterInvoke } from './types'
import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaAnthropic, type AnthropicFetchFn } from '../../src/next/provider/anthropic/anthropicAdapter'
import { ANTHROPIC_API_KEY_STORE_KEY } from './anthropicCredentialSettingsIpc'

export const ANTHROPIC_TEXT_CHAT_IPC_CHANNELS = [
  'anthropic-chat:stream-text',
  'anthropic-chat:abort',
] as const

export type AnthropicTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type AnthropicTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type AnthropicTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }>

type AnthropicTextChatStartFailure = Exclude<AnthropicTextChatStartResult, Readonly<{ ok: true }>>

export type AnthropicTextChatWireEvent =
  | Readonly<{ type: 'event'; event: StarverseStreamEvent }>
  | Readonly<{ type: 'end' }>

type RegisterAnthropicTextChatIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  fetchImpl?: typeof fetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: AnthropicTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | AnthropicTextChatStartFailure

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const activeControllers = new Map<string, AbortController>()

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticFailure(
  code: AnthropicTextChatStartFailure['code'],
  error: string,
): AnthropicTextChatStartFailure {
  return { ok: false, code, error }
}

function normalizeMessages(raw: unknown): AnthropicTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: AnthropicTextChatMessage[] = []
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

export function validateAnthropicTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'Anthropic Messages text chat payload is invalid.')
  }
  const record = payload as AnthropicTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticFailure('invalid_payload', 'Anthropic Messages text chat payload is invalid.')
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticFailure('invalid_payload', 'Anthropic Messages text chat requires text-only user and assistant messages.')
  }

  return {
    ok: true,
    requestId,
    assistantMessageId,
    model,
    messages,
    timeoutMs: normalizeTimeoutMs(record.timeoutMs),
  }
}

function readAnthropicApiKey(store: Store): AnthropicTextChatStartFailure | string {
  try {
    const apiKey = String(store.get(ANTHROPIC_API_KEY_STORE_KEY) ?? '').trim()
    if (!apiKey) {
      return staticFailure('credential_missing', 'Anthropic API key is not configured.')
    }
    return apiKey
  } catch {
    return staticFailure('store_unavailable', 'Anthropic credential store is unavailable.')
  }
}

function safeProviderError(error: StarverseProviderError): StarverseProviderError {
  const category = error.category === 'auth'
    ? 'auth'
    : error.category === 'rate_limit'
      ? 'rate_limit'
      : error.category === 'aborted'
        ? 'aborted'
        : error.category === 'bad_request'
          ? 'bad_request'
          : error.category === 'network'
            ? 'network'
            : 'provider_error'

  return {
    phase: error.phase,
    provider: 'anthropic',
    category,
    message: category === 'auth'
      ? 'Anthropic credential was rejected.'
      : category === 'rate_limit'
        ? 'Anthropic rate limit was reached.'
        : category === 'aborted'
          ? 'Anthropic Messages text chat was aborted.'
          : 'Anthropic Messages text chat failed safely.',
    ...(error.code ? { code: String(error.code) } : {}),
    ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
    ...(error.retryable ? { retryable: true } : {}),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  }
}

function safeStreamEvent(event: StarverseStreamEvent): StarverseStreamEvent {
  if (event.type === 'stream.error') {
    return {
      ...event,
      error: safeProviderError(event.error),
      terminal: true,
    }
  }
  if (event.type === 'stream.abort') {
    return {
      ...event,
      error: safeProviderError(event.error),
    }
  }
  return event
}

function sendWireEvent(sender: WebContents, requestId: string, event: AnthropicTextChatWireEvent) {
  sender.send(`anthropic-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`anthropic-chat:chunk:${requestId}`, { type: 'end' } satisfies AnthropicTextChatWireEvent)
  sender.send(`anthropic-chat:end:${requestId}`)
}

function buildProviderRequest(input: Readonly<{
  request: ValidatedTextChatSuccess
  controller: AbortController
}>): ProviderStreamRequest {
  const currentUser = input.request.messages[input.request.messages.length - 1]
  const contextMessages = input.request.messages.slice(0, -1)
  return {
    requestId: input.request.requestId,
    assistantMessageId: input.request.assistantMessageId,
    userText: currentUser?.content ?? '',
    contextMessages,
    signal: input.controller.signal,
    config: {
      model: input.request.model,
      requestedReasoningMode: 'auto',
    },
  }
}

async function forwardAnthropicStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  store: Store
  fetchImpl: typeof fetch
}>): Promise<void> {
  const apiKey = readAnthropicApiKey(input.store)
  if (typeof apiKey !== 'string') {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'anthropic',
          category: apiKey.code === 'credential_missing' ? 'auth' : 'unknown',
          code: apiKey.code,
          message: apiKey.error,
        },
        terminal: true,
      },
    })
    sendWireEnd(input.sender, input.request.requestId)
    return
  }

  const controller = new AbortController()
  activeControllers.set(input.request.requestId, controller)
  const timer = setTimeout(() => controller.abort('timeout'), input.request.timeoutMs)
  const fetchWithRedirectError: AnthropicFetchFn = (url, init) => input.fetchImpl(url, {
    ...init,
    redirect: 'error',
    signal: controller.signal,
  })

  try {
    const events = streamViaAnthropic(buildProviderRequest({ request: input.request, controller }), {
      baseUrl: ANTHROPIC_BASE_URL,
      apiKey,
      fetch: fetchWithRedirectError,
    })
    for await (const event of events) {
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'event',
        event: safeStreamEvent(event),
      })
    }
  } catch {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'anthropic',
          category: controller.signal.aborted ? 'aborted' : 'network',
          code: controller.signal.aborted ? 'aborted' : 'network_error',
          message: controller.signal.aborted
            ? 'Anthropic Messages text chat was aborted.'
            : 'Anthropic Messages text chat failed safely.',
        },
        terminal: true,
      },
    })
  } finally {
    clearTimeout(timer)
    activeControllers.delete(input.request.requestId)
    sendWireEnd(input.sender, input.request.requestId)
  }
}

export function abortAnthropicTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerAnthropicTextChatIpc(
  input: RegisterAnthropicTextChatIpcInput,
): string[] {
  input.registerInvoke('anthropic-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateAnthropicTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'Anthropic Messages text chat bridge is unavailable.')
    }

    void forwardAnthropicStream({ request: validated, sender, store: input.store, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('anthropic-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortAnthropicTextChat(requestId)
  })

  return [...ANTHROPIC_TEXT_CHAT_IPC_CHANNELS]
}
