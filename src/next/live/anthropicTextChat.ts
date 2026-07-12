import type { DomainEvent } from '@/next/state/types'
import type { ProviderStreamConfig, StarverseStreamEvent } from '@/next/provider/providerTypes'
import { streamEventToDomainEvent } from '@/next/provider/streamEventBridge'
import type { ProviderRuntimeContentBlock } from '@/next/multimodal/providerRuntimeContentBlocks'
import {
  ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  assertFinalAnthropicProviderNativeSnapshot,
  type AnthropicProviderNativeSnapshot,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'

export type AnthropicTextChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
  anthropicNativeContent?: AnthropicProviderNativeSnapshot
}>

export type AnthropicTextChatOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  model: string
  userText: string
  contextMessages?: readonly unknown[]
  currentUserContentBlocks?: ReadonlyArray<ProviderRuntimeContentBlock>
  generationParams?: ProviderStreamConfig['generationParams']
  signal?: AbortSignal
  timeoutMs?: number
}>

type AnthropicTextChatBridge = Readonly<{
  startTextChat: (payload: unknown) => Promise<unknown>
  abortTextChat: (requestId: string) => Promise<unknown>
  onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => () => void
  onTextChatEnd: (requestId: string, callback: () => void) => () => void
}>

function getAnthropicTextChatBridge(): AnthropicTextChatBridge | null {
  const bridge = (globalThis as any).anthropicChat as Partial<AnthropicTextChatBridge> | undefined
  if (!bridge) return null
  if (typeof bridge.startTextChat !== 'function') return null
  if (typeof bridge.abortTextChat !== 'function') return null
  if (typeof bridge.onTextChatChunk !== 'function') return null
  if (typeof bridge.onTextChatEnd !== 'function') return null
  return bridge as AnthropicTextChatBridge
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

export class AnthropicNativeHistoryError extends Error {
  constructor(
    readonly code:
      | 'anthropic_native_history_missing'
      | 'anthropic_native_history_not_final'
      | 'anthropic_native_history_unsupported',
    message: string,
  ) {
    super(message)
    this.name = 'AnthropicNativeHistoryError'
  }
}

function isAnthropicAssistantRecord(record: Record<string, unknown>): boolean {
  const providerId = typeof record.providerId === 'string' ? record.providerId : undefined
  const providerKey = typeof record.providerKey === 'string' ? record.providerKey : undefined
  if (providerId === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY || providerId === ANTHROPIC_MESSAGES_SOURCE_API) return true
  if (providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY || providerKey === ANTHROPIC_MESSAGES_SOURCE_API) return true
  const raw = record.providerNativeContents
  return Array.isArray(raw) && raw.some((item) =>
    !!item &&
    typeof item === 'object' &&
    (item as Record<string, unknown>).providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY &&
    (item as Record<string, unknown>).sourceApi === ANTHROPIC_MESSAGES_SOURCE_API
  )
}

function selectFinalAnthropicNativeSnapshot(record: Record<string, unknown>): AnthropicProviderNativeSnapshot | null {
  const raw = record.providerNativeContents
  if (!Array.isArray(raw)) return null
  let sawNonFinal = false
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    if (candidate.providerKey !== ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY) continue
    if (candidate.sourceApi !== ANTHROPIC_MESSAGES_SOURCE_API) continue
    if (candidate.snapshotKey !== ANTHROPIC_ASSISTANT_SNAPSHOT_KEY) continue
    if (candidate.status !== 'final') {
      sawNonFinal = true
      continue
    }
    try {
      return assertFinalAnthropicProviderNativeSnapshot(candidate)
    } catch {
      throw new AnthropicNativeHistoryError(
        'anthropic_native_history_not_final',
        'Anthropic assistant history contains invalid native content.',
      )
    }
  }
  if (sawNonFinal) {
    throw new AnthropicNativeHistoryError(
      'anthropic_native_history_not_final',
      'Anthropic assistant history contains non-final native content.',
    )
  }
  return null
}

export function buildAnthropicTextChatMessages(input: Readonly<{
  contextMessages?: readonly unknown[]
  userText: string
}>): AnthropicTextChatMessage[] {
  const messages: AnthropicTextChatMessage[] = []
  for (const item of input.contextMessages ?? []) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = record.role
    if (role !== 'user' && role !== 'assistant') continue
    if (role === 'assistant') {
      if (!isAnthropicAssistantRecord(record)) {
        throw new AnthropicNativeHistoryError(
          'anthropic_native_history_unsupported',
          'Anthropic Messages history cannot include non-Anthropic assistant messages.',
        )
      }
      const nativeSnapshot = selectFinalAnthropicNativeSnapshot(record)
      if (!nativeSnapshot) {
        throw new AnthropicNativeHistoryError(
          'anthropic_native_history_missing',
          'Anthropic assistant history is missing final native content.',
        )
      }
      messages.push({ role, content: textFromContent(record.content).trim(), anthropicNativeContent: nativeSnapshot })
      continue
    }
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
      provider: 'anthropic',
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
      provider: 'anthropic',
      category: 'aborted',
      code: 'aborted',
      message: 'Anthropic Messages text chat was aborted.',
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

function isWireEnd(payload: unknown): payload is Readonly<{ type: 'end' }> {
  return !!payload && typeof payload === 'object' && (payload as Record<string, unknown>).type === 'end'
}

async function* wireEventStream(input: Readonly<{
  bridge: AnthropicTextChatBridge
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
            provider: 'anthropic',
            category: startResult.code === 'credential_missing' ? 'auth' : 'bad_request',
            code: String(startResult.code ?? 'anthropic_start_failed'),
            message: String(startResult.error ?? 'Anthropic Messages text chat failed to start.'),
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

export async function* streamAnthropicTextChatAsDomainEvents(
  options: AnthropicTextChatOptions,
): AsyncGenerator<DomainEvent> {
  if (options.signal?.aborted) {
    yield streamAbort('aborted')
    return
  }

  const bridge = getAnthropicTextChatBridge()
  if (!bridge) {
    yield streamError('ipc_missing', 'Anthropic Messages text chat bridge is unavailable.')
    return
  }

  let messages: AnthropicTextChatMessage[]
  try {
    messages = buildAnthropicTextChatMessages({
      contextMessages: options.contextMessages,
      userText: options.userText,
    })
  } catch (err) {
    if (err instanceof AnthropicNativeHistoryError) {
      yield streamError(err.code, err.message, 'bad_request')
      return
    }
    throw err
  }
  const hasContentBlocks = (options.currentUserContentBlocks?.length ?? 0) > 0
  if (messages.length === 0 && hasContentBlocks) {
    messages.push({ role: 'user', content: '' })
  }
  if (messages.length === 0) {
    yield streamError('invalid_payload', 'Anthropic Messages text chat requires a text message.', 'bad_request')
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
        ...(options.generationParams ? { generationParams: options.generationParams } : {}),
        ...(hasContentBlocks ? { currentUserContentBlocks: options.currentUserContentBlocks } : {}),
        ...(typeof options.timeoutMs === 'number' ? { timeoutMs: options.timeoutMs } : {}),
      }),
    })

    for await (const payload of wireEvents) {
      if (isWireEnd(payload)) continue
      if (!isWireStreamEvent(payload)) {
        yield streamError('invalid_wire_event', 'Anthropic Messages text chat returned an invalid stream event.', 'bad_request')
        continue
      }
      yield streamEventToDomainEvent(payload.event)
    }
  } catch {
    yield streamError('ipc_invoke_failed', 'Anthropic Messages text chat failed safely.')
  }
}
