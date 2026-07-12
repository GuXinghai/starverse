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
  const capabilities = getEffectiveGenerationParamCapabilities(input.profile, input.modelId)
  const patch: Record<string, unknown> = {}

  for (const [rawKey, value] of Object.entries(input.requestParams) as Array<[GenerationParamKey, GenerationParamValue | undefined]>) {
    if (value === undefined) continue
    if (input.profile.providerId === 'openai_responses' && rawKey === 'reasoningEffort' && value === 'auto') continue
    const capability = capabilities[rawKey]
    const path = capability ? wireTarget(capability) : null
    if (!capability || !capability.supported || !path) {
      throw new Error(`generationParams.${rawKey} has no provider wire target for ${input.profile.profileId}`)
    }
    setWirePath(patch, path, value)
  }

  return patch
}
