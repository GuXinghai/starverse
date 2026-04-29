import type { ReasoningEffort, ReasoningPrefs } from '@/next/state/types'
import {
  resolveSearchSettingsFromStoredLayers,
  mergeConvoWebSearchOverrideMeta,
} from '@/next/openrouter/searchSettingsPersistence'
import type { SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import {
  mergeConvoSamplingParamsOverrideMeta,
} from '@/next/openrouter/samplingParamsPersistence'
import type { SamplingParamsLayer } from '@/next/openrouter/samplingParamsResolver'
import {
  mergeConvoImageGenerationMeta,
  normalizeImageGenerationUserConfig,
  resolveEffectiveImageGenerationConfig,
  type ConvoImageGenerationMode,
  type ImageGenerationUserConfig,
} from '@/next/openrouter/imageGenerationSettingsPersistence'
import {
  buildReasoningPrefsSavePlan,
  resolveReasoningPrefsFromStoredLayers,
} from '@/next/settings/reasoningPrefsScope'

export type ChatSessionConfigReasoningEffort = 'low' | 'medium' | 'high'
export type ChatSessionConfigWebSearchLevel = 'low' | 'high'
export type ChatSessionConfigImageResolution = '1K' | '2K' | '4K'
export type ChatSessionConfigAspectRatio = '16:9' | '3:4' | '1:1' | '4:3'

export type ChatSessionConfig = Readonly<{
  model: Readonly<{
    selectedModelKey: string | null
  }>
  reasoning: Readonly<{
    enabled: boolean
    effort: ChatSessionConfigReasoningEffort
  }>
  webSearch: Readonly<{
    enabled: boolean
    level: ChatSessionConfigWebSearchLevel
    detail: SearchSettingsLayer | null
  }>
  imageGeneration: Readonly<{
    enabled: boolean
    resolution: ChatSessionConfigImageResolution
    aspectRatio: ChatSessionConfigAspectRatio
    mode: ConvoImageGenerationMode
    detail: ImageGenerationUserConfig | null
  }>
  samplingParams: Readonly<{
    detail: SamplingParamsLayer | null
  }>
}>

export type ChatSessionConfigSources = Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalReasoningPrefs?: unknown
  globalWebSearchDefaults?: unknown
  globalSamplingParamsDefaults?: unknown
  globalImageGenerationDefault?: unknown
  defaultModelKey: string
}>

export type ChatSessionConfigPatch = Readonly<Partial<{
  model: Partial<ChatSessionConfig['model']>
  reasoning: Partial<ChatSessionConfig['reasoning']>
  webSearch: Partial<ChatSessionConfig['webSearch']>
  imageGeneration: Partial<ChatSessionConfig['imageGeneration']>
  samplingParams: Partial<ChatSessionConfig['samplingParams']>
}>>

const MODEL_META_KEY = 'selectedModelKey'
const IMAGE_ASPECT_RATIO_OPTIONS: readonly ChatSessionConfigAspectRatio[] = ['16:9', '3:4', '1:1', '4:3']
const IMAGE_RESOLUTION_OPTIONS: readonly ChatSessionConfigImageResolution[] = ['1K', '2K', '4K']

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeModelKey(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : fallback
}

function extractSelectedModelKey(meta: unknown): string | null {
  const root = asRecord(meta)
  if (!root) return null
  const normalized = String(root[MODEL_META_KEY] ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function mergeSelectedModelKeyIntoMeta(meta: unknown, selectedModelKey: string, defaultModelKey: string): Record<string, unknown> | null {
  const root = asRecord(meta)
  const next = root ? { ...root } : {}
  if (selectedModelKey === defaultModelKey) delete next[MODEL_META_KEY]
  else next[MODEL_META_KEY] = selectedModelKey
  return Object.keys(next).length > 0 ? next : null
}

function normalizeReasoningEffortForQuickControls(prefs: ReasoningPrefs): ChatSessionConfigReasoningEffort {
  if (prefs.effort === 'high' || prefs.effort === 'xhigh') return 'high'
  if (prefs.effort === 'low' || prefs.effort === 'minimal') return 'low'
  return 'medium'
}

function toReasoningPrefs(config: ChatSessionConfig['reasoning']): ReasoningPrefs {
  if (!config.enabled) return { mode: 'auto', effort: 'auto', exclude: false }
  return { mode: 'effort', effort: config.effort as ReasoningEffort, exclude: false }
}

function normalizeWebSearchLevelFromResolvedDepth(depth: string): ChatSessionConfigWebSearchLevel {
  return depth === 'low' ? 'low' : 'high'
}

function buildWebSearchDetail(input: Readonly<{
  detail: SearchSettingsLayer | null
  enabled: boolean
  level: ChatSessionConfigWebSearchLevel
}>): SearchSettingsLayer {
  const base = input.detail ? { ...input.detail } : {}
  base.searchMode = input.enabled ? 'enable' : 'disable'
  base.searchDepth = input.level
  if ('maxResults' in base) delete base.maxResults
  return base
}

function normalizeImageResolution(value: unknown): ChatSessionConfigImageResolution {
  return IMAGE_RESOLUTION_OPTIONS.includes(value as ChatSessionConfigImageResolution)
    ? (value as ChatSessionConfigImageResolution)
    : '1K'
}

function normalizeAspectRatio(value: unknown): ChatSessionConfigAspectRatio {
  return IMAGE_ASPECT_RATIO_OPTIONS.includes(value as ChatSessionConfigAspectRatio)
    ? (value as ChatSessionConfigAspectRatio)
    : '1:1'
}

function buildImageGenerationDetail(input: Readonly<{
  enabled: boolean
  resolution: ChatSessionConfigImageResolution
  aspectRatio: ChatSessionConfigAspectRatio
  detail: ImageGenerationUserConfig | null
}>): ImageGenerationUserConfig {
  const base = normalizeImageGenerationUserConfig(input.detail)
  return {
    ...base,
    enabled: input.enabled,
    imageSize: input.resolution,
    aspectRatio: input.aspectRatio,
  }
}

export function deserializeChatSessionConfigFromConvoMeta(input: ChatSessionConfigSources): ChatSessionConfig {
  const selectedModelKey = extractSelectedModelKey(input.convoMeta) ?? null

  const reasoningResolved = resolveReasoningPrefsFromStoredLayers({
    convoMeta: input.convoMeta,
    projectMeta: input.projectMeta,
    globalPrefs: input.globalReasoningPrefs,
  }).resolved

  const webSearchResolved = resolveSearchSettingsFromStoredLayers({
    convoMeta: input.convoMeta,
    projectMeta: input.projectMeta,
    globalDefaults: input.globalWebSearchDefaults,
    options: { accountDefaultEnabled: false },
  })

  const imageResolved = resolveEffectiveImageGenerationConfig({
    convoMeta: input.convoMeta,
    projectMeta: input.projectMeta,
    globalDefault: input.globalImageGenerationDefault,
  })

  const rawConvoRecord = asRecord(input.convoMeta)
  const webSearchDetail = asRecord(rawConvoRecord?.webSearchOverride)
  const samplingDetail = asRecord(rawConvoRecord?.samplingParamsOverride)
  const imageDetail = imageResolved.mode === 'custom' ? imageResolved.effective : null

  return {
    model: {
      selectedModelKey,
    },
    reasoning: {
      enabled: reasoningResolved.mode === 'effort' && reasoningResolved.effort !== 'none',
      effort: normalizeReasoningEffortForQuickControls(reasoningResolved),
    },
    webSearch: {
      enabled: webSearchResolved.effectiveMode,
      level: normalizeWebSearchLevelFromResolvedDepth(webSearchResolved.resolvedDepth),
      detail: (webSearchDetail as SearchSettingsLayer | null) ?? null,
    },
    imageGeneration: {
      enabled: imageResolved.effective.enabled,
      resolution: normalizeImageResolution(imageResolved.effective.imageSize),
      aspectRatio: normalizeAspectRatio(imageResolved.effective.aspectRatio),
      mode: imageResolved.mode,
      detail: imageDetail,
    },
    samplingParams: {
      detail: (samplingDetail as SamplingParamsLayer | null) ?? null,
    },
  }
}

export function mergeChatSessionConfig(current: ChatSessionConfig, patch: ChatSessionConfigPatch): ChatSessionConfig {
  return {
    model: {
      ...current.model,
      ...(patch.model ?? {}),
    },
    reasoning: {
      ...current.reasoning,
      ...(patch.reasoning ?? {}),
    },
    webSearch: {
      ...current.webSearch,
      ...(patch.webSearch ?? {}),
    },
    imageGeneration: {
      ...current.imageGeneration,
      ...(patch.imageGeneration ?? {}),
    },
    samplingParams: {
      ...current.samplingParams,
      ...(patch.samplingParams ?? {}),
    },
  }
}

export function serializeChatSessionConfigToConvoMeta(input: Readonly<{
  baseMeta?: unknown
  config: ChatSessionConfig
  convoProjectId?: string | null
  defaultModelKey: string
}>): Record<string, unknown> | null {
  const reasoningPrefs = toReasoningPrefs(input.config.reasoning)
  const reasoningPlan = buildReasoningPrefsSavePlan({
    convoMeta: input.baseMeta,
    convoProjectId: input.convoProjectId ?? null,
    prefs: reasoningPrefs,
  })

  const selectedModelKey = normalizeModelKey(
    input.config.model.selectedModelKey ?? input.defaultModelKey,
    input.defaultModelKey,
  )
  const withModel = mergeSelectedModelKeyIntoMeta(reasoningPlan.nextConvoMeta, selectedModelKey, input.defaultModelKey)

  const withWebSearch = mergeConvoWebSearchOverrideMeta(
    withModel,
    buildWebSearchDetail({
      enabled: input.config.webSearch.enabled,
      level: input.config.webSearch.level,
      detail: input.config.webSearch.detail,
    }),
  )

  const withSampling = mergeConvoSamplingParamsOverrideMeta(withWebSearch, input.config.samplingParams.detail)

  return mergeConvoImageGenerationMeta(withSampling, {
    mode: input.config.imageGeneration.mode,
    custom: buildImageGenerationDetail({
      enabled: input.config.imageGeneration.enabled,
      resolution: input.config.imageGeneration.resolution,
      aspectRatio: input.config.imageGeneration.aspectRatio,
      detail: input.config.imageGeneration.detail,
    }),
  })
}
