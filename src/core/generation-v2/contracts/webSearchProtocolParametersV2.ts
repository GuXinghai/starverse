import type { ModelCapabilityDomainV2 } from '../capability/modelCapabilitySchemaV2'
import { GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2, type WebSearchIntentV2 } from '../domain/generationIntentV2'
import { listReviewedProviderContractDefinitionsV2, type ProviderContractOperationV2 } from './providerContractRegistryV2'

export type WebSearchProtocolParameterBindingV2 = Readonly<{
  providerId: string
  protocolContractId: string
  operation: ProviderContractOperationV2
}>
export type WebSearchProtocolParametersV2 = Readonly<{
  types: ModelCapabilityDomainV2
  optionalParameters: Readonly<{
    engine?: ModelCapabilityDomainV2
    maxResults?: ModelCapabilityDomainV2
    searchContextSize?: ModelCapabilityDomainV2
  }>
}>

const webTypes = Object.freeze({ kind:'enum_list' as const,values:Object.freeze(['web']),maxItems:1 })
const noOptional = Object.freeze({})
const anthropic = Object.freeze({ types:webTypes,optionalParameters:Object.freeze({
  maxResults:Object.freeze({kind:'range' as const,min:1,max:20,integer:true}),
}) })
const openRouter = Object.freeze({ types:webTypes,optionalParameters:Object.freeze({
  engine:Object.freeze({kind:'enum' as const,values:Object.freeze(['auto','native','exa','firecrawl','parallel','perplexity'])}),
  maxResults:Object.freeze({kind:'range' as const,min:1,max:25,integer:true}),
  searchContextSize:Object.freeze({kind:'enum' as const,values:Object.freeze(['low','medium','high'])}),
}) })
const responses = Object.freeze({ types:webTypes,optionalParameters:Object.freeze({
  searchContextSize:Object.freeze({kind:'string' as const,maxLength:GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2}),
}) })
const generateContent = Object.freeze({ types:webTypes,optionalParameters:noOptional })
const interactions = Object.freeze({ types:Object.freeze({kind:'enum_list' as const,values:Object.freeze(['web','image']),maxItems:2}),optionalParameters:noOptional })

/** Registered wire bounds only. These parameters do not assert that a particular model supports search. */
export function resolveWebSearchProtocolParametersV2(binding: WebSearchProtocolParameterBindingV2): WebSearchProtocolParametersV2 {
  const contract = listReviewedProviderContractDefinitionsV2().find(item => item.protocolContractId.value === binding.protocolContractId)
  if (!contract || contract.providerId.value !== binding.providerId || !contract.operations.includes(binding.operation)) {
    throw new Error('GENERATION_V2_WEB_SEARCH_PROTOCOL_BINDING_INVALID')
  }
  switch (contract.protocolContractId.value) {
    case 'anthropic-messages-2023-06-01': return anthropic
    case 'openrouter-chat-completions-v1': return openRouter
    case 'openai-responses-v1': return responses
    case 'gemini-generate-content-v1beta': return generateContent
    case 'gemini-interactions-v1beta': return interactions
    default: throw new Error('GENERATION_V2_WEB_SEARCH_PROTOCOL_UNSUPPORTED')
  }
}

function scalarMatches(domain: ModelCapabilityDomainV2, value: unknown): boolean {
  switch (domain.kind) {
    case 'enum': return domain.values.includes(value as string | number | boolean)
    case 'range': return typeof value === 'number' && Number.isFinite(value) && value >= domain.min && value <= domain.max &&
      (!domain.integer || Number.isSafeInteger(value)) && !domain.excludedValues?.includes(value)
    case 'string': return typeof value === 'string' && value.length > 0 && value.length <= domain.maxLength
    default: return false
  }
}

/** Checks the bounded UI parameter subset; each compiler retains its existing checks for other web fields. */
export function validateWebSearchProtocolParametersV2(binding: WebSearchProtocolParameterBindingV2, web: WebSearchIntentV2): void {
  const parameters = resolveWebSearchProtocolParametersV2(binding)
  if (web.mode === 'disabled') return
  const types = parameters.types
  if (web.mode !== 'provider_search' || types.kind !== 'enum_list' || !Array.isArray(web.types) || web.types.length < 1 ||
      web.types.length > types.maxItems || new Set(web.types).size !== web.types.length ||
      Array.from(web.types).some(value => !types.values.includes(value))) {
    throw new Error('GENERATION_V2_WEB_SEARCH_PROTOCOL_PARAMETERS_INVALID')
  }
  for (const key of ['engine','maxResults','searchContextSize'] as const) {
    if (web[key] === undefined) continue
    const domain = parameters.optionalParameters[key]
    if (!domain || !scalarMatches(domain, web[key])) throw new Error('GENERATION_V2_WEB_SEARCH_PROTOCOL_PARAMETERS_INVALID')
  }
}
