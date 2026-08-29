import {
  decodeRuntimeCapabilitySnapshotV2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilitySnapshotV2,
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
import {
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
import { isOpenAIResponsesEncodedAttachmentV1 } from '../../src/next/generation-v2/providers/openai-responses/responsesRequestV1'
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
import {
  applyCapabilityRuleProjectionV2,
  assertCapabilityRuleProjectionIdentityV2,
  type CapabilityRuleProjectionV2,
} from '../../src/next/generation-v2/capability-rules/capabilityRuleV2'

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
  resolvedCapability: ResolvedCapabilityV2
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
    | 'GENERATION_V2_OPENAI_TOOL_CAPABILITY_UNAVAILABLE') {
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
  if (!contract) return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  return Object.freeze({
    contractSupport: `${contract.id}.supports`, contractReject: `${contract.id}.rejects`,
    contract,
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
  liveSupportEvidenceId: string,
): PersistedRuntimeCapabilityFieldV2 {
  const supported = (domain: NonNullable<PersistedRuntimeCapabilityFieldV2['domain']>, evidenceId: string = ids.contractSupport) => Object.freeze({
    path, state: 'supported' as const, domain, constraints: Object.freeze([]),
    evidenceIds: Object.freeze([evidenceId]),
  })
  const unsupported = () => Object.freeze({
    path, state: 'unsupported' as const, constraints: Object.freeze([]),
    evidenceIds: Object.freeze([ids.contractReject]),
  })
  const unavailable = () => Object.freeze({
    path, state: 'missing' as const, constraints: Object.freeze([]), evidenceIds: Object.freeze([]),
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
    case 'generation.maxOutputTokens': return supported({ kind: 'range', min: 1, max: maxOutputTokens, integer: true }, liveSupportEvidenceId)
    case 'generation.temperature':
    case 'generation.topP': return unavailable()
    case 'image.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'generate']) })
    case 'image.background': return supported({ kind: 'enum', values: Object.freeze(['auto', 'transparent', 'opaque']) })
    case 'image.format': return supported({ kind: 'enum', values: Object.freeze(['png', 'jpeg', 'webp']) })
    case 'image.quality': return supported({ kind: 'enum', values: Object.freeze(['auto', 'low', 'medium', 'high']) })
    case 'image.size': return unavailable()
    case 'image.aspectRatio':
    case 'image.outputCompression':
    case 'image.resolution':
    case 'image.stream': return unsupported()
    case 'providerExtension.kind': return supported({ kind: 'enum', values: Object.freeze(['none', 'openai_responses']) })
    case 'providerExtension.maxToolCalls': return supported({ kind: 'range', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true })
    case 'providerExtension.parallelToolCalls': return supported({ kind: 'boolean' })
    case 'providerExtension.reasoningContext':
    case 'providerExtension.reasoningMode': return unavailable()
    case 'providerExtension.serviceTier': return supported({ kind: 'enum', values: Object.freeze(['auto', 'default', 'flex', 'priority']) })
    case 'providerExtension.verbosity':
    case 'reasoning.effort':
    case 'reasoning.summary': return unavailable()
    case 'reasoning.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled']) })
    case 'tools.allowedToolIds': return supported({ kind: 'identity_list', maxItems: 128 })
    case 'tools.sideEffectConfirmation': return Object.freeze({
      path, state: 'requires_confirmation',
      domain: Object.freeze({ kind: 'enum' as const, values: Object.freeze(['required_each_retry']) }),
      constraints: Object.freeze([]), evidenceIds: Object.freeze([OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2]),
    })
    case 'tools.toolChoice': return supported({ kind: 'enum', values: Object.freeze(['omitted', 'auto', 'none', 'required', 'named']) })
    case 'tools.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled', 'enabled']) })
    case 'web.mode': return supported({ kind: 'enum', values: Object.freeze(['disabled']) })
    case 'web.types':
    case 'web.searchContextSize':
    case 'web.allowedDomains': return unavailable()
    default: return unsupported()
  }
}

function validateIntent(
  commandFacts: GenerationCommandFactsAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
): void {
  const intent = commandFacts.semanticIntent
  if (intent.attachments.some((attachment) => attachment.include && !isOpenAIResponsesEncodedAttachmentV1(attachment)) ||
      commandFacts.attachmentSet.attachments.length !== intent.attachments.length ||
      commandFacts.attachmentSet.requiresProviderFileAuthority !==
        intent.attachments.some(requiresProviderFileBindingV2)) {
    return fail('GENERATION_V2_OPENAI_ATTACHMENT_CAPABILITY_UNAVAILABLE')
  }
  if (intent.tools.mode === 'disabled' ? toolRegistry !== null : toolRegistry === null) {
    return fail('GENERATION_V2_OPENAI_TOOL_CAPABILITY_UNAVAILABLE')
  }
}

/**
 * `disabled` means the caller omits the optional OpenAI reasoning object. That
 * is an API-contract authorization, not a model fact. Capability Rules only
 * prove the model-side `enabled` state; this projection combines both facts
 * for the final UI/preflight domain without adding `disabled` to the rule.
 */
function projectOpenAIResponsesReasoningModeAuthorizationV2(
  input: ReturnType<typeof applyCapabilityRuleProjectionV2>,
  ids: ReturnType<typeof evidenceIds>,
): ReturnType<typeof applyCapabilityRuleProjectionV2> {
  const mode = input.fields.find((item) => item.path === 'reasoning.mode')
  if (mode?.state !== 'supported' || mode.domain?.kind !== 'enum' ||
      !mode.domain.values.includes('enabled')) return input
  const authorizedMode = Object.freeze({ ...mode,
    domain: Object.freeze({ kind: 'enum' as const, values: Object.freeze(['disabled', 'enabled']) }),
    evidenceIds: Object.freeze([...new Set([ids.contractSupport, ...mode.evidenceIds])].sort()),
  })
  return Object.freeze({ evidence: input.evidence,
    fields: Object.freeze(input.fields.map((item) => item.path === 'reasoning.mode' ? authorizedMode : item)) })
}

function composeCapability(input: Readonly<{
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  commandFacts?: GenerationCommandFactsAuthorityV2
  resolvedAt: string
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  capabilityRules: CapabilityRuleProjectionV2
}>): VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 {
  input.binding.assertCurrent()
  const definition = readReviewedOpenAIResponsesDefinitionV2()
  const ids = evidenceIds(definition)
  const verifiedAt = `${definition.evidence.verifiedAt}T00:00:00.000Z`
  const visibilityEvidenceId = `openai.responses.models.visibility.${input.modelEvidence.modelsResponseDigest.value}`
  const baseEvidence = Object.freeze([
    ...([ids.contractSupport, ids.contractReject] as const).map((evidenceId, index) => Object.freeze({
      evidenceId, kind: 'official_documentation' as const, effect: index === 0 ? 'supports' as const : 'rejects' as const,
      sourceRef: definition.evidence.provenanceUrls[0], verifiedAt, contentDigest: ids.contract.sha256,
    })),
    Object.freeze({
      evidenceId: visibilityEvidenceId,
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
  assertCapabilityRuleProjectionIdentityV2(input.capabilityRules, {
    providerId: input.binding.binding.providerId.value,
    endpointProfileId: input.binding.binding.endpointProfileId.value,
    nativeModelId: input.binding.binding.modelId.value,
  })
  const ruleResolved = applyCapabilityRuleProjectionV2({ baseEvidence,
    baseFields: Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) =>
      field(path, ids, input.modelEvidence.modelCapability.capability.maxOutputTokens, visibilityEvidenceId))),
    projection: input.capabilityRules })
  const merged = projectOpenAIResponsesReasoningModeAuthorizationV2(ruleResolved, ids)
  if (input.commandFacts) validateIntent(input.commandFacts, input.toolRegistry)
  const continuation = {
    kind: 'client_managed_native_replay' as const, artifactKind: OPENAI_RESPONSES_ARTIFACT_KIND_V2,
    supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [ids.contractSupport],
  }
  const resolvedCapability = canonicalizeResolvedCapabilityV2({
    ...projectActiveCatalogSnapshotAuthorityV2(input.modelEvidence),
    binding: projectDecodedProviderBindingRecordV2(input.binding.binding), evidence: merged.evidence, fields: merged.fields,
    continuation,
  })
  const record = runtimeSnapshotRecordFromResolvedCapabilityV2({
    capability: resolvedCapability, resolvedAt: input.resolvedAt,
    tools: input.toolRegistry?.selectedDefinitions.map((tool) => ({
      toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' : 'requires_confirmation',
      sideEffectPolicy: tool.sideEffectPolicy, evidenceIds: [tool.sideEffectPolicy === 'none'
        ? ids.contractSupport : OPENAI_RESPONSES_TOOL_SIDE_EFFECT_POLICY_EVIDENCE_V2],
    })) ?? [],
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.binding)) !==
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.binding.binding))) {
    return fail('GENERATION_V2_OPENAI_GENERATION_AUTHORITY_INVALID')
  }
  const authority: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2 = Object.freeze({
    trust: 'verified_openai_responses_runtime_capability', usage: 'snapshot_commit_input_only', executionAuthority: 'none',
    bindingAuthority: input.binding, resolvedCapability, record, snapshot,
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

/** Command-independent capability projection shared by UI and send paths. */
export function resolveOpenAIResponsesCapabilityV2(
  modelEvidence: ActiveCatalogModelAuthorityV2,
  capabilityRules: CapabilityRuleProjectionV2,
): ResolvedCapabilityV2 {
  const binding = composeBinding(modelEvidence)
  return composeCapability({
    binding,
    modelEvidence,
    resolvedAt: new Date(Math.max(Date.now(), modelEvidence.observedAtMs)).toISOString(),
    toolRegistry: null, capabilityRules,
  }).resolvedCapability
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
  capabilityRules: CapabilityRuleProjectionV2
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
      capabilityRules: input.capabilityRules,
    })
    validateSemanticIntentAgainstResolvedCapabilityV2(
      capability.resolvedCapability,
      input.commandFacts.semanticIntent,
    )
    assertExpectedCapabilityRevisionV2(capability.snapshot.revision.value)
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
