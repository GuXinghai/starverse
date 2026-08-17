import { createHash } from 'node:crypto'
import {
  isActiveCatalogModelAuthorityV2,
  projectActiveCatalogSnapshotAuthorityV2,
  type ActiveCatalogModelAuthorityV2,
} from './activeCatalogModelAuthorityV2Service'
import {
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type PersistedRuntimeCapabilitySnapshotV2,
  type RuntimeCapabilityDomainV2,
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
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedGeminiGenerateContentDefinitionV2,
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
import { readGenerationV2Digest, readGenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import { GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1 } from '../../src/next/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import {
  GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2,
  GEMINI_GENERATE_CONTENT_TOOL_CONFIRMATION_EVIDENCE_ID_V2,
  hasReviewedGeminiGenerateContentReasoningWebCapabilityV2,
  hasReviewedGeminiGenerateContentToolCapabilityV2,
} from '../../src/next/generation-v2/providers/gemini/toolCapabilityPolicyV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isVerifiedGeminiDeveloperApiEndpointProfileV2,
  readVerifiedGeminiDeveloperApiEndpointProfileV2,
} from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  isGenerationCommandFactsAuthorityV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import { resolveGeminiThinkingCapability, type GeminiThinkingCapability } from '../../src/next/provider/gemini/geminiThinkingPolicy'

export type VerifiedGeminiGenerateContentProviderBindingAuthorityV2 = Readonly<{
  trust: 'verified_gemini_generate_content_provider_binding'
  usage: 'runtime_capability_and_snapshot_input_only'
  executionAuthority: 'none'
  binding: DecodedProviderBindingRecordV2
  contractReference: VerifiedProviderContractReferenceV2
  credentialRevision: number
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export type VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_gemini_generate_content_runtime_capability'
  usage: 'snapshot_commit_input_only'
  executionAuthority: 'none'
  bindingAuthority: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
  resolvedCapability: ResolvedCapabilityV2
  record: PersistedRuntimeCapabilitySnapshotV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  assertCurrent(): void
}>

export class GeminiGenerateContentGenerationAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID'
    | 'GENERATION_V2_GEMINI_INTENT_UNSUPPORTED'
    | 'GENERATION_V2_GEMINI_FIELD_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_GEMINI_TOOL_REGISTRY_AUTHORITY_REQUIRED') {
    super(code)
    this.name = 'GeminiGenerateContentGenerationAuthorityV2Error'
  }
}

const bindings = new WeakSet<object>()
const capabilities = new WeakSet<object>()
const SUPPORTS = 'gemini.generate-content.v1beta.official.supports'
const REJECTS = 'gemini.generate-content.v1beta.owner-boundary.rejects'

export function isVerifiedGeminiGenerateContentProviderBindingAuthorityV2(
  value: unknown,
): value is VerifiedGeminiGenerateContentProviderBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindings.has(value))
}
export function isVerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2(
  value: unknown,
): value is VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilities.has(value))
}

function supported(path: RuntimeCapabilitySemanticPathV2, domain: RuntimeCapabilityDomainV2,
  evidenceId: string = SUPPORTS): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'supported', domain, constraints: Object.freeze([]), evidenceIds: Object.freeze([evidenceId]) })
}
function unsupported(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unsupported', constraints: Object.freeze([]), evidenceIds: Object.freeze([REJECTS]) })
}
function unavailable(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'missing', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
}

function thinkingCapabilityForEvidence(evidence: ActiveCatalogModelAuthorityV2): GeminiThinkingCapability {
  const model = evidence.model
  return resolveGeminiThinkingCapability({
    model: evidence.modelId.value,
    thinking: model.thinkingRawValue,
    thinkingOwnProperty: model.thinkingOwnProperty,
    supportedGenerationMethods: model.supportedGenerationMethods,
  })
}

function fields(evidence: ActiveCatalogModelAuthorityV2,
  toolsReviewed: boolean, thinking: GeminiThinkingCapability, webReviewed: boolean): readonly PersistedRuntimeCapabilityFieldV2[] {
  const values = new Map<RuntimeCapabilitySemanticPathV2, PersistedRuntimeCapabilityFieldV2>()
  for (const path of RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2) values.set(path, unavailable(path))
  values.set('generation.maxOutputTokens', supported('generation.maxOutputTokens', {
    kind: 'range', min: 1, max: evidence.model.outputTokenLimit, integer: true,
  }))
  if (evidence.model.maxTemperature !== undefined) values.set('generation.temperature', supported('generation.temperature', {
    kind: 'range', min: 0, max: evidence.model.maxTemperature, integer: false,
  }))
  if (evidence.model.topP !== undefined) values.set('generation.topP', supported('generation.topP', {
    kind: 'range', min: 0, max: 1, integer: false,
  }))
  if (evidence.model.topK !== undefined) values.set('generation.topK', supported('generation.topK', {
    kind: 'range', min: 1, max: Math.max(1, evidence.model.topK), integer: true,
  }))
  values.set('generation.stop', supported('generation.stop', { kind: 'string_list', maxItems: 5, maxItemLength: 65_536 }))
  const thinkingSupported = thinking.thinkingSupported === 'supported'
  values.set('reasoning.mode', supported('reasoning.mode', {
    kind: 'enum', values: Object.freeze(thinkingSupported ? ['disabled', 'enabled'] : ['disabled']),
  }, thinkingSupported ? SUPPORTS : REJECTS))
  if (thinking.kind === 'level') values.set('reasoning.effort', supported('reasoning.effort', {
    kind: 'enum', values: Object.freeze([...thinking.levels]),
  }, SUPPORTS))
  values.set('web.mode', supported('web.mode', {
    kind: 'enum', values: Object.freeze(webReviewed ? ['disabled', 'provider_search'] : ['disabled']),
  }, webReviewed ? GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2 : SUPPORTS))
  values.set('image.mode', supported('image.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('tools.mode', supported('tools.mode', {
    kind: 'enum', values: Object.freeze(toolsReviewed ? ['disabled', 'enabled'] : ['disabled']),
  }, toolsReviewed ? GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2 : SUPPORTS))
  values.set('providerExtension.kind', supported('providerExtension.kind', { kind: 'enum', values: Object.freeze(['gemini_generate_content']) }))
  values.set('providerExtension.thinkingMode', supported('providerExtension.thinkingMode', {
    kind: 'enum', values: Object.freeze(thinking.kind === 'level' ? ['default', 'level'] :
      thinking.kind === 'budget' ? ['default', 'budget'] : ['default']),
  }, thinkingSupported ? SUPPORTS : REJECTS))
  if (thinking.kind === 'level') values.set('providerExtension.thinkingLevel', supported('providerExtension.thinkingLevel', {
    kind: 'enum', values: Object.freeze([...thinking.levels]),
  }, SUPPORTS))
  if (thinking.kind === 'budget') values.set('providerExtension.thinkingBudget', supported('providerExtension.thinkingBudget', {
    kind: 'range', min: -1, max: thinking.maxBudget, integer: true,
  }, SUPPORTS))
  if (thinking.kind === 'budget' && !thinking.allowOff) {
    const field = values.get('providerExtension.thinkingBudget')!
    values.set('providerExtension.thinkingBudget', Object.freeze({
      ...field,
      constraints: Object.freeze([Object.freeze({ kind: 'forbids_value' as const,
        path: 'providerExtension.thinkingBudget' as const, values: Object.freeze([0]) })]),
    }))
  }
  values.set('providerExtension.includeThoughts', supported('providerExtension.includeThoughts', {
    kind: 'enum', values: Object.freeze(thinkingSupported ? ['provider_default', 'enabled', 'disabled'] : ['provider_default']),
  }, thinkingSupported ? SUPPORTS : REJECTS))
  for (const path of ['generation.seed', 'generation.frequencyPenalty', 'generation.presencePenalty',
    'generation.repetitionPenalty', 'reasoning.exclude', 'reasoning.summary',
    ] as const) values.set(path, unsupported(path))
  if (thinking.kind !== 'level') values.set('providerExtension.thinkingLevel', unsupported('providerExtension.thinkingLevel'))
  if (thinking.kind !== 'budget') values.set('providerExtension.thinkingBudget', unsupported('providerExtension.thinkingBudget'))
  if (thinking.kind !== 'level') values.set('reasoning.effort', unsupported('reasoning.effort'))
  return Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => values.get(path)!))
}

function validateFacts(facts: GenerationCommandFactsAuthorityV2, evidence: ActiveCatalogModelAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null, toolsReviewed: boolean, thinking: GeminiThinkingCapability): void {
  const intent = facts.semanticIntent
  const tools = intent.tools
  const webReviewed = hasReviewedGeminiGenerateContentReasoningWebCapabilityV2(evidence.modelId.value)
  if ((tools.mode === 'enabled') !== (toolRegistry !== null)) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_TOOL_REGISTRY_AUTHORITY_REQUIRED')
  }
  if (tools.mode === 'enabled') {
    const toolChoice = tools.toolChoice
    const namedToolId = toolChoice.mode === 'named' ? toolChoice.toolId.value : null
    if (!toolsReviewed || stableSerializeProviderRequestV2(toolRegistry!.selectedDefinitions.map((tool) => tool.toolId)) !==
        stableSerializeProviderRequestV2(tools.allowedToolIds.map((toolId) => toolId.value)) ||
        (namedToolId !== null && !tools.allowedToolIds.some((toolId) => toolId.value === namedToolId))) {
      throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_INTENT_UNSUPPORTED')
    }
  }
  const extension = intent.providerExtension
  const validReasoning = intent.reasoning.mode === 'disabled'
    ? extension.kind === 'gemini_generate_content' && extension.thinkingMode === 'default' &&
      extension.includeThoughts === 'provider_default'
    : thinking.thinkingSupported === 'supported' &&
      intent.reasoning.summary === undefined && intent.reasoning.exclude === undefined &&
      extension.kind === 'gemini_generate_content' &&
      (thinking.kind === 'level'
        ? extension.thinkingMode === 'default' && intent.reasoning.effort === undefined ||
          extension.thinkingMode === 'level' && intent.reasoning.effort !== undefined &&
            (thinking.levels as readonly string[]).includes(intent.reasoning.effort) && extension.thinkingLevel === intent.reasoning.effort
        : thinking.kind === 'budget'
          ? extension.thinkingMode === 'default' && intent.reasoning.effort === undefined ||
            extension.thinkingMode === 'budget' && intent.reasoning.effort === undefined &&
              (extension.thinkingBudget === -1 ||
                extension.thinkingBudget === 0 && thinking.allowOff ||
                Number.isSafeInteger(extension.thinkingBudget) && extension.thinkingBudget >= thinking.minBudget &&
                  extension.thinkingBudget <= thinking.maxBudget)
          : intent.reasoning.effort === undefined && extension.thinkingMode === 'default')
  const validWeb = intent.web.mode === 'disabled' || (webReviewed &&
    intent.web.types.length === 1 && intent.web.types[0] === 'web' && intent.web.engine === undefined &&
    intent.web.maxResults === undefined && intent.web.maxTotalResults === undefined &&
    intent.web.searchContextSize === undefined && intent.web.maxCharacters === undefined &&
    intent.web.userLocation === undefined && intent.web.allowedDomains === undefined && intent.web.excludedDomains === undefined)
  const attachmentUnsupported = intent.attachments.some((attachment) => {
    if (!attachment.include || attachment.kind !== 'managed_file') return attachment.include
    if ((attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text') ||
        (attachment.sendAs === 'image_reference' && attachment.conversion === 'none') ||
        (attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf')) return false
    const assetRevisionId = attachment.kind === 'managed_file' ? attachment.assetRevisionId.value : null
    const resolved = facts.attachmentSet.attachments.find((item) => item.revision.assetRevisionId.value === assetRevisionId)
    return !(attachment.sendAs === 'provider_file' && attachment.conversion === 'none' && resolved !== undefined &&
      resolved.revision.blob.sizeBytes <= 4 * 1024 * 1024 &&
      (/^(?:image|audio|video)\//u.test(resolved.revision.blob.mime) || resolved.revision.blob.mime === 'application/pdf'))
  })
  if (intent.attachments.length !== facts.attachmentSet.attachments.length + facts.attachmentSet.urlReferenceIntents.length ||
      attachmentUnsupported ||
      !validReasoning || !validWeb || intent.image.mode !== 'disabled' ||
      intent.generation.candidateCount !== undefined ||
      (intent.generation.maxOutputTokens !== undefined && intent.generation.maxOutputTokens > evidence.model.outputTokenLimit) ||
      intent.generation.seed !== undefined || intent.generation.frequencyPenalty !== undefined ||
      intent.generation.presencePenalty !== undefined || intent.generation.repetitionPenalty !== undefined) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_INTENT_UNSUPPORTED')
  }
}

function composeBinding(evidence: ActiveCatalogModelAuthorityV2): VerifiedGeminiGenerateContentProviderBindingAuthorityV2 {
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const definition = readReviewedGeminiGenerateContentDefinitionV2()
  if (!isVerifiedGeminiDeveloperApiEndpointProfileV2(profile) || !isReviewedProviderContractDefinitionV2(definition) ||
      definition.protocolContractId.value !== 'gemini-generate-content-v1beta' || definition.providerId.value !== 'google_ai_studio' ||
      profile.endpointSetRevision.value !== evidence.endpointSetRevision.value ||
      profile.descriptors.models.descriptorRevision.value !== evidence.descriptorRevision.value ||
      profile.descriptors.models.descriptorDigest.value !== evidence.descriptorDigest.value) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
  }
  const descriptor = profile.descriptors.generateContent
  const candidate = Object.freeze({
    credentialScopeId: readGenerationV2Identity(evidence.credentialScopeId, 'credential_scope_id'),
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: readGenerationV2Identity(profile.endpointSetRevision, 'endpoint_set_revision'),
      descriptors: [{ endpointId: readGenerationV2Identity(descriptor.endpointId, 'endpoint_id'),
        descriptorRevision: readGenerationV2Identity(descriptor.descriptorRevision, 'descriptor_revision') }] },
    protocolContractId: readGenerationV2Identity(definition.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(definition.contractRevision, 'contract_revision'),
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: readGenerationV2Identity(definition.registryRevision, 'registry_revision'),
    modelId: readGenerationV2Identity(evidence.modelId, 'model_id'), operation: 'text',
  })
  const binding = decodeProviderBindingRecordV2(candidate)
  const contractReference = verifyProviderContractReferenceV2(candidate)
  if (!isVerifiedProviderContractReferenceV2(contractReference) || contractReference.reviewedDefinition !== definition) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
  }
  const authority = Object.freeze({
    trust: 'verified_gemini_generate_content_provider_binding' as const,
    usage: 'runtime_capability_and_snapshot_input_only' as const, executionAuthority: 'none' as const,
    binding, contractReference, credentialRevision: evidence.credentialRevision,
    modelEvidenceRevision: evidence.modelsResponseRevision,
    assertCurrent: () => {
      if (!bindings.has(authority) || !isActiveCatalogModelAuthorityV2(evidence, 'google_ai_studio')) {
        throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
      }
      evidence.assertCurrent()
    },
  })
  bindings.add(authority)
  return authority
}

function composeCapability(binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2,
  evidence: ActiveCatalogModelAuthorityV2, toolRegistry: ToolRegistryRepositoryFactV2 | null,
  toolsReviewed: boolean, thinking: GeminiThinkingCapability, webReviewed: boolean) {
  const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
  const continuation = { kind: 'client_managed_native_replay' as const, artifactKind: GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
    supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [SUPPORTS] }
  const resolvedCapability = canonicalizeResolvedCapabilityV2({
    ...projectActiveCatalogSnapshotAuthorityV2(evidence),
    binding: projectDecodedProviderBindingRecordV2(binding.binding),
    evidence: [
      { evidenceId: SUPPORTS, kind: 'official_documentation', effect: 'supports',
        sourceRef: 'https://ai.google.dev/api/generate-content', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: hash(SUPPORTS) },
      { evidenceId: REJECTS, kind: 'contract_invariant', effect: 'rejects',
        sourceRef: 'generation-compiler-v2-gemini-baseline-boundary', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: hash(REJECTS) },
      { evidenceId: 'gemini.models.visibility.supports', kind: 'live_probe', effect: 'supports',
        sourceRef: evidence.modelsResponseRevision, verifiedAt: new Date(evidence.observedAtMs).toISOString(),
        contentDigest: evidence.modelsResponseDigest.value },
      { evidenceId: GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2, kind: 'contract_invariant',
        effect: toolsReviewed ? 'supports' : 'rejects',
        sourceRef: toolsReviewed
          ? 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite'
          : 'gemini-reviewed-model-tool-capability-v2-fail-closed',
        verifiedAt: '2026-07-20T00:00:00.000Z',
        contentDigest: hash(`${GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2}:${evidence.modelId.value}:${toolsReviewed}`) },
      { evidenceId: GEMINI_GENERATE_CONTENT_TOOL_CONFIRMATION_EVIDENCE_ID_V2, kind: 'contract_invariant',
        effect: 'requires_confirmation', sourceRef: 'generation-v2-tool-side-effect-confirmation-policy',
        verifiedAt: '2026-07-20T00:00:00.000Z',
        contentDigest: hash(GEMINI_GENERATE_CONTENT_TOOL_CONFIRMATION_EVIDENCE_ID_V2) },
      credentialRevisionEvidenceV2({ credentialRevision: evidence.credentialRevision,
        verifiedAt: new Date(evidence.observedAtMs).toISOString() }),
    ],
    fields: fields(evidence, toolsReviewed, thinking, webReviewed),
    continuation,
  })
  const record = runtimeSnapshotRecordFromResolvedCapabilityV2({
    capability: resolvedCapability,
    resolvedAt: new Date(Date.now()).toISOString(),
    tools: toolRegistry?.selectedDefinitions.map((tool) => ({
      toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' : 'requires_confirmation',
      sideEffectPolicy: tool.sideEffectPolicy,
      evidenceIds: [tool.sideEffectPolicy === 'none' ? GEMINI_GENERATE_CONTENT_TOOL_CAPABILITY_EVIDENCE_ID_V2
        : GEMINI_GENERATE_CONTENT_TOOL_CONFIRMATION_EVIDENCE_ID_V2],
    })) ?? [],
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  const authority = Object.freeze({
    trust: 'verified_gemini_generate_content_runtime_capability' as const,
    usage: 'snapshot_commit_input_only' as const, executionAuthority: 'none' as const,
    bindingAuthority: binding, resolvedCapability, record, snapshot,
    assertCurrent: () => {
      if (!capabilities.has(authority) || !isVerifiedGeminiGenerateContentProviderBindingAuthorityV2(binding)) {
        throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
      }
      binding.assertCurrent()
    },
  })
  capabilities.add(authority)
  return authority
}

/** Command-independent resolver; tools and attachments are not command facts. */
export function resolveGeminiGenerateContentCapabilityV2(
  modelEvidence: ActiveCatalogModelAuthorityV2,
): ResolvedCapabilityV2 {
  const toolsReviewed = hasReviewedGeminiGenerateContentToolCapabilityV2(modelEvidence.modelId.value)
  const thinking = thinkingCapabilityForEvidence(modelEvidence)
  const webReviewed = hasReviewedGeminiGenerateContentReasoningWebCapabilityV2(modelEvidence.modelId.value)
  const binding = composeBinding(modelEvidence)
  return composeCapability(binding, modelEvidence, null, toolsReviewed, thinking, webReviewed).resolvedCapability
}

export function readVerifiedGeminiGenerateContentProviderBindingRecordV2(
  authority: VerifiedGeminiGenerateContentProviderBindingAuthorityV2,
): Readonly<Record<string, unknown>> {
  if (!isVerifiedGeminiGenerateContentProviderBindingAuthorityV2(authority)) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
  }
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}

export function withVerifiedGeminiGenerateContentGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  commandFacts: GenerationCommandFactsAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  use: (authorities: Readonly<{ binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
    capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2 }>) => T
}>): T {
  if (!isActiveCatalogModelAuthorityV2(input.modelEvidence, 'google_ai_studio') ||
      !isGenerationCommandFactsAuthorityV2(input.commandFacts) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context)) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
  }
  const toolRegistry = input.toolRegistry ?? null
  if ((input.commandFacts.semanticIntent.tools.mode === 'enabled' &&
      !isToolRegistryRepositoryFactForContextV2(toolRegistry, input.context)) ||
      (input.commandFacts.semanticIntent.tools.mode === 'disabled' && toolRegistry !== null)) {
    throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_TOOL_REGISTRY_AUTHORITY_REQUIRED')
  }
  const toolsReviewed = hasReviewedGeminiGenerateContentToolCapabilityV2(input.modelEvidence.modelId.value)
  const thinking = thinkingCapabilityForEvidence(input.modelEvidence)
  const webReviewed = hasReviewedGeminiGenerateContentReasoningWebCapabilityV2(input.modelEvidence.modelId.value)
  input.modelEvidence.assertCurrent()
  validateFacts(input.commandFacts, input.modelEvidence, toolRegistry, toolsReviewed, thinking)
  let binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2 | undefined
  let capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2 | undefined
  let registered = false
  let completed = false
  try {
    binding = composeBinding(input.modelEvidence)
    capability = composeCapability(binding, input.modelEvidence, toolRegistry, toolsReviewed, thinking, webReviewed)
    validateSemanticIntentAgainstResolvedCapabilityV2(
      capability.resolvedCapability,
      input.commandFacts.semanticIntent,
    )
    assertExpectedCapabilityRevisionV2(capability.snapshot.revision.value)
    const revoke = () => { if (capability) capabilities.delete(capability); if (binding) bindings.delete(binding) }
    registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
      preCommit: () => { if (!completed) throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID'); capability!.assertCurrent() },
      committed: revoke, rolledBack: revoke,
    })
    registered = true
    const result = input.use(Object.freeze({ binding, capability }))
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      throw new GeminiGenerateContentGenerationAuthorityV2Error('GENERATION_V2_GEMINI_GENERATION_AUTHORITY_INVALID')
    }
    capability.assertCurrent()
    completed = true
    return result
  } finally {
    if (!registered || !completed) { if (capability) capabilities.delete(capability); if (binding) bindings.delete(binding) }
  }
}
