import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  decodeGeminiGenerateContentNativeContentV1,
  GeminiGenerateContentNativeHistoryV1Error,
  type GeminiGenerateContentNativeContentV1,
  type GeminiGenerateContentPartV1,
} from './generateContentNativeHistoryV1'

export const GEMINI_GENERATE_CONTENT_STREAM_MAX_WIRE_BYTES_V1 = 64 * 1_024 * 1_024
export const GEMINI_GENERATE_CONTENT_STREAM_MAX_NATIVE_BYTES_V1 = 20 * 1_024 * 1_024
const MAX_PENDING_FRAME_BYTES = 8 * 1_024 * 1_024

export type GeminiGenerateContentVisibleDeltaV1 = Readonly<
  | { type: 'text'; text: string }
  | { type: 'thought'; text: string; thoughtSignature?: string }
  | { type: 'inline_image'; mimeType: string; data: string; thought: boolean; thoughtSignature?: string }
  | { type: 'function_call'; name: string; args: Readonly<Record<string, unknown>>; thoughtSignature?: string }
>

export type GeminiGenerateContentStreamResultV1 = Readonly<{
  assistantContent: GeminiGenerateContentNativeContentV1
  finishReason: string
  finishMessage?: string
  responseId?: string
  modelVersion?: string
  usageMetadata?: Readonly<Record<string, unknown>>
  promptFeedback?: Readonly<Record<string, unknown>>
  candidateMetadata: readonly Readonly<Record<string, unknown>>[]
  rawChunks: readonly Readonly<Record<string, unknown>>[]
}>

export type GeminiGenerateContentStreamSequenceDiagnosticV1 = Readonly<{
  reason:
    | 'chunk_after_finished'
    | 'response_id_changed'
    | 'model_version_changed'
    | 'prompt_feedback_duplicate'
    | 'finish_reason_duplicate'
    | 'native_content_invalid'
  chunkIndex: number
  field: string | null
  previousValue: unknown | null
  currentValue: unknown | null
  rawChunk: Readonly<Record<string, unknown>> | null
}>

export class GeminiGenerateContentStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_SSE_INVALID'
    | 'GENERATION_V2_GEMINI_SSE_PREMATURE_EOF'
    | 'GENERATION_V2_GEMINI_STREAM_INVALID'
    | 'GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID'
    | 'GENERATION_V2_GEMINI_STREAM_LIMIT_EXCEEDED',
    readonly diagnostic: GeminiGenerateContentStreamSequenceDiagnosticV1 | null = null) {
    super(code)
    this.name = 'GeminiGenerateContentStreamV1Error'
  }
}
function fail(
  code: GeminiGenerateContentStreamV1Error['code'],
  diagnostic: GeminiGenerateContentStreamSequenceDiagnosticV1 | null = null,
): never {
  throw new GeminiGenerateContentStreamV1Error(code, diagnostic)
}

function cloneRecord(value: unknown): Readonly<Record<string, unknown>> {
  try {
    const encoded = stableSerializeProviderRequestBoundedV2(
      value,
      GEMINI_GENERATE_CONTENT_STREAM_MAX_NATIVE_BYTES_V1,
    )
    const parsed = JSON.parse(encoded)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    return Object.freeze(parsed as Record<string, unknown>)
  } catch (error) {
    if (error instanceof GeminiGenerateContentStreamV1Error) throw error
    return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
  }
}

function describeNativeContentShape(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({ valueType: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value })
  }
  const content = value as Readonly<Record<string, unknown>>
  const parts = Array.isArray(content.parts) ? content.parts : null
  return Object.freeze({
    contentKeys: Object.freeze(Object.keys(content).sort()),
    role: typeof content.role === 'string' ? content.role : null,
    roleType: typeof content.role,
    partsType: parts ? 'array' : content.parts === null ? 'null' : typeof content.parts,
    partCount: parts?.length ?? null,
    parts: parts === null ? null : Object.freeze(parts.map((part, index) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) {
        return Object.freeze({
          index,
          valueType: Array.isArray(part) ? 'array' : part === null ? 'null' : typeof part,
        })
      }
      const record = part as Readonly<Record<string, unknown>>
      const text = record.text
      const signature = record.thoughtSignature
      const nested = (key: 'inlineData' | 'fileData' | 'functionCall' | 'functionResponse') => {
        const child = record[key]
        return child && typeof child === 'object' && !Array.isArray(child)
          ? Object.freeze(Object.keys(child as Record<string, unknown>).sort())
          : null
      }
      return Object.freeze({
        index,
        keys: Object.freeze(Object.keys(record).sort()),
        textType: typeof text,
        textLength: typeof text === 'string' ? text.length : null,
        thoughtPresent: Object.prototype.hasOwnProperty.call(record, 'thought'),
        thoughtType: typeof record.thought,
        thoughtValue: typeof record.thought === 'boolean' ? record.thought : null,
        thoughtSignatureType: typeof signature,
        thoughtSignatureLength: typeof signature === 'string' ? signature.length : null,
        inlineDataKeys: nested('inlineData'),
        fileDataKeys: nested('fileData'),
        functionCallKeys: nested('functionCall'),
        functionResponseKeys: nested('functionResponse'),
      })
    })),
  })
}

export class GeminiGenerateContentSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #finished = false

  push(bytes: Uint8Array): readonly Readonly<Record<string, unknown>>[] {
    if (this.#finished || !(bytes instanceof Uint8Array)) return fail('GENERATION_V2_GEMINI_SSE_INVALID')
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > GEMINI_GENERATE_CONTENT_STREAM_MAX_WIRE_BYTES_V1) {
      return fail('GENERATION_V2_GEMINI_STREAM_LIMIT_EXCEEDED')
    }
    try { this.#buffer += this.#decoder.decode(bytes, { stream: true }).replace(/\r\n?|\n/gu, '\n') } catch {
      return fail('GENERATION_V2_GEMINI_SSE_INVALID')
    }
    if (new TextEncoder().encode(this.#buffer).byteLength > MAX_PENDING_FRAME_BYTES) {
      return fail('GENERATION_V2_GEMINI_STREAM_LIMIT_EXCEEDED')
    }
    return this.#drain()
  }

  finish(): readonly Readonly<Record<string, unknown>>[] {
    if (this.#finished) return fail('GENERATION_V2_GEMINI_SSE_INVALID')
    this.#finished = true
    try { this.#buffer += this.#decoder.decode().replace(/\r\n?|\n/gu, '\n') } catch {
      return fail('GENERATION_V2_GEMINI_SSE_INVALID')
    }
    const result = [...this.#drain()]
    if (this.#buffer.length > 0) {
      if (!this.#buffer.endsWith('\n')) return fail('GENERATION_V2_GEMINI_SSE_PREMATURE_EOF')
      this.#buffer += '\n'
      result.push(...this.#drain())
    }
    if (this.#buffer.length !== 0) return fail('GENERATION_V2_GEMINI_SSE_PREMATURE_EOF')
    return Object.freeze(result)
  }

  #drain(): readonly Readonly<Record<string, unknown>>[] {
    const result: Readonly<Record<string, unknown>>[] = []
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n')
      if (boundary < 0) break
      const frame = this.#buffer.slice(0, boundary)
      this.#buffer = this.#buffer.slice(boundary + 2)
      if (!frame) continue
      const data: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue
        if (line === 'data' || line.startsWith('data:')) data.push(line === 'data' ? '' : line.slice(5).replace(/^ /u, ''))
        else return fail('GENERATION_V2_GEMINI_SSE_INVALID')
      }
      if (data.length === 0) continue
      const raw = data.join('\n')
      if (raw === '[DONE]') return fail('GENERATION_V2_GEMINI_SSE_INVALID')
      let value: unknown
      try { value = JSON.parse(raw) } catch { return fail('GENERATION_V2_GEMINI_SSE_INVALID') }
      result.push(cloneRecord(value))
    }
    return Object.freeze(result)
  }
}

export class GeminiGenerateContentStreamAssemblerV1 {
  readonly #parts: GeminiGenerateContentPartV1[] = []
  readonly #rawChunks: Readonly<Record<string, unknown>>[] = []
  readonly #candidateMetadata: Readonly<Record<string, unknown>>[] = []
  #finishReason: string | undefined
  #finishMessage: string | undefined
  #responseId: string | undefined
  #modelVersion: string | undefined
  #usageMetadata: Readonly<Record<string, unknown>> | undefined
  #promptFeedback: Readonly<Record<string, unknown>> | undefined
  #nativeBytes = 0
  #chunkIndex = 0
  #finished = false

  push(value: unknown): readonly GeminiGenerateContentVisibleDeltaV1[] {
    if (this.#finished) return fail('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID', Object.freeze({
      reason: 'chunk_after_finished', chunkIndex: this.#chunkIndex + 1,
      field: null, previousValue: true, currentValue: null, rawChunk: null,
    }))
    const chunk = cloneRecord(value)
    const chunkIndex = ++this.#chunkIndex
    const allowed = ['candidates', 'promptFeedback', 'usageMetadata', 'modelVersion', 'responseId']
    if (Object.keys(chunk).some((key) => !allowed.includes(key))) return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    this.#consume(chunk)
    this.#rawChunks.push(chunk)
    this.#mergeStableString('responseId', chunk.responseId, chunkIndex, chunk)
    this.#mergeStableString('modelVersion', chunk.modelVersion, chunkIndex, chunk)
    if (chunk.usageMetadata !== undefined) this.#usageMetadata = this.#replaceProgressiveMetadata(chunk.usageMetadata)
    if (chunk.promptFeedback !== undefined) this.#promptFeedback = this.#replaceSingleton(
      'promptFeedback', this.#promptFeedback, chunk.promptFeedback, chunkIndex, chunk,
    )
    if (chunk.candidates === undefined) return Object.freeze([])
    if (!Array.isArray(chunk.candidates) || chunk.candidates.length > 1) return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    if (chunk.candidates.length === 0) return Object.freeze([])
    const candidate = cloneRecord(chunk.candidates[0])
    const candidateAllowed = ['content', 'finishReason', 'finishMessage', 'safetyRatings', 'citationMetadata',
      'tokenCount', 'groundingAttributions', 'groundingMetadata', 'avgLogprobs', 'logprobsResult', 'urlContextMetadata', 'index']
    if (Object.keys(candidate).some((key) => !candidateAllowed.includes(key)) ||
        (candidate.index !== undefined && candidate.index !== 0)) return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    const metadata = Object.freeze(Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'content')))
    this.#candidateMetadata.push(metadata)
    if (candidate.finishReason !== undefined) {
      if (typeof candidate.finishReason !== 'string' || candidate.finishReason.length === 0 || this.#finishReason !== undefined) {
        return fail('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID', Object.freeze({
          reason: 'finish_reason_duplicate', chunkIndex, field: 'candidates[0].finishReason',
          previousValue: this.#finishReason ?? null, currentValue: candidate.finishReason, rawChunk: chunk,
        }))
      }
      this.#finishReason = candidate.finishReason
      if (candidate.finishMessage !== undefined) {
        if (typeof candidate.finishMessage !== 'string') return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
        this.#finishMessage = candidate.finishMessage
      }
    }
    if (candidate.content === undefined) return Object.freeze([])
    let content: GeminiGenerateContentNativeContentV1
    try {
      content = decodeGeminiGenerateContentNativeContentV1(candidate.content)
    } catch (error) {
      if (!(error instanceof GeminiGenerateContentNativeHistoryV1Error)) throw error
      return fail('GENERATION_V2_GEMINI_STREAM_INVALID', Object.freeze({
        reason: 'native_content_invalid',
        chunkIndex,
        field: 'candidates[0].content',
        previousValue: null,
        currentValue: describeNativeContentShape(candidate.content),
        rawChunk: null,
      }))
    }
    if (content.role !== 'model') return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    const visible: GeminiGenerateContentVisibleDeltaV1[] = []
    for (const part of content.parts) {
      this.#consume(part)
      this.#parts.push(part)
      if ('text' in part) {
        if (part.text.length > 0) visible.push(Object.freeze({
          type: part.thought ? 'thought' as const : 'text' as const,
          text: part.text,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        }))
      }
      else if ('inlineData' in part) visible.push(Object.freeze({
        type: 'inline_image' as const,
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
        thought: part.thought === true,
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
      }))
      else if ('functionCall' in part) visible.push(Object.freeze({
        type: 'function_call' as const,
        name: part.functionCall.name,
        args: part.functionCall.args,
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
      }))
    }
    return Object.freeze(visible)
  }

  finish(): GeminiGenerateContentStreamResultV1 {
    if (this.#finished || !this.#finishReason || this.#parts.length === 0) {
      return fail('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID')
    }
    this.#finished = true
    return Object.freeze({
      assistantContent: decodeGeminiGenerateContentNativeContentV1({ role: 'model', parts: this.#parts }),
      finishReason: this.#finishReason,
      ...(this.#finishMessage === undefined ? {} : { finishMessage: this.#finishMessage }),
      ...(this.#responseId === undefined ? {} : { responseId: this.#responseId }),
      ...(this.#modelVersion === undefined ? {} : { modelVersion: this.#modelVersion }),
      ...(this.#usageMetadata === undefined ? {} : { usageMetadata: this.#usageMetadata }),
      ...(this.#promptFeedback === undefined ? {} : { promptFeedback: this.#promptFeedback }),
      candidateMetadata: Object.freeze(this.#candidateMetadata),
      rawChunks: Object.freeze(this.#rawChunks),
    })
  }

  #mergeStableString(
    field: 'responseId' | 'modelVersion', value: unknown, chunkIndex: number,
    rawChunk: Readonly<Record<string, unknown>>,
  ): void {
    if (value === undefined) return
    if (typeof value !== 'string' || value.length === 0) return fail('GENERATION_V2_GEMINI_STREAM_INVALID')
    const current = field === 'responseId' ? this.#responseId : this.#modelVersion
    if (current !== undefined && current !== value) return fail('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID', Object.freeze({
      reason: field === 'responseId' ? 'response_id_changed' : 'model_version_changed',
      chunkIndex, field, previousValue: current, currentValue: value, rawChunk,
    }))
    if (field === 'responseId') this.#responseId = value
    else this.#modelVersion = value
  }

  #replaceSingleton(
    field: 'promptFeedback', current: Readonly<Record<string, unknown>> | undefined,
    value: unknown, chunkIndex: number, rawChunk: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    const next = cloneRecord(value)
    if (current !== undefined) return fail('GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID', Object.freeze({
      reason: 'prompt_feedback_duplicate',
      chunkIndex, field, previousValue: current, currentValue: next, rawChunk,
    }))
    this.#consume(next)
    return next
  }

  #replaceProgressiveMetadata(value: unknown): Readonly<Record<string, unknown>> {
    const next = cloneRecord(value)
    this.#consume(next)
    return next
  }

  #consume(value: unknown): void {
    this.#nativeBytes += new TextEncoder().encode(JSON.stringify(value)).byteLength
    if (this.#nativeBytes > GEMINI_GENERATE_CONTENT_STREAM_MAX_NATIVE_BYTES_V1) {
      return fail('GENERATION_V2_GEMINI_STREAM_LIMIT_EXCEEDED')
    }
  }
}

export class GeminiGenerateContentChatStreamV1 {
  readonly #decoder = new GeminiGenerateContentSseDecoderV1()
  readonly #assembler = new GeminiGenerateContentStreamAssemblerV1()

  push(bytes: Uint8Array): readonly GeminiGenerateContentVisibleDeltaV1[] {
    return Object.freeze(this.#decoder.push(bytes).flatMap((event) => this.#assembler.push(event)))
  }

  finish(): GeminiGenerateContentStreamResultV1 {
    for (const event of this.#decoder.finish()) this.#assembler.push(event)
    try { return this.#assembler.finish() } catch (error) {
      if (error instanceof GeminiGenerateContentStreamV1Error &&
          error.code === 'GENERATION_V2_GEMINI_STREAM_SEQUENCE_INVALID') {
        return fail('GENERATION_V2_GEMINI_SSE_PREMATURE_EOF', error.diagnostic)
      }
      throw error
    }
  }
}
