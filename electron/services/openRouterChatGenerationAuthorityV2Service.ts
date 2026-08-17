import {
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type RuntimeCapabilitySemanticPathV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  canonicalizeResolvedCapabilityV2,
  runtimeSnapshotRecordFromResolvedCapabilityV2,
  validateSemanticIntentAgainstResolvedCapabilityV2,
  type ResolvedCapabilityV2,
} from '../../src/next/generation-v2/capability/resolvedCapabilityV2'
import { credentialRevisionEvidenceV2 } from '../../src/next/generation-v2/capability/credentialRevisionEvidenceV2'
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
    | 'GENERATION_V2_OPENROUTER_CHAT_EXPLICIT_FIELD_UNSUPPORTED'
    | 'GENERATION_V2_OPENROUTER_CHAT_FIELD_VALUE_UNSUPPORTED'
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

function domainContains(fieldValue: PersistedRuntimeCapabilityFieldV2, value: unknown): boolean {
  const domain = fieldValue.domain
  if (!domain) return false
  if (domain.kind === 'response_format') {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).type === 'string' &&
      domain.types.includes((value as Record<string, unknown>).type as 'text' | 'json_object' | 'json_schema'))
  }
  if (domain.kind === 'enum') return domain.values.includes(value as never)
  if (domain.kind === 'range') return typeof value === 'number' && value >= domain.min && value <= domain.max && (!domain.integer || Number.isSafeInteger(value))
  if (domain.kind === 'string_list') return Array.isArray(value) && value.length <= domain.maxItems && value.every((item) => typeof item === 'string' && item.length <= domain.maxItemLength)
  if (domain.kind === 'approximate_location') return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length > 0 && Object.keys(value).every((key) => ['city', 'region', 'country', 'timezone'].includes(key)) &&
    Object.values(value).every((item) => typeof item === 'string' && item.length > 0 && item.length <= domain.maxFieldLength))
  if (domain.kind === 'enum_list') return Array.isArray(value) && value.length <= domain.maxItems && value.every((item) => domain.values.includes(item as never))
  if (domain.kind === 'identity_list') return Array.isArray(value) && value.length > 0 && value.length <= domain.maxItems
  return true
}

/**
 * The DFC projection can only offer a representation that the selected
 * OpenRouter Chat model can actually encode. Keep this check adjacent to the
 * command authority rather than trusting renderer option state.
 */
export function isOpenRouterChatAttachmentAdmissibleV2(input: Readonly<{
  attachment: ManagedFileAttachmentIntentV2
  revision: AttachmentAssetRevisionRepositoryFactV2
  inputModalities: ReadonlySet<string>
}>): boolean {
  const { attachment, revision, inputModalities } = input
  return attachment.sendAs === 'image_reference' && attachment.conversion === 'none' &&
    revision.assetKind === 'image' && revision.blob.mime.startsWith('image/') && inputModalities.has('image') ||
    attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text' &&
    revision.revisionKind === 'derived' && revision.conversionKind === 'plain_text' &&
    revision.assetKind === 'file' && revision.blob.mime.startsWith('text/') ||
    attachment.sendAs === 'provider_file' && attachment.conversion === 'none' &&
    revision.revisionKind === 'source' && revision.blob.mime === 'application/pdf' && inputModalities.has('file') ||
    attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf' &&
    revision.revisionKind === 'derived' && revision.conversionKind === 'pdf' &&
    revision.blob.mime === 'application/pdf' && inputModalities.has('file')
}

function validateIntent(
  facts: GenerationCommandFactsAuthorityV2,
  fields: readonly PersistedRuntimeCapabilityFieldV2[],
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
  modelEvidence: ActiveCatalogModelAuthorityV2,
): void {
  const intent = facts.semanticIntent
  if (intent.attachments.length !== facts.attachmentSet.attachments.length) return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
  const inputModalities = new Set<string>((modelEvidence.inputModalities as unknown[])
    .filter((value): value is string => typeof value === 'string'))
  for (let index = 0; index < intent.attachments.length; index += 1) {
    const attachment = intent.attachments[index]
    if (attachment.kind !== 'managed_file') return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    const resolved = facts.attachmentSet.attachments[index]
    if (resolved.intent !== attachment) return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    if (!attachment.include) continue
    if (!isOpenRouterChatAttachmentAdmissibleV2({ attachment, revision: resolved.revision, inputModalities })) {
      return fail('GENERATION_V2_OPENROUTER_CHAT_ATTACHMENT_UNAVAILABLE')
    }
  }
  if ((intent.tools.mode === 'enabled') !== (toolRegistry !== null)) return fail('GENERATION_V2_OPENROUTER_CHAT_TOOL_AUTHORITY_REQUIRED')
  if (toolRegistry && stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
      stableSerializeProviderRequestV2(intent.tools.mode === 'enabled' ? intent.tools.allowedToolIds.map((tool) => tool.value) : [])) {
    return fail('GENERATION_V2_OPENROUTER_CHAT_TOOL_AUTHORITY_REQUIRED')
  }
  if (intent.image.mode !== 'disabled' ||
      intent.providerExtension.kind !== 'none' && intent.providerExtension.kind !== 'openrouter_chat') {
    return fail('GENERATION_V2_OPENROUTER_CHAT_EXPLICIT_FIELD_UNSUPPORTED')
  }
  const explicit = new Map<string, unknown>([
    ...intent.attachments.flatMap((attachment) => [
      ['attachments[].kind', attachment.kind] as const,
      ...(attachment.kind === 'managed_file' ? [
        ['attachments[].assetId', attachment.assetId.value] as const,
        ['attachments[].assetRevisionId', attachment.assetRevisionId.value] as const,
        ['attachments[].assetSha256', attachment.assetSha256.value] as const,
      ] : [
        ['attachments[].referenceId', attachment.referenceId.value] as const,
        ['attachments[].referenceRevision', attachment.referenceRevision.value] as const,
        ['attachments[].urlDigest', attachment.urlDigest.value] as const,
        ['attachments[].mediaKind', attachment.mediaKind] as const,
        ['attachments[].originalUrl', attachment.originalUrl] as const,
      ]),
      ['attachments[].include', attachment.include] as const,
      ['attachments[].conversion', attachment.conversion] as const,
      ['attachments[].sendAs', attachment.sendAs] as const,
    ]),
    ...Object.entries(intent.generation).map(([key, value]) => [`generation.${key}`, value] as const),
    ['reasoning.mode', intent.reasoning.mode],
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.effort !== undefined ? [['reasoning.effort', intent.reasoning.effort] as const] : []),
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.exclude !== undefined ? [['reasoning.exclude', intent.reasoning.exclude] as const] : []),
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.summary !== undefined ? [['reasoning.summary', intent.reasoning.summary] as const] : []),
    ['web.mode', intent.web.mode],
    ...(intent.web.mode === 'provider_search' ? [
      ['web.types', intent.web.types] as const,
      ...Object.entries(intent.web)
        .filter(([key, value]) => key !== 'mode' && key !== 'types' && value !== undefined)
        .map(([key, value]) => [`web.${key}`, value] as const),
    ] : []),
    ['tools.mode', intent.tools.mode],
    ...(intent.tools.mode === 'enabled' ? [
      ['tools.allowedToolIds', intent.tools.allowedToolIds.map((tool) => tool.value)] as const,
      ['tools.toolChoice', intent.tools.toolChoice.mode] as const,
      ['tools.sideEffectConfirmation', intent.tools.sideEffectConfirmation] as const,
    ] : []),
    ['image.mode', intent.image.mode], ['providerExtension.kind', intent.providerExtension.kind],
    ...(intent.providerExtension.kind === 'openrouter_chat' ? [
      ...(intent.providerExtension.verbosity === undefined ? [] : [['providerExtension.verbosity', intent.providerExtension.verbosity] as const]),
      ...(intent.providerExtension.parallelToolCalls === undefined ? [] : [['providerExtension.parallelToolCalls', intent.providerExtension.parallelToolCalls] as const]),
      ...(intent.providerExtension.responseFormat === undefined ? [] : [['providerExtension.responseFormat', intent.providerExtension.responseFormat] as const]),
    ] : []),
  ])
  const byPath = new Map(fields.map((item) => [item.path, item]))
  for (const [path, value] of explicit) {
    const capability = byPath.get(path as RuntimeCapabilitySemanticPathV2)
    if (!capability || capability.state === 'unsupported' || capability.state === 'missing' || capability.state === 'unknown') {
      return fail('GENERATION_V2_OPENROUTER_CHAT_EXPLICIT_FIELD_UNSUPPORTED')
    }
    if (!domainContains(capability, value)) return fail('GENERATION_V2_OPENROUTER_CHAT_FIELD_VALUE_UNSUPPORTED')
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
      credentialRevisionEvidenceV2({ credentialRevision: modelEvidence.credentialRevision,
        verifiedAt: new Date(modelEvidence.observedAtMs).toISOString() }),
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
  const fields = snapshot.fields
  validateIntent(input.commandFacts, fields, input.toolRegistry, input.modelEvidence)
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
