import type { GeminiThinkingLevel } from '@/next/provider/gemini/geminiThinkingPolicy'

export type GeminiImageGenerationImageSize = '512' | '1K' | '2K' | '4K'

export type GeminiImageGenerationPolicy =
  | Readonly<{
      kind: 'legacy_nano_banana'
      modelFamily: 'gemini-2.5-flash-image'
      supportedImageSizes: readonly GeminiImageGenerationImageSize[]
      defaultImageSize: GeminiImageGenerationImageSize
      supportsThoughtSummaries: false
      thinkingLevels: readonly []
    }>
  | Readonly<{
      kind: 'nano_banana_2_lite'
      modelFamily: 'gemini-3.1-flash-lite-image'
      supportedImageSizes: readonly GeminiImageGenerationImageSize[]
      defaultImageSize: GeminiImageGenerationImageSize
      supportsThoughtSummaries: true
      thinkingLevels: readonly []
    }>
  | Readonly<{
      kind: 'nano_banana_2'
      modelFamily: 'gemini-3.1-flash-image'
      supportedImageSizes: readonly GeminiImageGenerationImageSize[]
      defaultImageSize: GeminiImageGenerationImageSize
      supportsThoughtSummaries: true
      thinkingLevels: readonly GeminiThinkingLevel[]
      defaultThinkingLevel: GeminiThinkingLevel
    }>
  | Readonly<{
      kind: 'nano_banana_pro'
      modelFamily: 'gemini-3-pro-image'
      supportedImageSizes: readonly GeminiImageGenerationImageSize[]
      defaultImageSize: GeminiImageGenerationImageSize
      supportsThoughtSummaries: true
      thinkingLevels: readonly []
    }>
  | Readonly<{
      kind: 'unsupported'
      modelFamily: null
      supportedImageSizes: readonly GeminiImageGenerationImageSize[]
      defaultImageSize: GeminiImageGenerationImageSize
      supportsThoughtSummaries: false
      thinkingLevels: readonly []
    }>

const DEFAULT_GENERIC_IMAGE_SIZES = ['1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_2_IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const SINGLE_1K_IMAGE_SIZE = ['1K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_PRO_IMAGE_SIZES = ['1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_2_THINKING_LEVELS = ['minimal', 'high'] as const satisfies readonly GeminiThinkingLevel[]

export function normalizeGeminiImageGenerationModelId(raw: unknown): string {
  const value = String(raw ?? '').trim()
  const withoutPrefix = value.startsWith('models/') ? value.slice('models/'.length) : value
  return withoutPrefix.toLowerCase()
}

export function isGeminiImageGenerationImageSize(value: unknown): value is GeminiImageGenerationImageSize {
  return value === '512' || value === '1K' || value === '2K' || value === '4K'
}

export function resolveGeminiImageGenerationPolicy(model: unknown): GeminiImageGenerationPolicy {
  const modelId = normalizeGeminiImageGenerationModelId(model)
  if (modelId === 'gemini-2.5-flash-image') {
    return {
      kind: 'legacy_nano_banana',
      modelFamily: 'gemini-2.5-flash-image',
      supportedImageSizes: SINGLE_1K_IMAGE_SIZE,
      defaultImageSize: '1K',
      supportsThoughtSummaries: false,
      thinkingLevels: [],
    }
  }
  if (modelId === 'gemini-3.1-flash-lite-image') {
    return {
      kind: 'nano_banana_2_lite',
      modelFamily: 'gemini-3.1-flash-lite-image',
      supportedImageSizes: SINGLE_1K_IMAGE_SIZE,
      defaultImageSize: '1K',
      supportsThoughtSummaries: true,
      thinkingLevels: [],
    }
  }
  if (modelId === 'gemini-3.1-flash-image') {
    return {
      kind: 'nano_banana_2',
      modelFamily: 'gemini-3.1-flash-image',
      supportedImageSizes: NANO_BANANA_2_IMAGE_SIZES,
      defaultImageSize: '1K',
      supportsThoughtSummaries: true,
      thinkingLevels: NANO_BANANA_2_THINKING_LEVELS,
      defaultThinkingLevel: 'minimal',
    }
  }
  if (modelId === 'gemini-3-pro-image' || modelId.startsWith('gemini-3-pro-image-')) {
    return {
      kind: 'nano_banana_pro',
      modelFamily: 'gemini-3-pro-image',
      supportedImageSizes: NANO_BANANA_PRO_IMAGE_SIZES,
      defaultImageSize: '1K',
      supportsThoughtSummaries: true,
      thinkingLevels: [],
    }
  }
  return {
    kind: 'unsupported',
    modelFamily: null,
    supportedImageSizes: DEFAULT_GENERIC_IMAGE_SIZES,
    defaultImageSize: '1K',
    supportsThoughtSummaries: false,
    thinkingLevels: [],
  }
}

export function isKnownGeminiImageGenerationModel(model: unknown): boolean {
  return resolveGeminiImageGenerationPolicy(model).kind !== 'unsupported'
}

export function validateGeminiImageGenerationImageSize(input: Readonly<{
  model: string
  imageSize?: unknown
}>): Readonly<{ ok: true }> | Readonly<{ ok: false; supportedImageSizes: readonly GeminiImageGenerationImageSize[] }> {
  const imageSize = input.imageSize
  if (imageSize === undefined || imageSize === null || imageSize === '') return { ok: true }
  if (!isGeminiImageGenerationImageSize(imageSize)) {
    return { ok: false, supportedImageSizes: resolveGeminiImageGenerationPolicy(input.model).supportedImageSizes }
  }
  const policy = resolveGeminiImageGenerationPolicy(input.model)
  if (policy.kind === 'unsupported') return { ok: true }
  return policy.supportedImageSizes.includes(imageSize)
    ? { ok: true }
    : { ok: false, supportedImageSizes: policy.supportedImageSizes }
}
