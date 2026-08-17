/* eslint-disable no-restricted-imports -- Main-process capability authority composes canonical Generation V2 resolver contracts. */
import type BetterSqlite3 from 'better-sqlite3'
import { LocalEndpointProfileV2Repo, type LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { OpenRouterImageBindingRepo } from '../../infra/db/repo/openRouterImageBindingRepo'
import { OpenRouterImageSettingsRepo } from '../../infra/db/repo/openRouterImageSettingsRepo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { resolveAnthropicCapabilityV2 } from './anthropicGenerationAuthorityV2Service'
import { resolveDeepSeekStableCapabilityV2 } from './deepSeekStableGenerationAuthorityV2Service'
import { resolveGeminiGenerateContentCapabilityV2 } from './geminiGenerateContentGenerationAuthorityV2Service'
import { resolveGeminiInteractionsImageCapabilityV2 } from './geminiInteractionsImageGenerationAuthorityV2Service'
import { resolveOpenAIResponsesCapabilityV2 } from './openAIResponsesGenerationAuthorityV2Service'
import { resolveOpenRouterChatCapabilityV2 } from './openRouterChatGenerationAuthorityV2Service'
import { createOpenRouterImageDescriptorAuthorityV2Service } from './openRouterImageDescriptorAuthorityV2Service'
import {
  openAICompatibleUnauthenticatedCredentialScopeV2,
  mappedReasoningSources,
} from './openAIChatCompatibleGenerationV2Coordinator'
import { createLmStudioOpenResponsesProviderBindingV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/verifiedContractV2'
import { resolveLmStudioOpenResponsesCapabilityV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/runtimeCapabilityV2'
import { createGenericLocalOpenAIChatProviderBindingV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/verifiedContractV2'
import { resolveGenericLocalOpenAIChatCapabilityV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/runtimeCapabilityV2'
import { createOllamaChatProviderBindingV2 } from '../../src/next/generation-v2/providers/ollama-chat/verifiedContractV2'
import { resolveOllamaChatCapabilityV2 } from '../../src/next/generation-v2/providers/ollama-chat/runtimeCapabilityV2'
import { createOpenAIChatCompatibleProviderBindingV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/verifiedContractV2'
import { resolveOpenAIChatCompatibleCapabilityV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/runtimeCapabilityV2'
import { resolveOpenRouterImageCapabilityV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageRuntimeCapabilityV2'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 as readOpenRouterProfile } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import {
  assertCapabilityResolutionScopeV2,
  projectGenerationCapabilityResolutionV2,
  type GenerationCapabilityResolutionRequestV2,
  type GenerationCapabilityResolutionResultV2,
} from '../../src/next/generation-v2/capability/capabilityResolutionV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import {
  readVerifiedAnthropicEndpointProfileV2,
} from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import { listGenerationImplementationManifestsV2 } from '../../src/next/generation-v2/capability/implementationManifestV2'
/* eslint-enable no-restricted-imports */

export class GenerationV2CapabilityResolutionServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_INVALID_REQUEST'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_MODEL_UNAVAILABLE'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_CREDENTIAL_INVALID'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_STALE') {
    super(code)
    this.name = 'GenerationV2CapabilityResolutionServiceError'
  }
}

type CompatibleCredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>

function resolvedAt(atMs: number): string {
  const value = Number.isSafeInteger(atMs) && atMs >= 0 ? atMs : Date.now()
  return new Date(value).toISOString()
}

type CapabilityResolverV2 = (
  request: GenerationCapabilityResolutionRequestV2,
) => Promise<GenerationCapabilityResolutionResultV2>

function capabilityResolutionScopeKeyV2(
  providerId: string,
  protocolId: string,
  operation: string,
): string {
  return `${providerId}\u0000${protocolId}\u0000${operation}`
}

/**
 * Routing completeness only. The resolver result remains the sole capability
 * authority; this list prevents a newly production-reachable scope from
 * silently falling through to an unimplemented resolver.
 */
const PRODUCTION_CAPABILITY_RESOLUTION_SCOPE_KEYS_V2 = Object.freeze(
  listGenerationImplementationManifestsV2()
    // Continuations are bound to the originating answer's immutable runtime
    // capability snapshot; they must not resolve a new UI capability revision.
    .filter((manifest) => manifest.operation !== 'tool_continue')
    .map((manifest) => capabilityResolutionScopeKeyV2(
      manifest.providerId,
      manifest.protocolContractId,
      manifest.operation,
    ))
    .sort(),
)

function assertCapabilityResolutionRegistryCompleteV2(
  registry: ReadonlyMap<string, CapabilityResolverV2>,
): void {
  if (registry.size !== PRODUCTION_CAPABILITY_RESOLUTION_SCOPE_KEYS_V2.length ||
      PRODUCTION_CAPABILITY_RESOLUTION_SCOPE_KEYS_V2.some((key) => !registry.has(key))) {
    throw new Error('GENERATION_V2_CAPABILITY_RESOLUTION_REGISTRY_INCOMPLETE')
  }
}

function localBindingCapability(
  request: GenerationCapabilityResolutionRequestV2,
  profile: LocalEndpointProfileV2,
) {
  if (request.credentialRevision !== profile.revisionGeneration || request.credentialScopeId !== profile.credentialScopeId) {
    throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_STALE')
  }
  if (request.endpointProfileId !== profile.endpointProfileId || request.protocolId !== profile.protocolContractId ||
      request.providerId !== profile.providerId) {
    throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
  }
  if (request.operation !== 'text') {
    throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
  }
  if (profile.protocolConfig.modelId !== request.modelId) {
    throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_MODEL_UNAVAILABLE')
  }
  const at = resolvedAt(Math.max(Date.now(), profile.updatedAtMs))
  const capability = profile.providerId === 'lmstudio'
    ? resolveLmStudioOpenResponsesCapabilityV2({
      binding: createLmStudioOpenResponsesProviderBindingV2(profile, request.modelId), resolvedAt: at,
      credentialRevision: request.credentialRevision,
    })
      : profile.providerId === 'generic_local'
      ? resolveGenericLocalOpenAIChatCapabilityV2({
        binding: createGenericLocalOpenAIChatProviderBindingV2(profile, request.modelId), resolvedAt: at,
        credentialRevision: request.credentialRevision,
      })
      : profile.providerId === 'ollama'
        ? resolveOllamaChatCapabilityV2({
        binding: createOllamaChatProviderBindingV2(profile, request.modelId), profile, resolvedAt: at,
        credentialRevision: request.credentialRevision,
        })
        : (() => { throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE') })()
  assertCapabilityResolutionScopeV2(request, capability.binding)
  return projectGenerationCapabilityResolutionV2(capability)
}

export function createGenerationV2CapabilityResolutionService(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  openAICompatibleCredentialService: CompatibleCredentialService
}>) {
  const activeCatalog = createActiveCatalogModelAuthorityV2Service({ db: input.db, credentialService: input.credentialService })
  const profiles = new LocalEndpointProfileV2Repo(input.db)
  const compatible = new OpenAICompatibleV2Repo(input.db)
  const imageBindings = new OpenRouterImageBindingRepo(input.db)
  const imageSettings = new OpenRouterImageSettingsRepo(input.db)
  const imageDescriptors = createOpenRouterImageDescriptorAuthorityV2Service({
    db: input.db, credentialService: input.credentialService,
  })

  async function cloud(
    request: GenerationCapabilityResolutionRequestV2,
  ): Promise<GenerationCapabilityResolutionResultV2> {
    const modelId = GenerationV2Identity.create('model_id', request.modelId)
    const common = {
      expectedCredentialRevision: request.credentialRevision,
      expectedCredentialScopeId: request.credentialScopeId as CredentialScopeIdV2,
      modelId,
    }
    if (request.providerId === 'openrouter' && request.operation === 'text') {
      const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
      return activeCatalog.withExactActiveModel({ providerKey: 'openrouter', endpointProfile: profile, ...common,
        consume: (evidence) => {
          const capability = resolveOpenRouterChatCapabilityV2(evidence)
          assertCapabilityResolutionScopeV2(request, capability.binding)
          return projectGenerationCapabilityResolutionV2(capability)
        } })
    }
    if (request.providerId === 'openai_responses' && request.operation === 'text') {
      const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
      return activeCatalog.withExactActiveModel({ providerKey: 'openai_responses', endpointProfile: profile, ...common,
        consume: (evidence) => {
          const capability = resolveOpenAIResponsesCapabilityV2(evidence)
          assertCapabilityResolutionScopeV2(request, capability.binding)
          return projectGenerationCapabilityResolutionV2(capability)
        } })
    }
    if (request.providerId === 'anthropic' && request.operation === 'text') {
      const profile = readVerifiedAnthropicEndpointProfileV2()
      return activeCatalog.withExactActiveModel({ providerKey: 'anthropic_messages', endpointProfile: profile, ...common,
        consume: (evidence) => {
          const capability = resolveAnthropicCapabilityV2(evidence)
          assertCapabilityResolutionScopeV2(request, capability.binding)
          return projectGenerationCapabilityResolutionV2(capability)
        } })
    }
    if (request.providerId === 'deepseek' && request.operation === 'text') {
      const profile = readVerifiedDeepSeekStableEndpointProfileV2()
      return activeCatalog.withExactActiveModel({ providerKey: 'deepseek', endpointProfile: profile, ...common,
        consume: (evidence) => {
          const capability = resolveDeepSeekStableCapabilityV2(evidence)
          assertCapabilityResolutionScopeV2(request, capability.binding)
          return projectGenerationCapabilityResolutionV2(capability)
        } })
    }
    if (request.providerId === 'google_ai_studio') {
      const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
      if (request.operation === 'text') {
        return activeCatalog.withExactActiveModel({ providerKey: 'google_ai_studio', endpointProfile: profile, ...common,
          consume: (evidence) => {
            const capability = resolveGeminiGenerateContentCapabilityV2(evidence)
            assertCapabilityResolutionScopeV2(request, capability.binding)
            return projectGenerationCapabilityResolutionV2(capability)
          } })
      }
      return activeCatalog.withExactActiveModel({ providerKey: 'google_ai_studio', endpointProfile: profile, ...common,
        consume: (evidence) => {
          const capability = resolveGeminiInteractionsImageCapabilityV2(evidence, request.modelId)
          assertCapabilityResolutionScopeV2(request, capability.binding)
          return projectGenerationCapabilityResolutionV2(capability)
        } })
    }
    throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
  }

  async function compatibleCapability(request: GenerationCapabilityResolutionRequestV2): Promise<GenerationCapabilityResolutionResultV2> {
    if (request.operation !== 'text' || request.protocolId !== 'openai_chat_compatible') {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
    }
    const provider = compatible.get(request.endpointProfileId)
    const endpoint = provider.endpointRevisions[0]
    if (!endpoint || provider.status !== 'active' || endpoint.providerInstanceId !== provider.providerInstanceId) {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_MODEL_UNAVAILABLE')
    }
    const model = compatible.listMergedModels(provider.providerInstanceId, false).find((item) => item.modelId === request.modelId)
    if (!model) throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_MODEL_UNAVAILABLE')
    const auth = endpoint.auth as { mode?: unknown; credentialVersionRef?: unknown }
    let credentialScopeId: CredentialScopeIdV2
    let credentialRevision: number
    if (auth.mode === 'none') {
      credentialScopeId = openAICompatibleUnauthenticatedCredentialScopeV2(endpoint.endpointDigest)
      credentialRevision = 1
    } else if ((auth.mode === 'bearer' || auth.mode === 'basic' || auth.mode === 'custom_headers') &&
      typeof auth.credentialVersionRef === 'string') {
      const status = await input.openAICompatibleCredentialService.getStatus(provider.providerInstanceId, auth.credentialVersionRef)
      if (!status.configured || !status.credentialScopeId) {
        throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_CREDENTIAL_INVALID')
      }
      credentialScopeId = status.credentialScopeId
      credentialRevision = status.revision
    } else {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_CREDENTIAL_INVALID')
    }
    if (request.credentialScopeId !== credentialScopeId || request.credentialRevision !== credentialRevision) {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_STALE')
    }
    const binding = createOpenAIChatCompatibleProviderBindingV2({
      provider, endpoint, credentialScopeId, modelId: request.modelId,
    })
    const configuration = compatible.getConfigurationForEndpointRevision(provider.providerInstanceId, endpoint.endpointRevisionId)
    const capability = resolveOpenAIChatCompatibleCapabilityV2({
      binding, resolvedAt: resolvedAt(Math.max(Date.now(), endpoint.createdAtMs)),
      credentialRevision,
      mappedReasoningSourceFields: mappedReasoningSources(configuration),
    })
    assertCapabilityResolutionScopeV2(request, capability.binding)
    return projectGenerationCapabilityResolutionV2(capability)
  }

  async function openRouterImageCapability(request: GenerationCapabilityResolutionRequestV2): Promise<GenerationCapabilityResolutionResultV2> {
    if (request.protocolId !== 'openrouter-images-v1' || request.endpointProfileId !== OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 ||
        request.operation !== 'image_generate') {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
    }
    const profile = readOpenRouterProfile()
    const modelId = GenerationV2Identity.create('model_id', request.modelId)
    await activeCatalog.withExactActiveModel({
      providerKey: 'openrouter', endpointProfile: profile,
      expectedCredentialRevision: request.credentialRevision,
      expectedCredentialScopeId: request.credentialScopeId as CredentialScopeIdV2,
      modelId, consume: () => undefined,
    })
    const descriptor = await imageDescriptors.resolve({
      modelId: request.modelId, credentialRevision: request.credentialRevision,
      credentialScopeId: request.credentialScopeId as CredentialScopeIdV2,
      settings: imageSettings.readOrRestore().settings.pair,
    })
    const binding = imageBindings.getBinding({ credentialScopeId: descriptor.credentialScopeId, modelId })
    if (!binding || binding.record.endpointBinding.kind !== 'pinned') {
      throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
    }
    const selector = binding.record.endpointBinding.selector
    const selected = descriptor.descriptorSet.descriptors.find((candidate) =>
      candidate.providerTag.value === selector.providerTag.value && candidate.providerSlug.value === selector.providerSlug.value &&
      candidate.descriptorRevision.value === selector.descriptorRevision.value && candidate.descriptorDigest.value === selector.descriptorDigest.value)
    if (!selected) throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_STALE')
    const capability = resolveOpenRouterImageCapabilityV2({
      binding: binding.record, descriptor: selected, resolvedAt: resolvedAt(Math.max(Date.now(), descriptor.fetchedAtMs)),
      credentialRevision: request.credentialRevision,
    })
    assertCapabilityResolutionScopeV2(request, capability.binding)
    return projectGenerationCapabilityResolutionV2(capability)
  }

  const resolverRegistry = new Map<string, CapabilityResolverV2>([
    [capabilityResolutionScopeKeyV2('openrouter', 'openrouter-chat-completions-v1', 'text'), cloud],
    [capabilityResolutionScopeKeyV2('openrouter', 'openrouter-images-v1', 'image_generate'), openRouterImageCapability],
    [capabilityResolutionScopeKeyV2('openai_responses', 'openai-responses-v1', 'text'), cloud],
    [capabilityResolutionScopeKeyV2('anthropic', 'anthropic-messages-2023-06-01', 'text'), cloud],
    [capabilityResolutionScopeKeyV2('deepseek', 'deepseek-stable-chat-v1', 'text'), cloud],
    [capabilityResolutionScopeKeyV2('google_ai_studio', 'gemini-generate-content-v1beta', 'text'), cloud],
    [capabilityResolutionScopeKeyV2('google_ai_studio', 'gemini-interactions-v1beta', 'image_generate'), cloud],
    [capabilityResolutionScopeKeyV2('lmstudio', 'lmstudio-openresponses', 'text'),
      (request) => Promise.resolve(localBindingCapability(request, profiles.get(request.endpointProfileId)))],
    [capabilityResolutionScopeKeyV2('generic_local', 'generic-local-openai-chat-completions', 'text'),
      (request) => Promise.resolve(localBindingCapability(request, profiles.get(request.endpointProfileId)))],
    [capabilityResolutionScopeKeyV2('ollama', 'ollama-chat-v1', 'text'),
      (request) => Promise.resolve(localBindingCapability(request, profiles.get(request.endpointProfileId)))],
    [capabilityResolutionScopeKeyV2('openai_compatible', 'openai_chat_compatible', 'text'), compatibleCapability],
  ])
  assertCapabilityResolutionRegistryCompleteV2(resolverRegistry)
  return Object.freeze({
    resolve: async (request: GenerationCapabilityResolutionRequestV2): Promise<GenerationCapabilityResolutionResultV2> => {
      const resolver = resolverRegistry.get(capabilityResolutionScopeKeyV2(request.providerId, request.protocolId, request.operation))
      if (!resolver) throw new GenerationV2CapabilityResolutionServiceError('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
      return resolver(request)
    },
  })
}
