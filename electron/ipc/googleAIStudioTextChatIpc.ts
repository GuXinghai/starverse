import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaGemini, type GeminiFetchFn } from '../../src/next/provider/gemini/geminiAdapter'
import type { GeminiContent } from '../../src/next/provider/gemini/geminiRequestBuilder'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'

export const GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS = [
  'google-ai-studio-chat:stream-text',
  'google-ai-studio-chat:abort',
] as const

export type GoogleAIStudioTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type GoogleAIStudioTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  model?: unknown
  messages?: unknown
  timeoutMs?: unknown
}>

export type GoogleAIStudioTextChatStartResult =
  | Readonly<{ ok: true }>
  | Readonly<{
    ok: false
    code: 'invalid_payload' | 'credential_missing' | 'store_unavailable'
    error: string
  }>

type GoogleAIStudioTextChatStartFailure = Exclude<GoogleAIStudioTextChatStartResult, Readonly<{ ok: true }>>

export type GoogleAIStudioTextChatWireEvent =
  | Readonly<{ type: 'event'; event: StarverseStreamEvent }>
  | Readonly<{ type: 'end' }>

type RegisterGoogleAIStudioTextChatIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: ProviderCredentialService
  fetchImpl?: typeof fetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: GoogleAIStudioTextChatMessage[]
  timeoutMs: number
}>

type ValidatedTextChatPayload =
  | ValidatedTextChatSuccess
  | GoogleAIStudioTextChatStartFailure

const DEFAULT_TIMEOUT_MS = 30000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 120000
const MAX_MESSAGES = 80
const MAX_MESSAGE_CHARS = 20000
const GOOGLE_AI_STUDIO_BASE_URL = 'https://generativelanguage.googleapis.com'
const activeControllers = new Map<string, AbortController>()

function normalizeTimeoutMs(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)))
}

function staticFailure(
  code: GoogleAIStudioTextChatStartFailure['code'],
  error: string,
): GoogleAIStudioTextChatStartFailure {
  return { ok: false, code, error }
}

function normalizeMessages(raw: unknown): GoogleAIStudioTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: GoogleAIStudioTextChatMessage[] = []
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

export function validateGoogleAIStudioTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat payload is invalid.')
  }
  const record = payload as GoogleAIStudioTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = String(record.model ?? '').trim()
  if (!requestId || !assistantMessageId || !model) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat payload is invalid.')
  }

  const messages = normalizeMessages(record.messages)
  if (!messages) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat requires text-only user and assistant messages.')
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

function readGoogleAIStudioApiKey(credentialService: ProviderCredentialService): GoogleAIStudioTextChatStartFailure | string {
  const result = credentialService.readApiKey('google_ai_studio')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return staticFailure('credential_missing', 'Google AI Studio API key is not configured.')
  }
  return staticFailure('store_unavailable', 'Google AI Studio credential store is unavailable.')
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
    provider: 'google-ai-studio',
    category,
    message: category === 'auth'
      ? 'Google AI Studio credential was rejected.'
      : category === 'rate_limit'
        ? 'Google AI Studio rate limit was reached.'
        : category === 'aborted'
          ? 'Google AI Studio text chat was aborted.'
          : 'Google AI Studio text chat failed safely.',
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

function sendWireEvent(sender: WebContents, requestId: string, event: GoogleAIStudioTextChatWireEvent) {
  sender.send(`google-ai-studio-chat:chunk:${requestId}`, event)
}

function sendWireEnd(sender: WebContents, requestId: string) {
  sender.send(`google-ai-studio-chat:chunk:${requestId}`, { type: 'end' } satisfies GoogleAIStudioTextChatWireEvent)
  sender.send(`google-ai-studio-chat:end:${requestId}`)
}

function toGeminiContent(message: GoogleAIStudioTextChatMessage): GeminiContent {
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }
}

function buildProviderRequest(input: Readonly<{
  request: ValidatedTextChatSuccess
  controller: AbortController
}>): ProviderStreamRequest {
  const currentUser = input.request.messages[input.request.messages.length - 1]
  const contextMessages = input.request.messages.slice(0, -1).map(toGeminiContent)
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

async function forwardGoogleAIStudioStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  credentialService: ProviderCredentialService
  fetchImpl: typeof fetch
}>): Promise<void> {
  const apiKey = readGoogleAIStudioApiKey(input.credentialService)
  if (typeof apiKey !== 'string') {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: {
          phase: 'transport',
          provider: 'google-ai-studio',
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
  const fetchWithRedirectError: GeminiFetchFn = (url, init) => input.fetchImpl(url, {
    ...init,
    redirect: 'error',
    signal: controller.signal,
  })

  try {
    const events = streamViaGemini(buildProviderRequest({ request: input.request, controller }), {
      baseUrl: GOOGLE_AI_STUDIO_BASE_URL,
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
          provider: 'google-ai-studio',
          category: controller.signal.aborted ? 'aborted' : 'network',
          code: controller.signal.aborted ? 'aborted' : 'network_error',
          message: controller.signal.aborted
            ? 'Google AI Studio text chat was aborted.'
            : 'Google AI Studio text chat failed safely.',
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

export function abortGoogleAIStudioTextChat(requestId: unknown): Readonly<{ ok: true }> {
  const id = String(requestId ?? '').trim()
  const controller = id ? activeControllers.get(id) : undefined
  if (controller && !controller.signal.aborted) controller.abort('user_abort')
  return { ok: true }
}

export function registerGoogleAIStudioTextChatIpc(
  input: RegisterGoogleAIStudioTextChatIpcInput,
): string[] {
  input.registerInvoke('google-ai-studio-chat:stream-text', (event: unknown, payload: unknown) => {
    const validated = validateGoogleAIStudioTextChatPayload(payload)
    if (!validated.ok) return validated

    const sender = (event as { sender?: WebContents } | null)?.sender
    const fetchImpl = input.fetchImpl ?? globalThis.fetch
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'Google AI Studio text chat bridge is unavailable.')
    }

    void forwardGoogleAIStudioStream({ request: validated, sender, credentialService: input.credentialService, fetchImpl })
    return { ok: true }
  })

  input.registerInvoke('google-ai-studio-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortGoogleAIStudioTextChat(requestId)
  })

  return [...GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS]
}
