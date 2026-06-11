/**
 * Anthropic Messages API stream event mapper — fixture-level provider proof.
 *
 * Maps Anthropic Messages API stream events to StarverseStreamEvent.
 *
 * Anthropic uses event-name-prefixed SSE with these event types:
 * - message_start, message_delta, message_stop
 * - content_block_start, content_block_delta, content_block_stop
 *
 * Key Anthropic quirks handled here:
 * - content_block_delta with type "text_delta" → visible text
 * - content_block_delta with type "thinking_delta" → reasoning (NEVER visible text)
 * - content_block_delta with type "signature_delta" → reasoning detail
 * - content_block_delta with type "input_json_delta" → ignored (no tool delta shape)
 * - Usage split across message_start (input) and message_delta (output)
 * - stop_reason in message_delta → meta.delta
 * - message_stop → stream.done
 * - error → stream.error terminal
 *
 * @see https://docs.anthropic.com/en/api/messages-streaming
 * @see Anthropic SDK types: RawMessageStreamEvent union
 */

import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Anthropic event types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type AnthropicStreamEvent = Readonly<{
  type: string
  [key: string]: unknown
}>

// ---------------------------------------------------------------------------
// mapAnthropicStreamEventToStarverse — pure function
// ---------------------------------------------------------------------------

/**
 * Map a single Anthropic Messages API stream event to zero or more StarverseStreamEvent.
 *
 * - Pure function: emits events only; does not write any state.
 * - "text_delta" → message.text_delta.
 * - "thinking_delta" → message.reasoning_detail. NEVER visible text.
 * - "signature_delta" → message.reasoning_detail (opaque provider signature).
 * - "input_json_delta" → ignored (no tool delta event shape in Starverse).
 * - Usage from message_start and message_delta → usage.delta at message_delta.
 * - stop_reason → meta.delta with normalized finish reason.
 * - message_stop → stream.done.
 * - error → terminal stream.error.
 * - Unknown events silently ignored.
 */
export function mapAnthropicStreamEventToStarverse(
  event: AnthropicStreamEvent,
  messageId: string,
): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []

  switch (event.type) {
    // -------------------------------------------------------------------
    // message_start — extract input usage and meta
    // -------------------------------------------------------------------
    case 'message_start': {
      const message = event.message as Record<string, unknown> | undefined
      if (message) {
        const id = typeof message.id === 'string' ? message.id : undefined
        const model = typeof message.model === 'string' ? message.model : undefined
        if (id || model) {
          events.push({
            type: 'meta.delta',
            meta: { id, model },
          })
        }
        // Store input usage for later combination with message_delta usage
        // We emit it immediately as a partial usage event
        if (message.usage) {
          events.push({ type: 'usage.delta', usage: message.usage })
        }
      }
      break
    }

    // -------------------------------------------------------------------
    // content_block_delta — text, thinking, signature, input_json
    // -------------------------------------------------------------------
    case 'content_block_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      if (!delta) break

      switch (delta.type) {
        case 'text_delta': {
          const text = typeof delta.text === 'string' ? delta.text : ''
          if (text.length > 0) {
            events.push({
              type: 'message.text_delta',
              messageId,
              choiceIndex: 0,
              text,
            })
          }
          break
        }

        case 'thinking_delta': {
          const thinking = typeof delta.thinking === 'string' ? delta.thinking : ''
          if (thinking.length > 0) {
            events.push({
              type: 'message.reasoning_detail',
              messageId,
              choiceIndex: 0,
              detail: { type: 'thinking_delta', thinking },
            })
          }
          break
        }

        case 'signature_delta': {
          const signature = typeof delta.signature === 'string' ? delta.signature : ''
          if (signature.length > 0) {
            events.push({
              type: 'message.reasoning_detail',
              messageId,
              choiceIndex: 0,
              detail: { type: 'signature_delta', signature },
            })
          }
          break
        }

        case 'input_json_delta':
          // Tool input JSON streaming — no tool delta event shape in Starverse.
          // Intentionally ignored. Does not become visible text.
          break

        case 'citations_delta':
          // Citations — not mapped in this proof.
          break
      }
      break
    }

    // -------------------------------------------------------------------
    // message_delta — stop_reason, usage, stop_sequence
    // -------------------------------------------------------------------
    case 'message_delta': {
      const delta = event.delta as Record<string, unknown> | undefined
      const usage = event.usage as Record<string, unknown> | undefined

      // Stop reason → meta.delta
      if (delta?.stop_reason) {
        const nativeStopReason = String(delta.stop_reason)
        const normalized = normalizeStopReason(nativeStopReason)
        events.push({
          type: 'meta.delta',
          meta: {
            finish_reason: normalized,
            native_finish_reason: nativeStopReason,
          },
        })
      }

      // Output usage → usage.delta
      if (usage) {
        events.push({ type: 'usage.delta', usage })
      }
      break
    }

    // -------------------------------------------------------------------
    // message_stop — terminal done
    // -------------------------------------------------------------------
    case 'message_stop': {
      events.push({ type: 'stream.done' })
      break
    }

    // -------------------------------------------------------------------
    // error — terminal error
    // -------------------------------------------------------------------
    case 'error': {
      const error = event.error as Record<string, unknown> | undefined
      const code = typeof error?.type === 'string' ? error.type : (typeof error?.code === 'string' ? error.code : 'error')
      const message = typeof error?.message === 'string' ? error.message : 'Anthropic error'

      events.push({
        type: 'stream.error',
        error: {
          phase: 'provider',
          provider: 'anthropic',
          category: 'provider_error',
          message,
          code,
        },
        terminal: true,
      })
      break
    }

    // -------------------------------------------------------------------
    // content_block_start / content_block_stop — lifecycle, ignored
    // -------------------------------------------------------------------
    case 'content_block_start':
    case 'content_block_stop':
      // Lifecycle events — no visible text by default.
      break

    // -------------------------------------------------------------------
    // ping and all other events — silently ignored
    // -------------------------------------------------------------------
    default:
      break
  }

  return events
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const KNOWN_STOP_REASONS = new Set([
  'end_turn',
  'max_tokens',
  'stop_sequence',
  'tool_use',
  'pause_turn',
  'refusal',
])

function normalizeStopReason(native: string): string {
  return KNOWN_STOP_REASONS.has(native) ? native : 'unknown'
}
