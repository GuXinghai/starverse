import { decodeGenerationConfigLayerV2 } from '@/core/generation-v2/config/generationConfigLayerV2'
import { readImageAspectRatioV2, REQUESTED_PARAMETER_KEYS_V2 } from '@/core/generation-v2/domain/generationIntentV2'
import type { GenerationParamsLayer, GenerationParamKey, GenerationParamValue } from '@/next/generation-params/generationParamTypes'
import type { SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import type { ReasoningEffort } from '@/shared/provider/providerStreamPayloads'
import type { ChatSessionConfig, ChatSessionConfigPatch } from './chatSessionConfig'
import { selectTargetImageV2, readTargetImagePreferenceV2 } from '@/core/generation-v2/config/targetImagePreferencesV2'
import { normalizeOpenAIImageGenerationUserSettings } from '@/next/openrouter/imageGenerationSettingsPersistence'
import { selectTargetThinkingV2, type ThinkingTargetV2 } from '@/core/generation-v2/config/targetThinkingPreferencesV2'

const GENERATION_PARAM_FIELDS = Object.freeze({
  maxOutputTokens: 'maxOutputTokens', temperature: 'temperature', topP: 'topP', topK: 'topK', minP: 'minP',
  topA: 'topA', seed: 'seed', stop: 'stopSequences', frequencyPenalty: 'frequencyPenalty',
  presencePenalty: 'presencePenalty', repetitionPenalty: 'repetitionPenalty',
} as const)

type HydratedReasoningEffort = 'auto' | ReasoningEffort

export type GenerationV2SessionConfigProjection = Readonly<{
  patch: ChatSessionConfigPatch
  requestedReasoningEffort: HydratedReasoningEffort
  requestedReasoningExclude: boolean
  anthropicThinkingDisplay: 'provider_default' | 'summarized' | 'omitted' | null
}>

function custom(value: GenerationParamValue) {
  return Object.freeze({ mode: 'custom' as const, value })
}

function omit() {
  return Object.freeze({ mode: 'omit' as const })
}

function inherit() {
  return Object.freeze({ mode: 'inherit' as const })
}

function projectRawGenerationParams(
  layer: ReturnType<typeof decodeGenerationConfigLayerV2>,
): GenerationParamsLayer {
  const result: Partial<Record<GenerationParamKey, ReturnType<typeof custom> | ReturnType<typeof omit> | ReturnType<typeof inherit>>> = {}
  for (const key of REQUESTED_PARAMETER_KEYS_V2) {
    const entry = layer.requestedParameters?.[key]
    if (!entry) continue
    const paramKey = key as GenerationParamKey
    if (entry.source === 'project' || entry.source === 'global') {
      result[paramKey] = inherit()
    } else if (entry.mode === 'omit') {
      result[paramKey] = omit()
    } else {
      result[paramKey] = custom(entry.value as GenerationParamValue)
    }
  }
  return Object.freeze(result)
}

function projectGenerationParams(
  layer: ReturnType<typeof decodeGenerationConfigLayerV2>,
  providerId: RuntimeProviderId | null,
): GenerationParamsLayer {
  // The raw envelope is authoritative for this new snapshot. Preserve only
  // present entries and their original scope; don't reconstruct omissions from
  // an effective value that Rules may already have removed or adapted.
  if (layer.requestedParameters !== undefined) return projectRawGenerationParams(layer)
  const result: Partial<Record<GenerationParamKey, ReturnType<typeof custom> | ReturnType<typeof omit>>> = {}
  for (const [semanticKey, paramKey] of Object.entries(GENERATION_PARAM_FIELDS) as Array<
    [keyof typeof GENERATION_PARAM_FIELDS, GenerationParamKey]
  >) {
    const value = layer.generation?.[semanticKey]
    result[paramKey] = value === undefined ? omit() : custom(value)
  }
  const reasoning = layer.reasoning
  result.reasoningEffort = reasoning?.mode === 'enabled' && reasoning.effort !== undefined
    ? custom(reasoning.effort) : omit()
  result.reasoningSummary = reasoning?.mode === 'enabled' && reasoning.summary !== undefined
    ? custom(reasoning.summary) : omit()
  result.thinkingEnabled = reasoning === undefined
    ? omit() : custom(reasoning.mode === 'enabled')
  const web = layer.web
  result.googleSearch = web?.mode === 'provider_search' ? custom(web.types.includes('web')) : omit()
  result.imageSearch = web?.mode === 'provider_search' ? custom(web.types.includes('image')) : omit()
  const extension = layer.providerExtension
  result.verbosity = providerId === 'openai_responses' && extension?.kind === 'openai_responses' && extension.verbosity !== undefined
    ? custom(extension.verbosity) : omit()
  result.thinkingBudget = providerId === 'google_ai_studio' && extension?.kind === 'gemini_generate_content' && extension.thinkingMode === 'budget'
    ? custom(extension.thinkingBudget) : omit()
  result.thinkingLevel = providerId === 'google_ai_studio' && (extension?.kind === 'gemini_interactions' && extension.thinkingLevel !== undefined || extension?.kind === 'gemini_generate_content' && extension.thinkingMode === 'level')
    ? custom(extension.thinkingLevel!) : omit()
  result.includeThoughts = providerId === 'google_ai_studio' && extension?.kind === 'gemini_generate_content' && extension.includeThoughts !== 'provider_default'
    ? custom(extension.includeThoughts === 'enabled') : omit()
  return Object.freeze(result)
}

function projectWeb(layer: ReturnType<typeof decodeGenerationConfigLayerV2>): ChatSessionConfig['webSearch'] {
  const searchPrompt = layer.web?.searchPrompt === undefined ? {} : {
    searchPrompt: Object.freeze({ mode: 'customText' as const, text: layer.web.searchPrompt }),
  }
  if (!layer.web || layer.web.mode === 'disabled') {
    return Object.freeze({ enabled: false, level: 'high', detail: Object.freeze({ searchMode: 'disable', ...searchPrompt }) })
  }
  const web = layer.web
  const detail: SearchSettingsLayer = Object.freeze({
    searchMode: web.types.includes('web') ? 'enable' : 'disable',
    searchDepth: web.maxResults !== undefined ? 'custom' : (web.searchContextSize ?? 'default') as SearchSettingsLayer['searchDepth'],
    ...(web.maxResults === undefined ? {} : { maxResults: web.maxResults }),
    ...(web.engine === undefined || !['auto', 'native', 'exa'].includes(web.engine)
      ? {} : { searchEngine: web.engine as 'auto' | 'native' | 'exa' }),
    ...searchPrompt,
  })
  return Object.freeze({ enabled: web.types.includes('web'),
    level: web.searchContextSize === 'low' ? 'low' : 'high', detail })
}

function projectImage(layer: ReturnType<typeof decodeGenerationConfigLayerV2>,
  source: Readonly<Record<string, unknown>>, providerId: RuntimeProviderId | null, binding?: ThinkingTargetV2,
): ChatSessionConfig['imageGeneration'] {
  const preference = readTargetImagePreferenceV2(source, binding, providerId)
  const image = layer.image?.mode === 'generate' ? layer.image
    : preference ? decodeGenerationConfigLayerV2({ schemaVersion: 2, image: preference.image }).image : undefined
  const enabled = layer.image?.mode === 'generate'
  const openAIImage = providerId === 'openai_responses' ? image : undefined
  const genericImage = providerId === 'openai_responses' ? undefined : image
  const ratio = genericImage?.mode === 'generate' && genericImage.aspectRatio
    ? readImageAspectRatioV2(genericImage.aspectRatio) : 'auto'
  const supportedRatio = ['auto','1:1','9:16','16:9','3:4','4:3','3:2','2:3','5:4','4:5','21:9','4:1','1:4','8:1','1:8']
    .includes(ratio) ? ratio as ChatSessionConfig['imageGeneration']['aspectRatio'] : 'auto'
  const resolution = genericImage?.mode === 'generate' ? genericImage.resolution ?? '' : ''
  const openAI = openAIImage?.mode === 'generate' ? normalizeOpenAIImageGenerationUserSettings({
    ...openAIImage, size: typeof openAIImage.size === 'object'
      ? `${openAIImage.size.width}x${openAIImage.size.height}` : openAIImage.size,
    ...(openAIImage.maskAsset ? { maskAsset: {
      assetId: openAIImage.maskAsset.assetId.value, assetRevisionId: openAIImage.maskAsset.assetRevisionId.value,
      assetSha256: openAIImage.maskAsset.assetSha256.value,
    } } : {}),
  }) : undefined
  const detail: ImageGenerationUserConfig = Object.freeze({ enabled, outputMode: genericImage?.mode === 'generate'
    ? genericImage.outputMode ?? 'auto' : 'auto', aspectRatio: supportedRatio, imageSize: resolution,
    ...(openAI ? { openAI } : {}) })
  return Object.freeze({ enabled, resolution, aspectRatio: supportedRatio, mode: 'custom', detail })
}

export function projectGenerationV2SemanticLayerToSessionConfig(
  semanticLayer: unknown,
  providerId: RuntimeProviderId | null,
  binding?: ThinkingTargetV2,
): GenerationV2SessionConfigProjection {
  const source = semanticLayer as Readonly<Record<string, unknown>>
  const layer = decodeGenerationConfigLayerV2(selectTargetImageV2(selectTargetThinkingV2(source, binding), binding, providerId))
  const effort = layer.reasoning?.mode === 'enabled' ? layer.reasoning.effort : undefined
  const rawEffort = layer.requestedParameters?.reasoningEffort
  const rawThinkingEnabled = layer.requestedParameters?.thinkingEnabled
  const requestedReasoningEffort: HydratedReasoningEffort = rawThinkingEnabled?.mode === 'custom' && rawThinkingEnabled.value === false
    ? 'none'
    : rawEffort?.mode === 'custom'
      ? rawEffort.value
      : rawThinkingEnabled?.mode === 'custom' && rawThinkingEnabled.value === true
        ? (layer.reasoning?.effort && layer.reasoning.effort !== 'none' ? layer.reasoning.effort : 'auto')
        : rawEffort?.mode === 'omit' || rawThinkingEnabled?.mode === 'omit'
          ? 'auto'
          : layer.reasoning?.mode === 'disabled' ? 'none' : effort ?? 'auto'
  const quickEffort: ChatSessionConfig['reasoning']['effort'] = effort ?? 'medium'
  const extension = layer.providerExtension
  return Object.freeze({
    patch: Object.freeze({
      reasoning: Object.freeze({ enabled: layer.reasoning?.mode === 'enabled', effort: quickEffort }),
      webSearch: projectWeb(layer),
      imageGeneration: projectImage(layer, source, providerId, binding),
      generationParams: Object.freeze({ detail: projectGenerationParams(layer, providerId) }),
    }),
    requestedReasoningEffort,
    requestedReasoningExclude: layer.reasoning?.mode === 'enabled' && layer.reasoning.exclude === true,
    anthropicThinkingDisplay: providerId === 'anthropic_messages' && extension?.kind === 'anthropic_messages'
      ? extension.thinkingDisplay : null,
  })
}

export function isEmptyGenerationV2SemanticLayer(value: unknown): boolean {
  const layer = decodeGenerationConfigLayerV2(value)
  return Object.keys(layer).every((key) => key === 'schemaVersion')
}
