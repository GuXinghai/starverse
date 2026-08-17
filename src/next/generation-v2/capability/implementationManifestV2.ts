import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  listReviewedProviderContractDefinitionsV2,
  type ProviderContractOperationV2,
} from '../contracts/providerContractRegistryV2'
import type {
  PersistedRuntimeCapabilityFieldV2,
  RuntimeCapabilityConstraintV2,
  RuntimeCapabilityDomainV2,
  RuntimeCapabilityScalarV2,
  RuntimeCapabilitySemanticPathV2,
} from './runtimeCapabilitySnapshotV2'

export type GenerationImplementationDomainCeilingV2 = RuntimeCapabilityDomainV2 | Readonly<{
  kind: 'enum_pattern'
  pattern: 'image_aspect_ratio'
}>

export type GenerationImplementationFieldCeilingV2 = Readonly<{
  path: RuntimeCapabilitySemanticPathV2
  domain: GenerationImplementationDomainCeilingV2
  constraints: readonly RuntimeCapabilityConstraintV2[]
}>

/**
 * This is protocol knowledge, not model capability knowledge.  A manifest is
 * the set of semantic paths that the Starverse codec can consume for one
 * exact provider contract and operation.  Model evidence can only narrow this
 * set; it can never expand it.
 */
export type GenerationImplementationManifestV2 = Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
  contractRevision: string
  registryRevision: string
  semanticPaths: readonly RuntimeCapabilitySemanticPathV2[]
  fieldCeilings: readonly GenerationImplementationFieldCeilingV2[]
  manifestDigest: string
  manifestRevision: string
}>

export class GenerationImplementationManifestV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_IMPLEMENTATION_MANIFEST_INVALID'
    | 'GENERATION_V2_IMPLEMENTATION_MANIFEST_UNKNOWN') {
    super(code)
    this.name = 'GenerationImplementationManifestV2Error'
  }
}

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER

const ENUM_VALUES_BY_PATH: Readonly<Partial<Record<RuntimeCapabilitySemanticPathV2, readonly RuntimeCapabilityScalarV2[]>>> = Object.freeze({
  'attachments[].conversion': ['none', 'pdf', 'plain_text', 'images'],
  'attachments[].kind': ['managed_file', 'url_reference'],
  'attachments[].mediaKind': ['image', 'document', 'audio', 'video', 'other'],
  'attachments[].sendAs': ['provider_file', 'inline_text', 'image_reference', 'converted_document', 'url_reference'],
  'image.background': ['auto', 'transparent', 'opaque'],
  'image.format': ['png', 'jpeg', 'webp', 'svg'],
  'image.mode': ['disabled', 'generate'],
  'image.outputMode': ['image_only', 'image_and_text'],
  'image.quality': ['auto', 'low', 'medium', 'high'],
  'image.resolution': ['512', '1K', '2K', '4K'],
  'providerExtension.includeThoughts': ['provider_default', 'enabled', 'disabled'],
  'providerExtension.kind': ['none', 'openrouter_chat', 'anthropic_messages', 'gemini_generate_content', 'openai_responses'],
  'providerExtension.reasoningContext': ['auto', 'current_turn', 'all_turns'],
  'providerExtension.reasoningMode': ['standard', 'pro'],
  'providerExtension.serviceTier': ['auto', 'default', 'flex', 'priority'],
  'providerExtension.thinkingDisplay': ['provider_default', 'summarized', 'omitted'],
  'providerExtension.thinkingLevel': ['minimal', 'low', 'medium', 'high'],
  'providerExtension.thinkingMode': ['model_recommended', 'manual', 'adaptive', 'default', 'provider_default', 'level', 'budget'],
  'providerExtension.verbosity': ['low', 'medium', 'high', 'xhigh', 'max'],
  'reasoning.effort': ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  'reasoning.mode': ['disabled', 'enabled'],
  'reasoning.summary': ['auto', 'concise', 'detailed'],
  'tools.mode': ['disabled', 'enabled'],
  'tools.sideEffectConfirmation': ['required_each_retry'],
  'tools.toolChoice': ['omitted', 'auto', 'none', 'required', 'named'],
  'web.engine': ['auto', 'native', 'exa', 'firecrawl', 'parallel', 'perplexity'],
  'web.mode': ['disabled', 'provider_search'],
  'web.searchContextSize': ['low', 'medium', 'high'],
})

const INTEGER_RANGE_CEILINGS: Readonly<Partial<Record<RuntimeCapabilitySemanticPathV2, Readonly<{ min: number; max: number }>>>> = Object.freeze({
  'generation.candidateCount': { min: 1, max: MAX_SAFE_INTEGER },
  'generation.maxOutputTokens': { min: 0, max: MAX_SAFE_INTEGER },
  'generation.seed': { min: 0, max: MAX_SAFE_INTEGER },
  'generation.topK': { min: 0, max: MAX_SAFE_INTEGER },
  'image.outputCompression': { min: 0, max: 100 },
  'providerExtension.manualThinkingBudgetTokens': { min: 1, max: MAX_SAFE_INTEGER },
  'providerExtension.maxToolCalls': { min: 0, max: MAX_SAFE_INTEGER },
  'providerExtension.thinkingBudget': { min: -1, max: MAX_SAFE_INTEGER },
  'web.maxCharacters': { min: 1, max: 100_000 },
  'web.maxResults': { min: 1, max: 25 },
  'web.maxTotalResults': { min: 1, max: MAX_SAFE_INTEGER },
})

const NUMBER_RANGE_CEILINGS: Readonly<Partial<Record<RuntimeCapabilitySemanticPathV2, Readonly<{ min: number; max: number }>>>> = Object.freeze({
  'generation.frequencyPenalty': { min: -2, max: 2 },
  'generation.minP': { min: 0, max: 1 },
  'generation.presencePenalty': { min: -2, max: 2 },
  'generation.repetitionPenalty': { min: 0.000001, max: 100 },
  'generation.temperature': { min: 0, max: 100 },
  'generation.topA': { min: 0, max: 1 },
  'generation.topP': { min: 0, max: 1 },
})

const IDENTITY_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
])
const BOOLEAN_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'attachments[].include', 'image.stream', 'providerExtension.parallelToolCalls', 'reasoning.exclude',
])
const STRING_LIST_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'generation.stop', 'web.allowedDomains', 'web.excludedDomains',
])

function codecDomainCeiling(path: RuntimeCapabilitySemanticPathV2): GenerationImplementationDomainCeilingV2 {
  const enumValues = ENUM_VALUES_BY_PATH[path]
  if (enumValues) return Object.freeze({ kind: 'enum', values: Object.freeze([...enumValues]) })
  if (path === 'image.aspectRatio') return Object.freeze({ kind: 'enum_pattern', pattern: 'image_aspect_ratio' })
  if (path === 'providerExtension.responseFormat') {
    return Object.freeze({ kind: 'response_format', types: Object.freeze(['text', 'json_object', 'json_schema'] as const) })
  }
  const integerRange = INTEGER_RANGE_CEILINGS[path]
  if (integerRange) return Object.freeze({ kind: 'range', ...integerRange, integer: true })
  const numberRange = NUMBER_RANGE_CEILINGS[path]
  if (numberRange) return Object.freeze({ kind: 'range', ...numberRange, integer: false })
  if (IDENTITY_PATHS.has(path)) return Object.freeze({ kind: 'identity' })
  if (BOOLEAN_PATHS.has(path)) return Object.freeze({ kind: 'boolean' })
  if (STRING_LIST_PATHS.has(path)) return Object.freeze({ kind: 'string_list', maxItems: 128, maxItemLength: 65_536 })
  if (path === 'tools.allowedToolIds') return Object.freeze({ kind: 'identity_list', maxItems: 512 })
  if (path === 'web.types') return Object.freeze({ kind: 'enum_list', values: Object.freeze(['web', 'image']), maxItems: 2 })
  if (path === 'web.userLocation') return Object.freeze({ kind: 'approximate_location', maxFieldLength: 4_096 })
  if (path === 'image.size') return Object.freeze({ kind: 'dimensions', minWidth: 1, maxWidth: 100_000, minHeight: 1, maxHeight: 100_000 })
  throw new GenerationImplementationManifestV2Error('GENERATION_V2_IMPLEMENTATION_MANIFEST_INVALID')
}

function scalarKey(value: RuntimeCapabilityScalarV2): string {
  return `${typeof value}:${String(value)}`
}

function scalarSetWithin(actual: readonly RuntimeCapabilityScalarV2[], ceiling: readonly RuntimeCapabilityScalarV2[]): boolean {
  const allowed = new Set(ceiling.map(scalarKey))
  return actual.every((value) => allowed.has(scalarKey(value)))
}

function domainWithinCeiling(
  actual: RuntimeCapabilityDomainV2,
  ceiling: GenerationImplementationDomainCeilingV2,
): boolean {
  if (ceiling.kind === 'enum_pattern') {
    return actual.kind === 'enum' && actual.values.every((value) => typeof value === 'string' &&
      (value === 'auto' || /^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(value)))
  }
  if (actual.kind !== ceiling.kind) {
    if (ceiling.kind === 'dimensions' && actual.kind === 'dimensions_enum') {
      return actual.values.every((value) => value.width >= ceiling.minWidth && value.width <= ceiling.maxWidth &&
        value.height >= ceiling.minHeight && value.height <= ceiling.maxHeight)
    }
    return false
  }
  switch (ceiling.kind) {
    case 'boolean':
    case 'identity': return true
    case 'enum': return scalarSetWithin((actual as typeof ceiling).values, ceiling.values)
    case 'response_format': return (actual as typeof ceiling).types.every((value) => ceiling.types.includes(value))
    case 'enum_list': {
      const candidate = actual as typeof ceiling
      return candidate.maxItems <= ceiling.maxItems && scalarSetWithin(candidate.values, ceiling.values)
    }
    case 'range': {
      const candidate = actual as typeof ceiling
      return candidate.min >= ceiling.min && candidate.max <= ceiling.max && (!ceiling.integer || candidate.integer)
    }
    case 'string_list': {
      const candidate = actual as typeof ceiling
      return candidate.maxItems <= ceiling.maxItems && candidate.maxItemLength <= ceiling.maxItemLength
    }
    case 'identity_list': return (actual as typeof ceiling).maxItems <= ceiling.maxItems
    case 'approximate_location': return (actual as typeof ceiling).maxFieldLength <= ceiling.maxFieldLength
    case 'dimensions': {
      const candidate = actual as typeof ceiling
      return candidate.minWidth >= ceiling.minWidth && candidate.maxWidth <= ceiling.maxWidth &&
        candidate.minHeight >= ceiling.minHeight && candidate.maxHeight <= ceiling.maxHeight
    }
    case 'dimensions_enum': {
      const candidate = actual as typeof ceiling
      const allowed = new Set(ceiling.values.map((value) => `${value.width}x${value.height}`))
      return candidate.values.every((value) => allowed.has(`${value.width}x${value.height}`))
    }
  }
}

function constraintWithinCeiling(
  actual: RuntimeCapabilityConstraintV2,
  ceiling: RuntimeCapabilityConstraintV2,
): boolean {
  if (actual.kind !== ceiling.kind || actual.path !== ceiling.path) return false
  return actual.kind === 'requires_value'
    ? scalarSetWithin(actual.values, ceiling.values)
    : scalarSetWithin(ceiling.values, actual.values)
}

export function implementationFieldSatisfiesCeilingV2(
  field: Pick<PersistedRuntimeCapabilityFieldV2, 'domain' | 'constraints'>,
  ceiling: GenerationImplementationFieldCeilingV2,
): boolean {
  if (!field.domain || !domainWithinCeiling(field.domain, ceiling.domain)) return false
  return ceiling.constraints.every((required) => field.constraints.some((actual) =>
    constraintWithinCeiling(actual, required)))
}

function constraint(kind: RuntimeCapabilityConstraintV2['kind'], path: RuntimeCapabilitySemanticPathV2, values: readonly RuntimeCapabilityScalarV2[]): RuntimeCapabilityConstraintV2 {
  return Object.freeze({ kind, path, values: Object.freeze([...values]) })
}

const TEXT_GENERATION = Object.freeze([
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.topK',
  'generation.minP', 'generation.topA', 'generation.seed', 'generation.stop',
  'generation.frequencyPenalty', 'generation.presencePenalty', 'generation.repetitionPenalty',
] as RuntimeCapabilitySemanticPathV2[])

const COMMON_TEXT_NO_WIRE = Object.freeze([
  'web.mode', 'image.mode', 'tools.mode', 'providerExtension.kind',
] as RuntimeCapabilitySemanticPathV2[])

const OPENROUTER_CHAT_PATHS = Object.freeze([
  ...TEXT_GENERATION,
  'reasoning.mode', 'reasoning.effort', 'reasoning.exclude',
  'web.mode', 'web.types', 'web.engine', 'web.maxResults', 'web.maxTotalResults',
  'web.searchContextSize', 'web.maxCharacters', 'web.userLocation', 'web.allowedDomains', 'web.excludedDomains',
  'image.mode', 'tools.mode', 'tools.allowedToolIds', 'tools.toolChoice', 'tools.sideEffectConfirmation',
  'providerExtension.kind', 'providerExtension.verbosity', 'providerExtension.parallelToolCalls',
  'providerExtension.responseFormat',
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
  'attachments[].include', 'attachments[].sendAs', 'attachments[].conversion',
] as RuntimeCapabilitySemanticPathV2[])

const OPENAI_RESPONSES_PATHS = Object.freeze([
  'attachments[].kind', 'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
  'attachments[].include', 'attachments[].sendAs', 'attachments[].conversion',
  'generation.maxOutputTokens', 'image.mode', 'image.background', 'image.format', 'image.quality', 'image.size',
  'providerExtension.kind', 'providerExtension.maxToolCalls', 'providerExtension.parallelToolCalls',
  'providerExtension.reasoningContext', 'providerExtension.reasoningMode', 'providerExtension.serviceTier',
  'providerExtension.verbosity', 'reasoning.mode', 'reasoning.effort', 'reasoning.summary',
  'tools.mode', 'tools.allowedToolIds', 'tools.sideEffectConfirmation', 'tools.toolChoice',
  'web.mode', 'web.types', 'web.searchContextSize', 'web.allowedDomains',
] as RuntimeCapabilitySemanticPathV2[])

const ANTHROPIC_PATHS = Object.freeze([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
  'attachments[].include', 'attachments[].sendAs', 'attachments[].conversion',
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.topK', 'generation.stop',
  'reasoning.mode', 'reasoning.effort', 'reasoning.summary', 'reasoning.exclude',
  'web.mode', 'web.types', 'web.maxResults', 'web.allowedDomains', 'web.excludedDomains', 'web.userLocation',
  'image.mode', 'tools.mode', 'tools.allowedToolIds', 'tools.toolChoice', 'tools.sideEffectConfirmation',
  'providerExtension.kind', 'providerExtension.thinkingDisplay', 'providerExtension.thinkingMode',
  'providerExtension.manualThinkingBudgetTokens',
] as RuntimeCapabilitySemanticPathV2[])

const GEMINI_GENERATE_CONTENT_PATHS = Object.freeze([
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.topK', 'generation.stop',
  'reasoning.mode', 'reasoning.effort', 'web.mode', 'web.types', 'image.mode', 'tools.mode',
  'tools.allowedToolIds', 'tools.toolChoice', 'tools.sideEffectConfirmation',
  'providerExtension.kind', 'providerExtension.thinkingMode', 'providerExtension.thinkingLevel',
  'providerExtension.thinkingBudget', 'providerExtension.includeThoughts',
] as RuntimeCapabilitySemanticPathV2[])

const GEMINI_INTERACTIONS_IMAGE_PATHS = Object.freeze([
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.stop',
  'reasoning.mode', 'reasoning.effort', 'reasoning.summary', 'web.mode', 'web.types', 'tools.mode',
  'providerExtension.kind', 'image.mode', 'image.outputMode', 'image.aspectRatio', 'image.resolution',
  'image.format', 'image.stream',
] as RuntimeCapabilitySemanticPathV2[])

const DEEPSEEK_PATHS = Object.freeze([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256', 'attachments[].include',
  'attachments[].sendAs', 'attachments[].conversion',
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.stop',
  'reasoning.mode', 'reasoning.effort', 'web.mode', 'image.mode', 'tools.mode', 'tools.allowedToolIds',
  'tools.toolChoice', 'tools.sideEffectConfirmation', 'providerExtension.kind',
] as RuntimeCapabilitySemanticPathV2[])

const GENERIC_LOCAL_PATHS = Object.freeze([
  ...COMMON_TEXT_NO_WIRE,
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.stop',
  'reasoning.mode',
] as RuntimeCapabilitySemanticPathV2[])

const LMSTUDIO_PATHS = Object.freeze([
  ...COMMON_TEXT_NO_WIRE,
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP',
  'generation.frequencyPenalty', 'generation.presencePenalty',
  'reasoning.mode', 'reasoning.effort', 'tools.allowedToolIds', 'tools.toolChoice', 'tools.sideEffectConfirmation',
] as RuntimeCapabilitySemanticPathV2[])

const OLLAMA_PATHS = Object.freeze([
  ...COMMON_TEXT_NO_WIRE,
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.topK', 'generation.seed',
  'generation.stop', 'generation.repetitionPenalty', 'reasoning.mode', 'reasoning.effort',
] as RuntimeCapabilitySemanticPathV2[])

const OPENAI_COMPATIBLE_PATHS = Object.freeze([
  ...COMMON_TEXT_NO_WIRE,
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.stop', 'generation.seed',
  'generation.frequencyPenalty', 'generation.presencePenalty', 'reasoning.mode', 'reasoning.effort',
] as RuntimeCapabilitySemanticPathV2[])

const IMPLEMENTATION_PATHS_BY_KEY: Readonly<Record<string, readonly RuntimeCapabilitySemanticPathV2[]>> = Object.freeze({
  'openrouter-images-v1\0image_generate': Object.freeze([
    'generation.candidateCount', 'generation.seed', 'reasoning.mode', 'web.mode', 'tools.mode',
    'providerExtension.kind', 'image.mode', 'image.aspectRatio', 'image.background', 'image.format',
    'image.outputCompression', 'image.quality', 'image.resolution', 'image.size', 'image.stream',
  ] as RuntimeCapabilitySemanticPathV2[]),
  'openrouter-chat-completions-v1\0text': OPENROUTER_CHAT_PATHS,
  'openrouter-chat-completions-v1\0tool_continue': OPENROUTER_CHAT_PATHS,
  'gemini-generate-content-v1beta\0text': GEMINI_GENERATE_CONTENT_PATHS,
  'gemini-generate-content-v1beta\0tool_continue': GEMINI_GENERATE_CONTENT_PATHS,
  'gemini-interactions-v1beta\0image_generate': GEMINI_INTERACTIONS_IMAGE_PATHS,
  'anthropic-messages-2023-06-01\0text': ANTHROPIC_PATHS,
  'anthropic-messages-2023-06-01\0tool_continue': ANTHROPIC_PATHS,
  'deepseek-stable-chat-v1\0text': DEEPSEEK_PATHS,
  'deepseek-stable-chat-v1\0tool_continue': DEEPSEEK_PATHS,
  'openai-responses-v1\0text': OPENAI_RESPONSES_PATHS,
  'openai-responses-v1\0tool_continue': OPENAI_RESPONSES_PATHS,
  'generic-local-openai-chat-completions\0text': GENERIC_LOCAL_PATHS,
  'ollama-chat-v1\0text': OLLAMA_PATHS,
  'lmstudio-openresponses\0text': LMSTUDIO_PATHS,
  'lmstudio-openresponses\0tool_continue': LMSTUDIO_PATHS,
  'openai_chat_compatible\0text': OPENAI_COMPATIBLE_PATHS,
})

const IMPLEMENTATION_HARD_CONSTRAINTS_BY_FIELD_KEY: Readonly<Record<string, readonly RuntimeCapabilityConstraintV2[]>> = Object.freeze({
  'deepseek-stable-chat-v1\0text\0generation.temperature': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['disabled']),
  ]),
  'deepseek-stable-chat-v1\0text\0generation.topP': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['disabled']),
  ]),
  'deepseek-stable-chat-v1\0text\0reasoning.effort': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['enabled']),
  ]),
  'deepseek-stable-chat-v1\0tool_continue\0generation.temperature': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['disabled']),
  ]),
  'deepseek-stable-chat-v1\0tool_continue\0generation.topP': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['disabled']),
  ]),
  'deepseek-stable-chat-v1\0tool_continue\0reasoning.effort': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['enabled']),
  ]),
  'ollama-chat-v1\0text\0reasoning.effort': Object.freeze([
    constraint('requires_value', 'reasoning.mode', ['enabled']),
  ]),
})

const IMPLEMENTATION_DOMAIN_CEILINGS_BY_FIELD_KEY: Readonly<Record<string, GenerationImplementationDomainCeilingV2>> = Object.freeze({
  'deepseek-stable-chat-v1\0text\0reasoning.effort': Object.freeze({ kind: 'enum', values: Object.freeze(['high', 'max']) }),
  'deepseek-stable-chat-v1\0tool_continue\0reasoning.effort': Object.freeze({ kind: 'enum', values: Object.freeze(['high', 'max']) }),
})

function manifestKey(protocolContractId: string, operation: ProviderContractOperationV2): string {
  return `${protocolContractId}\0${operation}`
}

function fieldCeilingsFor(
  protocolContractId: string,
  operation: ProviderContractOperationV2,
  semanticPaths: readonly RuntimeCapabilitySemanticPathV2[],
): readonly GenerationImplementationFieldCeilingV2[] {
  return Object.freeze(semanticPaths.map((path) => Object.freeze({
    path,
    domain: IMPLEMENTATION_DOMAIN_CEILINGS_BY_FIELD_KEY[`${manifestKey(protocolContractId, operation)}\0${path}`] ??
      codecDomainCeiling(path),
    constraints: Object.freeze([
      ...(IMPLEMENTATION_HARD_CONSTRAINTS_BY_FIELD_KEY[`${manifestKey(protocolContractId, operation)}\0${path}`] ?? []),
    ]),
  })))
}

export function applyGenerationImplementationCeilingV2(
  fields: readonly PersistedRuntimeCapabilityFieldV2[],
  manifest: GenerationImplementationManifestV2,
  verifiedAt = '2026-08-17T00:00:00.000Z',
): Readonly<{
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  rejectEvidence?: Readonly<Record<string, unknown>>
}> {
  const ceilings = new Map(manifest.fieldCeilings.map((ceiling) => [ceiling.path, ceiling]))
  const rejectEvidenceId = `implementation-manifest.${manifest.manifestDigest}.rejects`
  const rejected = fields.some((field) => {
    if (field.state !== 'supported' && field.state !== 'requires_confirmation') return false
    const ceiling = ceilings.get(field.path)
    return ceiling === undefined || !implementationFieldSatisfiesCeilingV2(field, ceiling)
  })
  if (!rejected) return Object.freeze({ fields })
  const nextFields = fields.map((field) => {
    const ceiling = ceilings.get(field.path)
    if ((field.state !== 'supported' && field.state !== 'requires_confirmation') ||
        ceiling !== undefined && implementationFieldSatisfiesCeilingV2(field, ceiling)) {
      return field
    }
    return Object.freeze({
      path: field.path,
      state: 'unsupported' as const,
      constraints: Object.freeze([]),
      evidenceIds: Object.freeze([rejectEvidenceId]),
    })
  })
  return Object.freeze({
    fields: Object.freeze(nextFields),
    rejectEvidence: Object.freeze({
      evidenceId: rejectEvidenceId,
      kind: 'contract_invariant' as const,
      effect: 'rejects' as const,
      sourceRef: `generation-v2-implementation-manifest:${manifest.protocolContractId}:${manifest.operation}`,
      verifiedAt,
      contentDigest: manifest.manifestDigest,
    }),
  })
}

const definitions = listReviewedProviderContractDefinitionsV2()
const manifests = new Map<string, GenerationImplementationManifestV2>()
for (const definition of definitions) {
  for (const operation of definition.operations) {
    const key = manifestKey(definition.protocolContractId.value, operation)
    const semanticPaths = IMPLEMENTATION_PATHS_BY_KEY[key]
    if (!semanticPaths || semanticPaths.length === 0 || new Set(semanticPaths).size !== semanticPaths.length) {
      throw new GenerationImplementationManifestV2Error('GENERATION_V2_IMPLEMENTATION_MANIFEST_INVALID')
    }
    const fieldCeilings = fieldCeilingsFor(definition.protocolContractId.value, operation, semanticPaths)
    const projection = Object.freeze({
      providerId: definition.providerId.value,
      protocolContractId: definition.protocolContractId.value,
      operation,
      contractRevision: definition.contractRevision.value,
      registryRevision: definition.registryRevision.value,
      semanticPaths,
      fieldCeilings,
    })
    const manifestDigest = hash(projection)
    const manifest = Object.freeze({
      ...projection,
      manifestDigest,
      manifestRevision: `implementation-manifest-v2:${manifestDigest}`,
    })
    if (manifests.has(key)) throw new GenerationImplementationManifestV2Error('GENERATION_V2_IMPLEMENTATION_MANIFEST_INVALID')
    manifests.set(key, manifest)
  }
}

const allImplementationPaths = Object.freeze([...new Set(Object.values(IMPLEMENTATION_PATHS_BY_KEY).flat())]
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0))
export const GENERATION_IMPLEMENTATION_MANIFEST_SCHEMA_DIGEST_V2 = hash({
  schemaVersion: 2,
  fieldCeilings: allImplementationPaths.map((path) => Object.freeze({
    path,
    domain: codecDomainCeiling(path),
  })),
  hardConstraints: Object.entries(IMPLEMENTATION_HARD_CONSTRAINTS_BY_FIELD_KEY)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  domainOverrides: Object.entries(IMPLEMENTATION_DOMAIN_CEILINGS_BY_FIELD_KEY)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
})

const expectedManifestKeys = definitions.flatMap((definition) => definition.operations.map((operation) =>
  manifestKey(definition.protocolContractId.value, operation)))
if (manifests.size !== expectedManifestKeys.length || expectedManifestKeys.some((key) => !manifests.has(key))) {
  throw new GenerationImplementationManifestV2Error('GENERATION_V2_IMPLEMENTATION_MANIFEST_INVALID')
}

export function resolveGenerationImplementationManifestV2(input: Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
}>): GenerationImplementationManifestV2 {
  const manifest = manifests.get(manifestKey(input.protocolContractId, input.operation))
  if (!manifest || manifest.providerId !== input.providerId) {
    throw new GenerationImplementationManifestV2Error('GENERATION_V2_IMPLEMENTATION_MANIFEST_UNKNOWN')
  }
  return manifest
}

export function listGenerationImplementationManifestsV2(): readonly GenerationImplementationManifestV2[] {
  return Object.freeze([...manifests.values()])
}
