import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import type { GeminiThinkingCapability, GeminiThinkingLevel } from '@/next/provider/gemini/geminiThinkingPolicy'
import type { ChatSessionConfigAspectRatio, ChatSessionConfigImageResolution } from './chatSessionConfig'
import type { ImageGenerationOutputMode } from '@/next/openrouter/imageGenerationSettingsPersistence'

type ProjectionField = GenerationControlsProjectionV2['controls'][keyof GenerationControlsProjectionV2['controls']]

function field(projection: GenerationControlsProjectionV2 | null | undefined, path: keyof GenerationControlsProjectionV2['controls']): ProjectionField | null {
  return projection?.controls[path] ?? null
}

function enumValues(projection: GenerationControlsProjectionV2 | null | undefined, path: keyof GenerationControlsProjectionV2['controls']): readonly string[] {
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
  const levels = enumValues(projection, 'providerExtension.thinkingLevel')
    .filter((value): value is GeminiThinkingLevel => ['minimal', 'low', 'medium', 'high'].includes(value))
  if (levels.length > 0) {
    return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'supported', kind: 'level', controlKind: 'level',
      levels: Object.freeze(levels), defaultLevel: (levels.includes('medium') ? 'medium' : levels[0]) as GeminiThinkingLevel,
      highIsDynamic: true, reason: 'mapped_level' }) as GeminiThinkingCapability
  }
  const budget = field(projection, 'providerExtension.thinkingBudget')
  if (budget?.state === 'supported' && budget.domain?.kind === 'range') {
    return Object.freeze({ ...baseThinking(modelId), thinkingSupported: 'supported', kind: 'budget', controlKind: 'budget',
      minBudget: budget.domain.min, maxBudget: budget.domain.max, defaultBudgetMode: 'dynamic', allowDynamic: true,
      allowOff: budget.domain.min <= 0, reason: 'mapped_budget' }) as GeminiThinkingCapability
  }
  const mode = enumValues(projection, 'reasoning.mode')
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
  defaultImageSize: ChatSessionConfigImageResolution
  imageSizeMode: 'selectable' | 'hidden'
  supportedAspectRatios: readonly ChatSessionConfigAspectRatio[]
  defaultAspectRatio: ChatSessionConfigAspectRatio
  supportedOutputModes: readonly ImageGenerationOutputMode[]
  defaultOutputMode: ImageGenerationOutputMode
  supportsThoughtSummaries: boolean
  thinkingLevels: readonly GeminiThinkingLevel[]
}> {
  const sizes = enumValues(projection, 'image.resolution')
    .filter((value): value is ChatSessionConfigImageResolution => ['512', '1K', '2K', '4K'].includes(value))
  const ratios = enumValues(projection, 'image.aspectRatio')
    .filter((value): value is ChatSessionConfigAspectRatio => ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '5:4', '4:5', '21:9', '4:1', '1:4', '8:1', '1:8'].includes(value))
  const outputModes = enumValues(projection, 'image.outputMode')
    .filter((value): value is ImageGenerationOutputMode => value === 'image_only' || value === 'image_and_text')
  const thinkingLevels = enumValues(projection, 'providerExtension.thinkingLevel')
    .filter((value): value is GeminiThinkingLevel => ['minimal', 'low', 'medium', 'high'].includes(value))
  const summary = enumValues(projection, 'reasoning.summary')
  return Object.freeze({
    supportedImageSizes: Object.freeze(sizes),
    defaultImageSize: sizes[0] ?? '1K',
    imageSizeMode: sizes.length > 0 ? 'selectable' : 'hidden',
    supportedAspectRatios: Object.freeze(ratios),
    defaultAspectRatio: ratios[0] ?? '1:1',
    supportedOutputModes: Object.freeze(outputModes),
    defaultOutputMode: outputModes[0] ?? 'auto',
    supportsThoughtSummaries: summary.length > 0,
    thinkingLevels: Object.freeze(thinkingLevels),
  })
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
