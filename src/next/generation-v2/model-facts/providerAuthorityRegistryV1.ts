import { canonicalSourceFactDigestV1 } from './canonicalSourceFactsV1'

export type ProviderAuthorityRegistryEntryV1 = Readonly<{
  providerAuthorityId: string
  providerNativeSurfaceIds: readonly string[]
  executionBindings: readonly Readonly<{
    implementationProviderId: string
    endpointProfileKind: string
  }>[]
  modelsDevProviderKeys: readonly string[]
  registryEntryRevision: string
}>

export class ProviderAuthorityRegistryV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_PROVIDER_AUTHORITY_REGISTRY_INVALID'
    | 'GENERATION_V2_PROVIDER_AUTHORITY_AMBIGUOUS'
    | 'GENERATION_V2_PROVIDER_AUTHORITY_UNMAPPED') {
    super(code)
    this.name = 'ProviderAuthorityRegistryV1Error'
  }
}

type EntryDraft = Omit<ProviderAuthorityRegistryEntryV1, 'registryEntryRevision'>

function entry(input: EntryDraft): ProviderAuthorityRegistryEntryV1 {
  const projection = Object.freeze({ providerAuthorityId: input.providerAuthorityId,
    providerNativeSurfaceIds: Object.freeze([...input.providerNativeSurfaceIds].sort()),
    executionBindings: Object.freeze([...input.executionBindings]
      .sort((left, right) => `${left.implementationProviderId}\0${left.endpointProfileKind}`
        .localeCompare(`${right.implementationProviderId}\0${right.endpointProfileKind}`, 'en'))),
    modelsDevProviderKeys: Object.freeze([...input.modelsDevProviderKeys].sort()) })
  return Object.freeze({ ...projection,
    registryEntryRevision: `provider-authority-entry-v1:${canonicalSourceFactDigestV1(projection)}` })
}

export const PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1 = Object.freeze([
  entry({ providerAuthorityId: 'openai', providerNativeSurfaceIds: ['openai-models-v1'],
    executionBindings: [{ implementationProviderId: 'openai_responses', endpointProfileKind: 'openai-api-v1' }],
    modelsDevProviderKeys: ['openai'] }),
  entry({ providerAuthorityId: 'google-ai-studio', providerNativeSurfaceIds: ['gemini-models-v1beta'],
    executionBindings: [{ implementationProviderId: 'google_ai_studio', endpointProfileKind: 'gemini-developer-api-v1beta' }],
    modelsDevProviderKeys: ['google'] }),
  entry({ providerAuthorityId: 'anthropic', providerNativeSurfaceIds: ['anthropic-models-2023-06-01'],
    executionBindings: [{ implementationProviderId: 'anthropic', endpointProfileKind: 'anthropic-developer-api-2023-06-01' }],
    modelsDevProviderKeys: [] }),
  entry({ providerAuthorityId: 'deepseek', providerNativeSurfaceIds: ['deepseek-stable-models-v1'],
    executionBindings: [{ implementationProviderId: 'deepseek', endpointProfileKind: 'deepseek-stable-api-v1' }],
    modelsDevProviderKeys: ['deepseek'] }),
  entry({ providerAuthorityId: 'openrouter', providerNativeSurfaceIds: ['openrouter-chat-models-v1'],
    executionBindings: [{ implementationProviderId: 'openrouter', endpointProfileKind: 'openrouter-first-party-v1' }],
    modelsDevProviderKeys: ['openrouter'] }),
  entry({ providerAuthorityId: 'lmstudio-local', providerNativeSurfaceIds: ['lmstudio-models-v1'],
    // Local endpoint profiles have exact per-installation IDs but no persisted authority-profile kind yet.
    // Keep execution binding unmapped rather than inventing a string join from protocol compatibility.
    executionBindings: [],
    modelsDevProviderKeys: [] }),
  entry({ providerAuthorityId: 'ollama-local', providerNativeSurfaceIds: ['ollama-tags-v1'],
    executionBindings: [],
    modelsDevProviderKeys: [] }),
] as const)

function validate(entries: readonly ProviderAuthorityRegistryEntryV1[]): void {
  const authorities = entries.map((candidate) => candidate.providerAuthorityId)
  const nativeKeys = entries.flatMap((candidate) => candidate.providerNativeSurfaceIds)
  const modelsDevKeys = entries.flatMap((candidate) => candidate.modelsDevProviderKeys)
  const executionKeys = entries.flatMap((candidate) => candidate.executionBindings.map((binding) =>
    `${binding.implementationProviderId}\0${binding.endpointProfileKind}`))
  if (new Set(authorities).size !== authorities.length || new Set(nativeKeys).size !== nativeKeys.length ||
      new Set(modelsDevKeys).size !== modelsDevKeys.length || new Set(executionKeys).size !== executionKeys.length) {
    throw new ProviderAuthorityRegistryV1Error('GENERATION_V2_PROVIDER_AUTHORITY_REGISTRY_INVALID')
  }
}

validate(PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1)

export const PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 = `provider-authority-registry-v1:${canonicalSourceFactDigestV1(
  PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1,
)}`

function unique(matches: readonly ProviderAuthorityRegistryEntryV1[]): ProviderAuthorityRegistryEntryV1 {
  if (matches.length === 0) throw new ProviderAuthorityRegistryV1Error('GENERATION_V2_PROVIDER_AUTHORITY_UNMAPPED')
  if (matches.length !== 1) throw new ProviderAuthorityRegistryV1Error('GENERATION_V2_PROVIDER_AUTHORITY_AMBIGUOUS')
  return matches[0]!
}

export function providerAuthorityForNativeSurfaceV1(surfaceId: string): ProviderAuthorityRegistryEntryV1 {
  return unique(PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.filter((candidate) =>
    candidate.providerNativeSurfaceIds.includes(surfaceId)))
}

export function providerAuthorityForModelsDevKeyV1(providerKey: string): ProviderAuthorityRegistryEntryV1 {
  return unique(PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.filter((candidate) =>
    candidate.modelsDevProviderKeys.includes(providerKey)))
}

export function providerAuthorityForExecutionBindingV1(input: Readonly<{
  implementationProviderId: string
  endpointProfileKind: string
}>): ProviderAuthorityRegistryEntryV1 {
  return unique(PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.filter((candidate) => candidate.executionBindings.some((binding) =>
    binding.implementationProviderId === input.implementationProviderId &&
    binding.endpointProfileKind === input.endpointProfileKind)))
}

export function modelsDevProviderKeyForAuthorityV1(providerAuthorityId: string): string | null {
  const matches = PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.filter((candidate) =>
    candidate.providerAuthorityId === providerAuthorityId)
  const authority = unique(matches)
  if (authority.modelsDevProviderKeys.length === 0) return null
  if (authority.modelsDevProviderKeys.length !== 1) {
    throw new ProviderAuthorityRegistryV1Error('GENERATION_V2_PROVIDER_AUTHORITY_AMBIGUOUS')
  }
  return authority.modelsDevProviderKeys[0]!
}
