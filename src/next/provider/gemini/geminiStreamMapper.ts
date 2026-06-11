/**
 * Gemini API / Google AI Studio stream event mapper — fixture-level provider proof.
 *
 * Maps Gemini API GenerateContentResponse stream chunks to StarverseStreamEvent.
 *
 * Gemini uses a different streaming model from OpenAI/Anthropic:
 * - Each stream chunk is a full GenerateContentResponse
 * - Content is in candidates[].content.parts[]
 * - Parts have type-specific fields: text, functionCall, thought
 * - Thinking/reasoning is indicated by part.thought === true
 * - Usage is in usageMetadata with thought-specific token counts
 * - Finish reason is in candidates[].finishReason
 *
 * Key Gemini quirks handled here:
 * - text parts (thought !== true) → visible text
 * - text parts (thought === true) → reasoning (NEVER visible text)
 * - functionCall parts → ignored (no tool delta shape in Starverse)
 * - usageMetadata → usage.delta
 * - finishReason → meta.delta + stream.done
 * - safetyRatings → not mapped (no safety policy system)
 * - error → stream.error terminal
 *
 * @see https://ai.google.dev/api/generate-content
 * @see https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse
 */

import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Gemini response types — provider-native schema, contained here only
// ---------------------------------------------------------------------------

export type GeminiPart = Readonly<{
  text?: string
  thought?: boolean
  functionCall?: Readonly<{ name: string; args?: unknown }>
  functionResponse?: Readonly<{ name: string; response: unknown }>
  inlineData?: Readonly<{ mimeType: string; data: string }>
}>

export type GeminiContent = Readonly<{
  parts?: ReadonlyArray<GeminiPart>
  role?: string
}>

export type GeminiCandidate = Readonly<{
  content?: GeminiContent
  finishReason?: string
  safetyRatings?: ReadonlyArray<Readonly<{
    category: string
    probability: string
  }>>
  index?: number
}>

export type GeminiUsageMetadata = Readonly<{
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
  thoughtsTokenCount?: number
  cachedContentTokenCount?: number
}>

export type GeminiStreamChunk = Readonly<{
  candidates?: ReadonlyArray<GeminiCandidate>
  usageMetadata?: GeminiUsageMetadata
  modelVersion?: string
  error?: Readonly<{ code: number; message: string; status?: string }>
}>

// ---------------------------------------------------------------------------
// Known finish reasons
// ---------------------------------------------------------------------------

const KNOWN_FINISH_REASONS: Record<string, string> = {
  'STOP': 'stop',
  'MAX_TOKENS': 'max_tokens',
  'SAFETY': 'safety',
  'RECITATION': 'recitation',
  'OTHER': 'other',
  'FINISH_REASON_UNSPECIFIED': 'unknown',
}

function normalizeFinishReason(native: string | undefined): string {
  if (!native) return 'unknown'
  return KNOWN_FINISH_REASONS[native] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// mapGeminiStreamChunkToStarverse — pure function
// ---------------------------------------------------------------------------

/**
 * Map a parsed Gemini GenerateContentResponse chunk to zero or more StarverseStreamEvent.
 *
 * - Pure function: emits events only; does not write any state.
 * - text parts with thought !== true → message.text_delta.
 * - text parts with thought === true → message.reasoning_detail. NEVER visible text.
 * - functionCall parts → ignored (no tool delta event shape).
 * - usageMetadata → usage.delta.
 * - finishReason → meta.delta.
 * - Terminal response (finishReason present) → stream.done.
 * - error → terminal stream.error.
 * - Unknown fields silently ignored.
 */
export function mapGeminiStreamChunkToStarverse(
  chunk: GeminiStreamChunk,
  messageId: string,
): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []

  // Error chunk (terminal)
  if (chunk.error) {
    events.push({
      type: 'stream.error',
      error: {
        phase: 'mid_stream',
        completionClass: 'error',
        openrouter: {
          code: String(chunk.error.code ?? 'error'),
          message: chunk.error.message ?? 'Gemini error',
        },
        truncated: false,
      } as any,
      terminal: true,
    })
    return events
  }

  // Usage metadata
  if (chunk.usageMetadata) {
    events.push({ type: 'usage.delta', usage: chunk.usageMetadata })
  }

  // Process candidates (prefer index 0)
  const candidates = chunk.candidates
  if (!candidates || candidates.length === 0) return events

  const candidate = candidates[0]
  if (!candidate) return events

  // Process content parts
  const content = candidate.content
  if (content?.parts) {
    for (const part of content.parts) {
      // Thought/reasoning part — NEVER visible text
      if (part.thought === true) {
        if (typeof part.text === 'string' && part.text.length > 0) {
          events.push({
            type: 'message.reasoning_detail',
            messageId,
            choiceIndex: 0,
            detail: { type: 'thought', text: part.text },
          })
        }
        continue
      }

      // Visible text part
      if (typeof part.text === 'string' && part.text.length > 0) {
        events.push({
          type: 'message.text_delta',
          messageId,
          choiceIndex: 0,
          text: part.text,
        })
        continue
      }

      // Function call part — ignored (no tool delta shape)
      if (part.functionCall) {
        // Intentionally ignored. Does not become visible text.
        continue
      }

      // Function response part — ignored
      if (part.functionResponse) {
        continue
      }

      // Inline data part — ignored
      if (part.inlineData) {
        continue
      }
    }
  }

  // Finish reason → meta.delta + stream.done
  if (candidate.finishReason) {
    const native = candidate.finishReason
    const normalized = normalizeFinishReason(native)
    events.push({
      type: 'meta.delta',
      meta: {
        finish_reason: normalized,
        native_finish_reason: native,
      },
    })
    events.push({ type: 'stream.done' })
  }

  return events
}
