import type { ReasoningEffort, ReasoningPrefs } from '@/next/state/types'
import {
  resolveSearchSettingsFromStoredLayers,
  mergeConvoWebSearchOverrideMeta,
} from '@/next/openrouter/searchSettingsPersistence'
import type { SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import {
  extractConvoGenerationParamsOverride,
  mergeConvoGenerationParamsOverrideMeta,
} from '@/next/generation-params/generationParamPersistence'
import type { GenerationParamsLayer } from '@/next/generation-params/generationParamTypes'
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
import type { ConversationRouteSelection } from '@/next/provider/conversationRouteSelection'

export type ChatSessionConfigReasoningEffort = Exclude<ReasoningEffort, 'none'>
export type ChatSessionConfigWebSearchLevel = 'low' | 'high'
export type ChatSessionConfigImageResolution = '512' | '1K' | '2K' | '4K'
export type ChatSessionConfigAspectRatio =
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

export type ChatSessionConfig = Readonly<{
  routeSelection: ConversationRouteSelection | null
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
  generationParams: Readonly<{
    detail: GenerationParamsLayer | null
  }>
}>

export type ChatSessionConfigSources = Readonly<{
  convoMeta?: unknown
  projectMeta?: unknown
  globalReasoningPrefs?: unknown
  globalWebSearchDefaults?: unknown
  globalGenerationParamsDefaults?: unknown
  globalImageGenerationDefault?: unknown
}>

export type ChatSessionConfigPatch = Readonly<Partial<{
  routeSelection: ConversationRouteSelection | null
  reasoning: Partial<ChatSessionConfig['reasoning']>
  webSearch: Partial<ChatSessionConfig['webSearch']>
  imageGeneration: Partial<ChatSessionConfig['imageGeneration']>
  generationParams: Partial<ChatSessionConfig['generationParams']>
}>>

const IMAGE_ASPECT_RATIO_OPTIONS: readonly ChatSessionConfigAspectRatio[] = [
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
]
const IMAGE_RESOLUTION_OPTIONS: readonly ChatSessionConfigImageResolution[] = ['512', '1K', '2K', '4K']

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeReasoningEffortForQuickControls(prefs: ReasoningPrefs): ChatSessionConfigReasoningEffort {
  const effort = prefs.effort
  return effort && effort !== 'auto' && effort !== 'none' ? effort : 'medium'
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
  if (base.searchMode !== 'enable' && base.searchMode !== 'disable' && base.searchMode !== 'default') {
    base.searchMode = input.enabled ? 'enable' : 'disable'
  }
  if (base.searchDepth !== 'custom' && base.searchDepth !== 'low' && base.searchDepth !== 'medium' && base.searchDepth !== 'high' && base.searchDepth !== 'default') {
    base.searchDepth = input.level
  }
  if (base.searchDepth !== 'custom' && 'maxResults' in base) delete base.maxResults
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
  const generationDetail = extractConvoGenerationParamsOverride(input.convoMeta)
  const imageDetail = imageResolved.mode === 'custom' ? imageResolved.effective : null

  return {
    routeSelection: null,
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
    generationParams: {
      detail: generationDetail,
    },
  }
}

export function mergeChatSessionConfig(current: ChatSessionConfig, patch: ChatSessionConfigPatch): ChatSessionConfig {
  return {
    routeSelection: patch.routeSelection === undefined ? current.routeSelection : patch.routeSelection,
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
    generationParams: {
      ...current.generationParams,
      ...(patch.generationParams ?? {}),
    },
  }
}

export function serializeChatSessionConfigToConvoMeta(input: Readonly<{
  baseMeta?: unknown
  config: ChatSessionConfig
  convoProjectId?: string | null
}>): Record<string, unknown> | null {
  const reasoningPrefs = toReasoningPrefs(input.config.reasoning)
  const reasoningPlan = buildReasoningPrefsSavePlan({
    convoMeta: input.baseMeta,
    convoProjectId: input.convoProjectId ?? null,
    prefs: reasoningPrefs,
  })

  const withoutLegacyGoogleThinking = (() => {
    const next = reasoningPlan.nextConvoMeta ? { ...reasoningPlan.nextConvoMeta } : {}
    delete next.googleAIStudioThinking
    return Object.keys(next).length > 0 ? next : null
  })()

  const withWebSearch = mergeConvoWebSearchOverrideMeta(
    withoutLegacyGoogleThinking,
    buildWebSearchDetail({
      enabled: input.config.webSearch.enabled,
      level: input.config.webSearch.level,
      detail: input.config.webSearch.detail,
    }),
  )

  const withGenerationParams = mergeConvoGenerationParamsOverrideMeta(withWebSearch, input.config.generationParams.detail)

  return mergeConvoImageGenerationMeta(withGenerationParams, {
    mode: input.config.imageGeneration.mode,
    custom: buildImageGenerationDetail({
      enabled: input.config.imageGeneration.enabled,
      resolution: input.config.imageGeneration.resolution,
      aspectRatio: input.config.imageGeneration.aspectRatio,
      detail: input.config.imageGeneration.detail,
    }),
  })
}
