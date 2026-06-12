/**
 * Bidirectional bridge between StarverseStreamEvent (provider-neutral IR)
 * and DomainEvent (current state reducer vocabulary).
 *
 * This bridge ensures existing state reducers, timing, and DB persistence
 * continue to work unchanged while the provider layer uses its own IR.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md §6
 */

import type { DomainEvent } from '@/next/state/types'
import type { StarverseStreamEvent, StarverseProviderError } from './providerTypes'
import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'

/**
 * Convert an OpenRouter ErrorEnvelope to a StarverseProviderError.
 * Used when bridging OpenRouter DomainEvent errors to the provider-neutral shape.
 *
 * The original ErrorEnvelope is preserved in `raw` for lossless roundtrip.
 */
function errorEnvelopeToProviderError(env: ErrorEnvelope): StarverseProviderError {
  return {
    phase: env.phase === 'pre_stream' ? 'transport' : env.phase === 'mid_stream' ? 'stream' : 'provider',
    provider: 'openrouter',
    category: env.completionClass === 'aborted' ? 'aborted' : 'unknown',
    message: env.openrouter.message ?? 'error',
    code: env.openrouter.code,
    ...(env.http?.status ? { httpStatus: env.http.status } : {}),
    raw: env,
  }
}

/**
 * Shape guard: check if a value looks like a valid OpenRouter ErrorEnvelope.
 * Narrow check — only verifies the discriminator fields that current consumers depend on.
 */
function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.completionClass === 'string' &&
    typeof obj.phase === 'string' &&
    obj.openrouter != null &&
    typeof obj.openrouter === 'object' &&
    typeof (obj.openrouter as Record<string, unknown>).code === 'string' &&
    typeof obj.truncated === 'boolean'
  )
}

/**
 * Convert a StarverseProviderError back to an OpenRouter ErrorEnvelope.
 *
 * If the StarverseProviderError was created from an OpenRouter ErrorEnvelope
 * (i.e. raw contains a valid ErrorEnvelope), return the original unchanged
 * to preserve all fields losslessly.
 *
 * Otherwise construct a minimal ErrorEnvelope for non-OpenRouter bridge fallback.
 */
function providerErrorToErrorEnvelope(err: StarverseProviderError): ErrorEnvelope {
  // Lossless path: raw contains the original ErrorEnvelope
  if (isErrorEnvelope(err.raw)) {
    return err.raw
  }

  // Fallback path: non-OpenRouter errors get a minimal ErrorEnvelope
  return {
    phase: err.phase === 'transport' ? 'pre_stream' : err.phase === 'stream' ? 'mid_stream' : 'post_stream',
    completionClass: err.category === 'aborted' ? 'aborted' : 'error',
    openrouter: {
      code: err.code ?? 'error',
      message: err.message,
    },
    truncated: false,
  } as ErrorEnvelope
}

/**
 * Convert a StarverseStreamEvent into a DomainEvent for consumption
 * by the existing state reducer / timing / DB persistence path.
 *
 * Mapping is 1:1 and preserves all field values. The only difference
 * is the event type discriminator (dot-separated vs PascalCase).
 */
export function streamEventToDomainEvent(event: StarverseStreamEvent): DomainEvent {
  switch (event.type) {
    case 'stream.comment':
      return { type: 'StreamComment', text: event.text }
    case 'stream.error':
      return { type: 'StreamError', error: providerErrorToErrorEnvelope(event.error), terminal: true }
    case 'stream.done':
      return { type: 'StreamDone' }
    case 'stream.abort':
      return { type: 'StreamAbort', reason: event.reason, envelope: providerErrorToErrorEnvelope(event.error) }
    case 'stream.timing':
      return {
        type: 'TimingSnapshot',
        tRequestStart: event.tRequestStart,
        tAck: event.tAck,
        tEnd: event.tEnd,
        endReason: event.endReason as any,
        tTransportClosed: event.tTransportClosed,
      }
    case 'message.text_delta':
      return { type: 'MessageDeltaText', messageId: event.messageId, choiceIndex: event.choiceIndex, text: event.text }
    case 'message.content_block_append':
      return { type: 'MessageAppendContentBlock', messageId: event.messageId, choiceIndex: event.choiceIndex, block: event.block }
    case 'message.tool_call_delta':
      return {
        type: 'MessageDeltaToolCall',
        messageId: event.messageId,
        choiceIndex: event.choiceIndex,
        mergeStrategy: event.mergeStrategy,
        toolCallDeltas: event.toolCallDeltas,
      }
    case 'message.annotation_batch':
      return {
        type: 'MessageDeltaAnnotationBatch',
        messageId: event.messageId,
        choiceIndex: event.choiceIndex,
        mergeStrategy: event.mergeStrategy,
        annotations: event.annotations,
      }
    case 'message.reasoning_detail':
      return { type: 'MessageDeltaReasoningDetail', messageId: event.messageId, choiceIndex: event.choiceIndex, detail: event.detail, chunkNo: event.chunkNo }
    case 'message.reasoning_detail_batch':
      return { type: 'MessageDeltaReasoningDetailBatch', messageId: event.messageId, choiceIndex: event.choiceIndex, details: event.details }
    case 'usage.delta':
      return { type: 'UsageDelta', usage: event.usage }
    case 'meta.delta':
      return { type: 'MetaDelta', meta: event.meta }
  }
}

/**
 * Convert a DomainEvent into a StarverseStreamEvent.
 *
 * Used when existing OpenRouter modules produce DomainEvent directly
 * and the adapter needs to re-export them in the provider-neutral vocabulary.
 */
export function domainEventToStreamEvent(event: DomainEvent): StarverseStreamEvent {
  switch (event.type) {
    case 'StreamComment':
      return { type: 'stream.comment', text: event.text }
    case 'StreamError':
      return { type: 'stream.error', error: errorEnvelopeToProviderError(event.error), terminal: true }
    case 'StreamDone':
      return { type: 'stream.done' }
    case 'StreamAbort':
      return { type: 'stream.abort', reason: event.reason, error: errorEnvelopeToProviderError(event.envelope) }
    case 'TimingSnapshot':
      return {
        type: 'stream.timing',
        tRequestStart: event.tRequestStart,
        tAck: event.tAck,
        tEnd: event.tEnd,
        endReason: event.endReason,
        tTransportClosed: event.tTransportClosed,
      }
    case 'MessageDeltaText':
      return { type: 'message.text_delta', messageId: event.messageId, choiceIndex: event.choiceIndex, text: event.text }
    case 'MessageAppendContentBlock':
      return { type: 'message.content_block_append', messageId: event.messageId, choiceIndex: event.choiceIndex, block: event.block }
    case 'MessageDeltaToolCall':
      return {
        type: 'message.tool_call_delta',
        messageId: event.messageId,
        choiceIndex: event.choiceIndex,
        mergeStrategy: event.mergeStrategy,
        toolCallDeltas: event.toolCallDeltas,
      }
    case 'MessageDeltaAnnotationBatch':
      return {
        type: 'message.annotation_batch',
        messageId: event.messageId,
        choiceIndex: event.choiceIndex,
        mergeStrategy: event.mergeStrategy,
        annotations: event.annotations,
      }
    case 'MessageDeltaReasoningDetail':
      return { type: 'message.reasoning_detail', messageId: event.messageId, choiceIndex: event.choiceIndex, detail: event.detail, chunkNo: event.chunkNo }
    case 'MessageDeltaReasoningDetailBatch':
      return { type: 'message.reasoning_detail_batch', messageId: event.messageId, choiceIndex: event.choiceIndex, details: event.details }
    case 'UsageDelta':
      return { type: 'usage.delta', usage: event.usage }
    case 'MetaDelta':
      return { type: 'meta.delta', meta: event.meta }
  }
}
