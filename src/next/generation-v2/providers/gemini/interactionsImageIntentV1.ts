import { readImageAspectRatioV2 } from '../../domain/generationIntentV2'
import { decodeResolvedGenerationIntentV2, type ResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'

export type GeminiInteractionsImageIntentDispositionV1 = Readonly<{
  path: string
  disposition: 'encoded' | 'accepted_no_wire'
  nativeField: string | null
}>
export type GeminiInteractionsImageIntentProjectionV1 = Readonly<{
  intent: ResolvedGenerationIntentV2
  dispositions: readonly GeminiInteractionsImageIntentDispositionV1[]
  issues: readonly string[]
}>
function add(dispositions: GeminiInteractionsImageIntentDispositionV1[], path: string,
  disposition: GeminiInteractionsImageIntentDispositionV1['disposition'], nativeField: string | null): void {
  dispositions.push(Object.freeze({ path, disposition, nativeField }))
}

/** Exact semantic surface for the snapshot-bound Gemini Interactions image model. */
export function projectGeminiInteractionsImageIntentV1(value: unknown, _modelId: string): GeminiInteractionsImageIntentProjectionV1 {
  const intent = decodeResolvedGenerationIntentV2(value).value
  const dispositions: GeminiInteractionsImageIntentDispositionV1[] = []
  const issues: string[] = []
  const reject = (path: string) => { if (!issues.includes(path)) issues.push(path) }
  const generation = intent.generation
  // Google AI Studio owns the candidate cardinality for this route. The
  // provider currently returns one final image, so candidateCount is not a
  // Google AI Studio semantic field and must never be silently ignored.
  if (generation.candidateCount !== undefined) reject('generation.candidateCount')
  if (generation.temperature !== undefined) add(dispositions, 'generation.temperature', 'encoded', 'generation_config.temperature')
  if (generation.topP !== undefined) add(dispositions, 'generation.topP', 'encoded', 'generation_config.top_p')
  if (generation.maxOutputTokens !== undefined) {
    add(dispositions, 'generation.maxOutputTokens', 'encoded', 'generation_config.max_output_tokens')
  }
  if (generation.stop !== undefined) {
    add(dispositions, 'generation.stop', 'encoded', 'generation_config.stop_sequences')
  }
  for (const key of ['topK', 'minP', 'topA', 'seed', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty'] as const) {
    if (generation[key] !== undefined) reject(`generation.${key}`)
  }
  if (intent.reasoning.mode === 'disabled') add(dispositions, 'reasoning.mode', 'accepted_no_wire', null)
  else if (intent.reasoning.exclude !== undefined ||
      (intent.reasoning.effort === undefined && intent.reasoning.summary === undefined)) reject('reasoning.mode')
  else {
    add(dispositions, 'reasoning.mode', 'encoded', 'generation_config')
    if (intent.reasoning.effort !== undefined) {
      add(dispositions, 'reasoning.effort', 'encoded', 'generation_config.thinking_level')
    }
    if (intent.reasoning.summary !== undefined) {
      if (intent.reasoning.summary !== 'auto') reject('reasoning.summary')
      else add(dispositions, 'reasoning.summary', 'encoded', 'generation_config.thinking_summaries')
    }
  }
  if (intent.web.mode === 'disabled') add(dispositions, 'web.mode', 'accepted_no_wire', null)
  else {
    const unsupportedOption = intent.web.engine !== undefined || intent.web.maxResults !== undefined ||
      intent.web.maxTotalResults !== undefined || intent.web.searchContextSize !== undefined ||
      intent.web.maxCharacters !== undefined || intent.web.userLocation !== undefined ||
      intent.web.allowedDomains !== undefined || intent.web.excludedDomains !== undefined
    if (unsupportedOption || intent.web.types.length === 0) reject('web.mode')
    else {
      add(dispositions, 'web.mode', 'encoded', 'tools')
      add(dispositions, 'web.types', 'encoded', 'tools')
    }
  }
  if (intent.tools.mode !== 'disabled') reject('tools.mode')
  else add(dispositions, 'tools.mode', 'accepted_no_wire', null)
  if (intent.providerExtension.kind !== 'none') reject('providerExtension.kind')
  else add(dispositions, 'providerExtension.kind', 'accepted_no_wire', null)
  const image = intent.image
  if (image.mode !== 'generate') reject('image.mode')
  else {
    add(dispositions, 'image.mode', 'encoded', 'response_format.type')
    if (image.outputMode !== undefined) add(dispositions, 'image.outputMode', 'encoded', 'response_format')
    if (image.aspectRatio !== undefined) {
      const aspectRatio = readImageAspectRatioV2(image.aspectRatio)
      add(dispositions, 'image.aspectRatio', aspectRatio === 'auto' ? 'accepted_no_wire' : 'encoded',
        aspectRatio === 'auto' ? null : 'response_format.aspect_ratio')
    }
    if (image.resolution !== undefined) {
      add(dispositions, 'image.resolution', 'encoded', 'response_format.image_size')
    }
    if (image.format !== undefined) {
      if (image.format !== 'jpeg') reject('image.format')
      else add(dispositions, 'image.format', 'encoded', 'response_format.mime_type')
    }
    if (image.stream !== undefined) {
      if (image.stream !== true) reject('image.stream')
      else add(dispositions, 'image.stream', 'accepted_no_wire', null)
    }
    for (const key of ['size', 'quality', 'background', 'outputCompression'] as const) {
      if (image[key] !== undefined) reject(`image.${key}`)
    }
  }
  for (const attachment of intent.attachments) {
    const path = attachment.kind === 'managed_file'
      ? `attachments.${attachment.assetId.value}@${attachment.assetRevisionId.value}`
      : `attachments.${attachment.referenceId.value}@${attachment.referenceRevision.value}`
    if (attachment.include) reject(path)
    else add(dispositions, path, 'accepted_no_wire', null)
  }
  const compareCodePoints = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
  issues.sort(compareCodePoints)
  dispositions.sort((left, right) => compareCodePoints(left.path, right.path))
  return Object.freeze({ intent, dispositions: Object.freeze(dispositions), issues: Object.freeze(issues) })
}
