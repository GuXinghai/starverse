import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import { resolveEncodingCoverageRegistryV2 } from '@/next/generation-v2/capability/encodingCoverageRegistryV2'
import { resolveWebSearchProtocolParametersV2 } from '@/next/generation-v2/contracts/webSearchProtocolParametersV2'
import type { ModelCapabilityDomainV2, ModelCapabilitySemanticPathV2 } from '@/next/generation-v2/capability/modelCapabilitySchemaV2'
import { resolveSearchSettings, type SearchSettingsLayers, type SearchSettingsLayer } from '@/next/openrouter/searchSettingsResolver'
import type { ConversationRouteSelection } from '@/next/provider/conversationRouteSelection'

export type WebSearchBindingV2 = Readonly<{ providerId: string; modelId: string; operation: 'text' | 'image_generate' }>
export type GenerationV2WebSearchControls = Readonly<{
  ready: boolean
  enabled: boolean
  engines: readonly string[]
  contexts: readonly string[]
  maxResultsBounds: Readonly<{ min: number; max: number }> | null
  reason: 'errors.webSearch.capabilityUnavailable' | null
}>

export function registeredWebSearchProviderIdV2(providerId: string): string {
  return providerId === 'anthropic_messages' ? 'anthropic' : providerId === 'local_endpoint' ? 'generic_local'
    : providerId === 'lm_studio' ? 'lmstudio' : providerId === 'ollama_local' ? 'ollama' : providerId
}

export function webSearchBindingForRouteV2(route: ConversationRouteSelection | null, imageEnabled = false): WebSearchBindingV2 | null {
  if (!route) return null
  if (route.kind === 'openai_chat_compatible') return { providerId: 'openai_compatible', modelId: route.modelId, operation: 'text' }
  const providerId = registeredWebSearchProviderIdV2(route.providerId)
  return { providerId, modelId: route.modelId,
    operation: imageEnabled && (providerId === 'openrouter' || providerId === 'google_ai_studio') ? 'image_generate' : 'text' }
}

function bindingMatches(projection: GenerationControlsProjectionV2, expected?: WebSearchBindingV2 | null): boolean {
  const binding = projection.binding
  if (typeof binding.modelId !== 'string' || typeof binding.providerId !== 'string' ||
      typeof binding.protocolContractId !== 'string' || (binding.operation !== 'text' && binding.operation !== 'image_generate')) return false
  return !expected || expected.providerId === binding.providerId && expected.modelId === binding.modelId && expected.operation === binding.operation
}

function encodedPaths(projection: GenerationControlsProjectionV2 | null | undefined, expected?: WebSearchBindingV2 | null): readonly ModelCapabilitySemanticPathV2[] | null {
  if (!projection || projection.schemaVersion !== 2 || !projection.capabilityRevision || !bindingMatches(projection, expected)) return null
  try {
    return resolveEncodingCoverageRegistryV2({ providerId: String(projection.binding.providerId),
      protocolContractId: String(projection.binding.protocolContractId), operation: projection.binding.operation as 'text' | 'image_generate' }).semanticPaths
  } catch { return null }
}

function parametersFor(projection: GenerationControlsProjectionV2 | null | undefined, expected?: WebSearchBindingV2 | null) {
  const paths = encodedPaths(projection, expected)
  if (!paths || !projection) return null
  try {
    const wire = resolveWebSearchProtocolParametersV2({ providerId: String(projection.binding.providerId),
      protocolContractId: String(projection.binding.protocolContractId), operation: projection.binding.operation as 'text' | 'image_generate' })
    const domainFor = (path: ModelCapabilitySemanticPathV2): ModelCapabilityDomainV2 | null => {
      const control = projection.controls[path]
      if (!paths.includes(path) || !control || control.state !== 'supported' && control.state !== 'unknown') return null
      return path === 'web.mode' ? { kind: 'enum', values: ['provider_search'] }
        : path === 'web.types' ? wire.types : wire.optionalParameters[path.slice(4) as keyof typeof wire.optionalParameters] ?? null
    }
    return { domainFor, accepted: (path: ModelCapabilitySemanticPathV2, value: unknown) =>
      contains(domainFor(path), value) && (!projection.controls[path]?.domain || contains(projection.controls[path].domain!, value)) }
  } catch { return null }
}

export function projectGenerationV2WebSearchControls(projection: GenerationControlsProjectionV2 | null | undefined,
  expected?: WebSearchBindingV2 | null): GenerationV2WebSearchControls {
  const parameters = parametersFor(projection, expected)
  const engines = parameters?.domainFor('web.engine')
  const contexts = parameters?.domainFor('web.searchContextSize')
  const maximum = parameters?.domainFor('web.maxResults')
  const modelMaximum = projection?.controls['web.maxResults']?.domain
  const ready = parameters !== null
  // OpenRouter/global legacy UI retains its previous limit; native domains can expose their full range.
  const minimum = maximum?.kind === 'range' ? Math.max(maximum.min, modelMaximum?.kind === 'range' ? modelMaximum.min : maximum.min) : 0
  const maximumValue = maximum?.kind === 'range' ? Math.min(maximum.max, modelMaximum?.kind === 'range' ? modelMaximum.max : maximum.max,
    projection?.binding.protocolContractId === 'openrouter-chat-completions-v1' ? 10 : maximum.max) : 0
  const maxResultsBounds = maximum?.kind === 'range' && minimum <= maximumValue ? { min: minimum, max: maximumValue } : null
  return Object.freeze({ ready, enabled: parameters?.accepted('web.mode', 'provider_search') === true,
    engines: Object.freeze(engines?.kind === 'enum' ? engines.values.filter((v): v is string => typeof v === 'string' && parameters!.accepted('web.engine', v)) : []),
    contexts: Object.freeze(contexts ? ['low', 'medium', 'high'].filter(value => parameters!.accepted('web.searchContextSize', value)) : []),
    maxResultsBounds, reason: ready ? null : 'errors.webSearch.capabilityUnavailable' })
}

function contains(domainValue: ModelCapabilityDomainV2 | null, value: unknown): boolean {
  if (!domainValue) return false
  if (domainValue.kind === 'enum') return domainValue.values.includes(value as never)
  if (domainValue.kind === 'enum_list') return Array.isArray(value) && value.length <= domainValue.maxItems && value.every(v => domainValue.values.includes(v))
  if (domainValue.kind === 'range') return typeof value === 'number' && Number.isFinite(value) && value >= domainValue.min &&
    value <= domainValue.max && (!domainValue.integer || Number.isSafeInteger(value)) && !domainValue.excludedValues?.includes(value)
  if (domainValue.kind === 'string') return typeof value === 'string' && value.length > 0 && value.length <= domainValue.maxLength && !/[\u0000-\u001f\u007f]/u.test(value)
  return false
}

export function buildGenerationV2WebSearch(input: Readonly<{
  projection: GenerationControlsProjectionV2 | null | undefined
  expectedBinding: WebSearchBindingV2 | null
  layers: SearchSettingsLayers
  accountDefaultEnabled?: boolean
  googleSearch?: boolean
  imageSearch?: boolean
}>): Readonly<Record<string, unknown>> {
  const controls = projectGenerationV2WebSearchControls(input.projection, input.expectedBinding)
  const search = resolveSearchSettings(input.layers, { accountDefaultEnabled: input.accountDefaultEnabled,
    ...(controls.maxResultsBounds ? { maxResultsBounds: controls.maxResultsBounds } : {}) })
  if (!search.effectiveMode && !input.googleSearch && !input.imageSearch) return Object.freeze({ mode: 'disabled' })
  if (!controls.ready || !input.expectedBinding) throw new Error('errors.webSearch.capabilityUnavailable')
  if (search.effectiveSearchPrompt) throw new Error('GENERATION_V2_WEB_SEARCH_PROMPT_UNSUPPORTED')
  const parameters = parametersFor(input.projection, input.expectedBinding)!
  const accepted = parameters.accepted
  const unsupported = (): never => { throw new Error('errors.webSearch.unsupportedSetting') }
  const types = [...(search.effectiveMode || input.googleSearch ? ['web'] : []), ...(input.imageSearch ? ['image'] : [])]
  if (!accepted('web.mode', 'provider_search') || !accepted('web.types', types)) unsupported()
  const explicit: SearchSettingsLayer = input.layers.convo ?? {}
  const web: Record<string, unknown> = { mode: 'provider_search', types: Object.freeze(types) }
  if (explicit.searchEngine && explicit.searchEngine !== 'default' && !accepted('web.engine', explicit.searchEngine)) unsupported()
  if (typeof explicit.maxResults === 'number') {
    if (!parameters.domainFor('web.maxResults')) unsupported()
    if (!accepted('web.maxResults', explicit.maxResults)) throw new Error('errors.webSearch.invalidMaxResults')
    web.maxResults = explicit.maxResults
  } else if (accepted('web.maxResults', search.effectiveMaxResults)) web.maxResults = search.effectiveMaxResults
  if (explicit.searchDepth === 'custom' && web.maxResults === undefined) unsupported()
  if (explicit.searchDepth && explicit.searchDepth !== 'default' && explicit.searchDepth !== 'custom' &&
      !accepted('web.maxResults', search.effectiveMaxResults) && !accepted('web.searchContextSize', explicit.searchDepth)) unsupported()
  if (accepted('web.searchContextSize', search.effectiveSearchContextSize)) web.searchContextSize = search.effectiveSearchContextSize
  if (search.effectiveEngine && accepted('web.engine', search.effectiveEngine)) web.engine = search.effectiveEngine
  return Object.freeze(web)
}
