import type { GenerationControlsProjectionV2 } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import { contains } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import type { GeminiThinkingCapability, GeminiThinkingLevel } from '@/next/provider/gemini/geminiThinkingControl'
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

export function projectAnthropicThinkingCapabilityV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
  effort?: string,
): Readonly<{ supported: boolean; required: boolean; canDisable: boolean }> {
  const mode = field(projection, 'reasoning.mode')
  if (!mode || mode.state !== 'supported' || mode.domain?.kind !== 'enum') {
    return Object.freeze({ supported: false, required: false, canDisable: false })
  }
  const modeSupported = mode.domain.values.includes('enabled')
  const effortField = field(projection, 'reasoning.effort')
  const effectiveEffort = effort ?? (typeof effortField?.defaultValue === 'string' ? effortField.defaultValue : undefined)
  const disabledEffortConstraint = mode.constraints.find(constraint => constraint.path === 'reasoning.effort' &&
    (constraint.whenValues === undefined || constraint.whenValues.includes('disabled')))
  const effortAllowed = effectiveEffort === undefined || !disabledEffortConstraint?.values.includes(effectiveEffort)
  const canDisable = mode.domain.values.includes('disabled') && effortAllowed
  return Object.freeze({ supported: modeSupported, required: modeSupported && !canDisable, canDisable })
}

export function projectOpenAIResponsesThinkingCapabilityV2(
  projection: GenerationControlsProjectionV2 | null | undefined,
): Readonly<{ supported: boolean; required: boolean; canDisable: boolean }> {
  const mode = field(projection, 'reasoning.mode')
  const effort = field(projection, 'reasoning.effort')
  const effortValues = effort?.state === 'supported' && effort.domain?.kind === 'enum'
    ? effort.domain.values.filter((item): item is string => typeof item === 'string') : []
  const modeKnown = mode?.state === 'supported' && mode.domain?.kind === 'enum'
  const modeValues = modeKnown ? mode.domain.values : []
  const effortKnown = effort?.state === 'supported' && effort.domain?.kind === 'enum' && effortValues.length > 0
  const supported = effortKnown || modeValues.includes('enabled')
  const noneAllowed = effortValues.includes('none')
  const requiredByMode = modeKnown && modeValues.includes('enabled') && !modeValues.includes('disabled')
  const requiredByEffort = effortKnown && !noneAllowed
  const required = supported && (requiredByMode || requiredByEffort)
  return Object.freeze({ supported, required, canDisable: !required })
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
  const modeField = field(projection, 'reasoning.mode')
  const required = modeField?.state === 'supported' && modeField.domain?.kind === 'enum' &&
    modeField.domain.values.includes('enabled') && !modeField.domain.values.includes('disabled')
  const base = { ...baseThinking(modelId), required, defaultEnabled: required || modeField?.defaultValue !== 'disabled' }
  const levelField = field(projection, 'providerExtension.thinkingLevel')
  const levels = projectGenerationEnumValuesV2(projection, 'providerExtension.thinkingLevel') as readonly GeminiThinkingLevel[]
  if (levels.length > 0) {
    const defaultLevel = typeof levelField?.defaultValue === 'string' && levels.includes(levelField.defaultValue)
      ? levelField.defaultValue : ''
    return Object.freeze({ ...base, thinkingSupported: 'supported', kind: 'level', controlKind: 'level',
      levels: Object.freeze([...levels]), defaultLevel,
      highIsDynamic: true, reason: 'mapped_level' }) as GeminiThinkingCapability
  }
  const budget = field(projection, 'providerExtension.thinkingBudget')
  if (budget?.state === 'supported' && budget.domain?.kind === 'range') {
    const excluded = budget.domain.excludedValues ?? []
    const allowDynamic = contains(budget.domain, -1)
    const allowOff = !required && contains(budget.domain, 0)
    return Object.freeze({ ...base, thinkingSupported: 'supported', kind: 'budget', controlKind: 'budget',
      minBudget: Math.max(1, budget.domain.min), maxBudget: budget.domain.max, excludedBudgets: excluded, defaultBudgetMode: budget.defaultValue === 0 ? 'off' : 'dynamic',
      allowDynamic, allowOff, reason: 'mapped_budget' }) as GeminiThinkingCapability
  }
  const mode = projectGenerationEnumValuesV2(projection, 'reasoning.mode')
  if (mode.includes('enabled') || modeField?.state === 'supported') {
    return Object.freeze({ ...base, thinkingSupported: 'supported', kind: 'default-only', controlKind: 'default-only',
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
  return value >= capability.minBudget && value <= capability.maxBudget && !capability.excludedBudgets?.includes(value)
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
  if (!include || !sendAs || include.state === 'missing' || include.state === 'unsupported' || include.state === 'conflict' ||
      sendAs.state === 'missing' || sendAs.state === 'unsupported' || sendAs.state === 'conflict') return false
  if (include.state === 'unknown' || sendAs.state === 'unknown') return true
  if (sendAs.domain?.kind !== 'enum') return false
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
