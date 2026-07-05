import type { DomainEvent } from '@/next/state/types'
import type { StreamJsonChunkMapper } from '@/next/streaming/core/types'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'

const KNOWN_FINISH_REASONS = new Set(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])

export const mapGenericOpenAICompatibleChunkToEvents: StreamJsonChunkMapper = (input) => {
  const { chunk, messageId } = input
  const choiceIndex = typeof input.choiceIndex === 'number' ? input.choiceIndex : 0
  const events: DomainEvent[] = []

  if (!chunk || typeof chunk !== 'object') return events
  const record = chunk as Record<string, unknown>

  pushMeta(events, record)

  const error = record.error
  if (error && typeof error === 'object') {
    events.push({
      type: 'StreamError',
      error: genericErrorEnvelope(error),
      terminal: true,
    })
    return events
  }

  if (record.usage) {
    events.push({ type: 'UsageDelta', usage: record.usage })
  }

  const choices = Array.isArray(record.choices) ? record.choices : []
  const choice = choices[choiceIndex]
  if (!choice || typeof choice !== 'object') return events

  const choiceRecord = choice as Record<string, unknown>
  const delta = choiceRecord.delta && typeof choiceRecord.delta === 'object'
    ? choiceRecord.delta as Record<string, unknown>
    : null
  const message = choiceRecord.message && typeof choiceRecord.message === 'object'
    ? choiceRecord.message as Record<string, unknown>
    : null

  const content = delta?.content ?? message?.content
  if (typeof content === 'string' && content.length > 0) {
    events.push({
      type: 'MessageDeltaText',
      messageId,
      choiceIndex,
      text: content,
    })
  }

  const nativeFinishReason = typeof choiceRecord.finish_reason === 'string'
    ? choiceRecord.finish_reason
    : undefined
  if (nativeFinishReason) {
    events.push({
      type: 'MetaDelta',
      meta: {
        finish_reason: normalizeFinishReason(nativeFinishReason),
        native_finish_reason: nativeFinishReason,
      },
    })
  }

  return events
}

function pushMeta(events: DomainEvent[], chunk: Record<string, unknown>) {
  const id = typeof chunk.id === 'string' ? chunk.id : undefined
  const model = typeof chunk.model === 'string' ? chunk.model : undefined
  if (!id && !model) return
  events.push({
    type: 'MetaDelta',
    meta: { id, model },
  })
}

function normalizeFinishReason(native: string): string {
  return KNOWN_FINISH_REASONS.has(native) ? native : 'unknown'
}

function genericErrorEnvelope(error: unknown): ErrorEnvelope {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const code = typeof record.code === 'string'
    ? record.code
    : typeof record.type === 'string'
      ? record.type
      : 'generic_provider_error'
  const message = typeof record.message === 'string' ? record.message : 'Generic provider error'
  return {
    phase: 'mid_stream',
    completionClass: 'error',
    openrouter: {
      code,
      message,
      provider: 'generic',
      metadata: { provider_name: 'generic' },
    },
    truncated: false,
  } as ErrorEnvelope
}
