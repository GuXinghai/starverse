import { decodeGenerationConfigLayerV2 } from '@/next/generation-v2/config/generationConfigLayerV2'
import { readImageAspectRatioV2 } from '@/next/generation-v2/domain/generationIntentV2'
import type { GenerationParamsLayer, GenerationParamKey, GenerationParamValue } from '@/next/generation-params/generationParamTypes'
import type { SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import type { ImageGenerationUserConfig } from '@/next/openrouter/imageGenerationSettingsPersistence'
import type { RuntimeProviderId } from '@/next/provider/runtimeProviderId'
import type { ReasoningEffort } from '@/next/state/types'
import type { ChatSessionConfig, ChatSessionConfigPatch } from './chatSessionConfig'

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

function projectGenerationParams(
  layer: ReturnType<typeof decodeGenerationConfigLayerV2>,
  _providerId: RuntimeProviderId | null,
): GenerationParamsLayer {
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
  result.verbosity = extension?.kind === 'openai_responses' && extension.verbosity !== undefined
    ? custom(extension.verbosity) : omit()
  result.thinkingBudget = extension?.kind === 'gemini_generate_content' && extension.thinkingMode === 'budget'
    ? custom(extension.thinkingBudget) : omit()
  result.thinkingLevel = extension?.kind === 'gemini_generate_content' && extension.thinkingMode === 'level'
    ? custom(extension.thinkingLevel) : omit()
  result.includeThoughts = extension?.kind === 'gemini_generate_content' && extension.includeThoughts !== 'provider_default'
    ? custom(extension.includeThoughts === 'enabled') : omit()
  return Object.freeze(result)
}

function projectWeb(layer: ReturnType<typeof decodeGenerationConfigLayerV2>): ChatSessionConfig['webSearch'] {
  if (!layer.web || layer.web.mode === 'disabled') {
    return Object.freeze({ enabled: false, level: 'high', detail: Object.freeze({ searchMode: 'disable' }) })
  }
  const web = layer.web
  const detail: SearchSettingsLayer = Object.freeze({
    searchMode: web.types.includes('web') ? 'enable' : 'disable',
    searchDepth: web.maxResults !== undefined ? 'custom' : web.searchContextSize ?? 'default',
    ...(web.maxResults === undefined ? {} : { maxResults: web.maxResults }),
    ...(web.engine === undefined || !['auto', 'native', 'exa'].includes(web.engine)
      ? {} : { searchEngine: web.engine as 'auto' | 'native' | 'exa' }),
  })
  return Object.freeze({ enabled: web.types.includes('web'),
    level: web.searchContextSize === 'low' ? 'low' : 'high', detail })
}

function projectImage(layer: ReturnType<typeof decodeGenerationConfigLayerV2>): ChatSessionConfig['imageGeneration'] {
  if (!layer.image || layer.image.mode === 'disabled') {
    const detail: ImageGenerationUserConfig = Object.freeze({ enabled: false, outputMode: 'auto', aspectRatio: '', imageSize: '' })
    return Object.freeze({ enabled: false, resolution: '1K', aspectRatio: '1:1', mode: 'custom', detail })
  }
  const image = layer.image
  const ratio = image.aspectRatio ? readImageAspectRatioV2(image.aspectRatio)
    : image.size?.width === 1024 && image.size.height === 1536 ? '3:4'
      : image.size?.width === 1536 && image.size.height === 1024 ? '4:3'
        : image.size ? '1:1' : 'auto'
  const supportedRatio = ['auto','1:1','9:16','16:9','3:4','4:3','3:2','2:3','5:4','4:5','21:9','4:1','1:4','8:1','1:8']
    .includes(ratio) ? ratio as ChatSessionConfig['imageGeneration']['aspectRatio'] : '1:1'
  const resolution = image.resolution ?? '1K'
  const detail: ImageGenerationUserConfig = Object.freeze({ enabled: true, outputMode: image.outputMode ?? 'auto',
    aspectRatio: supportedRatio, imageSize: resolution })
  return Object.freeze({ enabled: true, resolution, aspectRatio: supportedRatio, mode: 'custom', detail })
}

export function projectGenerationV2SemanticLayerToSessionConfig(
  semanticLayer: unknown,
  providerId: RuntimeProviderId | null,
): GenerationV2SessionConfigProjection {
  const layer = decodeGenerationConfigLayerV2(semanticLayer)
  const effort = layer.reasoning?.mode === 'enabled' ? layer.reasoning.effort : undefined
  const requestedReasoningEffort: HydratedReasoningEffort = layer.reasoning?.mode === 'disabled'
    ? 'none' : effort ?? 'auto'
  const quickEffort: ChatSessionConfig['reasoning']['effort'] = effort ?? 'medium'
  const extension = layer.providerExtension
  return Object.freeze({
    patch: Object.freeze({
      reasoning: Object.freeze({ enabled: layer.reasoning?.mode === 'enabled', effort: quickEffort }),
      webSearch: projectWeb(layer),
      imageGeneration: projectImage(layer),
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
