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

export type GeminiPromptFeedback = Readonly<{
  blockReason?: string
  safetyRatings?: ReadonlyArray<Readonly<{
    category: string
    probability: string
  }>>
}>

export type GeminiStreamChunk = Readonly<{
  candidates?: ReadonlyArray<GeminiCandidate>
  usageMetadata?: GeminiUsageMetadata
  promptFeedback?: GeminiPromptFeedback
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
 * - text parts with thought === true → message.reasoning_raw_detail. NEVER visible text.
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
        phase: 'stream',
        provider: 'gemini',
        category: 'provider_error',
        message: chunk.error.message ?? 'Gemini error',
        code: String(chunk.error.code ?? 'error'),
        ...(chunk.error.status ? { raw: { status: chunk.error.status } } : {}),
      },
      terminal: true,
    })
    return events
  }

  // Usage metadata
  if (chunk.usageMetadata) {
    events.push({ type: 'usage.delta', usage: chunk.usageMetadata })
  }

  // Prompt feedback / block reason — does not become visible text
  if (chunk.promptFeedback?.blockReason) {
    const blockReason = chunk.promptFeedback.blockReason
    events.push({
      type: 'meta.delta',
      meta: {
        native_finish_reason: `BLOCKED:${blockReason}`,
      },
    })
    events.push({
      type: 'stream.error',
      error: {
        phase: 'stream',
        provider: 'gemini',
        category: 'provider_error',
        message: `Google AI Studio prompt was blocked: ${blockReason}`,
        code: `prompt_blocked_${String(blockReason).toLowerCase()}`,
      },
      terminal: true,
    })
    return events
  }

  // Process candidates (uses candidates[0])
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
            type: 'message.reasoning_raw_detail',
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

export function mapGeminiInteractionResponseToStarverse(
  payload: unknown,
  messageId: string,
): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []
  const reasoningDetails = collectGeminiInteractionReasoningDetails(payload)
  const reasoningDisplayBlocks = buildGeminiInteractionReasoningDisplayBlocks(reasoningDetails, messageId)
  const images = collectGeminiInteractionImages(payload)
  const texts = collectGeminiInteractionTexts(payload)

  for (const detail of reasoningDetails) {
    events.push({
      type: 'message.reasoning_raw_detail',
      messageId,
      choiceIndex: 0,
      detail,
    })
  }

  for (const block of reasoningDisplayBlocks) {
    events.push({
      type: 'message.reasoning_display_block',
      messageId,
      choiceIndex: 0,
      block,
    })
  }

  for (const text of texts) {
    events.push({
      type: 'message.text_delta',
      messageId,
      choiceIndex: 0,
      text,
    })
  }

  for (const image of images) {
    events.push({
      type: 'message.content_block_append',
      messageId,
      choiceIndex: 0,
      block: {
        type: 'image',
        url: toDataUrl(image.data, image.mimeType),
      },
    })
  }

  const usage = extractUsage(payload)
  if (usage) events.push({ type: 'usage.delta', usage })
  return events
}

function buildGeminiInteractionReasoningDisplayBlocks(
  details: ReadonlyArray<unknown>,
  messageId: string,
): NonNullable<Extract<StarverseStreamEvent, { type: 'message.reasoning_display_block' }>['block']>[] {
  const blocks: NonNullable<Extract<StarverseStreamEvent, { type: 'message.reasoning_display_block' }>['block']>[] = []
  let ordinal = 0
  for (const detail of details) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) continue
    const record = detail as Record<string, unknown>
    const type = String(record.type ?? '')
    if (type === 'thought_image') {
      const image = asPlainRecord(record.image)
      const url = typeof image?.url === 'string' ? image.url.trim() : ''
      if (!url) continue
      const mimeType = typeof image?.mimeType === 'string' ? image.mimeType : undefined
      blocks.push({
        blockId: `${messageId}:gemini-interaction:${ordinal}`,
        ordinal,
        type: 'image',
        url,
        ...(mimeType ? { mimeType } : {}),
        semanticRole: 'thought',
        providerKey: 'google_ai_studio',
        sourceEventType: type,
      })
      ordinal += 1
      continue
    }
    if (type === 'thought_summary' || type === 'thinking_summary' || type === 'reasoning_summary') {
      const text =
        typeof record.summary === 'string' ? record.summary :
        typeof record.text === 'string' ? record.text :
        ''
      if (!text) continue
      blocks.push({
        blockId: `${messageId}:gemini-interaction:${ordinal}`,
        ordinal,
        type: 'text',
        text,
        semanticRole: 'summary',
        providerKey: 'google_ai_studio',
        sourceEventType: type,
      })
      ordinal += 1
    }
  }
  return blocks
}

function collectGeminiInteractionReasoningDetails(payload: unknown): unknown[] {
  const details: unknown[] = []
  visitPlain(payload, (record) => {
    const summaryParts = extractThoughtSummaryDetails(record)
    if (summaryParts.length > 0) {
      details.push(...summaryParts)
      return
    }
    const summary = extractThoughtSummaryText(record)
    const signature = extractThoughtSignature(record)
    if (summary) {
      details.push({
        type: 'thought_summary',
        summary,
        __starverseReasoningPiece: true,
        ...(signature ? { thought_signature: signature } : {}),
      })
      return
    }
    if (signature && isThoughtRecord(record)) {
      details.push({
        type: 'thought_signature',
        thought_signature: signature,
      })
    }
  })
  return dedupeReasoningDetails(details).map((detail, index) => {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return detail
    const record = detail as Record<string, unknown>
    return typeof record.index === 'number' ? record : { ...record, index }
  })
}

function collectGeminiInteractionImages(payload: unknown): Array<{ data: string; mimeType: string }> {
  const images: Array<{ data: string; mimeType: string }> = []
  visitInteractionImages(payload, false, images)
  return dedupeImages(images)
}

function collectGeminiInteractionTexts(payload: unknown): string[] {
  const texts: string[] = []
  visitPlain(payload, (record) => {
    if (record.type === 'output_text' || record.type === 'text_output') {
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      if (text) {
        texts.push(text)
      }
    }
    if (typeof record.output_text === 'string' && record.output_text.trim()) {
      texts.push(record.output_text.trim())
    }
  })
  return Array.from(new Set(texts))
}

function extractThoughtSummaryText(record: Record<string, unknown>): string {
  if (typeof record.thought_summary === 'string') return record.thought_summary.trim()
  if (typeof record.thoughtSummary === 'string') return record.thoughtSummary.trim()
  const nested = asPlainRecord(record.thought_summary ?? record.thoughtSummary)
  if (nested) {
    if (typeof nested.text === 'string') return nested.text.trim()
    if (typeof nested.summary === 'string') return nested.summary.trim()
  }
  if (record.type === 'thought_summary' || record.type === 'thinking_summary' || record.type === 'reasoning_summary') {
    if (typeof record.text === 'string') return record.text.trim()
    if (typeof record.summary === 'string') return record.summary.trim()
    if (typeof record.delta === 'string') return record.delta.trim()
    const content = asPlainRecord(record.content)
    if (content) {
      if (content.type !== undefined && content.type !== 'text') return ''
      if (typeof content.text === 'string') return content.text.trim()
      if (typeof content.summary === 'string') return content.summary.trim()
    }
  }
  if (record.type === 'thought' && Array.isArray(record.summary)) {
    return record.summary
      .map((item) => {
        const summaryItem = asPlainRecord(item)
        if (!summaryItem) return ''
        if (summaryItem.type !== undefined && summaryItem.type !== 'text') return ''
        return typeof summaryItem.text === 'string' ? summaryItem.text.trim() : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return ''
}

function extractThoughtSummaryDetails(record: Record<string, unknown>): unknown[] {
  const signature = extractThoughtSignature(record)
  const out: unknown[] = []
  if (record.type === 'thought' && Array.isArray(record.summary)) {
    for (const item of record.summary) {
      const summaryItem = asPlainRecord(item)
      if (!summaryItem) continue
      const image = imageFromInteractionRecord(summaryItem)
      if (image) {
        out.push({
          type: 'thought_image',
          image: {
            url: toDataUrl(image.data, image.mimeType),
            mimeType: image.mimeType,
          },
          __starverseReasoningPiece: true,
          ...(signature ? { thought_signature: signature } : {}),
        })
        continue
      }
      if (summaryItem.type !== undefined && summaryItem.type !== 'text') continue
      const text = typeof summaryItem.text === 'string' ? summaryItem.text.trim() : ''
      if (text) {
        out.push({
          type: 'thought_summary',
          summary: text,
          __starverseReasoningPiece: true,
          ...(signature ? { thought_signature: signature } : {}),
        })
      }
    }
    return out
  }

  if (record.type === 'thought_summary' || record.type === 'thinking_summary' || record.type === 'reasoning_summary') {
    const content = asPlainRecord(record.content)
    const image = content ? imageFromInteractionRecord(content) : null
    if (image) {
      out.push({
        type: 'thought_image',
        image: {
          url: toDataUrl(image.data, image.mimeType),
          mimeType: image.mimeType,
        },
        __starverseReasoningPiece: true,
        ...(signature ? { thought_signature: signature } : {}),
      })
    }
    return out
  }

  return out
}

function imageFromInteractionRecord(record: Record<string, unknown>): { data: string; mimeType: string } | null {
  const outputImage = asPlainRecord(record.output_image)
  if (outputImage) {
    const data = normalizeBase64(outputImage.data)
    if (data) return { data, mimeType: normalizeMimeType(outputImage.mime_type ?? outputImage.mimeType) }
  }

  const inlineData = asPlainRecord(record.inlineData ?? record.inline_data)
  if (inlineData) {
    const data = normalizeBase64(inlineData.data)
    const mimeType = normalizeMimeType(inlineData.mimeType ?? inlineData.mime_type)
    if (data && mimeType.startsWith('image/')) return { data, mimeType }
  }

  if (record.type === 'output_image' || record.type === 'image') {
    const data = normalizeBase64(record.data)
    if (data) return { data, mimeType: normalizeMimeType(record.mime_type ?? record.mimeType) }
  }

  return null
}

function extractThoughtSignature(record: Record<string, unknown>): string {
  const value = record.thought_signature ?? record.thoughtSignature
  return typeof value === 'string' ? value.trim() : ''
}

function isThoughtRecord(record: Record<string, unknown>): boolean {
  return record.type === 'thought' ||
    record.type === 'thought_signature' ||
    record.type === 'thought_summary' ||
    record.type === 'thinking_summary' ||
    record.type === 'reasoning_summary' ||
    'thought_signature' in record ||
    'thoughtSignature' in record
}

function visitPlain(value: unknown, visitor: (record: Record<string, unknown>) => void, seen = new Set<unknown>()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) visitPlain(item, visitor, seen)
    return
  }
  const record = value as Record<string, unknown>
  visitor(record)
  for (const item of Object.values(record)) visitPlain(item, visitor, seen)
}

function visitInteractionImages(
  value: unknown,
  insideThoughtSummary: boolean,
  images: Array<{ data: string; mimeType: string }>,
  seen = new Set<unknown>(),
): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) visitInteractionImages(item, insideThoughtSummary, images, seen)
    return
  }
  const record = value as Record<string, unknown>
  if (!insideThoughtSummary) {
    const image = imageFromInteractionRecord(record)
    if (image) images.push(image)
  }
  for (const [key, item] of Object.entries(record)) {
    const nextInsideThoughtSummary =
      insideThoughtSummary ||
      (record.type === 'thought' && key === 'summary') ||
      ((record.type === 'thought_summary' || record.type === 'thinking_summary' || record.type === 'reasoning_summary') && key === 'content')
    visitInteractionImages(item, nextInsideThoughtSummary, images, seen)
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function normalizeBase64(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.startsWith('data:image/')) {
    const comma = trimmed.indexOf(',')
    return comma >= 0 ? trimmed.slice(comma + 1).trim() : ''
  }
  return trimmed
}

function normalizeMimeType(value: unknown): string {
  const mime = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'image/png'
  return mime.startsWith('image/') ? mime : 'image/png'
}

function toDataUrl(data: string, mimeType: string): string {
  return data.startsWith('data:image/') ? data : `data:${mimeType};base64,${data}`
}

function dedupeImages(images: Array<{ data: string; mimeType: string }>): Array<{ data: string; mimeType: string }> {
  const seen = new Set<string>()
  const out: Array<{ data: string; mimeType: string }> = []
  for (const image of images) {
    const key = `${image.mimeType}:${image.data}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(image)
  }
  return out
}

function dedupeReasoningDetails(details: unknown[]): unknown[] {
  const seen = new Set<string>()
  const out: unknown[] = []
  for (const detail of details) {
    const key = JSON.stringify(detail)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(detail)
  }
  return out
}

function extractUsage(payload: unknown): unknown | null {
  const record = asPlainRecord(payload)
  if (!record) return null
  return record.usageMetadata ?? record.usage ?? null
}
