import { ImmutablePreparedBodyV2 } from '../../compiler/stableSerialize'

type GeminiInteractionsImageSizeV1 = '512' | '1K' | '2K' | '4K'

export const GEMINI_INTERACTIONS_REQUEST_MAX_BYTES_V1 = 20 * 1_024 * 1_024

export type GeminiInteractionsRequestV1 = Readonly<{
  model: string
  /**
   * The official v1beta `InteractionsInput` accepts a string for a fresh text
   * turn. V2 deliberately does not emit the legacy `{type:"text"}` pseudo-step:
   * that is not a member of the documented `Step` union.
   */
  input: string
  response_format: Readonly<{ type: 'image'; mime_type?: 'image/jpeg'; aspect_ratio?: string; image_size?: string }> |
    readonly [Readonly<{ type: 'text' }>, Readonly<{ type: 'image'; mime_type?: 'image/jpeg'; aspect_ratio?: string; image_size?: string }>]
  stream: true
  store: false
  generation_config?: Readonly<{
    temperature?: number
    top_p?: number
    max_output_tokens?: number
    stop_sequences?: readonly string[]
    thinking_level?: string
    thinking_summaries?: 'auto'
  }>
  tools?: readonly Readonly<Record<string, unknown>>[]
}>

export class GeminiInteractionsRequestV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'GeminiInteractionsRequestV1Error'
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID')
  }
  return value as Readonly<Record<string, unknown>>
}

export function compileGeminiInteractionsRequestV1(inputValue: unknown): Readonly<{
  classification: 'gemini_interactions_v1beta_request_compilation_non_executable'
  executionAuthority: 'none'
  nativeRequest: GeminiInteractionsRequestV1
  preparedBody: ImmutablePreparedBodyV2
}> {
  const input = record(inputValue)
  const allowed = ['model', 'prompt', 'outputMode', 'image', 'generation', 'reasoning', 'webTypes']
  if (Object.keys(input).some((key) => !allowed.includes(key)) || typeof input.model !== 'string' ||
      typeof input.prompt !== 'string' || input.prompt.length === 0) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID')
  }
  if (input.model.length < 1 || input.model.length > 512 || input.model.trim() !== input.model) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID')
  }
  const image = record(input.image)
  if (Object.keys(image).some((key) => !['mimeType', 'aspectRatio', 'imageSize'].includes(key)) ||
      (image.mimeType !== undefined && image.mimeType !== 'image/jpeg') ||
      (image.aspectRatio !== undefined && (typeof image.aspectRatio !== 'string' ||
        (image.aspectRatio !== 'auto' && !/^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(image.aspectRatio)))) ||
      (image.imageSize !== undefined && (typeof image.imageSize !== 'string' ||
        !['512', '1K', '2K', '4K'].includes(image.imageSize))) ||
      (input.outputMode !== 'image_only' && input.outputMode !== 'image_and_text')) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED')
  }
  const imageFormat = Object.freeze({
    type: 'image' as const,
    ...(image.mimeType === undefined ? {} : { mime_type: 'image/jpeg' as const }),
    ...(image.aspectRatio === undefined || image.aspectRatio === 'auto'
      ? {} : { aspect_ratio: image.aspectRatio as string }),
    ...(image.imageSize === undefined ? {} : { image_size: image.imageSize as GeminiInteractionsImageSizeV1 }),
  })
  const generation: Readonly<Record<string, unknown>> = input.generation === undefined ? Object.freeze({}) : record(input.generation)
  if (Object.keys(generation).some((key) => !['temperature', 'topP', 'maxOutputTokens', 'stop'].includes(key)) ||
      (generation.temperature !== undefined && (typeof generation.temperature !== 'number' || !Number.isFinite(generation.temperature) || generation.temperature < 0 || generation.temperature > 2)) ||
      (generation.topP !== undefined && (typeof generation.topP !== 'number' || !Number.isFinite(generation.topP) || generation.topP < 0 || generation.topP > 1)) ||
      (generation.maxOutputTokens !== undefined && (!Number.isSafeInteger(generation.maxOutputTokens) || (generation.maxOutputTokens as number) < 0)) ||
      (generation.stop !== undefined && (!Array.isArray(generation.stop) ||
        generation.stop.some((item: unknown) => typeof item !== 'string' || !item.trim())))) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED')
  }
  const reasoning: Readonly<Record<string, unknown>> = input.reasoning === undefined ? Object.freeze({}) : record(input.reasoning)
  if (Object.keys(reasoning).some((key) => !['thinkingLevel', 'thinkingSummaries'].includes(key)) ||
      (reasoning.thinkingLevel !== undefined && (typeof reasoning.thinkingLevel !== 'string' || !reasoning.thinkingLevel)) ||
      (reasoning.thinkingSummaries !== undefined && reasoning.thinkingSummaries !== 'auto')) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED')
  }
  const webTypes = input.webTypes === undefined ? [] : input.webTypes
  if (!Array.isArray(webTypes) || webTypes.some((type) => type !== 'web' && type !== 'image')) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED')
  }
  const generationConfig = Object.freeze({
    ...(generation.temperature === undefined ? {} : { temperature: generation.temperature as number }),
    ...(generation.topP === undefined ? {} : { top_p: generation.topP as number }),
    ...(generation.maxOutputTokens === undefined ? {} : { max_output_tokens: generation.maxOutputTokens as number }),
    ...(generation.stop === undefined ? {} : { stop_sequences: Object.freeze([...(generation.stop as string[])]) }),
    ...(reasoning.thinkingLevel === undefined ? {} : { thinking_level: reasoning.thinkingLevel as string }),
    ...(reasoning.thinkingSummaries === undefined ? {} : { thinking_summaries: 'auto' as const }),
  })
  const tools = webTypes.length === 0 ? Object.freeze([]) : Object.freeze([Object.freeze({
    type: 'google_search',
    search_types: Object.freeze((webTypes as string[]).map((type) => type === 'web' ? 'web_search' : 'image_search')),
  })])
  const nativeRequest: GeminiInteractionsRequestV1 = Object.freeze({
    model: input.model,
    input: input.prompt,
    response_format: input.outputMode === 'image_only'
      ? imageFormat
      : Object.freeze([Object.freeze({ type: 'text' as const }), imageFormat] as const),
    stream: true,
    store: false,
    ...(Object.keys(generationConfig).length === 0 ? {} : { generation_config: generationConfig }),
    ...(tools.length === 0 ? {} : { tools }),
  })
  let preparedBody: ImmutablePreparedBodyV2
  try {
    preparedBody = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(nativeRequest, GEMINI_INTERACTIONS_REQUEST_MAX_BYTES_V1)
  } catch {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_LIMIT_EXCEEDED')
  }
  return Object.freeze({ classification: 'gemini_interactions_v1beta_request_compilation_non_executable',
    executionAuthority: 'none', nativeRequest, preparedBody })
}
