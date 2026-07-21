import { ImmutablePreparedBodyV2 } from '../../compiler/stableSerialize'

export const GEMINI_INTERACTIONS_REQUEST_MAX_BYTES_V1 = 20 * 1_024 * 1_024

export type GeminiInteractionsRequestV1 = Readonly<{
  model: 'gemini-3.1-flash-image'
  /**
   * The official v1beta `InteractionsInput` accepts a string for a fresh text
   * turn. V2 deliberately does not emit the legacy `{type:"text"}` pseudo-step:
   * that is not a member of the documented `Step` union.
   */
  input: string
  response_format: Readonly<
    { type: 'image'; mime_type: 'image/jpeg'; aspect_ratio: '1:1'; image_size: '1K' }
  >
  stream: true
  store: false
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
  const allowed = ['model', 'prompt', 'outputMode', 'image']
  if (Object.keys(input).some((key) => !allowed.includes(key)) || input.model !== 'gemini-3.1-flash-image' ||
      typeof input.prompt !== 'string' || input.prompt.length === 0) {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_INVALID')
  }
  const image = record(input.image)
  if (Object.keys(image).some((key) => !['mimeType', 'aspectRatio', 'imageSize'].includes(key)) ||
      image.mimeType !== 'image/jpeg' || image.aspectRatio !== '1:1' || image.imageSize !== '1K' ||
      input.outputMode !== 'image_only') {
    throw new GeminiInteractionsRequestV1Error('GENERATION_V2_GEMINI_INTERACTIONS_REQUEST_UNSUPPORTED')
  }
  const imageFormat = Object.freeze({
    type: 'image' as const,
    mime_type: 'image/jpeg' as const,
    aspect_ratio: '1:1' as const,
    image_size: '1K' as const,
  })
  const nativeRequest: GeminiInteractionsRequestV1 = Object.freeze({
    model: 'gemini-3.1-flash-image',
    input: input.prompt,
    response_format: imageFormat,
    stream: true,
    store: false,
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
