/**
 * DeepSeek stream chunk mapper — fixture-level provider proof.
 *
 * Maps DeepSeek API stream chunks (OpenAI-compatible transport with
 * DeepSeek-specific `reasoning_content` field) to StarverseStreamEvent.
 *
 * Key DeepSeek quirks handled here:
 * - `delta.reasoning_content` → reasoning event (NEVER visible text)
 * - `delta.content` → visible text event
 * - Reasoning and visible text order is preserved
 * - `finish_reason` → meta + done
 *
 * DeepSeek quirks stay inside this folder. They must NOT leak into
 * generic OpenAI-compatible adapter defaults.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md §7
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.5
 */

import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// DeepSeek chunk types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type DeepSeekDelta = Readonly<{
  role?: string
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: ReadonlyArray<Readonly<{
    index: number
    id?: string
    type?: string
    function?: Readonly<{ name?: string; arguments?: string }>
  }>>
}>

export type DeepSeekChoice = Readonly<{
  index: number
  delta?: DeepSeekDelta
  finish_reason?: string | null
}>

export type DeepSeekChunk = Readonly<{
  id?: string
  model?: string
  choices?: ReadonlyArray<DeepSeekChoice>
  usage?: Readonly<{
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_cache_hit_tokens?: number
    prompt_cache_miss_tokens?: number
    completion_tokens_details?: Readonly<{
      reasoning_tokens?: number
    }>
  }>
  error?: Readonly<{ code?: string; message?: string; type?: string }>
}>

// ---------------------------------------------------------------------------
// Known finish reasons
// ---------------------------------------------------------------------------

const KNOWN_FINISH_REASONS = new Set([
  'stop',
  'length',
  'tool_calls',
  'content_filter',
  'error',
])

function normalizeFinishReason(native: string | null | undefined): string | undefined {
  if (typeof native !== 'string' || !native) return undefined
  return KNOWN_FINISH_REASONS.has(native) ? native : 'unknown'
}

// ---------------------------------------------------------------------------
// mapDeepSeekChunkToEvents — pure function, no state mutation
// ---------------------------------------------------------------------------

export type DeepSeekChunkInput = Readonly<{
  chunk: DeepSeekChunk
  messageId: string
  choiceIndex?: number
  chunkNo?: number
}>

/**
 * Map a parsed DeepSeek JSON chunk into StarverseStreamEvent[].
 *
 * - Pure function: emits events only; does not write any state.
 * - `reasoning_content` is mapped to reasoning events, NEVER to visible text.
 * - `content` is mapped to visible text events.
 * - Order of reasoning/text chunks is preserved in the output array.
 */
export function mapDeepSeekChunkToEvents(input: DeepSeekChunkInput): StarverseStreamEvent[] {
  const { chunk, messageId } = input
  const choiceIndex = typeof input.choiceIndex === 'number' ? input.choiceIndex : 0
  const events: StarverseStreamEvent[] = []

  // Meta extraction
  pushMeta(events, chunk)

  // Error chunk (terminal)
  if (chunk.error) {
    events.push({
      type: 'stream.error',
      error: {
        phase: 'mid_stream',
        completionClass: 'error',
        openrouter: {
          code: String(chunk.error.code ?? 'error'),
          message: chunk.error.message,
        },
        truncated: false,
      } as any,
      terminal: true,
    })
    return events
  }

  // Usage chunk (no choices)
  if (chunk.usage) {
    events.push({ type: 'usage.delta', usage: chunk.usage })
  }

  const choices = chunk.choices
  if (!choices || choices.length === 0) return events

  const choice = choices[choiceIndex]
  if (!choice) return events

  const delta = choice.delta
  if (!delta) return events

  // Reasoning content — NEVER visible text
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
    events.push({
      type: 'message.reasoning_detail',
      messageId,
      choiceIndex,
      detail: { text: delta.reasoning_content, type: 'reasoning_content' },
      chunkNo: input.chunkNo,
    })
  }

  // Visible text content
  if (typeof delta.content === 'string' && delta.content.length > 0) {
    events.push({
      type: 'message.text_delta',
      messageId,
      choiceIndex,
      text: delta.content,
    })
  }

  // Tool calls
  if (delta.tool_calls && delta.tool_calls.length > 0) {
    events.push({
      type: 'message.tool_call_delta',
      messageId,
      choiceIndex,
      mergeStrategy: 'append',
      toolCallDeltas: delta.tool_calls.map((tc) => ({
        index: tc.index,
        id: tc.id,
        type: tc.type,
        function: tc.function ? { name: tc.function.name, arguments: tc.function.arguments } : undefined,
      })),
    })
  }

  // Finish reason → meta + done
  if (choice.finish_reason) {
    const normalized = normalizeFinishReason(choice.finish_reason)
    events.push({
      type: 'meta.delta',
      meta: {
        ...(chunk.id ? { id: chunk.id } : {}),
        ...(chunk.model ? { model: chunk.model } : {}),
        finish_reason: normalized,
        native_finish_reason: choice.finish_reason,
      },
    })
    events.push({ type: 'stream.done' })
  }

  return events
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pushMeta(events: StarverseStreamEvent[], chunk: DeepSeekChunk) {
  const id = typeof chunk.id === 'string' ? chunk.id : undefined
  const model = typeof chunk.model === 'string' ? chunk.model : undefined
  if (id || model) {
    events.push({
      type: 'meta.delta',
      meta: { id, model },
    })
  }
}
