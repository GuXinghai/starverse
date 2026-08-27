import {
  decodeRuntimeCapabilitySnapshotV2,
  type DecodedRuntimeCapabilitySnapshotV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type PersistedModelCapabilityFieldV2 as PersistedRuntimeCapabilityFieldV2,
  type ModelCapabilitySemanticPathV2 as RuntimeCapabilitySemanticPathV2,
} from '../../src/next/generation-v2/capability/modelCapabilitySchemaV2'
import {
  canonicalizeResolvedCapabilityV2,
  runtimeSnapshotRecordFromResolvedCapabilityV2,
  validateSemanticIntentAgainstResolvedCapabilityV2,
  type ResolvedCapabilityV2,
} from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import { assertExpectedCapabilityRevisionV2 } from '../../src/next/generation-v2/capability/capabilityRevisionExpectationV2'
import { isActiveCatalogModelAuthorityV2,
  projectActiveCatalogSnapshotAuthorityV2, type ActiveCatalogModelAuthorityV2 } from './activeCatalogModelAuthorityV2Service'
import { listReviewedProviderContractDefinitionsV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { verifyProviderContractReferenceV2 } from '../../src/next/generation-v2/contracts/providerContractReferenceAuthorityV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from '../../src/next/generation-v2/domain/providerBindingV2'
import { readGenerationV2Digest, readGenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { ManagedFileAttachmentIntentV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import { OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import {
  readVerifiedOpenRouterFirstPartyEndpointProfileV2,
} from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { AttachmentAssetRevisionRepositoryFactV2 } from '../../infra/db/repo/attachmentAssetV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

export type VerifiedOpenRouterChatBindingAuthorityV2 = Readonly<{
  trust: 'verified_openrouter_chat_binding_v2'
  binding: DecodedProviderBindingRecordV2
  evidence: ActiveCatalogModelAuthorityV2
  assertCurrent(): void
}>

export type VerifiedOpenRouterChatCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_openrouter_chat_capability_v2'
  bindingAuthority: VerifiedOpenRouterChatBindingAuthorityV2
  resolvedCapability: ResolvedCapabilityV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  assertCurrent(): void
}>

export class OpenRouterChatGenerationAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_TOOL_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE') {
    super(code)
    this.name = 'OpenRouterChatGenerationAuthorityV2Error'
  }
}

const bindings = new WeakSet<object>()
const capabilities = new WeakSet<object>()

export function isVerifiedOpenRouterChatBindingAuthorityV2(value: unknown): value is VerifiedOpenRouterChatBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindings.has(value))
}
export function isVerifiedOpenRouterChatCapabilityAuthorityV2(value: unknown): value is VerifiedOpenRouterChatCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilities.has(value))
}
export function readVerifiedOpenRouterChatBindingRecordV2(authority: VerifiedOpenRouterChatBindingAuthorityV2) {
  if (!isVerifiedOpenRouterChatBindingAuthorityV2(authority)) return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}

function fail(code: OpenRouterChatGenerationAuthorityV2Error['code']): never {
  throw new OpenRouterChatGenerationAuthorityV2Error(code)
}

function field(
  path: RuntimeCapabilitySemanticPathV2,
  supportedParameters: ReadonlySet<string>,
  toolsSupported: boolean,
  inputModalities: ReadonlySet<string>,
  supportEvidence: string,
  rejectEvidence: string,
): PersistedRuntimeCapabilityFieldV2 {
  const supported = (domain: NonNullable<PersistedRuntimeCapabilityFieldV2['domain']>) => Object.freeze({
    path, state: 'supported' as const, domain, constraints: Object.freeze([]), evidenceIds: Object.freeze([supportEvidence]),
  })
  const unsupported = () => Object.freeze({
    path, state: 'unsupported' as const, constraints: Object.freeze([]), evidenceIds: Object.freeze([rejectEvidence]),
  })
  const byParameter = (parameter: string, domain: NonNullable<PersistedRuntimeCapabilityFieldV2['domain']>) =>
    supportedParameters.has(parameter) ? supported(domain) : unsupported()
  switch (path) {
    case 'attachments[].kind':
    case 'attachments[].referenceId':
    case 'attachments[].referenceRevision':
    case 'attachments[].originalUrl':
    case 'attachments[].urlDigest':
    case 'attachments[].mediaKind':
    case 'attachments[].declaredMediaType':
    case 'attachments[].capturedAtMs':
    case 'attachments[].provenance': return unsupported()
    case 'attachments[].assetId':
    case 'attachments[].assetRevisionId':
    case 'attachments[].assetSha256': return supported({ kind: 'identity' })
    case 'attachments[].include': return supported({ kind: 'boolean' })
    case 'attachments[].conversion': return supported({ kind: 'enum', values: Object.freeze(['none', 'plain_text', 'pdf']) })
    case 'attachments[].sendAs': {
      const values = [
        'inline_text' as const,
        ...(inputModalities.has('image') ? ['image_reference' as const] : []),
        ...(inputModalities.has('file') ? ['provider_file' as const, 'converted_document' as const] : []),
      ]
      return values.length > 0 ? supported({ kind: 'enum', values: Object.freeze(values) }) : unsupported()
    }
    case 'generation.maxOutputTokens': return byParameter('max_tokens', { kind: 'range', min: 1, max: 2_000_000, integer: true })
    case 'generation.temperature': return byParameter('temperature', { kind: 'range', min: 0, max: 2, integer: false })
    case 'generation.topP': return byParameter('top_p', { kind: 'range', min: 0, max: 1, integer: false })
    case 'generation.topK': return byParameter('top_k', { kind: 'range', min: 0, max: 1_000_000, integer: true })
    case 'generation.minP': return byParameter('min_p', { kind: 'range', min: 0, max: 1, integer: false })
    case 'generation.topA': return byParameter('top_a', { kind: 'range', min: 0, max: 1, integer: false })
    case 'generation.seed': return byParameter('seed', { kind: 'range', min: 0, max: 2_147_483_647, integer: true })
    case 'generation.stop': return byParameter('stop', { kind: 'string_list', maxItems: 16, maxItemLength: 16_384 })
    case 'generation.frequencyPenalty': return byParameter('frequency_penalty', { kind: 'range', min: -2, max: 2, integer: false })
    case 'generation.presencePenalty': return byParameter('presence_penalty', { kind: 'range', min: -2, max: 2, integer: false })
    case 'generation.repetitionPenalty': return byParameter('repetition_penalty', { kind: 'range', min: 0.000001, max: 2, integer: false })
    case 'reasoning.mode': return supported({ kind: 'enum', values: Object.freeze(supportedParameters.has('reasoning') ? ['disabled', 'enabled'] : ['disabled']) })
    case 'reasoning.effort': return supportedParameters.has('reasoning')
      ? supported({ kind: 'enum', values: Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh']) }) : unsupported()
    case 'reasoning.exclude': return supportedParameters.has('reasoning') ? supported({ kind: 'boolean' }) : unsupported()
    case 'reasoning.summary': return unsupported()
    case 'web.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'provider_search']) })
    case 'web.types': return supported({ kind: 'enum_list', values: Object.freeze(['web']), maxItems: 1 })
    case 'web.engine': return supported({ kind: 'enum', values: Object.freeze(['auto', 'native', 'exa', 'firecrawl', 'parallel', 'perplexity']) })
    case 'web.maxResults': return supported({ kind: 'range', min: 1, max: 25, integer: true })
    case 'web.maxTotalResults': return supported({ kind: 'range', min: 1, max: 1_000_000, integer: true })
    case 'web.searchContextSize': return supported({ kind: 'enum', values: Object.freeze(['low', 'medium', 'high']) })
    case 'web.maxCharacters': return supported({ kind: 'range', min: 1, max: 100_000, integer: true })
    case 'web.userLocation': return supported({ kind: 'approximate_location', maxFieldLength: 256 })
    case 'web.allowedDomains':
    case 'web.excludedDomains': return supported({ kind: 'string_list', maxItems: 100, maxItemLength: 253 })
    case 'tools.mode': return supported({ kind: 'enum', values: Object.freeze(toolsSupported ? ['disabled', 'enabled'] : ['disabled']) })
    case 'tools.allowedToolIds': return toolsSupported ? supported({ kind: 'identity_list', maxItems: 128 }) : unsupported()
    case 'tools.toolChoice': return toolsSupported
      ? supported({ kind: 'enum', values: Object.freeze(['omitted', 'auto', 'none', 'required', 'named']) }) : unsupported()
    case 'tools.sideEffectConfirmation': return toolsSupported
      ? Object.freeze({ path, state: 'requires_confirmation' as const,
          domain: Object.freeze({ kind: 'enum' as const, values: Object.freeze(['required_each_retry']) }),
          constraints: Object.freeze([]), evidenceIds: Object.freeze([supportEvidence]) }) : unsupported()
    case 'image.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled']) })
    case 'providerExtension.kind': return supported({ kind: 'enum', values: Object.freeze(['none', 'openrouter_chat']) })
    case 'providerExtension.verbosity': return byParameter('verbosity', { kind: 'enum', values: Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']) })
    case 'providerExtension.parallelToolCalls': return toolsSupported && supportedParameters.has('parallel_tool_calls')
      ? supported({ kind: 'boolean' }) : unsupported()
    case 'providerExtension.responseFormat': {
      const types = supportedParameters.has('response_format')
        ? ['text', 'json_object', ...(supportedParameters.has('structured_outputs') || supportedParameters.has('json_schema') ? ['json_schema'] : [])]
        : []
      return types.length > 0 ? supported({ kind: 'response_format', types: Object.freeze(types as ('text' | 'json_object' | 'json_schema')[]) }) : unsupported()
    }
    default: return unsupported()
  }
}

/**
 * Runtime attachment facts must match the selected semantic representation.
 * Model support is checked separately against the frozen model facts.
 */
export function isOpenRouterChatAttachmentAdmissibleV2(input: Readonly<{
  attachment: ManagedFileAttachmentIntentV2
  revision: AttachmentAssetRevisionRepositoryFactV2
}>): boolean {
  const { attachment, revision } = input
  return attachment.sendAs === 'image_reference' && attachment.conversion === 'none' &&
    revision.assetKind === 'image' && revision.blob.mime.startsWith('image/') ||
    attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text' &&
    revision.revisionKind === 'derived' && revision.conversionKind === 'plain_text' &&
    revision.assetKind === 'file' && revision.blob.mime.startsWith('text/') ||
    attachment.sendAs === 'provider_file' && attachment.conversion === 'none' &&
    revision.revisionKind === 'source' && revision.blob.mime === 'application/pdf' ||
    attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf' &&
    revision.revisionKind === 'derived' && revision.conversionKind === 'pdf' &&
    revision.blob.mime === 'application/pdf'
}

function validateIntent(
  facts: GenerationCommandFactsAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
): void {
  const intent = facts.semanticIntent
  if (intent.attachments.length !== facts.attachmentSet.attachments.length) return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
  for (let index = 0; index < intent.attachments.length; index += 1) {
    const attachment = intent.attachments[index]
    if (attachment.kind !== 'managed_file') return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    const resolved = facts.attachmentSet.attachments[index]
    if (resolved.intent !== attachment) return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    if (!attachment.include) continue
    if (!isOpenRouterChatAttachmentAdmissibleV2({ attachment, revision: resolved.revision })) {
      return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    }
  }
  if ((intent.tools.mode === 'enabled') !== (toolRegistry !== null)) return fail('GENERATION_V2_OPENROUTER_CHAT_TOOL_AUTHORITY_REQUIRED')
  if (toolRegistry && stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
      stableSerializeProviderRequestV2(intent.tools.mode === 'enabled' ? intent.tools.allowedToolIds.map((tool) => tool.value) : [])) {
    return fail('GENERATION_V2_OPENROUTER_CHAT_TOOL_AUTHORITY_REQUIRED')
  }
}

function composeOpenRouterChatBinding(
  modelEvidence: ActiveCatalogModelAuthorityV2,
): VerifiedOpenRouterChatBindingAuthorityV2 {
  if (!isActiveCatalogModelAuthorityV2(modelEvidence, 'openrouter')) {
    return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
  }
  modelEvidence.assertCurrent()
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const definition = listReviewedProviderContractDefinitionsV2().find((candidate) =>
    candidate.protocolContractId.value === 'openrouter-chat-completions-v1')
  if (!definition || definition.providerId.value !== 'openrouter' || !definition.operations.includes('text')) {
    return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
  }
  const descriptor = profile.operations.chat_completions.descriptor
  const candidate = Object.freeze({
    credentialScopeId: modelEvidence.credentialScopeId,
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.endpointSetRevision.value,
      descriptors: [{ endpointId: descriptor.endpointId.value, descriptorRevision: descriptor.descriptorRevision.value }] },
    protocolContractId: definition.protocolContractId.value,
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: definition.registryRevision.value,
    modelId: modelEvidence.modelId.value,
    operation: 'text' as const,
  })
  const decodedBinding = decodeProviderBindingRecordV2(candidate)
  verifyProviderContractReferenceV2(candidate)
  const binding: VerifiedOpenRouterChatBindingAuthorityV2 = Object.freeze({
    trust: 'verified_openrouter_chat_binding_v2', binding: decodedBinding, evidence: modelEvidence,
    assertCurrent: () => {
      if (!bindings.has(binding)) return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
      modelEvidence.assertCurrent()
    },
  })
  bindings.add(binding)
  return binding
}

function resolveOpenRouterChatCapabilityRecord(
  binding: VerifiedOpenRouterChatBindingAuthorityV2,
  modelEvidence: ActiveCatalogModelAuthorityV2,
): ResolvedCapabilityV2 {
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const supportedParameters = new Set<string>((modelEvidence.supportedParameters as unknown[])
    .filter((value): value is string => typeof value === 'string'))
  const toolsSupported = supportedParameters.has('tools')
  const supportEvidence = `openrouter.chat.models.${modelEvidence.responseDigest.value}.supports`
  const rejectEvidence = `openrouter.chat.models.${modelEvidence.responseDigest.value}.rejects`
  const inputModalities = new Set<string>((modelEvidence.inputModalities as unknown[])
    .filter((value): value is string => typeof value === 'string'))
  const fields = Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) =>
    field(path, supportedParameters, toolsSupported, inputModalities, supportEvidence, rejectEvidence)))
  return canonicalizeResolvedCapabilityV2({
    ...projectActiveCatalogSnapshotAuthorityV2(modelEvidence),
    binding: projectDecodedProviderBindingRecordV2(binding.binding),
    evidence: [
      { evidenceId: supportEvidence, kind: 'live_probe', effect: 'supports', sourceRef: profile.operations.chat_completions.modelsUrl,
        verifiedAt: new Date(modelEvidence.observedAtMs).toISOString(), contentDigest: modelEvidence.responseDigest.value },
      { evidenceId: rejectEvidence, kind: 'live_probe', effect: 'rejects', sourceRef: profile.operations.chat_completions.modelsUrl,
        verifiedAt: new Date(modelEvidence.observedAtMs).toISOString(), contentDigest: modelEvidence.responseDigest.value },
    ],
    fields,
    continuation: { kind: 'client_managed_native_replay', artifactKind: OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [supportEvidence] },
  })
}

function composeOpenRouterChatSnapshot(
  binding: VerifiedOpenRouterChatBindingAuthorityV2,
  modelEvidence: ActiveCatalogModelAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null = null,
): DecodedRuntimeCapabilitySnapshotV2 {
  const capability = resolveOpenRouterChatCapabilityRecord(binding, modelEvidence)
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2({
    capability,
    resolvedAt: new Date(Math.max(Date.now(), modelEvidence.observedAtMs)).toISOString(),
    tools: toolRegistry?.selectedDefinitions.map((tool) => ({
      toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' as const : 'requires_confirmation' as const,
      sideEffectPolicy: tool.sideEffectPolicy, evidenceIds: [
        tool.sideEffectPolicy === 'none' ? `openrouter.chat.models.${modelEvidence.responseDigest.value}.supports`
          : `openrouter.chat.models.${modelEvidence.responseDigest.value}.supports`,
      ],
    })) ?? [],
  }))
}

/** Command-independent OpenRouter Chat capability resolver. */
export function resolveOpenRouterChatCapabilityV2(
  modelEvidence: ActiveCatalogModelAuthorityV2,
): ResolvedCapabilityV2 {
  const binding = composeOpenRouterChatBinding(modelEvidence)
  return resolveOpenRouterChatCapabilityRecord(binding, modelEvidence)
}

export function withVerifiedOpenRouterChatGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  commandFacts: GenerationCommandFactsAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  use: (authorities: Readonly<{
    binding: VerifiedOpenRouterChatBindingAuthorityV2
    capability: VerifiedOpenRouterChatCapabilityAuthorityV2
  }>) => T
}>): T {
  if (!isActiveCatalogModelAuthorityV2(input.modelEvidence, 'openrouter') ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      (input.toolRegistry !== null && !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context))) {
    return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
  }
  const binding = composeOpenRouterChatBinding(input.modelEvidence)
  const resolvedCapability = resolveOpenRouterChatCapabilityRecord(binding, input.modelEvidence)
  const snapshot = composeOpenRouterChatSnapshot(binding, input.modelEvidence, input.toolRegistry)
  validateIntent(input.commandFacts, input.toolRegistry)
  validateSemanticIntentAgainstResolvedCapabilityV2(
    resolvedCapability,
    input.commandFacts.semanticIntent,
  )
  assertExpectedCapabilityRevisionV2(snapshot.revision.value)
  const capability: VerifiedOpenRouterChatCapabilityAuthorityV2 = Object.freeze({
    trust: 'verified_openrouter_chat_capability_v2', bindingAuthority: binding, resolvedCapability, snapshot,
    assertCurrent: () => {
      if (!capabilities.has(capability)) return fail('GENERATION_V2_OPENROUTER_CHAT_AUTHORITY_INVALID')
      binding.assertCurrent()
    },
  })
  capabilities.add(capability)
  return input.use(Object.freeze({ binding, capability }))
}
