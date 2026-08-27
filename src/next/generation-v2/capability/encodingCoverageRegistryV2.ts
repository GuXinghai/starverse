import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  listReviewedProviderContractDefinitionsV2,
  type ProviderContractOperationV2,
} from '../contracts/providerContractRegistryV2'
import type {
  PersistedModelCapabilityFieldV2 as PersistedRuntimeCapabilityFieldV2,
  ModelCapabilitySemanticPathV2 as RuntimeCapabilitySemanticPathV2,
} from './modelCapabilitySchemaV2'

/**
 * Protocol coverage is a code-integrity fact, not a model capability ceiling.
 * It records which canonical semantic paths have an encoder for an exact
 * provider contract and operation. It deliberately contains no model ids,
 * domains, constraints, aliases, or value mappings.
 */
export type EncodingCoverageRegistryV2 = Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
  semanticPaths: readonly RuntimeCapabilitySemanticPathV2[]
  encoderRevision: string
}>

export class EncodingCoverageRegistryV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ENCODING_COVERAGE_INVALID'
    | 'GENERATION_V2_ENCODING_COVERAGE_UNKNOWN') {
    super(code)
    this.name = 'EncodingCoverageRegistryV2Error'
  }
}

export const ENCODING_COVERAGE_REGISTRY_SCHEMA_DIGEST_V2 = hash({
  schemaVersion: 2,
  fields: ['providerId', 'protocolContractId', 'operation', 'semanticPaths', 'encoderRevision'],
  excludes: ['modelId', 'domains', 'constraints', 'aliases', 'valueMappings'],
})

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
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
  'generation.frequencyPenalty', 'generation.presencePenalty',
  'reasoning.mode', 'reasoning.effort', 'web.mode', 'image.mode', 'tools.mode', 'tools.allowedToolIds',
  'tools.toolChoice', 'tools.sideEffectConfirmation', 'providerExtension.kind',
] as RuntimeCapabilitySemanticPathV2[])

const GENERIC_LOCAL_PATHS = Object.freeze([
  ...COMMON_TEXT_NO_WIRE,
  'generation.maxOutputTokens', 'generation.temperature', 'generation.topP', 'generation.stop', 'reasoning.mode',
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

const PATHS_BY_KEY: Readonly<Record<string, readonly RuntimeCapabilitySemanticPathV2[]>> = Object.freeze({
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

/**
 * Explicit implementation revisions are intentionally separate from the
 * capability revision. A wire-target, omission rule, structural encoding, or
 * response/request framing change must bump the affected seed even when the
 * semantic coverage set is unchanged. This is a code review surface, not a
 * model capability allowlist.
 */
const ENCODER_IMPLEMENTATION_REVISION_BY_KEY: Readonly<Record<string, string>> = Object.freeze({
  'openrouter-images-v1\0image_generate': 'wire-adapter-20260817-openrouter-images-1',
  'openrouter-chat-completions-v1\0text': 'wire-adapter-20260817-openrouter-chat-text-1',
  'openrouter-chat-completions-v1\0tool_continue': 'wire-adapter-20260817-openrouter-chat-tool-1',
  'gemini-generate-content-v1beta\0text': 'wire-adapter-20260817-gemini-content-text-1',
  'gemini-generate-content-v1beta\0tool_continue': 'wire-adapter-20260817-gemini-content-tool-1',
  'gemini-interactions-v1beta\0image_generate': 'wire-adapter-20260817-gemini-interactions-image-1',
  'anthropic-messages-2023-06-01\0text': 'wire-adapter-20260817-anthropic-text-1',
  'anthropic-messages-2023-06-01\0tool_continue': 'wire-adapter-20260817-anthropic-tool-1',
  'deepseek-stable-chat-v1\0text': 'wire-adapter-20260817-deepseek-text-1',
  'deepseek-stable-chat-v1\0tool_continue': 'wire-adapter-20260817-deepseek-tool-1',
  'openai-responses-v1\0text': 'wire-adapter-20260817-openai-responses-text-1',
  'openai-responses-v1\0tool_continue': 'wire-adapter-20260817-openai-responses-tool-1',
  'generic-local-openai-chat-completions\0text': 'wire-adapter-20260817-generic-local-1',
  'ollama-chat-v1\0text': 'wire-adapter-20260817-ollama-1',
  'lmstudio-openresponses\0text': 'wire-adapter-20260817-lmstudio-text-1',
  'lmstudio-openresponses\0tool_continue': 'wire-adapter-20260817-lmstudio-tool-1',
  'openai_chat_compatible\0text': 'wire-adapter-20260817-openai-compatible-1',
})

function key(protocolContractId: string, operation: ProviderContractOperationV2): string {
  return `${protocolContractId}\0${operation}`
}

const definitions = listReviewedProviderContractDefinitionsV2()
const registries = new Map<string, EncodingCoverageRegistryV2>()
for (const definition of definitions) {
  for (const operation of definition.operations) {
    const semanticPaths = PATHS_BY_KEY[key(definition.protocolContractId.value, operation)]
    if (!semanticPaths || semanticPaths.length === 0 || new Set(semanticPaths).size !== semanticPaths.length) {
      throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    }
    const implementationRevision = ENCODER_IMPLEMENTATION_REVISION_BY_KEY[key(definition.protocolContractId.value, operation)]
    if (!implementationRevision) throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    const projection = Object.freeze({
      providerId: definition.providerId.value,
      protocolContractId: definition.protocolContractId.value,
      operation,
      semanticPaths,
    })
    const encoderRevision = `encoder-v2:${hash({
      projection,
      contractRevision: definition.contractRevision.value,
      registryRevision: definition.registryRevision.value,
      implementationRevision,
    })}`
    const registry = Object.freeze({ ...projection, encoderRevision })
    const registryKey = key(definition.protocolContractId.value, operation)
    if (registries.has(registryKey)) throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    registries.set(registryKey, registry)
  }
}

const expectedKeys = definitions.flatMap((definition) => definition.operations.map((operation) =>
  key(definition.protocolContractId.value, operation)))
if (registries.size !== expectedKeys.length || expectedKeys.some((item) => !registries.has(item))) {
  throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
}

export function resolveEncodingCoverageRegistryV2(input: Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
}>): EncodingCoverageRegistryV2 {
  const registry = registries.get(key(input.protocolContractId, input.operation))
  if (!registry || registry.providerId !== input.providerId) {
    throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_UNKNOWN')
  }
  return registry
}

/**
 * A supported semantic field is executable only when the exact protocol
 * encoder has an explicit coverage entry for it. This is an integrity check,
 * not a capability ceiling: the registry never supplies or narrows domains.
 */
export function assertEncodingCoverageForResolvedFieldsV2(
  input: Readonly<{
    providerId: string
    protocolContractId: string
    operation: ProviderContractOperationV2
    fields: readonly PersistedRuntimeCapabilityFieldV2[]
  }>,
): EncodingCoverageRegistryV2 {
  const registry = resolveEncodingCoverageRegistryV2(input)
  const covered = new Set(registry.semanticPaths)
  for (const field of input.fields) {
    if ((field.state === 'supported' || field.state === 'requires_confirmation') && !covered.has(field.path)) {
      throw new EncodingCoverageRegistryV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    }
  }
  return registry
}

export function listEncodingCoverageRegistriesV2(): readonly EncodingCoverageRegistryV2[] {
  return Object.freeze([...registries.values()])
}
