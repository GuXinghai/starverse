import type { CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'
import type { ModelCapabilitySemanticPathV2 } from './modelCapabilitySchemaV2'

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
  { runtimePath: 'generation.maxOutputTokens', sourcePaths: ['limits.output.maxTokens'] },
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
  { runtimePath: 'web.types', sourcePaths: ['search.image.support'] },
])

/** Ordered Model Facts source paths for one runtime control; empty when no Model Facts field feeds it. */
export function runtimeProjectionSourcePathsV1(runtimePath: string): readonly CanonicalSemanticPathV1[] {
  return RUNTIME_PROJECTION_RULES_V1.find((rule) => rule.runtimePath === runtimePath)?.sourcePaths ?? Object.freeze([])
}
