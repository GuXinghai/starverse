import type {
  AttachmentIntentV2,
  ImageGenerationIntentV2,
  ProviderSemanticExtensionV2,
  ReasoningIntentV2,
  SamplingIntentV2,
  ToolPolicyIntentV2,
  WebSearchIntentV2,
} from '../domain/generationIntentV2'

type ProviderExtensionSemanticFieldV2 = ProviderSemanticExtensionV2 extends infer Extension
  ? Extension extends Readonly<{ kind: string }>
    ? Exclude<Extract<keyof Extension, string>, 'kind'>
    : never
  : never

type AttachmentSemanticFieldV2 = AttachmentIntentV2 extends infer Attachment
  ? Attachment extends Readonly<Record<string, unknown>>
    ? Extract<keyof Attachment, string>
    : never
  : never

type ModelCapabilityRequiredSemanticPathV2 =
  | `generation.${Extract<keyof SamplingIntentV2, string>}`
  | `reasoning.${Extract<keyof Extract<ReasoningIntentV2, { mode: 'enabled' }>, string>}`
  | `web.${Extract<keyof Extract<WebSearchIntentV2, { mode: 'provider_search' }>, string>}`
  | `image.${Extract<keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>, string>}`
  | `tools.${Extract<keyof Extract<ToolPolicyIntentV2, { mode: 'enabled' }>, string>}`
  | `attachments[].${AttachmentSemanticFieldV2}`
  | 'providerExtension.kind'
  | 'providerExtension.responseFormat'
  | `providerExtension.${ProviderExtensionSemanticFieldV2}`

/**
 * Canonical semantic vocabulary for model capability facts.  The vocabulary
 * is owned by the model-facts layer; runtime snapshots only persist a frozen
 * copy of facts expressed with these paths.
 */
export const MODEL_CAPABILITY_SEMANTIC_PATHS_V2 = Object.freeze([
  'attachments[].assetId',
  'attachments[].assetRevisionId',
  'attachments[].assetSha256',
  'attachments[].capturedAtMs',
  'attachments[].conversion',
  'attachments[].declaredMediaType',
  'attachments[].include',
  'attachments[].kind',
  'attachments[].mediaKind',
  'attachments[].originalUrl',
  'attachments[].provenance',
  'attachments[].referenceId',
  'attachments[].referenceRevision',
  'attachments[].sendAs',
  'attachments[].urlDigest',
  'generation.candidateCount',
  'generation.frequencyPenalty',
  'generation.maxOutputTokens',
  'generation.minP',
  'generation.presencePenalty',
  'generation.repetitionPenalty',
  'generation.seed',
  'generation.stop',
  'generation.temperature',
  'generation.topA',
  'generation.topK',
  'generation.topP',
  'image.aspectRatio',
  'image.background',
  'image.format',
  'image.mode',
  'image.outputCompression',
  'image.outputMode',
  'image.quality',
  'image.resolution',
  'image.size',
  'image.stream',
  'providerExtension.includeThoughts',
  'providerExtension.kind',
  'providerExtension.manualThinkingBudgetTokens',
  'providerExtension.maxToolCalls',
  'providerExtension.parallelToolCalls',
  'providerExtension.reasoningContext',
  'providerExtension.reasoningMode',
  'providerExtension.responseFormat',
  'providerExtension.serviceTier',
  'providerExtension.thinkingBudget',
  'providerExtension.thinkingDisplay',
  'providerExtension.thinkingLevel',
  'providerExtension.thinkingMode',
  'providerExtension.verbosity',
  'reasoning.effort',
  'reasoning.exclude',
  'reasoning.mode',
  'reasoning.summary',
  'tools.allowedToolIds',
  'tools.mode',
  'tools.sideEffectConfirmation',
  'tools.toolChoice',
  'web.allowedDomains',
  'web.engine',
  'web.excludedDomains',
  'web.maxCharacters',
  'web.maxResults',
  'web.maxTotalResults',
  'web.mode',
  'web.searchContextSize',
  'web.types',
  'web.userLocation',
] as const satisfies readonly ModelCapabilityRequiredSemanticPathV2[])

export const MODEL_CAPABILITY_SEMANTIC_PATHS_V2_COMPLETE:
  Exclude<ModelCapabilityRequiredSemanticPathV2, typeof MODEL_CAPABILITY_SEMANTIC_PATHS_V2[number]> extends never
    ? true
    : false = true

export type ModelCapabilitySemanticPathV2 = typeof MODEL_CAPABILITY_SEMANTIC_PATHS_V2[number]
export type ModelCapabilityFieldStateV2 =
  | 'supported'
  | 'unsupported'
  | 'requires_confirmation'
  | 'missing'
  | 'unknown'

export type ModelCapabilityEvidenceEffectV2 = 'supports' | 'rejects' | 'requires_confirmation' | 'unknown'
export type ModelCapabilityScalarV2 = string | number | boolean

export type ModelCapabilityDomainV2 =
  | Readonly<{ kind: 'boolean' }>
  | Readonly<{ kind: 'identity' }>
  | Readonly<{ kind: 'string'; maxLength: number }>
  | Readonly<{ kind: 'enum'; values: readonly ModelCapabilityScalarV2[] }>
  | Readonly<{ kind: 'response_format'; types: readonly ('text' | 'json_object' | 'json_schema')[] }>
  | Readonly<{ kind: 'enum_list'; values: readonly ModelCapabilityScalarV2[]; maxItems: number }>
  | Readonly<{ kind: 'range'; min: number; max: number; integer: boolean }>
  | Readonly<{ kind: 'string_list'; maxItems: number; maxItemLength: number }>
  | Readonly<{ kind: 'identity_list'; maxItems: number }>
  | Readonly<{ kind: 'approximate_location'; maxFieldLength: number }>
  | Readonly<{
      kind: 'dimensions'
      minWidth: number
      maxWidth: number
      minHeight: number
      maxHeight: number
    }>
  | Readonly<{
      kind: 'dimensions_enum'
      values: readonly Readonly<{ width: number; height: number }>[]
    }>

export type ModelCapabilityConstraintV2 = Readonly<{
  kind: 'requires_value' | 'forbids_value'
  path: ModelCapabilitySemanticPathV2
  values: readonly ModelCapabilityScalarV2[]
}>

export type ModelCapabilityEvidenceKindV2 =
  | 'contract_invariant'
  | 'endpoint_descriptor'
  | 'signed_provider_record'
  | 'official_documentation'
  | 'live_probe'
  | 'capability_rule'

export type PersistedModelCapabilityEvidenceV2 = Readonly<{
  evidenceId: string
  kind: ModelCapabilityEvidenceKindV2
  effect: ModelCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: string
  contentDigest: string
  entryDigest: string
}>

export type PersistedModelCapabilityFieldV2 = Readonly<{
  path: ModelCapabilitySemanticPathV2
  state: ModelCapabilityFieldStateV2
  domain?: ModelCapabilityDomainV2
  constraints: readonly ModelCapabilityConstraintV2[]
  evidenceIds: readonly string[]
}>

/** Canonical semantic representation kinds. No provider/model values live here. */
export const MODEL_CAPABILITY_DOMAIN_KINDS_BY_PATH_V2: Readonly<Partial<Record<
  ModelCapabilitySemanticPathV2,
  ModelCapabilityDomainV2['kind'] | readonly ModelCapabilityDomainV2['kind'][]
>>> = Object.freeze({
  'attachments[].conversion': 'enum',
  'attachments[].kind': 'enum',
  'attachments[].mediaKind': 'enum',
  'attachments[].provenance': 'enum',
  'attachments[].sendAs': 'enum',
  'attachments[].include': 'boolean',
  'attachments[].assetId': 'identity',
  'attachments[].assetRevisionId': 'identity',
  'attachments[].assetSha256': 'identity',
  'attachments[].referenceId': 'identity',
  'attachments[].referenceRevision': 'identity',
  'attachments[].urlDigest': 'identity',
  'attachments[].capturedAtMs': 'range',
  'image.aspectRatio': 'enum',
  'image.background': 'enum',
  'image.format': 'enum',
  'image.mode': 'enum',
  'image.outputCompression': 'range',
  'image.outputMode': 'enum',
  'image.quality': 'enum',
  'image.resolution': 'enum',
  'image.size': Object.freeze(['dimensions', 'dimensions_enum'] as const),
  'image.stream': 'boolean',
  'generation.candidateCount': 'range',
  'generation.frequencyPenalty': 'range',
  'generation.maxOutputTokens': 'range',
  'generation.minP': 'range',
  'generation.presencePenalty': 'range',
  'generation.repetitionPenalty': 'range',
  'generation.seed': 'range',
  'generation.temperature': 'range',
  'generation.topA': 'range',
  'generation.topK': 'range',
  'generation.topP': 'range',
  'generation.stop': 'string_list',
  'providerExtension.includeThoughts': 'enum',
  'providerExtension.kind': 'enum',
  'providerExtension.manualThinkingBudgetTokens': 'range',
  'providerExtension.maxToolCalls': 'range',
  'providerExtension.parallelToolCalls': 'boolean',
  'providerExtension.reasoningContext': 'enum',
  'providerExtension.reasoningMode': 'enum',
  'providerExtension.responseFormat': 'response_format',
  'providerExtension.serviceTier': 'enum',
  'providerExtension.thinkingBudget': 'range',
  'providerExtension.thinkingDisplay': 'enum',
  'providerExtension.thinkingLevel': 'enum',
  'providerExtension.thinkingMode': 'enum',
  'providerExtension.verbosity': 'enum',
  'reasoning.effort': Object.freeze(['enum', 'string'] as const),
  'reasoning.exclude': 'boolean',
  'reasoning.mode': 'enum',
  'reasoning.summary': Object.freeze(['enum', 'string'] as const),
  'tools.allowedToolIds': 'identity_list',
  'tools.mode': 'enum',
  'tools.sideEffectConfirmation': 'enum',
  'tools.toolChoice': 'enum',
  'web.allowedDomains': 'string_list',
  'web.engine': 'enum',
  'web.excludedDomains': 'string_list',
  'web.maxCharacters': 'range',
  'web.maxResults': 'range',
  'web.maxTotalResults': 'range',
  'web.mode': 'enum',
  'web.searchContextSize': 'enum',
  'web.types': 'enum_list',
  'web.userLocation': 'approximate_location',
})

export const MODEL_CAPABILITY_IDENTITY_PATHS_V2 = Object.freeze([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
  'attachments[].referenceId', 'attachments[].referenceRevision', 'attachments[].urlDigest',
] as const satisfies readonly ModelCapabilitySemanticPathV2[])

export function isModelCapabilityDomainCompatibleWithPathV2(
  path: ModelCapabilitySemanticPathV2,
  domain: ModelCapabilityDomainV2,
): boolean {
  const expected = MODEL_CAPABILITY_DOMAIN_KINDS_BY_PATH_V2[path]
  const allowed = Array.isArray(expected) ? expected : expected ? [expected] : []
  return allowed.includes(domain.kind) &&
    !(path === 'web.types' && domain.kind === 'enum_list' &&
      domain.values.some((value) => value !== 'web' && value !== 'image')) &&
    !(path === 'web.userLocation' && domain.kind === 'approximate_location' && domain.maxFieldLength > 4_096) &&
    !(path === 'providerExtension.responseFormat' && domain.kind === 'response_format' &&
      domain.types.some((value) => value !== 'text' && value !== 'json_object' && value !== 'json_schema')) &&
    !(path === 'image.aspectRatio' && domain.kind === 'enum' &&
      domain.values.some((value) => typeof value !== 'string' ||
        (value !== 'auto' && !/^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(value))))
}
