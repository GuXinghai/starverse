/**
 * OpenAI Responses stream event mapper — fixture-level provider proof.
 *
 * Maps OpenAI Responses API stream events to StarverseStreamEvent.
 *
 * OpenAI Responses uses a typed event stream with event names like
 * `response.output_text.delta`, `response.reasoning_summary_text.delta`,
 * `response.completed`, etc. Each event has a `type` discriminant.
 *
 * Key quirks handled here:
 * - `response.output_text.delta` → visible text (message.text_delta)
 * - `response.reasoning_summary_text.delta` → reasoning (message.reasoning_detail)
 * - `response.reasoning_text.delta` → reasoning (message.reasoning_detail)
 * - Reasoning text NEVER becomes visible text
 * - `response.completed` → usage.delta + stream.done
 * - `response.failed` / `response.incomplete` → stream.error terminal
 *
 * @see https://platform.openai.com/docs/api-reference/responses-streaming
 * @see OpenAI SDK types: ResponseStreamEvent union
 */

import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// OpenAI Responses event types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type OpenAIResponsesStreamEvent = Readonly<{
  type: string
  [key: string]: unknown
}>

// ---------------------------------------------------------------------------
// mapOpenAIResponsesEventToStarverse — pure function
// ---------------------------------------------------------------------------

/**
 * Map a single OpenAI Responses stream event to zero or more StarverseStreamEvent.
 *
 * - Pure function: emits events only; does not write any state.
 * - `response.output_text.delta` → visible text event.
 * - `response.reasoning_summary_text.delta` / `response.reasoning_text.delta` → reasoning event.
 * - Reasoning text NEVER becomes visible text.
 * - `response.completed` → usage + done.
 * - `response.failed` / `response.incomplete` → terminal error.
 * - Unknown event types are silently ignored (return empty array).
 */
export function mapOpenAIResponsesEventToStarverse(
  event: OpenAIResponsesStreamEvent,
  messageId: string,
): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []

  switch (event.type) {
    // -----------------------------------------------------------------------
    // Visible text
    // -----------------------------------------------------------------------
    case 'response.output_text.delta': {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      if (delta.length > 0) {
        events.push({
          type: 'message.text_delta',
          messageId,
          choiceIndex: 0,
          text: delta,
        })
      }
      break
    }

    case 'response.output_text.done':
      // Text finalized; no event needed (already streamed via delta)
      break

    // -----------------------------------------------------------------------
    // Reasoning summary
    // -----------------------------------------------------------------------
    case 'response.reasoning_summary_text.delta': {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      if (delta.length > 0) {
        events.push({
          type: 'message.reasoning_detail',
          messageId,
          choiceIndex: 0,
          detail: { type: 'reasoning_summary', text: delta },
        })
      }
      break
    }

    case 'response.reasoning_summary_text.done':
      // Summary finalized; no event needed
      break

    // -----------------------------------------------------------------------
    // Reasoning text (full reasoning content, not just summary)
    // -----------------------------------------------------------------------
    case 'response.reasoning_text.delta': {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      if (delta.length > 0) {
        events.push({
          type: 'message.reasoning_detail',
          messageId,
          choiceIndex: 0,
          detail: { type: 'reasoning_text', text: delta },
        })
      }
      break
    }

    case 'response.reasoning_text.done':
      // Reasoning text finalized; no event needed
      break

    // -----------------------------------------------------------------------
    // Output item done — may contain reasoning item with encrypted_content
    // -----------------------------------------------------------------------
    case 'response.output_item.done': {
      const item = event.item as Record<string, unknown> | undefined
      if (item?.type === 'reasoning') {
        // Reasoning output item finalized — emit as opaque artifact
        const summary = Array.isArray(item.summary) ? item.summary : []
        const encryptedContent = typeof item.encrypted_content === 'string' ? item.encrypted_content : null
        const status = typeof item.status === 'string' ? item.status : undefined

        events.push({
          type: 'message.reasoning_detail',
          messageId,
          choiceIndex: 0,
          detail: {
            type: 'reasoning_item',
            id: typeof item.id === 'string' ? item.id : undefined,
            summary: summary.map((s: any) => ({ text: typeof s?.text === 'string' ? s.text : '', type: 'summary_text' })),
            ...(encryptedContent ? { encrypted_content: encryptedContent } : {}),
            ...(status ? { status } : {}),
          },
        })
      }
      break
    }

    // -----------------------------------------------------------------------
    // Terminal: completed
    // -----------------------------------------------------------------------
    case 'response.completed': {
      const response = event.response as Record<string, unknown> | undefined
      if (response?.usage) {
        events.push({ type: 'usage.delta', usage: response.usage })
      }

      // Extract meta from response
      const id = typeof response?.id === 'string' ? response.id : undefined
      const model = typeof response?.model === 'string' ? response.model : undefined
      if (id || model) {
        events.push({
          type: 'meta.delta',
          meta: {
            ...(id ? { id } : {}),
            ...(model ? { model } : {}),
            finish_reason: 'stop',
          },
        })
      }

      events.push({ type: 'stream.done' })
      break
    }

    // -----------------------------------------------------------------------
    // Terminal: incomplete
    // -----------------------------------------------------------------------
    case 'response.incomplete': {
      const response = event.response as Record<string, unknown> | undefined
      const incompleteDetails = response?.incomplete_details as Record<string, unknown> | undefined
      const reason = typeof incompleteDetails?.reason === 'string' ? incompleteDetails.reason : 'unknown'

      events.push({
        type: 'stream.error',
        error: {
          phase: 'provider',
          provider: 'openai-responses',
          category: 'provider_error',
          message: `Response incomplete${reason !== 'unknown' ? `: ${reason}` : ''}`,
          code: reason,
        },
        terminal: true,
      })
      break
    }

    // -----------------------------------------------------------------------
    // Terminal: failed
    // -----------------------------------------------------------------------
    case 'response.failed': {
      const response = event.response as Record<string, unknown> | undefined
      const error = response?.error as Record<string, unknown> | undefined
      const code = typeof error?.code === 'string' ? error.code : 'error'
      const message = typeof error?.message === 'string' ? error.message : 'Response failed'

      events.push({
        type: 'stream.error',
        error: {
          phase: 'provider',
          provider: 'openai-responses',
          category: 'provider_error',
          message,
          code,
        },
        terminal: true,
      })
      break
    }

    // -----------------------------------------------------------------------
    // Error event (top-level, official SDK type)
    // -----------------------------------------------------------------------
    case 'error': {
      const error = event.error as Record<string, unknown> | undefined
      const code = typeof error?.code === 'string' ? error.code : 'error'
      const message = typeof error?.message === 'string' ? error.message : 'Response error'

      events.push({
        type: 'stream.error',
        error: {
          phase: 'provider',
          provider: 'openai-responses',
          category: 'provider_error',
          message,
          code,
        },
        terminal: true,
      })
      break
    }

    // -----------------------------------------------------------------------
    // All other events (lifecycle, tool calls, etc.) — silently ignored
    // -----------------------------------------------------------------------
    default:
      break
  }

  return events
}
