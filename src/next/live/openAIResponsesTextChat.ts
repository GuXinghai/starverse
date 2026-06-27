import type { DomainEvent } from '@/next/state/types'
import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import { streamEventToDomainEvent } from '@/next/provider/streamEventBridge'
import type { ProviderRuntimeContentBlock } from '@/next/multimodal/providerRuntimeContentBlocks'

export type OpenAIResponsesTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type OpenAIResponsesTextChatOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  model: string
  userText: string
  contextMessages?: readonly unknown[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  signal?: AbortSignal
  timeoutMs?: number
}>

type OpenAIResponsesTextChatBridge = Readonly<{
  startTextChat: (payload: unknown) => Promise<unknown>
  abortTextChat: (requestId: string) => Promise<unknown>
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => () => void
  onTextChatEnd: (requestId: string, callback: () => void) => () => void
}>

function getOpenAIResponsesTextChatBridge(): OpenAIResponsesTextChatBridge | null {
  const bridge = (globalThis as any).openAIResponsesChat as Partial<OpenAIResponsesTextChatBridge> | undefined
  if (!bridge) return null
  if (typeof bridge.startTextChat !== 'function') return null
  if (typeof bridge.abortTextChat !== 'function') return null
  if (typeof bridge.onTextChatChunk !== 'function') return null
  if (typeof bridge.onTextChatEnd !== 'function') return null
  return bridge as OpenAIResponsesTextChatBridge
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

export function buildOpenAIResponsesTextChatMessages(input: Readonly<{
  contextMessages?: readonly unknown[]
  userText: string
}>): OpenAIResponsesTextChatMessage[] {
  const messages: OpenAIResponsesTextChatMessage[] = []
  for (const item of input.contextMessages ?? []) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = record.role
    if (role !== 'user' && role !== 'assistant') continue
    const content = textFromContent(record.content).trim()
    if (!content) continue
    messages.push({ role, content })
  }

  const userText = input.userText.trim()
  if (userText) messages.push({ role: 'user', content: userText })
  return messages
}

function streamError(code: string, message: string, category: 'auth' | 'bad_request' | 'unknown' = 'unknown'): DomainEvent {
  return streamEventToDomainEvent({
    type: 'stream.error',
    error: {
      phase: 'transport',
      provider: 'openai-responses',
      category,
      code,
      message,
    },
    terminal: true,
  })
}

function streamAbort(reason: string): DomainEvent {
  return streamEventToDomainEvent({
    type: 'stream.abort',
    reason,
    error: {
      phase: 'abort',
      provider: 'openai-responses',
      category: 'aborted',
      code: 'aborted',
      message: 'OpenAI Responses text chat was aborted.',
    },
  })
}

function isStartFailure(result: unknown): result is Readonly<{ ok: false; code?: unknown; error?: unknown }> {
  return !!result && typeof result === 'object' && (result as Record<string, unknown>).ok === false
}

function isWireStreamEvent(payload: unknown): payload is Readonly<{ type: 'event'; event: StarverseStreamEvent }> {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  if (record.type !== 'event') return false
  const event = record.event as Record<string, unknown> | undefined
  return !!event && typeof event === 'object' && typeof event.type === 'string'
}

async function* wireEventStream(input: Readonly<{
  bridge: OpenAIResponsesTextChatBridge
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
        type: 'event',
        event: {
          type: 'stream.error',
          error: {
            phase: 'transport',
            provider: 'openai-responses',
            category: startResult.code === 'credential_missing' ? 'auth' : 'bad_request',
            code: String(startResult.code ?? 'openai_responses_start_failed'),
            message: String(startResult.error ?? 'OpenAI Responses text chat failed to start.'),
          },
          terminal: true,
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

export async function* streamOpenAIResponsesTextChatAsDomainEvents(
  options: OpenAIResponsesTextChatOptions,
): AsyncGenerator<DomainEvent> {
  if (options.signal?.aborted) {
    yield streamAbort('aborted')
    return
  }

  const bridge = getOpenAIResponsesTextChatBridge()
  if (!bridge) {
    yield streamError('ipc_missing', 'OpenAI Responses text chat bridge is unavailable.')
    return
  }

  const messages = buildOpenAIResponsesTextChatMessages({
    contextMessages: options.contextMessages,
    userText: options.userText,
  })
  const hasContentBlocks = (options.currentUserContentBlocks?.length ?? 0) > 0
  if (messages.length === 0 && hasContentBlocks) {
    messages.push({ role: 'user', content: '' })
  }
  if (messages.length === 0) {
    yield streamError('invalid_payload', 'OpenAI Responses text chat requires a text message.', 'bad_request')
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
        model: options.model,
        messages,
        ...(hasContentBlocks ? { currentUserContentBlocks: options.currentUserContentBlocks } : {}),
        ...(typeof options.timeoutMs === 'number' ? { timeoutMs: options.timeoutMs } : {}),
      }),
    })

    for await (const payload of wireEvents) {
      if (!isWireStreamEvent(payload)) {
        yield streamError('invalid_wire_event', 'OpenAI Responses text chat returned an invalid stream event.', 'bad_request')
        continue
      }
      yield streamEventToDomainEvent(payload.event)
    }
  } catch {
    yield streamError('ipc_invoke_failed', 'OpenAI Responses text chat failed safely.')
  }
}
