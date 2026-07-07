import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { ProviderStreamConfig, ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '../../src/next/provider/providerTypes'
import { streamViaGemini, type GeminiFetchFn } from '../../src/next/provider/gemini/geminiAdapter'
import type { GeminiContent } from '../../src/next/provider/gemini/geminiRequestBuilder'
import {
  isGeminiThinkingLevel,
  normalizeGeminiThinkingConfig,
  type GeminiThinkingConfig,
} from '../../src/next/provider/gemini/geminiThinkingPolicy'
import { validateGeminiImageGenerationImageSize } from '../../src/next/provider/gemini/geminiImageGenerationPolicy'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import { sanitizeProviderNetworkError } from './providerNetworkError'
import {
  isProviderRuntimeUploadRequestBlock,
  sanitizeProviderRuntimeFileContentBlocks,
  type ProviderRuntimeContentBlock,
} from '../../src/next/multimodal/providerRuntimeContentBlocks'
import type { ProviderFileUploadCacheEvent, ProviderFileUploadService } from '../services/providerFileUploadService'
import { invalidateProviderFileUploadCacheOnReferenceError } from '../services/providerFileUploadInvalidation'
import { validateProviderGenerationParamsPayload } from './providerGenerationParamsPayload'

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
  currentUserContentBlocks?: unknown
  geminiThinking?: unknown
  generationParams?: unknown
  imageGeneration?: unknown
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
  providerFileUploadService?: ProviderFileUploadService
  fetchImpl?: ProviderFetch
}>

type ValidatedTextChatSuccess = Readonly<{
  ok: true
  requestId: string
  assistantMessageId: string
  model: string
  messages: GoogleAIStudioTextChatMessage[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  geminiThinking?: GeminiThinkingConfig
  generationParams?: ProviderStreamConfig['generationParams']
  imageGeneration?: ProviderStreamConfig['imageGeneration']
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

function normalizeGoogleAIStudioTextChatModelId(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  const withoutPrefix = value.startsWith('models/') ? value.slice('models/'.length) : value
  if (!withoutPrefix || withoutPrefix.length > 128) return null
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(withoutPrefix) ? withoutPrefix : null
}

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

function normalizeMessages(raw: unknown, allowEmptyCurrentUser = false): GoogleAIStudioTextChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: GoogleAIStudioTextChatMessage[] = []
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

function validateGeminiThinkingConfig(raw: unknown, model: string): GeminiThinkingConfig | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const mode = record.mode
  if (mode !== 'auto' && mode !== 'budget' && mode !== 'level') return null
  if ('includeThoughts' in record && typeof record.includeThoughts !== 'boolean') return null
  let thinkingBudget: number | undefined
  if ('thinkingBudget' in record) {
    if (typeof record.thinkingBudget !== 'number' || !Number.isFinite(record.thinkingBudget) || record.thinkingBudget <= 0) {
      return null
    }
    thinkingBudget = Math.trunc(record.thinkingBudget)
  }
  let thinkingLevel: GeminiThinkingConfig['thinkingLevel'] | undefined
  if ('thinkingLevel' in record) {
    if (!isGeminiThinkingLevel(record.thinkingLevel)) return null
    thinkingLevel = record.thinkingLevel
  }
  const candidate: GeminiThinkingConfig = {
    mode,
    ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    includeThoughts: record.includeThoughts === true,
  }
  return normalizeGeminiThinkingConfig({ model, config: candidate })
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function validateImageGenerationConfig(raw: unknown): ProviderStreamConfig['imageGeneration'] | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isPlainRecord(raw)) return null

  const out: {
    capabilityClass?: string
    modalities?: string[]
    outputMode?: 'auto' | 'image_only' | 'image_and_text'
    aspectRatio?: string
    imageSize?: '512' | '1K' | '2K' | '4K' | ''
  } = {}

  if ('capabilityClass' in raw) {
    const value = String(raw.capabilityClass ?? '').trim()
    if (!value || value.length > 128) return null
    out.capabilityClass = value
  }
  if ('modalities' in raw) {
    if (!Array.isArray(raw.modalities)) return null
    const modalities = raw.modalities.map((item) => String(item ?? '').trim()).filter((item) => item === 'image' || item === 'text')
    if (modalities.length !== raw.modalities.length) return null
    if (modalities.length > 0) out.modalities = modalities
  }
  if ('outputMode' in raw) {
    if (raw.outputMode !== 'auto' && raw.outputMode !== 'image_only' && raw.outputMode !== 'image_and_text') return null
    out.outputMode = raw.outputMode
  }
  if ('aspectRatio' in raw) {
    const value = String(raw.aspectRatio ?? '').trim()
    if (value.length > 32) return null
    if (value) out.aspectRatio = value
  }
  if ('imageSize' in raw) {
    if (raw.imageSize !== '' && raw.imageSize !== '512' && raw.imageSize !== '1K' && raw.imageSize !== '2K' && raw.imageSize !== '4K') return null
    out.imageSize = raw.imageSize
  }

  return Object.keys(out).length > 0 ? out : undefined
}

function extractImageSizeForValidation(imageGeneration: ProviderStreamConfig['imageGeneration']): unknown {
  if (!imageGeneration) return undefined
  if (imageGeneration.imageSize) return imageGeneration.imageSize
  return undefined
}

export function validateGoogleAIStudioTextChatPayload(payload: unknown): ValidatedTextChatPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat payload is invalid.')
  }
  const record = payload as GoogleAIStudioTextChatPayload
  const requestId = String(record.requestId ?? '').trim()
  const assistantMessageId = String(record.assistantMessageId ?? '').trim()
  const model = normalizeGoogleAIStudioTextChatModelId(record.model)
  if (!requestId || !assistantMessageId || !model) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat payload is invalid.')
  }

  const contentBlocks = sanitizeProviderRuntimeFileContentBlocks('google_ai_studio', record.currentUserContentBlocks)
  if (!contentBlocks.ok) {
    return staticFailure('invalid_payload', 'Google AI Studio file content block payload is invalid.')
  }

  const messages = normalizeMessages(record.messages, contentBlocks.blocks.length > 0)
  if (!messages) {
    return staticFailure('invalid_payload', 'Google AI Studio text chat requires user and assistant messages.')
  }

  const geminiThinking = validateGeminiThinkingConfig(record.geminiThinking, model)
  if (geminiThinking === null) {
    return staticFailure('invalid_payload', 'Google AI Studio thinking config payload is invalid.')
  }
  const imageGeneration = validateImageGenerationConfig(record.imageGeneration)
  if (imageGeneration === null) {
    return staticFailure('invalid_payload', 'Google AI Studio image generation payload is invalid.')
  }
  const generationParams = validateProviderGenerationParamsPayload(record.generationParams)
  if (generationParams === null) {
    return staticFailure('invalid_payload', 'Google AI Studio generation params payload is invalid.')
  }
  if (imageGeneration) {
    const imageSizeValidation = validateGeminiImageGenerationImageSize({
      model,
      imageSize: extractImageSizeForValidation(imageGeneration),
    })
    if (!imageSizeValidation.ok) {
      return staticFailure('invalid_payload', `Google AI Studio image size is not supported for this model. Supported sizes: ${imageSizeValidation.supportedImageSizes.join(', ')}.`)
    }
  }

  return {
    ok: true,
    requestId,
    assistantMessageId,
    model,
    messages,
    ...(contentBlocks.blocks.length > 0 ? { currentUserContentBlocks: contentBlocks.blocks } : {}),
    ...(geminiThinking ? { geminiThinking } : {}),
    ...(generationParams ? { generationParams } : {}),
    ...(imageGeneration ? { imageGeneration } : {}),
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
  if (error.phase !== 'transport' && error.phase !== 'http' && error.phase !== 'abort' && error.category !== 'network') {
    return {
      phase: error.phase,
      provider: 'google-ai-studio',
      category: error.category,
      message: sanitizeProviderMessage(error.message),
      ...(error.code ? { code: sanitizeProviderCode(error.code) } : {}),
      ...(typeof error.httpStatus === 'number' ? { httpStatus: error.httpStatus } : {}),
      ...(error.retryable ? { retryable: true } : {}),
      ...(error.requestId ? { requestId: sanitizeProviderCode(error.requestId) } : {}),
    }
  }
  return sanitizeProviderNetworkError({
    providerId: 'google_ai_studio',
    providerWireName: 'google-ai-studio',
    providerLabel: 'Google AI Studio',
    error,
  })
}

function sanitizeProviderMessage(message: unknown): string {
  const value = typeof message === 'string' && message.trim() ? message : 'Google AI Studio stream failed.'
  return redactProviderDiagnosticText(value).slice(0, 1000)
}

function sanitizeProviderCode(code: unknown): string {
  const value = typeof code === 'string' && code.trim() ? code : String(code ?? 'error')
  return redactProviderDiagnosticText(value).slice(0, 120)
}

function redactProviderDiagnosticText(value: string): string {
  return value
    .replace(/\bAuthorization\b\s*:?\s*Bearer\s+[A-Za-z0-9._~+/-]+/giu, '[redacted-auth]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+/giu, '[redacted-auth]')
    .replace(/\b(x-goog-api-key|api[_ -]?key)\b\s*[:=]\s*[A-Za-z0-9._~+/-]+/giu, '$1=[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/giu, '[redacted-url]')
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
    ...(input.request.currentUserContentBlocks?.length ? { currentUserContentBlocks: input.request.currentUserContentBlocks } : {}),
    signal: input.controller.signal,
    config: {
      model: input.request.model,
      requestedReasoningMode: 'auto',
      ...(input.request.geminiThinking ? { geminiThinking: input.request.geminiThinking } : {}),
      ...(input.request.generationParams ? { generationParams: input.request.generationParams } : {}),
      ...(input.request.imageGeneration ? { imageGeneration: input.request.imageGeneration } : {}),
    },
  }
}

async function forwardGoogleAIStudioStream(input: Readonly<{
  request: ValidatedTextChatSuccess
  sender: WebContents
  credentialService: ProviderCredentialService
  providerFileUploadService?: ProviderFileUploadService
  fetchImpl: ProviderFetch
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
    const uploadResolved = await resolveUploadBlocksForGoogleAIStudio({
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
            provider: 'google-ai-studio',
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
    const events = streamViaGemini(buildProviderRequest({ request: uploadResolved.request, controller }), {
      baseUrl: GOOGLE_AI_STUDIO_BASE_URL,
      apiKey,
      fetch: fetchWithRedirectError,
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
          providerId: 'google_ai_studio',
          providerWireName: 'google-ai-studio',
          providerLabel: 'Google AI Studio',
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
    const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
    if (!sender || typeof sender.send !== 'function' || typeof fetchImpl !== 'function') {
      return staticFailure('invalid_payload', 'Google AI Studio text chat bridge is unavailable.')
    }

    void forwardGoogleAIStudioStream({
      request: validated,
      sender,
      credentialService: input.credentialService,
      providerFileUploadService: input.providerFileUploadService,
      fetchImpl,
    })
    return { ok: true }
  })

  input.registerInvoke('google-ai-studio-chat:abort', (_event: unknown, requestId: unknown) => {
    return abortGoogleAIStudioTextChat(requestId)
  })

  return [...GOOGLE_AI_STUDIO_TEXT_CHAT_IPC_CHANNELS]
}

async function resolveUploadBlocksForGoogleAIStudio(input: Readonly<{
  request: ValidatedTextChatSuccess
  apiKey: string
  service?: ProviderFileUploadService
  fetchImpl: GeminiFetchFn
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
    provider: 'google_ai_studio',
      endpointFamily: 'google_ai_studio',
      baseUrl: GOOGLE_AI_STUDIO_BASE_URL,
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
