import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaOpenAIResponses, type ResponsesFetchFn } from '../../src/next/provider/openai-responses/openaiResponsesAdapter'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import {
  sanitizeProviderRuntimeFileContentBlocks,
  type ProviderRuntimeContentBlock,
} from '../../src/next/multimodal/providerRuntimeContentBlocks'

export const OPENAI_RESPONSES_TEXT_CHAT_IPC_CHANNELS = [
  'openai-responses-chat:stream-text',
  'openai-responses-chat:abort',
] as const

export type OpenAIResponsesTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type OpenAIResponsesTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  model?: unknown
  messages?: unknown
  currentUserContentBlocks?: unknown
  timeoutMs?: unknown
}>

export type OpenAIResponsesTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }>

type OpenAIResponsesTextChatStartFailure = Exclude<OpenAIResponsesTextChatStartResult, Readonly<{ ok: true }>>

export type OpenAIResponsesTextChatWireEvent =
  | Readonly<{ type: 'event'; event: StarverseStreamEvent }>
  | Readonly<{ type: 'end' }>

type RegisterOpenAIResponsesTextChatIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
  fetchImpl?: typeof fetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: OpenAIResponsesTextChatMessage[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | OpenAIResponsesTextChatStartFailure

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const OPENAI_RESPONSES_BASE_URL = 'https://api.openai.com/v1'
const activeControllers = new Map<string, AbortController>()

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticFailure(
  code: OpenAIResponsesTextChatStartFailure['code'],
  error: string,
): OpenAIResponsesTextChatStartFailure {
  return { ok: false, code, error }
}

function normalizeMessages(raw: unknown, allowEmptyCurrentUser = false): OpenAIResponsesTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: OpenAIResponsesTextChatMessage[] = []
  const sliced = raw.slice(-MAX_MESSAGES)
  for (let index = 0; index < sliced.length; index++) {
    const item = sliced[index]
    if (!item || typeof item !== 'object') return null
    const role = (item as Record<string, unknown>).role
    if (role !== 'user' && role !== 'assistant') return null
    const content = String((item as Record<string, unknown>).content ?? '').trim()
    if (!content) {
      if (allowEmptyCurrentUser && index === sliced.length - 1 && role === 'user') {
        out.push({ role, content: '' })
      }
      continue
    }
    out.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) })
  }
  if (out.length === 0 || out[out.length - 1]?.role !== 'user') return null
  return out
}

export function validateOpenAIResponsesTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'OpenAI Responses text chat payload is invalid.')
  }
  const record = payload as OpenAIResponsesTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticFailure('invalid_payload', 'OpenAI Responses text chat payload is invalid.')
  }

  const contentBlocks = sanitizeProviderRuntimeFileContentBlocks('openai_responses', record.currentUserContentBlocks)
  if (!contentBlocks.ok) {
    return staticFailure('invalid_payload', 'OpenAI Responses file content block payload is invalid.')
  }

  const messages = normalizeMessages(record.messages, contentBlocks.blocks.length > 0)
  if (!messages) {
    return staticFailure('invalid_payload', 'OpenAI Responses text chat requires user and assistant messages.')
  }

  return {
    ok: true,
    requestId,
    assistantMessageId,
    model,
    messages,
    ...(contentBlocks.blocks.length > 0 ? { currentUserContentBlocks: contentBlocks.blocks } : {}),
    timeoutMs: normalizeTimeoutMs(record.timeoutMs),
  }
}

function readOpenAIResponsesApiKey(credentialService: ProviderCredentialService): OpenAIResponsesTextChatStartFailure | string {
  const result = credentialService.readApiKey('openai_responses')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return staticFailure('credential_missing', 'OpenAI Responses API key is not configured.')
  }
  return staticFailure('store_unavailable', 'OpenAI Responses credential store is unavailable.')
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
    provider: 'openai-responses',
    category,
    message: category === 'auth'
      ? 'OpenAI Responses credential was rejected.'
      : category === 'rate_limit'
        ? 'OpenAI Responses rate limit was reached.'
        : category === 'aborted'
          ? 'OpenAI Responses text chat was aborted.'
          : 'OpenAI Responses text chat failed safely.',
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

function sendWireEvent(sender: WebContents, requestId: string, event: OpenAIResponsesTextChatWireEvent) {
  sender.send(`openai-responses-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`openai-responses-chat:chunk:${requestId}`, { type: 'end' } satisfies OpenAIResponsesTextChatWireEvent)
  sender.send(`openai-responses-chat:end:${requestId}`)
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
    ...(input.request.currentUserContentBlocks?.length ? { currentUserContentBlocks: input.request.currentUserContentBlocks } : {}),
    signal: input.controller.signal,
    config: {
      model: input.request.model,
      requestedReasoningMode: 'auto',
    },
  }
}

async function forwardOpenAIResponsesStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  credentialService: ProviderCredentialService
  fetchImpl: typeof fetch
}>): Promise<void> {
  const apiKey = readOpenAIResponsesApiKey(input.credentialService)
  if (typeof apiKey !== 'string') {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'openai-responses',
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
  const fetchWithRedirectError: ResponsesFetchFn = (url, init) => input.fetchImpl(url, {
    ...init,
    redirect: 'error',
    signal: controller.signal,
  })

  try {
    const events = streamViaOpenAIResponses(buildProviderRequest({ request: input.request, controller }), {
      baseUrl: OPENAI_RESPONSES_BASE_URL,
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
          provider: 'openai-responses',
          category: controller.signal.aborted ? 'aborted' : 'network',
          code: controller.signal.aborted ? 'aborted' : 'network_error',
          message: controller.signal.aborted
            ? 'OpenAI Responses text chat was aborted.'
            : 'OpenAI Responses text chat failed safely.',
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

export function abortOpenAIResponsesTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerOpenAIResponsesTextChatIpc(
  input: RegisterOpenAIResponsesTextChatIpcInput,
): string[] {
  input.registerInvoke('openai-responses-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateOpenAIResponsesTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'OpenAI Responses text chat bridge is unavailable.')
    }

    void forwardOpenAIResponsesStream({ request: validated, sender, credentialService: input.credentialService, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('openai-responses-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortOpenAIResponsesTextChat(requestId)
  })

  return [...OPENAI_RESPONSES_TEXT_CHAT_IPC_CHANNELS]
}
