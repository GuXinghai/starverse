import type { DomainEvent } from '@/next/state/types'
import {
  buildStreamErrorFromAppError,
  mapAppPhaseToEndReason,
  mapAppPhaseToEnvelopePhase,
  semanticMapIpcInvokeCatchError,
  semanticMapIpcMissingError,
  semanticMapIpcStartInvokeError,
  streamWireSemanticCore,
} from '@/next/streaming/core'
import { buildAbortEnvelope } from '@/next/errors/openRouterErrorEnvelope'
import {
  buildOpenAICompatibleUserContent,
  type OpenAICompatibleChatContentPart,
  type ProviderRuntimeContentBlock,
} from '@/next/multimodal/providerRuntimeContentBlocks'

export type OllamaTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string | ReadonlyArray<OpenAICompatibleChatContentPart>
}>

export type OllamaNativeControls = Readonly<{
  diagnosticsEnabled: boolean
  manualLoadUnloadEnabled: boolean
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
  autoUnloadAfterIdleEnabled?: boolean
}>

export type OllamaTextChatConfig = Readonly<{
  providerKey: 'ollama_local'
  endpointUrl: string
  nativeControls: OllamaNativeControls
  chatMode: 'native_rest' | 'openai_compatible'
  nativeRest: Readonly<{
    basePath: '/api'
    preferredEndpoint: 'chat' | 'generate'
  }>
  openAICompatible: Readonly<{
    basePath: '/v1'
    preferredEndpoint: 'chat_completions' | 'responses'
  }>
}>

export type OllamaTextChatOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  config: OllamaTextChatConfig
  model: string
  userText: string
  contextMessages?: readonly unknown[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  signal?: AbortSignal
  timeoutMs?: number
}>

type OllamaTextChatBridge = Readonly<{
  startTextChat: (payload: unknown) => Promise<unknown>
  abortTextChat: (requestId: string) => Promise<unknown>
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => () => void
  onTextChatEnd: (requestId: string, callback: () => void) => () => void
}>

function getOllamaTextChatBridge(): OllamaTextChatBridge | null {
  const bridge = (globalThis as any).ollamaChat as Partial<OllamaTextChatBridge> | undefined
  if (!bridge) return null
  if (typeof bridge.startTextChat !== 'function') return null
  if (typeof bridge.abortTextChat !== 'function') return null
  if (typeof bridge.onTextChatChunk !== 'function') return null
  if (typeof bridge.onTextChatEnd !== 'function') return null
  return bridge as OllamaTextChatBridge
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      if (record.type === 'text') return String(record.text ?? '')
      return ''
    })
    .join('')
}

export function buildOllamaTextChatMessages(input: Readonly<{
  contextMessages?: readonly unknown[]
  userText: string
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
}>): OllamaTextChatMessage[] {
  const messages: OllamaTextChatMessage[] = []
  for (const item of input.contextMessages ?? []) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = record.role
    if (role !== 'user' && role !== 'assistant') continue
    const content = textFromContent(record.content).trim()
    if (!content) continue
    messages.push({ role, content })
  }

  const userContent = buildOpenAICompatibleUserContent(input.userText, input.currentUserContentBlocks)
  if (Array.isArray(userContent)) {
    if (userContent.length > 0) messages.push({ role: 'user', content: userContent })
  } else {
    const userText = userContent.trim()
    if (userText) messages.push({ role: 'user', content: userText })
  }
  return messages
}

function isStartFailure(result: unknown): result is Readonly<{ ok: false; code?: unknown; error?: unknown }> {
  return !!result && typeof result === 'object' && (result as Record<string, unknown>).ok === false
}

async function* wireEventStream(input: Readonly<{
  bridge: OllamaTextChatBridge
  requestId: string
  start: () => Promise<unknown>
  signal?: AbortSignal
}>): AsyncGenerator<unknown> {
  const queue: unknown[] = []
  let ended = false
  let wake: (() => void) | null = null
  const notify = () => {
    if (!wake) return
    wake()
    wake = null
  }
  const offChunk = input.bridge.onTextChatChunk(input.requestId, (payload) => {
    queue.push(payload)
    notify()
  })
  const offEnd = input.bridge.onTextChatEnd(input.requestId, () => {
    ended = true
    notify()
  })
  const onAbort = () => {
    void input.bridge.abortTextChat(input.requestId)
  }
  input.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const startResult = await input.start()
    if (isStartFailure(startResult)) {
      queue.push({
        type: 'responseMeta',
        status: 0,
        requestId: input.requestId,
        provider: 'ollama_local',
        headers: {},
      })
      queue.push({
        type: 'error',
        error: {
          kind: 'transport_error',
          code: String(startResult.code ?? 'ollama_start_failed'),
          message: String(startResult.error ?? 'Ollama text chat failed to start.'),
        },
      })
      ended = true
      notify()
    }

    while (!ended || queue.length > 0) {
      const next = queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        wake = resolve
      })
    }
  } finally {
    input.signal?.removeEventListener('abort', onAbort)
    offChunk()
    offEnd()
  }
}

export async function* streamOllamaTextChatAsDomainEvents(
  options: OllamaTextChatOptions,
): AsyncGenerator<DomainEvent> {
  const requestContext = { model: options.model, stream: true }
  if (options.signal?.aborted) {
    const envelope = buildAbortEnvelope({
      phase: 'pre_stream',
      completionClass: 'aborted',
      reason: 'aborted',
      request: requestContext,
    })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  const bridge = getOllamaTextChatBridge()
  if (!bridge) {
    yield* semanticMapIpcMissingError(requestContext)
    return
  }

  const messages = buildOllamaTextChatMessages({
    contextMessages: options.contextMessages,
    userText: options.userText,
    currentUserContentBlocks: options.currentUserContentBlocks,
  })
  if (messages.length === 0) {
    yield* semanticMapIpcStartInvokeError(
      { ok: false, code: 'invalid_payload', error: 'Ollama text chat requires a text message.' },
      true,
      requestContext,
    )
    return
  }

  try {
    const wireEvents = wireEventStream({
      bridge,
      requestId: options.requestId,
      signal: options.signal,
      start: () => bridge.startTextChat({
        requestId: options.requestId,
        assistantMessageId: options.assistantMessageId,
        config: options.config,
        model: options.model,
        messages,
        ...(typeof options.timeoutMs === 'number' ? { timeoutMs: options.timeoutMs } : {}),
      }),
    })

    yield* streamWireSemanticCore({
      wireEvents,
      assistantMessageId: options.assistantMessageId,
      requestContext,
      tRequestStart: Date.now(),
      signal: options.signal,
      mapAppPhaseToEnvelopePhase,
      mapAppPhaseToEndReason,
      buildStreamErrorFromAppError,
    })
  } catch (err) {
    yield* semanticMapIpcInvokeCatchError(err, requestContext)
  }
}
