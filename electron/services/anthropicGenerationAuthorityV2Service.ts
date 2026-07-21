import { createHash } from 'node:crypto'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type PersistedRuntimeCapabilitySnapshotV2,
  type RuntimeCapabilityDomainV2,
  type RuntimeCapabilitySemanticPathV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedAnthropicMessagesDefinitionV2,
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
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectAnthropicMessagesIntentV1 } from '../../src/next/generation-v2/providers/anthropic/messagesIntentProjectionV1'
import {
  resolveAnthropicModelThinkingRuleV1,
} from '../../src/next/generation-v2/providers/anthropic/modelThinkingRulesV1'
import { ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import {
  isVerifiedAnthropicEndpointProfileV2,
  readVerifiedAnthropicEndpointProfileV2,
} from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  isGenerationCommandFactsAuthorityV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import {
  isVerifiedAnthropicModelEvidenceV2,
  type VerifiedAnthropicModelEvidenceV2,
} from './anthropicModelEvidenceV2Service'

export type VerifiedAnthropicProviderBindingAuthorityV2 = Readonly<{
  trust: 'verified_anthropic_provider_binding'
  usage: 'runtime_capability_and_snapshot_input_only'
  executionAuthority: 'none'
  binding: DecodedProviderBindingRecordV2
  contractReference: VerifiedProviderContractReferenceV2
  credentialRevision: number
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export type VerifiedAnthropicRuntimeCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_anthropic_runtime_capability'
  usage: 'snapshot_commit_input_only'
  executionAuthority: 'none'
  bindingAuthority: VerifiedAnthropicProviderBindingAuthorityV2
  record: PersistedRuntimeCapabilitySnapshotV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export class AnthropicGenerationAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID'
    | 'GENERATION_V2_ANTHROPIC_OPERATION_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_ANTHROPIC_MODEL_RULE_UNAVAILABLE'
    | 'GENERATION_V2_ANTHROPIC_MODEL_CAPABILITY_MISMATCH'
    | 'GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED') {
    super(code)
    this.name = 'AnthropicGenerationAuthorityV2Error'
  }
}

const bindingAuthorities = new WeakSet<object>()
const capabilityAuthorities = new WeakSet<object>()

export function isVerifiedAnthropicProviderBindingAuthorityV2(
  value: unknown,
): value is VerifiedAnthropicProviderBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindingAuthorities.has(value))
}

export function isVerifiedAnthropicRuntimeCapabilityAuthorityV2(
  value: unknown,
): value is VerifiedAnthropicRuntimeCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilityAuthorities.has(value))
}

function same(left: { value: string }, right: { value: string }): boolean {
  return left.value === right.value
}

function evidenceDigest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

const SUPPORTS = 'anthropic.messages.v2.supports'
const REJECTS = 'anthropic.messages.v2.rejects'
const TOOL_CONFIRMATION = 'anthropic.messages.v2.tool_confirmation'

function supported(path: RuntimeCapabilitySemanticPathV2, domain: RuntimeCapabilityDomainV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'supported', domain, constraints: Object.freeze([]), evidenceIds: Object.freeze([SUPPORTS]) })
}

function unsupported(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unsupported', constraints: Object.freeze([]), evidenceIds: Object.freeze([REJECTS]) })
}

function unavailable(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
}

function fieldsForModel(evidence: VerifiedAnthropicModelEvidenceV2, toolsEnabled: boolean): readonly PersistedRuntimeCapabilityFieldV2[] {
  const rule = resolveAnthropicModelThinkingRuleV1(evidence.modelId.value)
  if (!rule) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_MODEL_RULE_UNAVAILABLE')
  const reviewedThinkingTypes = rule.thinkingModes
    .filter((mode) => mode !== 'disabled')
    .map((mode) => mode === 'manual' ? 'enabled' : 'adaptive')
    .sort()
  const observedThinkingTypes = [...evidence.supportedThinkingTypes].sort()
  const reviewedEfforts = [...rule.supportedEfforts].sort()
  const observedEfforts = [...evidence.supportedEfforts].sort()
  if (reviewedThinkingTypes.join('\0') !== observedThinkingTypes.join('\0') ||
      reviewedEfforts.join('\0') !== observedEfforts.join('\0')) {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_MODEL_CAPABILITY_MISMATCH')
  }
  const values = new Map<RuntimeCapabilitySemanticPathV2, PersistedRuntimeCapabilityFieldV2>()
  for (const path of RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2) values.set(path, unavailable(path))
  values.set('generation.maxOutputTokens', supported('generation.maxOutputTokens', { kind: 'range', min: 1, max: evidence.maxTokens, integer: true }))
  for (const path of ['generation.seed', 'generation.candidateCount', 'generation.frequencyPenalty', 'generation.presencePenalty', 'generation.repetitionPenalty'] as const) values.set(path, unsupported(path))
  if (rule.rejectsExplicitSampling) {
    for (const path of ['generation.temperature', 'generation.topP', 'generation.topK'] as const) values.set(path, unsupported(path))
  } else {
    values.set('generation.temperature', supported('generation.temperature', { kind: 'range', min: 0, max: 1, integer: false }))
    values.set('generation.topP', supported('generation.topP', { kind: 'range', min: 0, max: 1, integer: false }))
    values.set('generation.topK', supported('generation.topK', { kind: 'range', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }))
  }
  values.set('generation.stop', supported('generation.stop', { kind: 'string_list', maxItems: 4, maxItemLength: 65_536 }))
  values.set('reasoning.mode', supported('reasoning.mode', { kind: 'enum', values: Object.freeze(rule.thinkingModes.includes('disabled') ? ['disabled', 'enabled'] : ['enabled']) }))
  if (rule.supportedEfforts.length) values.set('reasoning.effort', supported('reasoning.effort', { kind: 'enum', values: rule.supportedEfforts }))
  else values.set('reasoning.effort', unsupported('reasoning.effort'))
  values.set('reasoning.summary', unsupported('reasoning.summary'))
  values.set('reasoning.exclude', unsupported('reasoning.exclude'))
  values.set('web.mode', supported('web.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('image.mode', supported('image.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('tools.mode', supported('tools.mode', { kind: 'enum', values: Object.freeze(toolsEnabled ? ['disabled', 'enabled'] : ['disabled']) }))
  if (toolsEnabled) {
    values.set('tools.allowedToolIds', supported('tools.allowedToolIds', { kind: 'identity_list', maxItems: 128 }))
    values.set('tools.toolChoice', supported('tools.toolChoice', { kind: 'enum', values: Object.freeze(['omitted', 'auto', 'none', 'required', 'named']) }))
    values.set('tools.sideEffectConfirmation', Object.freeze({ path: 'tools.sideEffectConfirmation', state: 'requires_confirmation',
      domain: Object.freeze({ kind: 'enum' as const, values: Object.freeze(['required_each_retry']) }),
      constraints: Object.freeze([]), evidenceIds: Object.freeze([TOOL_CONFIRMATION]) }))
  }
  values.set('providerExtension.kind', supported('providerExtension.kind', { kind: 'enum', values: Object.freeze(['anthropic_messages']) }))
  values.set('providerExtension.thinkingDisplay', supported('providerExtension.thinkingDisplay', { kind: 'enum', values: Object.freeze(['provider_default', 'summarized', 'omitted']) }))
  const modes = [
    ...(rule.recommendedEnabledThinkingMode === null ? [] : ['model_recommended']),
    ...(rule.thinkingModes.includes('adaptive') ? ['adaptive'] : []),
    ...(rule.thinkingModes.includes('manual') ? ['manual'] : []),
  ]
  values.set('providerExtension.thinkingMode', supported('providerExtension.thinkingMode', { kind: 'enum', values: Object.freeze(modes) }))
  if (rule.thinkingModes.includes('manual')) values.set('providerExtension.manualThinkingBudgetTokens', supported('providerExtension.manualThinkingBudgetTokens', { kind: 'range', min: 1_024, max: Number.MAX_SAFE_INTEGER, integer: true }))
  else values.set('providerExtension.manualThinkingBudgetTokens', unsupported('providerExtension.manualThinkingBudgetTokens'))
  return Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => values.get(path)!))
}

function validateFacts(facts: GenerationCommandFactsAuthorityV2, evidence: VerifiedAnthropicModelEvidenceV2, toolRegistry?: ToolRegistryRepositoryFactV2 | null): void {
  const intent = facts.semanticIntent
  const tools = intent.tools ?? { mode: 'disabled' as const }
  if (intent.attachments.length !== 0 || facts.attachmentSet.attachments.length !== 0 ||
      facts.attachmentSet.providerFileRequirements.length !== 0 || facts.attachmentSet.requiresProviderFileAuthority ||
      intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled') {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
  }
  if (tools.mode === 'enabled') {
    if (!toolRegistry || toolRegistry.selectedDefinitions.length !== tools.allowedToolIds.length ||
        toolRegistry.selectedDefinitions.some((definition, index) => definition.toolId !== tools.allowedToolIds[index].value)) {
      throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
    }
  } else if (toolRegistry !== undefined && toolRegistry !== null) {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
  }
  if (intent.generation.maxOutputTokens === undefined || intent.generation.maxOutputTokens > evidence.maxTokens) {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
  }
  const projection = projectAnthropicMessagesIntentV1(projectGenerationIntentLayerV2(intent), evidence.modelId.value)
  if (projection.issues.length !== 0 || projection.dispositions.some((entry) => entry.outcome === 'rejected')) {
    throw new AnthropicGenerationAuthorityV2Error(
      projection.issues.some((issue) => issue.code === 'ANTHROPIC_MODEL_RULE_UNAVAILABLE')
        ? 'GENERATION_V2_ANTHROPIC_MODEL_RULE_UNAVAILABLE'
        : 'GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED',
    )
  }
}

function composeBinding(evidence: VerifiedAnthropicModelEvidenceV2): VerifiedAnthropicProviderBindingAuthorityV2 {
  const profile = readVerifiedAnthropicEndpointProfileV2()
  const definition = readReviewedAnthropicMessagesDefinitionV2()
  if (!isVerifiedAnthropicEndpointProfileV2(profile) || !isReviewedProviderContractDefinitionV2(definition) ||
      definition.providerId.value !== 'anthropic' || definition.protocolContractId.value !== 'anthropic-messages-2023-06-01' ||
      !same(profile.providerId, evidence.providerId) || !same(profile.endpointProfileId, evidence.endpointProfileId) ||
      !same(profile.endpointSetRevision, evidence.endpointSetRevision) || !same(profile.descriptor.descriptorRevision, evidence.descriptorRevision) ||
      profile.descriptor.descriptorDigest.value !== evidence.descriptorDigest.value) {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
  }
  const candidate = Object.freeze({
    credentialScopeId: readGenerationV2Identity(evidence.credentialScopeId, 'credential_scope_id'),
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: readGenerationV2Identity(profile.endpointSetRevision, 'endpoint_set_revision'), descriptors: [{ endpointId: readGenerationV2Identity(profile.descriptor.endpointId, 'endpoint_id'), descriptorRevision: readGenerationV2Identity(profile.descriptor.descriptorRevision, 'descriptor_revision') }] },
    protocolContractId: readGenerationV2Identity(definition.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(definition.contractRevision, 'contract_revision'),
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: readGenerationV2Identity(definition.registryRevision, 'registry_revision'),
    modelId: readGenerationV2Identity(evidence.modelId, 'model_id'),
    operation: 'text',
  })
  const binding = decodeProviderBindingRecordV2(candidate)
  const contractReference = verifyProviderContractReferenceV2(candidate)
  if (!isVerifiedProviderContractReferenceV2(contractReference) || contractReference.reviewedDefinition !== definition) {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
  }
  const authority: VerifiedAnthropicProviderBindingAuthorityV2 = Object.freeze({
    trust: 'verified_anthropic_provider_binding', usage: 'runtime_capability_and_snapshot_input_only', executionAuthority: 'none',
    binding, contractReference, credentialRevision: evidence.credentialRevision, modelEvidenceRevision: evidence.modelResponseRevision,
    assertCurrent: () => {
      if (!bindingAuthorities.has(authority) || !isVerifiedAnthropicModelEvidenceV2(evidence)) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
      evidence.assertCurrent()
    },
  })
  bindingAuthorities.add(authority)
  return authority
}

function composeCapability(binding: VerifiedAnthropicProviderBindingAuthorityV2, evidence: VerifiedAnthropicModelEvidenceV2,
  fields: readonly PersistedRuntimeCapabilityFieldV2[], toolRegistry: ToolRegistryRepositoryFactV2 | null): VerifiedAnthropicRuntimeCapabilityAuthorityV2 {
  binding.assertCurrent()
  const observedAt = new Date(evidence.observedAtMs).toISOString()
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2, resolvedAt: new Date(Date.now()).toISOString(), binding: projectDecodedProviderBindingRecordV2(binding.binding),
    evidence: [
      { evidenceId: SUPPORTS, kind: 'official_documentation', effect: 'supports', sourceRef: 'https://platform.claude.com/docs/en/api/messages/create', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: evidenceDigest(SUPPORTS) },
      { evidenceId: REJECTS, kind: 'contract_invariant', effect: 'rejects', sourceRef: 'generation-compiler-v2-anthropic-plain-text-boundary', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: evidenceDigest(REJECTS) },
      { evidenceId: TOOL_CONFIRMATION, kind: 'contract_invariant', effect: 'requires_confirmation', sourceRef: 'generation-compiler-v2-tool-side-effect-policy', verifiedAt: '2026-07-18T00:00:00.000Z', contentDigest: evidenceDigest(TOOL_CONFIRMATION) },
      { evidenceId: 'anthropic.models.visibility.supports', kind: 'live_probe', effect: 'supports', sourceRef: evidence.modelResponseRevision, verifiedAt: observedAt, contentDigest: readGenerationV2Digest(evidence.modelResponseDigest, 'evidence_digest') },
    ],
    fields, tools: toolRegistry?.selectedDefinitions.map((tool) => ({ toolId: tool.toolId, kind: tool.kind,
      state: tool.sideEffectPolicy === 'none' ? 'supported' : 'requires_confirmation', sideEffectPolicy: tool.sideEffectPolicy,
      evidenceIds: [tool.sideEffectPolicy === 'none' ? SUPPORTS : TOOL_CONFIRMATION] })) ?? [],
    continuation: { kind: 'client_managed_native_replay', artifactKind: ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1, supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: [SUPPORTS] },
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  const authority: VerifiedAnthropicRuntimeCapabilityAuthorityV2 = Object.freeze({
    trust: 'verified_anthropic_runtime_capability', usage: 'snapshot_commit_input_only', executionAuthority: 'none', bindingAuthority: binding,
    record, snapshot, modelEvidenceRevision: evidence.modelResponseRevision,
    assertCurrent: () => {
      if (!capabilityAuthorities.has(authority) || !isVerifiedAnthropicProviderBindingAuthorityV2(binding)) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
      binding.assertCurrent()
    },
  })
  capabilityAuthorities.add(authority)
  return authority
}

export function readVerifiedAnthropicProviderBindingRecordV2(authority: VerifiedAnthropicProviderBindingAuthorityV2): Readonly<Record<string, unknown>> {
  if (!isVerifiedAnthropicProviderBindingAuthorityV2(authority)) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}

function promiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function') && typeof (value as { then?: unknown }).then === 'function')
}

export function withVerifiedAnthropicGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: VerifiedAnthropicModelEvidenceV2
  commandFacts: GenerationCommandFactsAuthorityV2
  operation: 'text' | 'tool_continue'
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  use: (authorities: Readonly<{ binding: VerifiedAnthropicProviderBindingAuthorityV2; capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2 }>) => T extends PromiseLike<unknown> ? never : T
}>): T {
  if (!isVerifiedAnthropicModelEvidenceV2(input.modelEvidence) || !isGenerationCommandFactsAuthorityV2(input.commandFacts) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) || input.commandFacts.executionAuthority !== 'none') {
    throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
  }
  if (input.operation !== 'text' && input.operation !== 'tool_continue') throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_OPERATION_AUTHORITY_REQUIRED')
  if (input.toolRegistry !== undefined && input.toolRegistry !== null) {
    if (!isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context)) {
      throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
    }
  }
  input.modelEvidence.assertCurrent()
  validateFacts(input.commandFacts, input.modelEvidence, input.toolRegistry)
  const fields = fieldsForModel(input.modelEvidence, input.toolRegistry !== undefined && input.toolRegistry !== null)
  let binding: VerifiedAnthropicProviderBindingAuthorityV2 | undefined
  let capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2 | undefined
  let registered = false
  let completed = false
  try {
    binding = composeBinding(input.modelEvidence)
    capability = composeCapability(binding, input.modelEvidence, fields, input.toolRegistry ?? null)
    const revoke = () => { if (capability) capabilityAuthorities.delete(capability); if (binding) bindingAuthorities.delete(binding) }
    registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
      preCommit: () => { if (!completed) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID'); capability!.assertCurrent(); binding!.assertCurrent() },
      committed: revoke, rolledBack: revoke,
    })
    registered = true
    const result = input.use(Object.freeze({ binding, capability }))
    if (promiseLike(result)) throw new AnthropicGenerationAuthorityV2Error('GENERATION_V2_ANTHROPIC_GENERATION_AUTHORITY_INVALID')
    capability.assertCurrent()
    completed = true
    return result
  } finally {
    if (!registered || !completed) { if (capability) capabilityAuthorities.delete(capability); if (binding) bindingAuthorities.delete(binding) }
  }
}
