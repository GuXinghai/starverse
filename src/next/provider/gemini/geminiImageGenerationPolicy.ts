import type { GeminiThinkingLevel } from '@/next/provider/gemini/geminiThinkingPolicy'

export type GeminiImageGenerationImageSize = '512' | '1K' | '2K' | '4K'
export type GeminiImageGenerationImageSizeMode = 'selectable' | 'locked' | 'hidden'
export type GeminiImageGenerationAspectRatio =
  | 'auto'
  | '1:1'
  | '9:16'
  | '16:9'
  | '3:4'
  | '4:3'
  | '3:2'
  | '2:3'
  | '5:4'
  | '4:5'
  | '21:9'
  | '4:1'
  | '1:4'
  | '8:1'
  | '1:8'
export type GeminiImageGenerationOutputMode = 'image_only' | 'image_and_text'

type GeminiImageGenerationPolicyCommon = Readonly<{
  supportedImageSizes: readonly GeminiImageGenerationImageSize[]
  defaultImageSize: GeminiImageGenerationImageSize
  imageSizeMode: GeminiImageGenerationImageSizeMode
  supportedAspectRatios: readonly GeminiImageGenerationAspectRatio[]
  defaultAspectRatio: GeminiImageGenerationAspectRatio
  supportedOutputModes: readonly GeminiImageGenerationOutputMode[]
  defaultOutputMode: GeminiImageGenerationOutputMode
  maxOutputTokens: number
  supportsStopSequences: boolean
  supportsGoogleSearch: boolean
  supportsImageSearch: boolean
  supportsThoughtSummaries: boolean
  thinkingLevels: readonly GeminiThinkingLevel[]
}>

export type GeminiImageGenerationPolicy =
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'legacy_nano_banana'
      modelFamily: 'gemini-2.5-flash-image'
      supportsThoughtSummaries: false
      thinkingLevels: readonly []
    }>)
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'nano_banana_2_lite'
      modelFamily: 'gemini-3.1-flash-lite-image'
      supportsThoughtSummaries: true
      thinkingLevels: readonly GeminiThinkingLevel[]
      defaultThinkingLevel: GeminiThinkingLevel
    }>)
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'interactions_image_v1beta'
      modelFamily: 'gemini-3.1-flash-image'
      supportsThoughtSummaries: false
      thinkingLevels: readonly []
    }>)
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'nano_banana_2'
      modelFamily: 'gemini-3.1-flash-image'
      supportsThoughtSummaries: true
      thinkingLevels: readonly GeminiThinkingLevel[]
      defaultThinkingLevel: GeminiThinkingLevel
    }>)
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'nano_banana_pro'
      modelFamily: 'gemini-3-pro-image'
      supportsThoughtSummaries: true
      thinkingLevels: readonly GeminiThinkingLevel[]
      defaultThinkingLevel: GeminiThinkingLevel
    }>)
  | (GeminiImageGenerationPolicyCommon & Readonly<{
      kind: 'unsupported'
      modelFamily: null
      supportsThoughtSummaries: false
      thinkingLevels: readonly []
    }>)

const DEFAULT_GENERIC_IMAGE_SIZES = ['1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_2_IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const SINGLE_1K_IMAGE_SIZE = ['1K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_PRO_IMAGE_SIZES = ['1K', '2K', '4K'] as const satisfies readonly GeminiImageGenerationImageSize[]
const NANO_BANANA_2_THINKING_LEVELS = ['minimal', 'high'] as const satisfies readonly GeminiThinkingLevel[]
export const GEMINI_IMAGE_GENERATION_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
  '4:1',
  '1:4',
  '8:1',
  '1:8',
] as const satisfies readonly GeminiImageGenerationAspectRatio[]
const GEMINI_NANO_BANANA_LEGACY_ASPECT_RATIOS = [
  'auto',
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '21:9',
] as const satisfies readonly GeminiImageGenerationAspectRatio[]
const GEMINI_IMAGE_GENERATION_OUTPUT_MODES = ['image_and_text', 'image_only'] as const satisfies readonly GeminiImageGenerationOutputMode[]

export function normalizeGeminiImageGenerationModelId(raw: unknown): string {
  const value = String(raw ?? '').trim()
  const withoutPublisherPrefix = value.startsWith('publishers/google/models/')
    ? value.slice('publishers/google/models/'.length)
    : value
  const withoutPrefix = withoutPublisherPrefix.startsWith('models/')
    ? withoutPublisherPrefix.slice('models/'.length)
    : withoutPublisherPrefix
  return withoutPrefix.toLowerCase()
}

export function isGeminiImageGenerationImageSize(value: unknown): value is GeminiImageGenerationImageSize {
  return value === '512' || value === '1K' || value === '2K' || value === '4K'
}

export function isGeminiImageGenerationAspectRatio(value: unknown): value is GeminiImageGenerationAspectRatio {
  return (GEMINI_IMAGE_GENERATION_ASPECT_RATIOS as readonly unknown[]).includes(value)
}

function modelIdMatchesStableOrPreview(modelId: string, stableModelId: string): boolean {
  return modelId === stableModelId ||
    modelId === `${stableModelId}-preview` ||
    modelId.startsWith(`${stableModelId}-preview-`)
}

function commonPolicy(input: Readonly<{
  supportedImageSizes: readonly GeminiImageGenerationImageSize[]
  defaultImageSize: GeminiImageGenerationImageSize
  imageSizeMode: GeminiImageGenerationImageSizeMode
  supportedAspectRatios?: readonly GeminiImageGenerationAspectRatio[]
  defaultAspectRatio?: GeminiImageGenerationAspectRatio
  maxOutputTokens?: number
  supportsStopSequences?: boolean
  supportsGoogleSearch?: boolean
  supportsImageSearch?: boolean
  supportedOutputModes?: readonly GeminiImageGenerationOutputMode[]
  defaultOutputMode?: GeminiImageGenerationOutputMode
}>): GeminiImageGenerationPolicyCommon {
  return {
    supportedImageSizes: input.supportedImageSizes,
    defaultImageSize: input.defaultImageSize,
    imageSizeMode: input.imageSizeMode,
    supportedAspectRatios: input.supportedAspectRatios ?? GEMINI_IMAGE_GENERATION_ASPECT_RATIOS,
    defaultAspectRatio: input.defaultAspectRatio ?? '1:1',
    supportedOutputModes: input.supportedOutputModes ?? GEMINI_IMAGE_GENERATION_OUTPUT_MODES,
    defaultOutputMode: input.defaultOutputMode ?? 'image_and_text',
    maxOutputTokens: input.maxOutputTokens ?? 32768,
    supportsStopSequences: input.supportsStopSequences ?? true,
    supportsGoogleSearch: input.supportsGoogleSearch ?? false,
    supportsImageSearch: input.supportsImageSearch ?? false,
    supportsThoughtSummaries: false,
    thinkingLevels: [],
  }
}

export function resolveGeminiImageGenerationPolicy(model: unknown): GeminiImageGenerationPolicy {
  const modelId = normalizeGeminiImageGenerationModelId(model)
  if (modelId === 'gemini-3.1-flash-image') {
    return {
      ...commonPolicy({
        supportedImageSizes: SINGLE_1K_IMAGE_SIZE,
        defaultImageSize: '1K',
        imageSizeMode: 'locked',
        supportedAspectRatios: ['1:1'],
        defaultAspectRatio: '1:1',
        supportedOutputModes: ['image_only'],
        defaultOutputMode: 'image_only',
        maxOutputTokens: 0,
        supportsStopSequences: false,
      }),
      kind: 'interactions_image_v1beta',
      modelFamily: 'gemini-3.1-flash-image',
      supportsThoughtSummaries: false,
      thinkingLevels: [],
    }
  }
  if (modelIdMatchesStableOrPreview(modelId, 'gemini-2.5-flash-image')) {
    return {
      ...commonPolicy({
        supportedImageSizes: NANO_BANANA_2_IMAGE_SIZES,
        defaultImageSize: '1K',
        imageSizeMode: 'hidden',
        supportedAspectRatios: GEMINI_NANO_BANANA_LEGACY_ASPECT_RATIOS,
      }),
      kind: 'legacy_nano_banana',
      modelFamily: 'gemini-2.5-flash-image',
      supportsThoughtSummaries: false,
      thinkingLevels: [],
    }
  }
  if (modelIdMatchesStableOrPreview(modelId, 'gemini-3.1-flash-lite-image')) {
    return {
      ...commonPolicy({
        supportedImageSizes: SINGLE_1K_IMAGE_SIZE,
        defaultImageSize: '1K',
        imageSizeMode: 'locked',
        maxOutputTokens: 4096,
      }),
      kind: 'nano_banana_2_lite',
      modelFamily: 'gemini-3.1-flash-lite-image',
      supportsThoughtSummaries: true,
      thinkingLevels: NANO_BANANA_2_THINKING_LEVELS,
      defaultThinkingLevel: 'minimal',
    }
  }
  if (modelIdMatchesStableOrPreview(modelId, 'gemini-3.1-flash-image')) {
    return {
      ...commonPolicy({
        supportedImageSizes: NANO_BANANA_2_IMAGE_SIZES,
        defaultImageSize: '1K',
        imageSizeMode: 'selectable',
        supportsGoogleSearch: true,
        supportsImageSearch: true,
      }),
      kind: 'nano_banana_2',
      modelFamily: 'gemini-3.1-flash-image',
      supportsThoughtSummaries: true,
      thinkingLevels: NANO_BANANA_2_THINKING_LEVELS,
      defaultThinkingLevel: 'minimal',
    }
  }
  if (modelIdMatchesStableOrPreview(modelId, 'gemini-3-pro-image')) {
    return {
      ...commonPolicy({
        supportedImageSizes: NANO_BANANA_PRO_IMAGE_SIZES,
        defaultImageSize: '1K',
        imageSizeMode: 'selectable',
        supportedAspectRatios: GEMINI_NANO_BANANA_LEGACY_ASPECT_RATIOS,
        supportsGoogleSearch: true,
      }),
      kind: 'nano_banana_pro',
      modelFamily: 'gemini-3-pro-image',
      supportsThoughtSummaries: true,
      thinkingLevels: NANO_BANANA_2_THINKING_LEVELS,
      defaultThinkingLevel: 'minimal',
    }
  }
  return {
    ...commonPolicy({
      supportedImageSizes: DEFAULT_GENERIC_IMAGE_SIZES,
      defaultImageSize: '1K',
      imageSizeMode: 'selectable',
      supportedAspectRatios: GEMINI_NANO_BANANA_LEGACY_ASPECT_RATIOS,
    }),
    kind: 'unsupported',
    modelFamily: null,
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

export function validateGeminiImageGenerationAspectRatio(input: Readonly<{
  model: string
  aspectRatio?: unknown
}>): Readonly<{ ok: true }> | Readonly<{ ok: false; supportedAspectRatios: readonly GeminiImageGenerationAspectRatio[] }> {
  const aspectRatio = input.aspectRatio
  if (aspectRatio === undefined || aspectRatio === null || aspectRatio === '') return { ok: true }
  if (!isGeminiImageGenerationAspectRatio(aspectRatio)) {
    return { ok: false, supportedAspectRatios: resolveGeminiImageGenerationPolicy(input.model).supportedAspectRatios }
  }
  const policy = resolveGeminiImageGenerationPolicy(input.model)
  if (policy.kind === 'unsupported') return { ok: true }
  return policy.supportedAspectRatios.includes(aspectRatio)
    ? { ok: true }
    : { ok: false, supportedAspectRatios: policy.supportedAspectRatios }
}
