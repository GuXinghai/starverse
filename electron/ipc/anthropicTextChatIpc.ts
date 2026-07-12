import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaAnthropic, type AnthropicFetchFn } from '../../src/next/provider/anthropic/anthropicAdapter'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import { sanitizeProviderNetworkError } from './providerNetworkError'
import {
  isProviderRuntimeUploadRequestBlock,
  sanitizeProviderRuntimeFileContentBlocks,
  type ProviderRuntimeContentBlock,
} from '../../src/next/multimodal/providerRuntimeContentBlocks'
import type { ProviderFileUploadCacheEvent, ProviderFileUploadService } from '../services/providerFileUploadService'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { invalidateProviderFileUploadCacheOnReferenceError } from '../services/providerFileUploadInvalidation'
import { validateProviderGenerationParamsPayload } from './providerGenerationParamsPayload'
import {
  assertFinalAnthropicProviderNativeSnapshot,
  type AnthropicProviderNativeSnapshot,
} from '../../src/next/provider/anthropic/anthropicProviderNativeContent'

export const ANTHROPIC_TEXT_CHAT_IPC_CHANNELS = [
  'anthropic-chat:stream-text',
  'anthropic-chat:abort',
] as const

export type AnthropicTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
  anthropicNativeContent?: AnthropicProviderNativeSnapshot
}>

export type AnthropicTextChatPayload = Readonly<{
  requestId?: unknown
  assistantMessageId?: unknown
  model?: unknown
  messages?: unknown
  currentUserContentBlocks?: unknown
  generationParams?: unknown
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
  credentialService: ProviderCredentialService
  providerFileUploadService?: ProviderFileUploadService
  fetchImpl?: ProviderFetch
  rawGenerationRequestStore?: RawGenerationRequestStore
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: AnthropicTextChatMessage[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  generationParams?: ProviderStreamRequest['config']['generationParams']
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

function normalizeMessages(raw: unknown, allowEmptyCurrentUser = false): AnthropicTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: AnthropicTextChatMessage[] = []
  const sliced = raw.slice(-MAX_MESSAGES)
  for (let index = 0; index < sliced.length; index++) {
    const item = sliced[index]
    if (!item || typeof item !== 'object') return null
    const role = (item as Record<string, unknown>).role
    if (role !== 'user' && role !== 'assistant') return null
    const content = String((item as Record<string, unknown>).content ?? '').trim()
    let anthropicNativeContent: AnthropicProviderNativeSnapshot | undefined
    if (role === 'assistant' && (item as Record<string, unknown>).anthropicNativeContent !== undefined) {
      try {
        anthropicNativeContent = assertFinalAnthropicProviderNativeSnapshot((item as Record<string, unknown>).anthropicNativeContent)
      } catch {
        return null
      }
    }
    if (!content) {
      if (anthropicNativeContent) {
        out.push({ role, content: '', anthropicNativeContent })
        continue
      }
      if (allowEmptyCurrentUser && index === sliced.length - 1 && role === 'user') {
        out.push({ role, content: '' })
      }
      continue
    }
    out.push({
      role,
      content: content.slice(0, MAX_MESSAGE_CHARS),
      ...(anthropicNativeContent ? { anthropicNativeContent } : {}),
    })
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

  const contentBlocks = sanitizeProviderRuntimeFileContentBlocks('anthropic_messages', record.currentUserContentBlocks)
  if (!contentBlocks.ok) {
    return staticFailure('invalid_payload', 'Anthropic Messages file content block payload is invalid.')
  }

  const messages = normalizeMessages(record.messages, contentBlocks.blocks.length > 0)
  if (!messages) {
    return staticFailure('invalid_payload', 'Anthropic Messages text chat requires user and assistant messages.')
  }
  const generationParams = validateProviderGenerationParamsPayload(record.generationParams)
  if (generationParams === null) {
    return staticFailure('invalid_payload', 'Anthropic Messages generation params payload is invalid.')
  }

  return {
    ok: true,
    requestId,
    assistantMessageId,
    model,
    messages,
    ...(contentBlocks.blocks.length > 0 ? { currentUserContentBlocks: contentBlocks.blocks } : {}),
    ...(generationParams ? { generationParams } : {}),
    timeoutMs: normalizeTimeoutMs(record.timeoutMs),
  }
}

function readAnthropicApiKey(credentialService: ProviderCredentialService): AnthropicTextChatStartFailure | string {
  const result = credentialService.readApiKey('anthropic')
  if (result.ok) return result.apiKey
  if (result.code === 'credential_missing') {
    return staticFailure('credential_missing', 'Anthropic API key is not configured.')
  }
  return staticFailure('store_unavailable', 'Anthropic credential store is unavailable.')
}

function safeProviderError(error: StarverseProviderError): StarverseProviderError {
  return sanitizeProviderNetworkError({
    providerId: 'anthropic',
    providerWireName: 'anthropic',
    providerLabel: 'Anthropic',
    error,
  })
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
    ...(input.request.currentUserContentBlocks?.length ? { currentUserContentBlocks: input.request.currentUserContentBlocks } : {}),
    signal: input.controller.signal,
    config: {
      model: input.request.model,
      requestedReasoningMode: 'auto',
      ...(input.request.generationParams ? { generationParams: input.request.generationParams } : {}),
    },
  }
}

async function forwardAnthropicStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  credentialService: ProviderCredentialService
  providerFileUploadService?: ProviderFileUploadService
  fetchImpl: ProviderFetch
  rawGenerationRequestStore?: RawGenerationRequestStore
}>): Promise<void> {
  const apiKey = readAnthropicApiKey(input.credentialService)
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
    const uploadResolved = await resolveUploadBlocksForAnthropic({
      request: input.request,
      apiKey,
      service: input.providerFileUploadService,
      fetchImpl: fetchWithRedirectError,
      signal: controller.signal,
    })
    if (!uploadResolved.ok) {
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'event',
        event: {
          type: 'stream.error',
          error: {
            phase: 'request_build',
            provider: 'anthropic',
            category: uploadResolved.retryable ? 'network' : 'bad_request',
            code: uploadResolved.code,
            message: uploadResolved.message,
            ...(uploadResolved.retryable ? { retryable: true } : {}),
          },
          terminal: true,
        },
      })
      return
    }
    const events = streamViaAnthropic(buildProviderRequest({ request: uploadResolved.request, controller }), {
      baseUrl: ANTHROPIC_BASE_URL,
      apiKey,
      fetch: fetchWithRedirectError,
      captureSerializedRequest: (serializedBody) => input.rawGenerationRequestStore?.tryPersist({
        operationId: input.request.requestId, answerRootId: input.request.assistantMessageId, requestSequence: 1,
        providerId: 'anthropic_messages', modelId: input.request.model,
      }, serializedBody),
    })
    for await (const event of events) {
      const safeEvent = safeStreamEvent(event)
      await invalidateProviderFileUploadCacheOnReferenceError({
        service: input.providerFileUploadService,
        cacheEvents: uploadResolved.cacheEvents,
        streamEvent: event,
      })
      sendWireEvent(input.sender, input.request.requestId, {
        type: 'event',
        event: safeEvent,
      })
    }
  } catch (error) {
    sendWireEvent(input.sender, input.request.requestId, {
      type: 'event',
      event: {
        type: 'stream.error',
        error: sanitizeProviderNetworkError({
          providerId: 'anthropic',
          providerWireName: 'anthropic',
          providerLabel: 'Anthropic',
          thrown: error,
          abortReason: controller.signal.reason,
          fallbackPhase: 'transport',
        }),
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
    const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'Anthropic Messages text chat bridge is unavailable.')
    }

    void forwardAnthropicStream({
      request: validated,
      sender,
      credentialService: input.credentialService,
      providerFileUploadService: input.providerFileUploadService,
      fetchImpl,
      rawGenerationRequestStore: input.rawGenerationRequestStore,
    })
    return { ok: true }
  })

  input.registerInvoke('anthropic-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortAnthropicTextChat(requestId)
  })

  return [...ANTHROPIC_TEXT_CHAT_IPC_CHANNELS]
}

async function resolveUploadBlocksForAnthropic(input: Readonly<{
  request: ValidatedTextChatSuccess
  apiKey: string
  service?: ProviderFileUploadService
  fetchImpl: AnthropicFetchFn
  signal: AbortSignal
}>): Promise<
  | Readonly<{ ok: true; request: ValidatedTextChatSuccess; cacheEvents: ProviderFileUploadCacheEvent[] }>
  | Readonly<{ ok: false; code: string; message: string; retryable?: boolean }>
> {
  const blocks = input.request.currentUserContentBlocks ?? []
  if (!blocks.some(isProviderRuntimeUploadRequestBlock)) return { ok: true, request: input.request, cacheEvents: [] }
  if (!input.service) {
    return { ok: false, code: 'provider_file_upload_unavailable', message: 'Provider file upload service is unavailable.' }
  }
  const resolved = await input.service.resolveContentBlocks({
    provider: 'anthropic_messages',
      endpointFamily: 'anthropic_messages',
      baseUrl: ANTHROPIC_BASE_URL,
      apiKey: input.apiKey,
      blocks,
      fetchImpl: input.fetchImpl as any,
      signal: input.signal,
  })
  if (!resolved.ok) return resolved
  return {
    ok: true,
    request: {
      ...input.request,
      currentUserContentBlocks: resolved.blocks,
    },
    cacheEvents: resolved.cacheEvents,
  }
}
