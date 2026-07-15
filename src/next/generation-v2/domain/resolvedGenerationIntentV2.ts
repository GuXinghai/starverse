import {
  decodeGenerationIntentLayerV2,
  type AttachmentIntentV2,
  type GenerationIntentLayerV2,
  type ImageGenerationIntentV2,
  type ProviderSemanticExtensionV2,
  type ReasoningIntentV2,
  type SamplingIntentV2,
  type ToolPolicyIntentV2,
  type WebSearchIntentV2,
} from './generationIntentV2'

export type ResolvedGenerationIntentV2 = Readonly<{
  schemaVersion: 2
  generation: SamplingIntentV2
  reasoning: ReasoningIntentV2
  web: WebSearchIntentV2
  image: ImageGenerationIntentV2
  tools: ToolPolicyIntentV2
  attachments: readonly AttachmentIntentV2[]
  providerExtension: ProviderSemanticExtensionV2
}>

export type DecodedResolvedGenerationIntentV2 = Readonly<{
  trust: 'decoded_unverified'
  value: ResolvedGenerationIntentV2
}>

export class ResolvedGenerationIntentV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_RESOLVED_INTENT_INCOMPLETE') {
    super(code)
    this.name = 'ResolvedGenerationIntentV2Error'
  }
}

export function decodeResolvedGenerationIntentV2(value: unknown): DecodedResolvedGenerationIntentV2 {
  const decoded: GenerationIntentLayerV2 = decodeGenerationIntentLayerV2(value)
  if (decoded.generation === undefined || decoded.reasoning === undefined || decoded.web === undefined ||
      decoded.image === undefined || decoded.tools === undefined || decoded.attachments === undefined ||
      decoded.providerExtension === undefined) {
    throw new ResolvedGenerationIntentV2Error('GENERATION_V2_RESOLVED_INTENT_INCOMPLETE')
  }
  return Object.freeze({
    trust: 'decoded_unverified',
    value: Object.freeze({
      schemaVersion: 2,
      generation: decoded.generation,
      reasoning: decoded.reasoning,
      web: decoded.web,
      image: decoded.image,
      tools: decoded.tools,
      attachments: decoded.attachments,
      providerExtension: decoded.providerExtension,
    }),
  })
}
