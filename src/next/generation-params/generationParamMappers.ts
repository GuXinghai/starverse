import { getEffectiveGenerationParamCapabilities } from './generationParamProfiles'
import type {
  GenerationParamCapability,
  GenerationParamKey,
  GenerationParamValue,
  MapGenerationParamsInput,
} from './generationParamTypes'

function setWirePath(target: Record<string, unknown>, path: readonly string[], value: GenerationParamValue) {
  let cursor: Record<string, unknown> = target
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const existing = cursor[segment]
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[path[path.length - 1]] = value
}

function wireTarget(capability: GenerationParamCapability): readonly string[] | null {
  if (capability.wirePath?.length) return capability.wirePath
  if (capability.wireKey) return [capability.wireKey]
  return null
}

export function mapGenerationParamsToProviderRequestPatch(input: MapGenerationParamsInput): Record<string, unknown> {
  const capabilities = getEffectiveGenerationParamCapabilities(input.profile, input.modelId, {
    geminiThinkingCapability: input.geminiThinkingCapability,
  })
  const patch: Record<string, unknown> = {}
  const interactionSearchTypes: string[] = []

  for (const [rawKey, value] of Object.entries(input.requestParams) as Array<[GenerationParamKey, GenerationParamValue | undefined]>) {
    if (value === undefined) continue
    if (input.profile.providerId === 'openai_responses' && rawKey === 'reasoningEffort' && value === 'auto') continue
    const capability = capabilities[rawKey]
    const path = capability ? wireTarget(capability) : null
    if (!capability || !capability.supported || (!path && !capability.wireEncoding)) {
      if (capability?.wireEncoding === 'gemini_interactions_google_search_type' && capability.supported && value === false) continue
      throw new Error(`generationParams.${rawKey} has no provider wire target for ${input.profile.profileId}`)
    }
    if (capability.wireEncoding === 'gemini_interactions_google_search_type') {
      if (value !== true && value !== false) {
        throw new Error(`generationParams.${rawKey} requires a boolean search toggle for ${input.profile.profileId}`)
      }
      if (value === true) interactionSearchTypes.push(rawKey === 'googleSearch' ? 'web_search' : 'image_search')
      continue
    }
    if (!path) {
      throw new Error(`generationParams.${rawKey} has no provider wire target for ${input.profile.profileId}`)
    }
    setWirePath(patch, path, value)
  }

  if (interactionSearchTypes.length > 0) {
    patch.tools = [{ type: 'google_search', search_types: Array.from(new Set(interactionSearchTypes)) }]
  }

  return patch
}
