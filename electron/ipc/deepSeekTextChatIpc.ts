import type { WebContents } from 'electron'
import type Store from 'electron-store'
import type { RegisterInvoke } from './types'
import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaDeepSeek, type DeepSeekFetchFn } from '../../src/next/provider/deepseek/deepSeekAdapter'
import { DEEPSEEK_API_KEY_STORE_KEY } from './deepSeekCredentialSettingsIpc'

export const DEEPSEEK_TEXT_CHAT_IPC_CHANNELS = [
  'deepseek-chat:stream-text',
  'deepseek-chat:abort',
] as const

export type DeepSeekTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type DeepSeekTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type DeepSeekTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }>

type DeepSeekTextChatStartFailure = Exclude<DeepSeekTextChatStartResult, Readonly<{ ok: true }>>

export type DeepSeekTextChatWireEvent =
  | Readonly<{ type: 'event'; event: StarverseStreamEvent }>
  | Readonly<{ type: 'end' }>

type RegisterDeepSeekTextChatIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  fetchImpl?: typeof fetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: DeepSeekTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | DeepSeekTextChatStartFailure

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
const activeControllers = new Map<string, AbortController>()

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticFailure(
  code: DeepSeekTextChatStartFailure['code'],
  error: string,
): DeepSeekTextChatStartFailure {
  return { ok: false, code, error }
}

function normalizeMessages(raw: unknown): DeepSeekTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: DeepSeekTextChatMessage[] = []
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

export function validateDeepSeekTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'DeepSeek official text chat payload is invalid.')
  }
  const record = payload as DeepSeekTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticFailure('invalid_payload', 'DeepSeek official text chat payload is invalid.')
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticFailure('invalid_payload', 'DeepSeek official text chat requires text-only user and assistant messages.')
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

function readDeepSeekApiKey(store: Store): DeepSeekTextChatStartFailure | string {
  try {
    const apiKey = String(store.get(DEEPSEEK_API_KEY_STORE_KEY) ?? '').trim()
    if (!apiKey) {
      return staticFailure('credential_missing', 'DeepSeek API key is not configured.')
    }
    return apiKey
  } catch {
    return staticFailure('store_unavailable', 'DeepSeek credential store is unavailable.')
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
    provider: 'deepseek',
    category,
    message: category === 'auth'
      ? 'DeepSeek credential was rejected.'
      : category === 'rate_limit'
        ? 'DeepSeek rate limit was reached.'
        : category === 'aborted'
          ? 'DeepSeek official text chat was aborted.'
          : 'DeepSeek official text chat failed safely.',
    ...(error.code ? { code: String(error.code) } : {}),
    ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
    ...(error.retryable ? { retryable: true } : {}),
    ...(error.requestId ? { requestId: error.requestId } : {}),
  }
}

function safeStreamEvent(event: StarverseStreamEvent): StarverseStreamEvent | null {
  if (event.type === 'message.reasoning_detail' || event.type === 'message.reasoning_detail_batch') {
    return null
  }
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

function sendWireEvent(sender: WebContents, requestId: string, event: DeepSeekTextChatWireEvent) {
  sender.send(`deepseek-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`deepseek-chat:chunk:${requestId}`, { type: 'end' } satisfies DeepSeekTextChatWireEvent)
  sender.send(`deepseek-chat:end:${requestId}`)
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

async function forwardDeepSeekStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  store: Store
  fetchImpl: typeof fetch
}>): Promise<void> {
  const apiKey = readDeepSeekApiKey(input.store)
  if (typeof apiKey !== 'string') {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'deepseek',
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
  const fetchWithRedirectError: DeepSeekFetchFn = (url, init) => input.fetchImpl(url, {
    ...init,
    redirect: 'error',
    signal: controller.signal,
  })

  try {
    const events = streamViaDeepSeek(buildProviderRequest({ request: input.request, controller }), {
      baseUrl: DEEPSEEK_BASE_URL,
      apiKey,
      fetch: fetchWithRedirectError,
    })
    for await (const event of events) {
      const safeEvent = safeStreamEvent(event)
      if (!safeEvent) continue
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'event',
        event: safeEvent,
      })
    }
  } catch {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'deepseek',
          category: controller.signal.aborted ? 'aborted' : 'network',
          code: controller.signal.aborted ? 'aborted' : 'network_error',
          message: controller.signal.aborted
            ? 'DeepSeek official text chat was aborted.'
            : 'DeepSeek official text chat failed safely.',
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

export function abortDeepSeekTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerDeepSeekTextChatIpc(
  input: RegisterDeepSeekTextChatIpcInput,
): string[] {
  input.registerInvoke('deepseek-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateDeepSeekTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'DeepSeek official text chat bridge is unavailable.')
    }

    void forwardDeepSeekStream({ request: validated, sender, store: input.store, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('deepseek-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortDeepSeekTextChat(requestId)
  })

  return [...DEEPSEEK_TEXT_CHAT_IPC_CHANNELS]
}
