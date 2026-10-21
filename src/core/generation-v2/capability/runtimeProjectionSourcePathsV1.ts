import type { CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'
import type { ModelCapabilitySemanticPathV2 } from './modelCapabilitySchemaV2'
import type { ProviderContractOperationV2 } from '../contracts/providerContractRegistryV2'

export type RuntimeProjectionRuleV1 = Readonly<{
  runtimePath: ModelCapabilitySemanticPathV2
  sourcePaths: readonly CanonicalSemanticPathV1[]
}>

/**
 * This is a closed, reviewed ontology projection, not a second resolver. The
 * ordered source paths are explicit because several source paths describe one
 * legacy runtime control. The first available path supplies the control value;
 * every available path still contributes its evidence and remains visible in
 * the persisted Goal 3 resolution.
 *
 * Dependency-free (type imports only) so renderer presentation can name the
 * exact Model Facts paths behind a control without importing projection code.
 */
export const RUNTIME_PROJECTION_RULES_V1: readonly RuntimeProjectionRuleV1[] = Object.freeze([
  { runtimePath: 'generation.maxOutputTokens', sourcePaths: ['limits.output.maxTokens', 'limits.output.providerDefaultTokens'] },
  { runtimePath: 'reasoning.mode', sourcePaths: ['reasoning.support', 'reasoning.modes.nativeValues'] },
  { runtimePath: 'reasoning.effort', sourcePaths: [
    'reasoning.effort.nativeValues', 'generation.effort.nativeValues',
    'reasoning.effort.providerDefault', 'generation.effort.providerDefault',
  ] },
  { runtimePath: 'generation.temperature', sourcePaths: [
    'sampling.temperature.support', 'sampling.temperature.modelMaximum', 'sampling.temperature.providerDefault',
  ] },
  { runtimePath: 'generation.topP', sourcePaths: ['sampling.topP.providerDefault'] },
  { runtimePath: 'generation.topK', sourcePaths: ['sampling.topK.support', 'sampling.topK.providerDefault'] },
  { runtimePath: 'tools.mode', sourcePaths: ['tools.calling.support'] },
  { runtimePath: 'providerExtension.responseFormat', sourcePaths: ['structuredOutput.support'] },
  { runtimePath: 'image.mode', sourcePaths: ['image.generation.support'] },
  { runtimePath: 'image.aspectRatio', sourcePaths: ['image.generation.aspectRatios'] },
  { runtimePath: 'image.resolution', sourcePaths: [
    'image.generation.resolutionPresets.nativeValues', 'image.generation.resolutionPreset.providerDefault',
  ] },
  { runtimePath: 'web.mode', sourcePaths: ['search.web.support'] },
  { runtimePath: 'web.types', sourcePaths: ['search.web.support'] },
])

const IMAGE_RUNTIME_PROJECTION_RULES_V1: readonly RuntimeProjectionRuleV1[] = Object.freeze(
  RUNTIME_PROJECTION_RULES_V1.map(rule => rule.runtimePath === 'web.types'
    ? Object.freeze({runtimePath:rule.runtimePath,sourcePaths:Object.freeze(['search.image.support'] as const)}) : rule),
)

export function runtimeProjectionRulesV1(operation: ProviderContractOperationV2 = 'text', protocol?: string): readonly RuntimeProjectionRuleV1[] {
  const openAIResponsesText = protocol === 'openai-responses-v1' && (operation === 'text' || operation === 'tool_continue')
  const generateContentText = protocol === 'gemini-generate-content-v1beta' && (operation === 'text' || operation === 'tool_continue')
  // GenerateContent text does not encode Interactions image-generation options.
  // Their original model facts remain in Goal 3 and become controls on image_generate.
  const rules = (operation === 'image_generate' ? IMAGE_RUNTIME_PROJECTION_RULES_V1 : RUNTIME_PROJECTION_RULES_V1)
    .map(rule => openAIResponsesText && rule.runtimePath === 'reasoning.mode'
      ? { ...rule, sourcePaths: [...rule.sourcePaths, 'reasoning.required' as const, 'reasoning.effort.providerDefault' as const] }
      : rule)
    .filter(rule => !generateContentText || !['image.aspectRatio', 'image.resolution'].includes(rule.runtimePath))
    // The Models API also advertises GenerateContent topK for image models;
    // Interactions generation_config has no top_k encoder.
    .filter(rule => protocol !== 'gemini-interactions-v1beta' || rule.runtimePath !== 'generation.topK')
  const scope = generateContentText ? 'generateContent.text'
    : protocol === 'gemini-interactions-v1beta' && operation === 'image_generate' ? 'interactions.imageGenerate' : null
  if (!scope) {
    if (protocol !== 'anthropic-messages-2023-06-01' || (operation !== 'text' && operation !== 'tool_continue')) return rules
    const path = (suffix: string): CanonicalSemanticPathV1 => `anthropic.messages.thinking.${suffix}` as CanonicalSemanticPathV1
    return [...rules.map(rule => rule.runtimePath === 'reasoning.mode' ? { ...rule,
      sourcePaths: [path('required'), path('omittedBehavior'), path('disabledAllowedEfforts'), 'reasoning.effort.nativeValues' as const, ...rule.sourcePaths] } :
      rule.runtimePath === 'reasoning.effort' ? { ...rule,
        sourcePaths: ['reasoning.effort.nativeValues' as const, 'reasoning.effort.providerDefault' as const] } : rule),
      { runtimePath: 'providerExtension.thinkingMode', sourcePaths: [path('acceptedTypes'), path('omittedBehavior'), path('recommendedMode')] },
      { runtimePath: 'providerExtension.thinkingDisplay', sourcePaths: [path('defaultDisplay')] },
      { runtimePath: 'providerExtension.manualThinkingBudgetTokens', sourcePaths: [path('manualBudgetDomain'), 'limits.output.maxTokens' as const] },
    ]
  }
  const path = (suffix: string) => `gemini.${scope}.${suffix}` as CanonicalSemanticPathV1
  return [...rules.map(rule => rule.runtimePath === 'reasoning.mode' ? { ...rule,
    sourcePaths: [path('thinking.required'), path('thinking.defaultEnabled'), ...rule.sourcePaths] } : rule),
    { runtimePath: 'providerExtension.thinkingLevel', sourcePaths: [path('thinkingLevel.nativeValues'), path('thinkingLevel.providerDefault')] },
    ...(generateContentText ? [{ runtimePath: 'providerExtension.thinkingBudget' as const,
      sourcePaths: [path('thinkingBudget.domain'), path('thinkingBudget.providerDefault')] }] : []),
    ...(generateContentText ? [{ runtimePath: 'providerExtension.includeThoughts' as const, sourcePaths: [path('thinking.includeThoughts.support')] }]
      : [{ runtimePath: 'reasoning.summary' as const, sourcePaths: [path('thinking.summaries.support')] }]),
  ]
}

/** Ordered Model Facts source paths for one runtime control; empty when no Model Facts field feeds it. */
export function runtimeProjectionSourcePathsV1(runtimePath: string, operation: ProviderContractOperationV2 = 'text', protocol?: string): readonly CanonicalSemanticPathV1[] {
  return runtimeProjectionRulesV1(operation, protocol).find((rule) => rule.runtimePath === runtimePath)?.sourcePaths ?? Object.freeze([])
}
