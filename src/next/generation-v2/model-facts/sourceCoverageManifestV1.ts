import {
  canonicalSourceFactDigestV1,
  isCanonicalSemanticPathV1,
  type CanonicalOperationKindV1,
  type CanonicalSemanticPathV1,
} from './canonicalSourceFactsV1'

export type SourceMappingCoverageEntryV1 = Readonly<{
  mappingId: string
  sourceFieldPaths: readonly string[]
  canonicalPath: CanonicalSemanticPathV1
  absenceSemantics: 'missing' | 'explicit_unsupported' | 'no_outcome'
  nullSemantics: 'invalid' | 'missing' | 'explicit_unsupported' | 'mapped_value'
  collectionCompleteness: 'complete' | 'partial' | 'not_a_collection'
}>

export type SourceMappingCoverageManifestV1 = Readonly<{
  sourceSurfaceId: string
  manifestRevision: string
  mappings: readonly SourceMappingCoverageEntryV1[]
  nativeOperationMappings: readonly Readonly<{
    sourceValue: string
    canonicalValue: CanonicalOperationKindV1
  }>[]
}>

export class SourceCoverageManifestV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_SOURCE_COVERAGE_MANIFEST_INVALID') {
    super(code)
    this.name = 'SourceCoverageManifestV1Error'
  }
}

function invalid(): never {
  throw new SourceCoverageManifestV1Error('GENERATION_V2_SOURCE_COVERAGE_MANIFEST_INVALID')
}

export function defineSourceMappingCoverageManifestV1(input: Readonly<{
  sourceSurfaceId: string
  mappings: readonly Omit<SourceMappingCoverageEntryV1, never>[]
  nativeOperationMappings?: readonly Readonly<{
    sourceValue: string
    canonicalValue: CanonicalOperationKindV1
  }>[]
}>): SourceMappingCoverageManifestV1 {
  if (!input.sourceSurfaceId || input.sourceSurfaceId.length > 256 || input.mappings.length > 256) invalid()
  const mappings = input.mappings.map((mapping) => {
    if (!mapping.mappingId || mapping.mappingId.length > 256 || mapping.sourceFieldPaths.length < 1 ||
        mapping.sourceFieldPaths.length > 16 || mapping.sourceFieldPaths.some((path) => !path || path.length > 512) ||
        !isCanonicalSemanticPathV1(mapping.canonicalPath) ||
        !['missing', 'explicit_unsupported', 'no_outcome'].includes(mapping.absenceSemantics) ||
        !['invalid', 'missing', 'explicit_unsupported', 'mapped_value'].includes(mapping.nullSemantics) ||
        !['complete', 'partial', 'not_a_collection'].includes(mapping.collectionCompleteness)) invalid()
    return Object.freeze({ ...mapping, sourceFieldPaths: Object.freeze([...mapping.sourceFieldPaths]) })
  }).sort((left, right) => left.mappingId.localeCompare(right.mappingId, 'en'))
  const operations = [...(input.nativeOperationMappings ?? [])]
    .map((mapping) => Object.freeze({ ...mapping }))
    .sort((left, right) => left.sourceValue.localeCompare(right.sourceValue, 'en'))
  if (new Set(mappings.map((mapping) => mapping.mappingId)).size !== mappings.length ||
      new Set(operations.map((mapping) => mapping.sourceValue)).size !== operations.length) invalid()
  const projection = Object.freeze({ sourceSurfaceId: input.sourceSurfaceId, mappings: Object.freeze(mappings),
    nativeOperationMappings: Object.freeze(operations) })
  return Object.freeze({ ...projection,
    manifestRevision: `source-coverage-manifest-v1:${canonicalSourceFactDigestV1(projection)}` })
}

const scalar = (
  mappingId: string,
  sourceFieldPath: string,
  canonicalPath: CanonicalSemanticPathV1,
  absenceSemantics: SourceMappingCoverageEntryV1['absenceSemantics'] = 'missing',
): SourceMappingCoverageEntryV1 => Object.freeze({ mappingId, sourceFieldPaths: [sourceFieldPath], canonicalPath,
  absenceSemantics, nullSemantics: 'invalid', collectionCompleteness: 'not_a_collection' })

export const PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1 = Object.freeze({
  'openai-models-v1': defineSourceMappingCoverageManifestV1({ sourceSurfaceId: 'openai-models-v1', mappings: [] }),
  'deepseek-stable-models-v1': defineSourceMappingCoverageManifestV1({ sourceSurfaceId: 'deepseek-stable-models-v1', mappings: [] }),
  'gemini-models-v1beta': defineSourceMappingCoverageManifestV1({
    sourceSurfaceId: 'gemini-models-v1beta',
    mappings: [
      scalar('google.input-limit.v1', 'inputTokenLimit', 'limits.input.maxTokens'),
      scalar('google.output-limit.v1', 'outputTokenLimit', 'limits.output.maxTokens'),
      scalar('google.thinking.v1', 'thinking', 'reasoning.support'),
      scalar('google.temperature-default.v1', 'temperature', 'sampling.temperature.providerDefault'),
      scalar('google.temperature-maximum.v1', 'maxTemperature', 'sampling.temperature.modelMaximum'),
      scalar('google.top-p-default.v1', 'topP', 'sampling.topP.providerDefault'),
      scalar('google.top-k-support.v1', 'topK', 'sampling.topK.support', 'explicit_unsupported'),
      scalar('google.top-k-default.v1', 'topK', 'sampling.topK.providerDefault', 'no_outcome'),
      Object.freeze({ mappingId: 'google.supported-operations.v1', sourceFieldPaths: ['supportedGenerationMethods'],
        canonicalPath: 'operations.supported', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'complete' }),
    ],
    nativeOperationMappings: [
      { sourceValue: 'generateContent', canonicalValue: 'content_generate' },
      { sourceValue: 'bidiGenerateContent', canonicalValue: 'content_generate_bidirectional' },
      { sourceValue: 'batchGenerateContent', canonicalValue: 'content_generate_batch' },
      { sourceValue: 'generateAnswer', canonicalValue: 'answer_generate' },
      { sourceValue: 'embedContent', canonicalValue: 'embedding_generate' },
      { sourceValue: 'asyncBatchEmbedContent', canonicalValue: 'embedding_batch_async' },
      { sourceValue: 'countTokens', canonicalValue: 'token_count' },
      { sourceValue: 'countTextTokens', canonicalValue: 'token_count' },
      { sourceValue: 'createCachedContent', canonicalValue: 'context_cache_create' },
      { sourceValue: 'predict', canonicalValue: 'predict' },
      { sourceValue: 'predictLongRunning', canonicalValue: 'predict_long_running' },
    ],
  }),
  'anthropic-models-2023-06-01': defineSourceMappingCoverageManifestV1({
    sourceSurfaceId: 'anthropic-models-2023-06-01',
    mappings: [
      scalar('anthropic.input-limit.v1', 'max_input_tokens', 'limits.input.maxTokens'),
      scalar('anthropic.output-limit.v1', 'max_tokens', 'limits.output.maxTokens'),
      scalar('anthropic.thinking-support.v1', 'capabilities.thinking.supported', 'reasoning.support'),
      Object.freeze({ mappingId: 'anthropic.thinking-modes.v1',
        sourceFieldPaths: ['capabilities.thinking.types.enabled.supported', 'capabilities.thinking.types.adaptive.supported'],
        canonicalPath: 'reasoning.modes.nativeValues', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
      Object.freeze({ mappingId: 'anthropic.generation-effort.v1',
        sourceFieldPaths: ['capabilities.effort.supported', 'capabilities.effort.low.supported',
          'capabilities.effort.medium.supported', 'capabilities.effort.high.supported',
          'capabilities.effort.xhigh.supported', 'capabilities.effort.max.supported'],
        canonicalPath: 'generation.effort.nativeValues', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'complete' }),
      scalar('anthropic.structured-output.v1', 'capabilities.structured_outputs.supported', 'structuredOutput.support'),
      Object.freeze({ mappingId: 'anthropic.input-modalities.v1',
        sourceFieldPaths: ['capabilities.image_input.supported', 'capabilities.pdf_input.supported'],
        canonicalPath: 'modalities.input', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
      scalar('anthropic.citations.v1', 'capabilities.citations.supported', 'documents.citations.support'),
      scalar('anthropic.code-execution.v1', 'capabilities.code_execution.supported', 'tools.codeExecution.support'),
      scalar('anthropic.context-management.v1', 'capabilities.context_management.supported', 'contextManagement.support'),
      Object.freeze({ mappingId: 'anthropic.context-actions.v1', sourceFieldPaths: [
        'capabilities.context_management.clear_tool_uses_20250919.supported',
        'capabilities.context_management.clear_thinking_20251015.supported',
        'capabilities.context_management.compact_20260112.supported'],
        canonicalPath: 'contextManagement.actions.nativeValues', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
      Object.freeze({ mappingId: 'anthropic.batch-operation.v1', sourceFieldPaths: ['capabilities.batch.supported'],
        canonicalPath: 'operations.supported', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
    ],
  }),
  'openrouter-chat-models-v1': defineSourceMappingCoverageManifestV1({
    sourceSurfaceId: 'openrouter-chat-models-v1',
    mappings: [
      scalar('openrouter.context-window.v1', 'context_length', 'limits.contextWindow.maxTokens'),
      Object.freeze({ mappingId: 'openrouter.input-modalities.v1', sourceFieldPaths: ['architecture.input_modalities'],
        canonicalPath: 'modalities.input', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'complete' }),
      Object.freeze({ mappingId: 'openrouter.output-modalities.v1', sourceFieldPaths: ['architecture.output_modalities'],
        canonicalPath: 'modalities.output', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'complete' }),
      scalar('openrouter.reasoning-support.v1', 'reasoning', 'reasoning.support'),
      scalar('openrouter.reasoning-required.v1', 'reasoning.mandatory', 'reasoning.required'),
      scalar('openrouter.reasoning-default.v1', 'reasoning.default_effort', 'reasoning.effort.providerDefault'),
    ],
  }),
  'lmstudio-models-v1': defineSourceMappingCoverageManifestV1({
    sourceSurfaceId: 'lmstudio-models-v1',
    mappings: [
      scalar('lmstudio.context-window.v1', 'max_context_length', 'limits.contextWindow.maxTokens'),
      Object.freeze({ mappingId: 'lmstudio.vision.v1', sourceFieldPaths: ['capabilities.vision'],
        canonicalPath: 'modalities.input', absenceSemantics: 'missing', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
      scalar('lmstudio.tool-training.v1', 'capabilities.trained_for_tool_use', 'tools.trainingForToolUse'),
    ],
  }),
  'ollama-tags-v1': defineSourceMappingCoverageManifestV1({
    sourceSurfaceId: 'ollama-tags-v1',
    mappings: [
      Object.freeze({ mappingId: 'ollama.capabilities.operations.v1', sourceFieldPaths: ['capabilities'],
        canonicalPath: 'operations.supported', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
      Object.freeze({ mappingId: 'ollama.capabilities.input-modalities.v1', sourceFieldPaths: ['capabilities'],
        canonicalPath: 'modalities.input', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
        collectionCompleteness: 'partial' }),
    ],
  }),
})

export const MODELS_DEV_COVERAGE_MANIFEST_V1 = defineSourceMappingCoverageManifestV1({
  sourceSurfaceId: 'models-dev-api-v1',
  mappings: [
    scalar('models-dev.attachment.v1', 'attachment', 'input.attachments.support'),
    scalar('models-dev.reasoning.v1', 'reasoning', 'reasoning.support'),
    scalar('models-dev.tool-call.v1', 'tool_call', 'tools.calling.support'),
    scalar('models-dev.structured-output.v1', 'structured_output', 'structuredOutput.support'),
    scalar('models-dev.temperature.v1', 'temperature', 'sampling.temperature.support'),
    Object.freeze({ mappingId: 'models-dev.input-modalities.v1', sourceFieldPaths: ['modalities.input'],
      canonicalPath: 'modalities.input', absenceSemantics: 'missing', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    Object.freeze({ mappingId: 'models-dev.output-modalities.v1', sourceFieldPaths: ['modalities.output'],
      canonicalPath: 'modalities.output', absenceSemantics: 'missing', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    scalar('models-dev.context-limit.v1', 'limit.context', 'limits.contextWindow.maxTokens'),
    scalar('models-dev.input-limit.v1', 'limit.input', 'limits.input.maxTokens'),
    scalar('models-dev.output-limit.v1', 'limit.output', 'limits.output.maxTokens'),
    scalar('models-dev.reasoning-toggle.v1', 'reasoning_options[type=toggle]', 'reasoning.toggle.support'),
    Object.freeze({ mappingId: 'models-dev.reasoning-effort.v1', sourceFieldPaths: ['reasoning_options[type=effort].values'],
      canonicalPath: 'reasoning.effort.nativeValues', absenceSemantics: 'missing', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    scalar('models-dev.reasoning-budget-support.v1', 'reasoning_options[type=budget_tokens]', 'reasoning.budgetTokens.support'),
    Object.freeze({ mappingId: 'models-dev.reasoning-budget-domain.v1',
      sourceFieldPaths: ['reasoning_options[type=budget_tokens].min', 'reasoning_options[type=budget_tokens].max'],
      canonicalPath: 'reasoning.budgetTokens.domain', absenceSemantics: 'missing', nullSemantics: 'invalid',
      collectionCompleteness: 'not_a_collection' }),
  ],
})

export const CAPABILITY_RULE_COVERAGE_MANIFEST_V1 = defineSourceMappingCoverageManifestV1({
  sourceSurfaceId: 'capability-rules-v2',
  mappings: [
    scalar('rules.reasoning-mode.v1', 'reasoning.mode', 'reasoning.support'),
    Object.freeze({ mappingId: 'rules.reasoning-effort.v1', sourceFieldPaths: ['reasoning.effort'],
      canonicalPath: 'reasoning.effort.nativeValues', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    scalar('rules.reasoning-effort-default.v1', 'reasoning.effort.defaultValue',
      'reasoning.effort.providerDefault'),
    scalar('rules.generation-effort-default.v1', 'reasoning.effort.defaultValue',
      'generation.effort.providerDefault'),
    scalar('rules.image-mode.v1', 'image.mode', 'image.generation.support'),
    Object.freeze({ mappingId: 'rules.image-aspect-ratio.v1', sourceFieldPaths: ['image.aspectRatio'],
      canonicalPath: 'image.generation.aspectRatios', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    Object.freeze({ mappingId: 'rules.image-resolution.v1', sourceFieldPaths: ['image.resolution'],
      canonicalPath: 'image.generation.resolutionPresets.nativeValues', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
    scalar('rules.image-resolution-default.v1', 'image.resolution.defaultValue',
      'image.generation.resolutionPreset.providerDefault'),
    scalar('rules.web-mode.v1', 'web.mode', 'search.web.support'),
    Object.freeze({ mappingId: 'rules.web-types.v1', sourceFieldPaths: ['web.types'],
      canonicalPath: 'search.web.support', absenceSemantics: 'no_outcome', nullSemantics: 'invalid',
      collectionCompleteness: 'complete' }),
  ],
})
