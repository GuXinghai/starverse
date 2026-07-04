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
import {
  DEFAULT_CHAT_PROVIDER_ID,
  DEFAULT_OPENROUTER_MODEL_ID,
  isSameChatModelSelection,
  normalizeRuntimeProviderId,
  type ChatModelSelection,
} from '@/next/provider/modelSelection'
import type { RuntimeProviderKey } from '@/next/provider/runtimeSelection'
import {
  DEFAULT_GEMINI_THINKING_CONFIG,
  isGeminiThinkingLevel,
  type GeminiThinkingConfig,
} from '@/next/provider/gemini/geminiThinkingPolicy'

export type ChatSessionConfigReasoningEffort = 'low' | 'medium' | 'high'
export type ChatSessionConfigWebSearchLevel = 'low' | 'high'
export type ChatSessionConfigImageResolution = '512' | '1K' | '2K' | '4K'
export type ChatSessionConfigAspectRatio = '16:9' | '3:4' | '1:1' | '4:3'

export type ChatSessionConfig = Readonly<{
  model: Readonly<{
    selectedProviderId?: RuntimeProviderKey | null
    selectedModelKey: string | null
  }>
  reasoning: Readonly<{
    enabled: boolean
    effort: ChatSessionConfigReasoningEffort
  }>
  googleAIStudioThinking?: GeminiThinkingConfig
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
  defaultProviderId?: RuntimeProviderKey
}>

export type ChatSessionConfigPatch = Readonly<Partial<{
  model: Partial<ChatSessionConfig['model']>
  reasoning: Partial<ChatSessionConfig['reasoning']>
  googleAIStudioThinking: Partial<GeminiThinkingConfig> | GeminiThinkingConfig | null
  webSearch: Partial<ChatSessionConfig['webSearch']>
  imageGeneration: Partial<ChatSessionConfig['imageGeneration']>
  samplingParams: Partial<ChatSessionConfig['samplingParams']>
}>>

const MODEL_META_KEY = 'selectedModelKey'
const PROVIDER_META_KEY = 'selectedProviderId'
const GOOGLE_AI_STUDIO_THINKING_META_KEY = 'googleAIStudioThinking'
const IMAGE_ASPECT_RATIO_OPTIONS: readonly ChatSessionConfigAspectRatio[] = ['16:9', '3:4', '1:1', '4:3']
const IMAGE_RESOLUTION_OPTIONS: readonly ChatSessionConfigImageResolution[] = ['512', '1K', '2K', '4K']

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeModelKey(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : fallback
}

function defaultModelSelection(input: Readonly<{
  defaultModelKey?: string
  defaultProviderId?: RuntimeProviderKey
}>): ChatModelSelection {
  return {
    providerId: input.defaultProviderId ?? DEFAULT_CHAT_PROVIDER_ID,
    modelId: normalizeModelKey(input.defaultModelKey, DEFAULT_OPENROUTER_MODEL_ID),
  }
}

function extractSelectedModelKey(meta: unknown): string | null {
  const root = asRecord(meta)
  if (!root) return null
  const normalized = String(root[MODEL_META_KEY] ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function extractSelectedProviderId(meta: unknown): RuntimeProviderKey | null {
  const root = asRecord(meta)
  if (!root) return null
  return normalizeRuntimeProviderId(root[PROVIDER_META_KEY])
}

function mergeSelectedModelSelectionIntoMeta(
  meta: unknown,
  selection: ChatModelSelection,
  defaultSelection: ChatModelSelection,
): Record<string, unknown> | null {
  const root = asRecord(meta)
  const next = root ? { ...root } : {}
  if (isSameChatModelSelection(selection, defaultSelection)) {
    delete next[PROVIDER_META_KEY]
    delete next[MODEL_META_KEY]
  } else {
    next[PROVIDER_META_KEY] = selection.providerId
    next[MODEL_META_KEY] = selection.modelId
  }
  return Object.keys(next).length > 0 ? next : null
}

function normalizeReasoningEffortForQuickControls(prefs: ReasoningPrefs): ChatSessionConfigReasoningEffort {
  if (prefs.effort === 'high' || prefs.effort === 'xhigh') return 'high'
  if (prefs.effort === 'low' || prefs.effort === 'minimal') return 'low'
  return 'medium'
}

function normalizeGoogleAIStudioThinking(value: unknown): GeminiThinkingConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_GEMINI_THINKING_CONFIG
  const record = value as Partial<GeminiThinkingConfig>
  const parsedBudget = typeof record.thinkingBudget === 'number'
    ? record.thinkingBudget
    : Number(String(record.thinkingBudget ?? '').trim())
  return {
    mode: record.mode === 'budget' || record.mode === 'level' || record.mode === 'auto' ? record.mode : 'auto',
    thinkingBudget: Number.isFinite(parsedBudget) && parsedBudget > 0
      ? Math.trunc(parsedBudget)
      : DEFAULT_GEMINI_THINKING_CONFIG.thinkingBudget,
    thinkingLevel: isGeminiThinkingLevel(record.thinkingLevel)
      ? record.thinkingLevel
      : DEFAULT_GEMINI_THINKING_CONFIG.thinkingLevel,
    includeThoughts: record.includeThoughts === true,
  }
}

function mergeGoogleAIStudioThinking(
  current: GeminiThinkingConfig | undefined,
  patch: Partial<GeminiThinkingConfig> | GeminiThinkingConfig | null | undefined,
): GeminiThinkingConfig | undefined {
  if (patch === undefined) return current
  if (patch === null) return DEFAULT_GEMINI_THINKING_CONFIG
  return {
    ...(current ?? DEFAULT_GEMINI_THINKING_CONFIG),
    ...patch,
  }
}

function isDefaultGoogleAIStudioThinking(config: GeminiThinkingConfig | undefined): boolean {
  const value = config ?? DEFAULT_GEMINI_THINKING_CONFIG
  return value.mode === DEFAULT_GEMINI_THINKING_CONFIG.mode &&
    value.thinkingBudget === DEFAULT_GEMINI_THINKING_CONFIG.thinkingBudget &&
    value.thinkingLevel === DEFAULT_GEMINI_THINKING_CONFIG.thinkingLevel &&
    value.includeThoughts === DEFAULT_GEMINI_THINKING_CONFIG.includeThoughts
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
  const selectedModelKey = extractSelectedModelKey(input.convoMeta) ?? null
  const selectedProviderId = selectedModelKey
    ? extractSelectedProviderId(input.convoMeta) ?? defaultModelSelection(input).providerId
    : null

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
      selectedProviderId,
      selectedModelKey,
    },
    reasoning: {
      enabled: reasoningResolved.mode === 'effort' && reasoningResolved.effort !== 'none',
      effort: normalizeReasoningEffortForQuickControls(reasoningResolved),
    },
    googleAIStudioThinking: normalizeGoogleAIStudioThinking(rawConvoRecord?.[GOOGLE_AI_STUDIO_THINKING_META_KEY]),
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
    googleAIStudioThinking: mergeGoogleAIStudioThinking(current.googleAIStudioThinking, patch.googleAIStudioThinking),
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
  defaultProviderId?: RuntimeProviderKey
}>): Record<string, unknown> | null {
  const reasoningPrefs = toReasoningPrefs(input.config.reasoning)
  const reasoningPlan = buildReasoningPrefsSavePlan({
    convoMeta: input.baseMeta,
    convoProjectId: input.convoProjectId ?? null,
    prefs: reasoningPrefs,
  })

  const defaultSelection = defaultModelSelection(input)
  const selectedSelection: ChatModelSelection = {
    providerId: input.config.model.selectedProviderId ?? defaultSelection.providerId,
    modelId: normalizeModelKey(
      input.config.model.selectedModelKey ?? input.defaultModelKey,
      input.defaultModelKey,
    ),
  }
  const withModel = mergeSelectedModelSelectionIntoMeta(reasoningPlan.nextConvoMeta, selectedSelection, defaultSelection)
  const withGoogleThinking = (() => {
    const next = withModel ? { ...withModel } : {}
    if (isDefaultGoogleAIStudioThinking(input.config.googleAIStudioThinking)) {
      delete next[GOOGLE_AI_STUDIO_THINKING_META_KEY]
    } else {
      next[GOOGLE_AI_STUDIO_THINKING_META_KEY] = input.config.googleAIStudioThinking
    }
    return Object.keys(next).length > 0 ? next : null
  })()

  const withWebSearch = mergeConvoWebSearchOverrideMeta(
    withGoogleThinking,
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
