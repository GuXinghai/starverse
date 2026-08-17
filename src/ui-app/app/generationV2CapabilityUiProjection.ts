import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import type { GeminiThinkingCapability, GeminiThinkingLevel } from '@/next/provider/gemini/geminiThinkingPolicy'
import type { ChatSessionConfigAspectRatio, ChatSessionConfigImageResolution } from './chatSessionConfig'
import type { ImageGenerationOutputMode } from '@/next/openrouter/imageGenerationSettingsPersistence'

type ProjectionField = GenerationControlsProjectionV2['controls'][keyof GenerationControlsProjectionV2['controls']]

function field(projection: GenerationControlsProjectionV2 | null | undefined, path: keyof GenerationControlsProjectionV2['controls']): ProjectionField | null {
  return projection?.controls[path] ?? null
}

export function projectGenerationEnumValuesV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
  path: keyof GenerationControlsProjectionV2['controls'],
): readonly string[] {
  const value = field(projection, path)
  return value?.state === 'supported' && value.domain?.kind === 'enum'
    ? value.domain.values.filter((item): item is string => typeof item === 'string')
    : []
}

function baseThinking(modelId: string): Record<string, unknown> {
  return {
    modelId,
    thinkingOwnProperty: true,
    thinkingRawValue: true,
    thinkingRawType: 'boolean',
    matchedRule: null,
    allowDynamic: false,
    allowOff: false,
  }
}

export function projectGeminiThinkingCapabilityV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
  modelId: string,
): GeminiThinkingCapability {
  const levels = projectGenerationEnumValuesV2(projection, 'providerExtension.thinkingLevel') as readonly GeminiThinkingLevel[]
  if (levels.length > 0) {
    return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'supported', kind: 'level', controlKind: 'level',
      levels: Object.freeze([...levels]), defaultLevel: levels[0],
      highIsDynamic: true, reason: 'mapped_level' }) as GeminiThinkingCapability
  }
  const budget = field(projection, 'providerExtension.thinkingBudget')
  if (budget?.state === 'supported' && budget.domain?.kind === 'range') {
    return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'supported', kind: 'budget', controlKind: 'budget',
      minBudget: budget.domain.min, maxBudget: budget.domain.max, defaultBudgetMode: 'dynamic', allowDynamic: true,
      allowOff: budget.domain.min <= 0, reason: 'mapped_budget' }) as GeminiThinkingCapability
  }
  const mode = projectGenerationEnumValuesV2(projection, 'reasoning.mode')
  if (mode.includes('enabled')) {
    return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'supported', kind: 'default-only', controlKind: 'default-only',
      reason: 'supported_unmapped' }) as GeminiThinkingCapability
  }
  return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'unsupported', kind: 'unsupported', controlKind: null,
    reason: 'thinking_not_true' }) as GeminiThinkingCapability
}

export function isProjectedGeminiThinkingBudgetValid(
  capability: GeminiThinkingCapability,
  value: unknown,
): value is number {
  if (capability.kind !== 'budget' || typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  if (value === -1) return capability.allowDynamic
  if (value === 0) return capability.allowOff
  return value >= capability.minBudget && value <= capability.maxBudget
}

export function projectGeminiImageGenerationPolicyV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): Readonly<{
  supportedImageSizes: readonly ChatSessionConfigImageResolution[]
  imageSizeMode: 'selectable' | 'hidden'
  supportedAspectRatios: readonly ChatSessionConfigAspectRatio[]
  supportedOutputModes: readonly ImageGenerationOutputMode[]
  supportsThoughtSummaries: boolean
  thinkingLevels: readonly GeminiThinkingLevel[]
}> {
  const sizes = projectGenerationEnumValuesV2(projection, 'image.resolution') as readonly ChatSessionConfigImageResolution[]
  const ratios = projectGenerationEnumValuesV2(projection, 'image.aspectRatio') as readonly ChatSessionConfigAspectRatio[]
  const outputModes = projectGenerationEnumValuesV2(projection, 'image.outputMode') as readonly ImageGenerationOutputMode[]
  const thinkingLevels = projectGenerationEnumValuesV2(projection, 'providerExtension.thinkingLevel') as readonly GeminiThinkingLevel[]
  const summary = projectGenerationEnumValuesV2(projection, 'reasoning.summary')
  return Object.freeze({
    supportedImageSizes: Object.freeze(sizes),
    imageSizeMode: sizes.length > 0 ? 'selectable' : 'hidden',
    supportedAspectRatios: Object.freeze(ratios),
    supportedOutputModes: Object.freeze(outputModes),
    supportsThoughtSummaries: summary.length > 0,
    thinkingLevels: Object.freeze(thinkingLevels),
  })
}

/** Image control domains are a direct mechanical view of the resolved record. */
export function projectImageGenerationControlDomainsV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): Readonly<{
  resolutions: readonly ChatSessionConfigImageResolution[]
  aspectRatios: readonly ChatSessionConfigAspectRatio[]
  outputModes: readonly ImageGenerationOutputMode[]
}> {
  return Object.freeze({
    resolutions: Object.freeze([...projectGenerationEnumValuesV2(projection, 'image.resolution')]) as readonly ChatSessionConfigImageResolution[],
    aspectRatios: Object.freeze([...projectGenerationEnumValuesV2(projection, 'image.aspectRatio')]) as readonly ChatSessionConfigAspectRatio[],
    outputModes: Object.freeze([...projectGenerationEnumValuesV2(projection, 'image.outputMode')]) as readonly ImageGenerationOutputMode[],
  })
}

/** Image attachment acceptance is resolved capability, never catalog UI metadata. */
export function projectImageAttachmentInputSupportV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): boolean | null {
  if (!projection) return null
  const include = field(projection, 'attachments[].include')
  const sendAs = field(projection, 'attachments[].sendAs')
  if (include?.state !== 'supported' || sendAs?.state !== 'supported' || sendAs.domain?.kind !== 'enum') return false
  return sendAs.domain.values.includes('image_reference')
}

export function isProjectedGeminiImageModelV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): boolean {
  return projectImageGenerationCapabilityClassV2(projection) !== null
}

/** Image-generation controls use the same resolved field for every provider. */
export function projectImageGenerationCapabilityClassV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): 'text_and_image' | 'image_only' | null {
  const value = field(projection, 'image.mode')
  return value?.state === 'supported' && value.domain?.kind === 'enum' && value.domain.values.includes('generate')
    ? 'text_and_image'
    : null
}
