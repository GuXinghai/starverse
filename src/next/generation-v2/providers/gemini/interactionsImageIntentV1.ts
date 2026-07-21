import { decodeGenerationIntentLayerV2, readImageAspectRatioV2, type GenerationIntentLayerV2 } from '../../domain/generationIntentV2'

export type GeminiInteractionsImageIntentDispositionV1 = Readonly<{
  path: string
  disposition: 'encoded' | 'accepted_no_wire'
  nativeField: string | null
}>
export type GeminiInteractionsImageIntentProjectionV1 = Readonly<{
  intent: GenerationIntentLayerV2
  dispositions: readonly GeminiInteractionsImageIntentDispositionV1[]
  issues: readonly string[]
}>
function add(dispositions: GeminiInteractionsImageIntentDispositionV1[], path: string,
  disposition: GeminiInteractionsImageIntentDispositionV1['disposition'], nativeField: string | null): void {
  dispositions.push(Object.freeze({ path, disposition, nativeField }))
}

/** Exact semantic surface for the initial verified Interactions image slice. */
export function projectGeminiInteractionsImageIntentV1(value: unknown): GeminiInteractionsImageIntentProjectionV1 {
  const intent = decodeGenerationIntentLayerV2(value)
  const dispositions: GeminiInteractionsImageIntentDispositionV1[] = []
  const issues: string[] = []
  const reject = (path: string) => { if (!issues.includes(path)) issues.push(path) }
  const generation = intent.generation
  if (generation.candidateCount !== 1) reject('generation.candidateCount')
  else add(dispositions, 'generation.candidateCount', 'accepted_no_wire', null)
  for (const key of ['maxOutputTokens', 'temperature', 'topP', 'topK', 'minP', 'topA', 'seed', 'stop',
    'frequencyPenalty', 'presencePenalty', 'repetitionPenalty'] as const) {
    if (generation[key] !== undefined) reject(`generation.${key}`)
  }
  if (intent.reasoning.mode !== 'disabled') reject('reasoning.mode')
  else add(dispositions, 'reasoning.mode', 'accepted_no_wire', null)
  if (intent.web.mode !== 'disabled') reject('web.mode')
  else add(dispositions, 'web.mode', 'accepted_no_wire', null)
  if (intent.tools.mode !== 'disabled') reject('tools.mode')
  else add(dispositions, 'tools.mode', 'accepted_no_wire', null)
  if (intent.providerExtension.kind !== 'none') reject('providerExtension.kind')
  else add(dispositions, 'providerExtension.kind', 'accepted_no_wire', null)
  const image = intent.image
  if (image.mode !== 'generate') reject('image.mode')
  else {
    add(dispositions, 'image.mode', 'encoded', 'response_format.type')
    if (image.aspectRatio !== undefined) {
      if (readImageAspectRatioV2(image.aspectRatio) !== '1:1') reject('image.aspectRatio')
      else add(dispositions, 'image.aspectRatio', 'encoded', 'response_format.aspect_ratio')
    }
    if (image.resolution !== undefined) {
      if (image.resolution !== '1K') reject('image.resolution')
      else add(dispositions, 'image.resolution', 'encoded', 'response_format.image_size')
    }
    if (image.format !== undefined) {
      if (image.format !== 'jpeg') reject('image.format')
      else add(dispositions, 'image.format', 'encoded', 'response_format.mime_type')
    }
    if (image.stream !== undefined) {
      if (image.stream !== true) reject('image.stream')
      else add(dispositions, 'image.stream', 'encoded', 'stream')
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
