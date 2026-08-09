import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type PersistedRuntimeCapabilitySnapshotV2,
  type RuntimeCapabilitySemanticPathV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  assertActiveCatalogOptionalCapabilitiesV2,
  isActiveCatalogModelAuthorityV2,
  projectActiveCatalogSnapshotAuthorityV2,
  type ActiveCatalogModelAuthorityV2,
} from './activeCatalogModelAuthorityV2Service'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedOpenAIResponsesDefinitionV2,
} from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import {
  isVerifiedProviderContractReferenceV2,
  verifyProviderContractReferenceV2,
  type VerifiedProviderContractReferenceV2,
} from '../../src/next/generation-v2/contracts/providerContractReferenceAuthorityV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from '../../src/next/generation-v2/domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { requiresProviderFileBindingV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import { isOpenAIResponsesEncodedAttachmentIntentV1 } from '../../src/next/generation-v2/providers/openai-responses/responsesIntentProjectionV1'
import {
  readGenerationV2Digest,
  readGenerationV2Identity,
  type GenerationV2Digest,
} from '../../src/next/generation-v2/domain/identityV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import {
  isVerifiedOpenAIResponsesEndpointProfileV2,
  readVerifiedOpenAIResponsesEndpointProfileV2,
} from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  isGenerationCommandFactsAuthorityV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import {
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

export type VerifiedOpenAIResponsesProviderBindingAuthorityV2 = Readonly<{
  trust: 'verified_openai_responses_provider_binding'
  usage: 'runtime_capability_and_snapshot_input_only'
  executionAuthority: 'none'
  binding: DecodedProviderBindingRecordV2
  contractReference: VerifiedProviderContractReferenceV2
  credentialRevision: number
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export type VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_openai_responses_runtime_capability'
  usage: 'snapshot_commit_input_only'
  executionAuthority: 'none'
  bindingAuthority: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  record: PersistedRuntimeCapabilitySnapshotV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  modelCapabilityDigest: GenerationV2Digest<'evidence_digest'>
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export class OpenAIResponsesGenerationAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_OPERATION_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_OPENAI_ATTACHMENT_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_OPENAI_TOOL_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_OPENAI_FIELD_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_OPENAI_UNSUPPORTED_EXPLICIT_FIELD'
    | 'GENERATION_V2_OPENAI_FIELD_VALUE_UNSUPPORTED'
    | 'GENERATION_V2_OPENAI_PROVIDER_EXTENSION_REQUIRED') {
    super(code)
    this.name = 'OpenAIResponsesGenerationAuthorityV2Error'
  }
}

const bindingAuthorities = new WeakSet<object>()
const capabilityAuthorities = new WeakSet<object>()
const OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2 = 'openai.responses.owner.tool_side_effect_confirmation.v1'

export function isVerifiedOpenAIResponsesProviderBindingAuthorityV2(
  value: unknown,
): value is VerifiedOpenAIResponsesProviderBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindingAuthorities.has(value))
}

export function isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(
  value: unknown,
): value is VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilityAuthorities.has(value))
}

export function readVerifiedOpenAIResponsesProviderBindingRecordV2(
  authority: VerifiedOpenAIResponsesProviderBindingAuthorityV2,
): Readonly<Record<string, unknown>> {
  if (!isVerifiedOpenAIResponsesProviderBindingAuthorityV2(authority)) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}

function fail(code: OpenAIResponsesGenerationAuthorityV2Error['code']): never {
  throw new OpenAIResponsesGenerationAuthorityV2Error(code)
}

function evidenceIds(definition: ReturnType<typeof readReviewedOpenAIResponsesDefinitionV2>) {
  const contract = definition.evidence.localArtifacts.find((value) => value.id === 'openai-responses-api-contract-20260715')
  const model = definition.evidence.localArtifacts.find((value) => value.id === 'openai-responses-gpt-5.6-capabilities-20260717')
  if (!contract || !model) return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  return Object.freeze({
    contractSupport: `${contract.id}.supports`, contractReject: `${contract.id}.rejects`,
    modelSupport: `${model.id}.supports`, modelReject: `${model.id}.rejects`,
    contract, model,
  })
}

function composeBinding(modelEvidence: ActiveCatalogModelAuthorityV2) {
  const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
  const definition = readReviewedOpenAIResponsesDefinitionV2()
  if (!isActiveCatalogModelAuthorityV2(modelEvidence, 'openai_responses') ||
      !isVerifiedOpenAIResponsesEndpointProfileV2(profile) ||
      !isReviewedProviderContractDefinitionV2(definition) ||
      definition.providerId.value !== 'openai_responses' ||
      definition.protocolContractId.value !== 'openai-responses-v1' ||
      !definition.operations.includes('text') ||
      modelEvidence.providerId.value !== profile.providerId.value ||
      modelEvidence.endpointProfileId.value !== profile.endpointProfileId.value ||
      modelEvidence.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      modelEvidence.descriptorRevision.value !== profile.descriptor.descriptorRevision.value ||
      modelEvidence.descriptorDigest.value !== profile.descriptor.descriptorDigest.value) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  modelEvidence.assertCurrent()
  const candidate = Object.freeze({
    credentialScopeId: readGenerationV2Identity(modelEvidence.credentialScopeId, 'credential_scope_id'),
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: readGenerationV2Identity(profile.endpointSetRevision, 'endpoint_set_revision'),
      descriptors: [{
        endpointId: readGenerationV2Identity(profile.descriptor.endpointId, 'endpoint_id'),
        descriptorRevision: readGenerationV2Identity(profile.descriptor.descriptorRevision, 'descriptor_revision'),
      }],
    },
    protocolContractId: readGenerationV2Identity(definition.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(definition.contractRevision, 'contract_revision'),
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: readGenerationV2Identity(definition.registryRevision, 'registry_revision'),
    modelId: readGenerationV2Identity(modelEvidence.modelId, 'model_id'),
    operation: 'text' as const,
  })
  const binding = decodeProviderBindingRecordV2(candidate)
  const contractReference = verifyProviderContractReferenceV2(candidate)
  if (!isVerifiedProviderContractReferenceV2(contractReference) || contractReference.reviewedDefinition !== definition) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  const authority: VerifiedOpenAIResponsesProviderBindingAuthorityV2 = Object.freeze({
    trust: 'verified_openai_responses_provider_binding',
    usage: 'runtime_capability_and_snapshot_input_only', executionAuthority: 'none',
    binding, contractReference, credentialRevision: modelEvidence.credentialRevision,
    modelEvidenceRevision: modelEvidence.modelsResponseRevision,
    assertCurrent: () => {
      if (!bindingAuthorities.has(authority) || !isActiveCatalogModelAuthorityV2(modelEvidence, 'openai_responses')) {
        return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
      }
      modelEvidence.assertCurrent()
    },
  })
  bindingAuthorities.add(authority)
  return authority
}

function field(
  path: RuntimeCapabilitySemanticPathV2,
  ids: ReturnType<typeof evidenceIds>,
  maxOutputTokens: number,
  toolsEnabled: boolean,
): PersistedRuntimeCapabilityFieldV2 {
  const supported = (domain: NonNullable<PersistedRuntimeCapabilityFieldV2['domain']>, model = false) => Object.freeze({
    path, state: 'supported' as const, domain, constraints: Object.freeze([]),
    evidenceIds: Object.freeze([model ? ids.modelSupport : ids.contractSupport]),
  })
  const unsupported = (model = false) => Object.freeze({
    path, state: 'unsupported' as const, constraints: Object.freeze([]),
    evidenceIds: Object.freeze([model ? ids.modelReject : ids.contractReject]),
  })
  const unavailable = () => Object.freeze({
    path, state: 'unavailable' as const, constraints: Object.freeze([]), evidenceIds: Object.freeze([]),
  })
  switch (path) {
    case 'attachments[].kind': return supported({ kind: 'enum', values: Object.freeze(['managed_file', 'url_reference']) })
    case 'attachments[].referenceId':
    case 'attachments[].referenceRevision':
    case 'attachments[].originalUrl':
    case 'attachments[].urlDigest': return unsupported()
    case 'attachments[].mediaKind': return supported({ kind: 'enum', values: Object.freeze(['image']) })
    case 'attachments[].declaredMediaType':
    case 'attachments[].capturedAtMs':
    case 'attachments[].provenance': return unsupported()
    case 'attachments[].assetId':
    case 'attachments[].assetRevisionId':
    case 'attachments[].assetSha256': return supported({ kind: 'identity' })
    case 'attachments[].conversion': return supported({ kind: 'enum', values: Object.freeze(['none']) })
    case 'attachments[].include': return supported({ kind: 'boolean' })
    case 'attachments[].sendAs': return supported({ kind: 'enum', values: Object.freeze(['provider_file', 'url_reference']) })
    case 'generation.maxOutputTokens': return supported({ kind: 'range', min: 1, max: maxOutputTokens, integer: true }, true)
    case 'generation.temperature':
    case 'generation.topP': return unavailable()
    case 'image.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'generate']) }, true)
    case 'image.background': return supported({ kind: 'enum', values: Object.freeze(['auto', 'transparent', 'opaque']) }, true)
    case 'image.format': return supported({ kind: 'enum', values: Object.freeze(['png', 'jpeg', 'webp']) }, true)
    case 'image.quality': return supported({ kind: 'enum', values: Object.freeze(['auto', 'low', 'medium', 'high']) }, true)
    case 'image.size': return supported({ kind: 'dimensions', minWidth: 1024, maxWidth: 1536, minHeight: 1024, maxHeight: 1536 }, true)
    case 'image.aspectRatio':
    case 'image.outputCompression':
    case 'image.resolution':
    case 'image.stream': return unsupported(true)
    case 'providerExtension.kind': return supported({ kind: 'enum', values: Object.freeze(['none', 'openai_responses']) })
    case 'providerExtension.maxToolCalls': return supported({ kind: 'range', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true })
    case 'providerExtension.parallelToolCalls': return supported({ kind: 'boolean' })
    case 'providerExtension.reasoningContext': return supported({ kind: 'enum', values: Object.freeze(['auto', 'current_turn', 'all_turns']) })
    case 'providerExtension.reasoningMode': return supported({ kind: 'enum', values: Object.freeze(['standard', 'pro']) })
    case 'providerExtension.serviceTier': return supported({ kind: 'enum', values: Object.freeze(['auto', 'default', 'flex', 'priority']) })
    case 'providerExtension.verbosity': return supported({ kind: 'enum', values: Object.freeze(['low', 'medium', 'high']) }, true)
    case 'reasoning.effort': return supported({ kind: 'enum', values: Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']) }, true)
    case 'reasoning.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'enabled']) }, true)
    case 'reasoning.summary': return supported({ kind: 'enum', values: Object.freeze(['auto', 'concise', 'detailed']) })
    case 'tools.allowedToolIds': return toolsEnabled
      ? supported({ kind: 'identity_list', maxItems: 128 }) : unavailable()
    case 'tools.sideEffectConfirmation': return toolsEnabled ? Object.freeze({
      path, state: 'requires_confirmation',
      domain: Object.freeze({ kind: 'enum' as const, values: Object.freeze(['required_each_retry']) }),
      constraints: Object.freeze([]), evidenceIds: Object.freeze([OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2]),
    }) : unavailable()
    case 'tools.toolChoice': return toolsEnabled
      ? supported({ kind: 'enum', values: Object.freeze(['omitted', 'auto', 'none', 'required', 'named']) })
      : unavailable()
    case 'tools.mode': return supported({ kind: 'enum', values: Object.freeze(toolsEnabled
      ? ['disabled', 'enabled'] : ['disabled']) })
    case 'web.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'provider_search']) }, true)
    case 'web.types': return supported({ kind: 'enum_list', values: Object.freeze(['web']), maxItems: 1 }, true)
    case 'web.searchContextSize': return supported({ kind: 'enum', values: Object.freeze(['low', 'medium', 'high']) })
    case 'web.allowedDomains': return supported({ kind: 'string_list', maxItems: 100, maxItemLength: 253 })
    default: return unsupported()
  }
}

function domainContains(field: PersistedRuntimeCapabilityFieldV2, value: unknown): boolean {
  const domain = field.domain
  if (!domain) return false
  if (domain.kind === 'enum') return domain.values.includes(value as never)
  if (domain.kind === 'range') return typeof value === 'number' && value >= domain.min && value <= domain.max &&
    (!domain.integer || Number.isSafeInteger(value))
  if (domain.kind === 'boolean') return typeof value === 'boolean'
  if (domain.kind === 'enum_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((entry) => domain.values.includes(entry as never))
  if (domain.kind === 'string_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= domain.maxItemLength)
  if (domain.kind === 'dimensions') return Boolean(value && typeof value === 'object' &&
    Number.isSafeInteger((value as { width?: unknown }).width) && Number.isSafeInteger((value as { height?: unknown }).height) &&
    (value as { width: number }).width >= domain.minWidth && (value as { width: number }).width <= domain.maxWidth &&
    (value as { height: number }).height >= domain.minHeight && (value as { height: number }).height <= domain.maxHeight)
  return true
}

function validateIntent(
  commandFacts: GenerationCommandFactsAuthorityV2,
  fields: readonly PersistedRuntimeCapabilityFieldV2[],
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
): void {
  const intent = commandFacts.semanticIntent
  if (intent.attachments.some((attachment) => attachment.include && !isOpenAIResponsesEncodedAttachmentIntentV1(attachment)) ||
      commandFacts.attachmentSet.attachments.length !== intent.attachments.length ||
      commandFacts.attachmentSet.requiresProviderFileAuthority !==
        intent.attachments.some(requiresProviderFileBindingV2)) {
    return fail('GENERATION_V2_OPENAI_ATTACHMENT_CAPABILITY_UNAVAILABLE')
  }
  if (intent.tools.mode === 'disabled' ? toolRegistry !== null : toolRegistry === null) {
    return fail('GENERATION_V2_OPENAI_TOOL_CAPABILITY_UNAVAILABLE')
  }
  const explicit = new Map<string, unknown>([
    ...Object.entries(intent.generation).map(([key, value]) => [`generation.${key}`, value] as const),
    ['reasoning.mode', intent.reasoning.mode],
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.effort !== undefined ? [['reasoning.effort', intent.reasoning.effort] as const] : []),
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.summary !== undefined ? [['reasoning.summary', intent.reasoning.summary] as const] : []),
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.exclude !== undefined ? [['reasoning.exclude', intent.reasoning.exclude] as const] : []),
    ['web.mode', intent.web.mode],
    ...(intent.web.mode === 'provider_search' ? [
      ['web.types', intent.web.types] as const,
      ...Object.entries(intent.web)
        .filter(([key, value]) => key !== 'mode' && key !== 'types' && value !== undefined)
        .map(([key, value]) => [`web.${key}`, value] as const),
    ] : []),
    ['image.mode', intent.image.mode],
    ...(intent.image.mode === 'generate' ? Object.entries(intent.image)
      .filter(([key, value]) => key !== 'mode' && value !== undefined)
      .map(([key, value]) => [`image.${key}`, value] as const) : []),
    ['tools.mode', intent.tools.mode],
    ...(intent.tools.mode === 'enabled' ? [
      ['tools.allowedToolIds', intent.tools.allowedToolIds.map((tool) => tool.value)] as const,
      ['tools.sideEffectConfirmation', intent.tools.sideEffectConfirmation] as const,
      ['tools.toolChoice', intent.tools.toolChoice.mode] as const,
    ] : []),
    ['providerExtension.kind', intent.providerExtension.kind],
    ...(intent.providerExtension.kind === 'openai_responses' ? Object.entries(intent.providerExtension)
      .filter(([key, value]) => key !== 'kind' && value !== undefined)
      .map(([key, value]) => [`providerExtension.${key}`, value] as const) : []),
  ])
  const byPath = new Map(fields.map((value) => [value.path, value]))
  for (const [path, value] of explicit) {
    const capability = byPath.get(path as RuntimeCapabilitySemanticPathV2)
    if (!capability || capability.state === 'unsupported') return fail('GENERATION_V2_OPENAI_UNSUPPORTED_EXPLICIT_FIELD')
    if (capability.state === 'unavailable') return fail('GENERATION_V2_OPENAI_FIELD_CAPABILITY_UNAVAILABLE')
    if (capability.domain?.kind === 'identity_list') {
      if (!Array.isArray(value) || value.length === 0 || value.length > capability.domain.maxItems ||
          value.some((item) => typeof item !== 'string')) return fail('GENERATION_V2_OPENAI_FIELD_VALUE_UNSUPPORTED')
    } else if (!domainContains(capability, value)) return fail('GENERATION_V2_OPENAI_FIELD_VALUE_UNSUPPORTED')
  }
  if (intent.image.mode === 'generate' && intent.image.size &&
      ![[1024, 1024], [1024, 1536], [1536, 1024]].some(([width, height]) =>
        intent.image.mode === 'generate' && intent.image.size?.width === width && intent.image.size.height === height)) {
    return fail('GENERATION_V2_OPENAI_FIELD_VALUE_UNSUPPORTED')
  }
}

function composeCapability(input: Readonly<{
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  commandFacts: GenerationCommandFactsAuthorityV2
  resolvedAt: string
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 {
  input.binding.assertCurrent()
  const definition = readReviewedOpenAIResponsesDefinitionV2()
  const ids = evidenceIds(definition)
  const verifiedAt = `${definition.evidence.verifiedAt}T00:00:00.000Z`
  const evidence = Object.freeze([
    ...([ids.contractSupport, ids.contractReject] as const).map((evidenceId, index) => Object.freeze({
      evidenceId, kind: 'official_documentation' as const, effect: index === 0 ? 'supports' as const : 'rejects' as const,
      sourceRef: definition.evidence.provenanceUrls[0], verifiedAt, contentDigest: ids.contract.sha256,
    })),
    ...([ids.modelSupport, ids.modelReject] as const).map((evidenceId, index) => Object.freeze({
      evidenceId, kind: 'official_documentation' as const, effect: index === 0 ? 'supports' as const : 'rejects' as const,
      sourceRef: `https://developers.openai.com/api/docs/models/${input.modelEvidence.modelCapability.capability.family}`,
      verifiedAt, contentDigest: ids.model.sha256,
    })),
    Object.freeze({
      evidenceId: `openai.responses.models.visibility.${input.modelEvidence.modelsResponseDigest.value}`,
      kind: 'live_probe' as const, effect: 'supports' as const,
      sourceRef: input.modelEvidence.modelsResponseRevision,
      verifiedAt: new Date(input.modelEvidence.observedAtMs).toISOString(),
      contentDigest: input.modelEvidence.modelsResponseDigest.value,
    }),
    Object.freeze({
      evidenceId: OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2,
      kind: 'contract_invariant' as const, effect: 'requires_confirmation' as const,
      sourceRef: 'docs/architecture/generation-compiler-v2/generation-compiler-v2-final-plan.md',
      verifiedAt, contentDigest: ids.contract.sha256,
    }),
  ])
  const fields = Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) =>
    field(path, ids, input.modelEvidence.modelCapability.capability.maxOutputTokens, input.toolRegistry !== null)))
  validateIntent(input.commandFacts, fields, input.toolRegistry)
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2, resolvedAt: input.resolvedAt,
    ...projectActiveCatalogSnapshotAuthorityV2(input.modelEvidence),
    binding: projectDecodedProviderBindingRecordV2(input.binding.binding), evidence, fields,
    tools: input.toolRegistry?.selectedDefinitions.map((tool) => ({
      toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' : 'requires_confirmation',
      sideEffectPolicy: tool.sideEffectPolicy, evidenceIds: [tool.sideEffectPolicy === 'none'
        ? ids.contractSupport : OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2],
    })) ?? [],
    continuation: {
      kind: 'client_managed_native_replay', artifactKind: OPENAI_RESPONSES_ARTIFACT_KIND_V2,
      supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [ids.contractSupport],
    },
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.binding)) !==
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.binding.binding))) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  const authority: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 = Object.freeze({
    trust: 'verified_openai_responses_runtime_capability', usage: 'snapshot_commit_input_only', executionAuthority: 'none',
    bindingAuthority: input.binding, record, snapshot,
    modelCapabilityDigest: input.modelEvidence.modelCapability.capabilityEvidenceDigest,
    modelEvidenceRevision: input.modelEvidence.modelsResponseRevision,
    assertCurrent: () => {
      if (!capabilityAuthorities.has(authority) || !isVerifiedOpenAIResponsesProviderBindingAuthorityV2(input.binding)) {
        return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
      }
      input.binding.assertCurrent()
    },
  })
  capabilityAuthorities.add(authority)
  return authority
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function')
}

export function withVerifiedOpenAIResponsesGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  commandFacts: GenerationCommandFactsAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  operation: 'text'
  use: (authorities: Readonly<{
    binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
    capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
  }>) => T extends PromiseLike<unknown> ? never : T
}>): T {
  if (!isActiveCatalogModelAuthorityV2(input.modelEvidence, 'openai_responses') ||
      !isGenerationCommandFactsAuthorityV2(input.commandFacts) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.operation !== 'text' || typeof input.use !== 'function' ||
      (input.toolRegistry !== null &&
        !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context)) ||
      (input.commandFacts.semanticIntent.tools.mode === 'disabled'
        ? input.toolRegistry !== null : input.toolRegistry === null)) {
    return fail(input.operation !== 'text'
      ? 'GENERATION_V2_OPENAI_OPERATION_AUTHORITY_REQUIRED'
      : 'GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  const resolvedAtMs = Date.now()
  assertActiveCatalogOptionalCapabilitiesV2(input.modelEvidence, input.commandFacts.semanticIntent)
  if (!Number.isSafeInteger(resolvedAtMs) || resolvedAtMs < input.modelEvidence.observedAtMs) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  let binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2 | undefined
  let capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 | undefined
  let registered = false
  let completed = false
  try {
    binding = composeBinding(input.modelEvidence)
    capability = composeCapability({
      binding, modelEvidence: input.modelEvidence, commandFacts: input.commandFacts,
      resolvedAt: new Date(resolvedAtMs).toISOString(), toolRegistry: input.toolRegistry,
    })
    const revoke = () => {
      if (capability) capabilityAuthorities.delete(capability)
      if (binding) bindingAuthorities.delete(binding)
    }
    registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
      preCommit: () => {
        if (!completed) return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
        capability?.assertCurrent()
        binding?.assertCurrent()
      },
      committed: revoke, rolledBack: revoke,
    })
    registered = true
    const result = input.use(Object.freeze({ binding, capability }))
    if (isPromiseLike(result)) return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
    capability.assertCurrent()
    completed = true
    return result
  } finally {
    if (!registered || !completed) {
      if (capability) capabilityAuthorities.delete(capability)
      if (binding) bindingAuthorities.delete(binding)
    }
  }
}
