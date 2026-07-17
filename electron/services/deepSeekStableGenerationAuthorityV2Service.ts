import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type PersistedRuntimeCapabilitySnapshotV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedDeepSeekStableChatDefinitionV2,
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
import {
  readGenerationV2Digest,
  readGenerationV2Identity,
  type GenerationV2Digest,
} from '../../src/next/generation-v2/domain/identityV2'
import {
  isVerifiedDeepSeekStableCapabilityPolicyV2,
  readVerifiedDeepSeekStableCapabilityPolicyV2,
  type DeepSeekStableCapabilityRuleV2,
  type VerifiedDeepSeekStableCapabilityPolicyV2,
} from '../../src/next/generation-v2/providers/deepseek/stableCapabilityPolicyV2'
import {
  isVerifiedDeepSeekStableEndpointProfileV2,
  readVerifiedDeepSeekStableEndpointProfileV2,
} from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
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
  isVerifiedDeepSeekStableModelEvidenceV2,
  type VerifiedDeepSeekStableModelEvidenceV2,
} from './deepSeekStableModelEvidenceV2Service'

export type VerifiedDeepSeekStableProviderBindingAuthorityV2 = Readonly<{
  trust: 'verified_deepseek_stable_provider_binding'
  usage: 'runtime_capability_and_snapshot_input_only'
  executionAuthority: 'none'
  binding: DecodedProviderBindingRecordV2
  contractReference: VerifiedProviderContractReferenceV2
  credentialRevision: number
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export type VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_deepseek_stable_runtime_capability'
  usage: 'snapshot_commit_input_only'
  executionAuthority: 'none'
  bindingAuthority: VerifiedDeepSeekStableProviderBindingAuthorityV2
  record: PersistedRuntimeCapabilitySnapshotV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  policyDigest: GenerationV2Digest<'evidence_digest'>
  modelEvidenceRevision: string
  assertCurrent(): void
}>

export class DeepSeekStableGenerationAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID'
    | 'GENERATION_V2_DEEPSEEK_OPERATION_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_DEEPSEEK_TOOL_REGISTRY_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_DEEPSEEK_ATTACHMENT_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_DEEPSEEK_FIELD_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_DEEPSEEK_FIELD_VALUE_UNSUPPORTED'
    | 'GENERATION_V2_DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD'
    | 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED'
    | 'DEEPSEEK_REASONING_EFFORT_UNSUPPORTED') {
    super(code)
    this.name = 'DeepSeekStableGenerationAuthorityV2Error'
  }
}

const bindingAuthorities = new WeakSet<object>()
const capabilityAuthorities = new WeakSet<object>()

export function isVerifiedDeepSeekStableProviderBindingAuthorityV2(
  value: unknown,
): value is VerifiedDeepSeekStableProviderBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindingAuthorities.has(value))
}

export function isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(
  value: unknown,
): value is VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilityAuthorities.has(value))
}

function sameIdentity(left: { value: string }, right: { value: string }): boolean {
  return left.value === right.value
}

function requireCompleteBrandedInputs(
  modelEvidence: VerifiedDeepSeekStableModelEvidenceV2,
  commandFacts: GenerationCommandFactsAuthorityV2,
  policy: VerifiedDeepSeekStableCapabilityPolicyV2,
): void {
  const profile = readVerifiedDeepSeekStableEndpointProfileV2()
  if (!isVerifiedDeepSeekStableModelEvidenceV2(modelEvidence) ||
      !isGenerationCommandFactsAuthorityV2(commandFacts) ||
      !isVerifiedDeepSeekStableCapabilityPolicyV2(policy) ||
      !isVerifiedDeepSeekStableEndpointProfileV2(profile) ||
      !sameIdentity(modelEvidence.providerId, profile.providerId) ||
      !sameIdentity(policy.providerId, profile.providerId) ||
      !sameIdentity(modelEvidence.endpointProfileId, profile.endpointProfileId) ||
      !sameIdentity(modelEvidence.endpointSetRevision, profile.endpointSetRevision) ||
      !sameIdentity(modelEvidence.descriptorRevision, profile.descriptor.descriptorRevision) ||
      modelEvidence.descriptorDigest.value !== profile.descriptor.descriptorDigest.value ||
      commandFacts.executionAuthority !== 'none') {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  modelEvidence.assertCurrent()
}

function validateIntentSubset(
  commandFacts: GenerationCommandFactsAuthorityV2,
  fields: readonly PersistedRuntimeCapabilityFieldV2[],
): void {
  const intent = commandFacts.semanticIntent
  if (intent.tools.mode !== 'disabled') {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_TOOL_REGISTRY_AUTHORITY_REQUIRED',
    )
  }
  if (intent.attachments.length !== 0 || commandFacts.attachmentSet.attachments.length !== 0 ||
      commandFacts.attachmentSet.providerFileRequirements.length !== 0 ||
      commandFacts.attachmentSet.requiresProviderFileAuthority) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_ATTACHMENT_CAPABILITY_UNAVAILABLE',
    )
  }
  if (intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.providerExtension.kind !== 'none') {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD',
    )
  }
  const explicit = new Map<string, unknown>([
    ...Object.entries(intent.generation).map(([key, value]) => [`generation.${key}`, value] as const),
    ['reasoning.mode', intent.reasoning.mode],
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.effort !== undefined
      ? [['reasoning.effort', intent.reasoning.effort] as const]
      : []),
    ...(intent.reasoning.mode === 'enabled' && intent.reasoning.summary !== undefined
      ? [['reasoning.summary', intent.reasoning.summary] as const]
      : []),
    ['web.mode', intent.web.mode],
    ['image.mode', intent.image.mode],
    ['tools.mode', intent.tools.mode],
    ['providerExtension.kind', intent.providerExtension.kind],
  ])
  const fieldsByPath = new Map(fields.map((field) => [field.path, field]))
  const domainContains = (domain: PersistedRuntimeCapabilityFieldV2['domain'], value: unknown): boolean => {
    if (!domain) return false
    if (domain.kind === 'enum') return domain.values.includes(value as never)
    if (domain.kind === 'range') {
      return typeof value === 'number' && value >= domain.min && value <= domain.max &&
        (!domain.integer || Number.isSafeInteger(value))
    }
    if (domain.kind === 'boolean') return typeof value === 'boolean'
    if (domain.kind === 'identity') {
      return Boolean(value && typeof value === 'object' &&
        typeof (value as { value?: unknown }).value === 'string')
    }
    if (domain.kind === 'string_list') {
      return Array.isArray(value) && value.length <= domain.maxItems && value.every((item) =>
        typeof item === 'string' && item.length <= domain.maxItemLength)
    }
    return false
  }
  for (const [path, value] of explicit) {
    const field = fieldsByPath.get(path as DeepSeekStableCapabilityRuleV2['path'])
    if (!field || field.state === 'unsupported') {
      throw new DeepSeekStableGenerationAuthorityV2Error(
        'GENERATION_V2_DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD',
      )
    }
    if (field.state === 'unavailable') {
      throw new DeepSeekStableGenerationAuthorityV2Error(
        'GENERATION_V2_DEEPSEEK_FIELD_CAPABILITY_UNAVAILABLE',
      )
    }
    if (!domainContains(field.domain, value)) {
      if (path === 'reasoning.effort') {
        throw new DeepSeekStableGenerationAuthorityV2Error('DEEPSEEK_REASONING_EFFORT_UNSUPPORTED')
      }
      throw new DeepSeekStableGenerationAuthorityV2Error('GENERATION_V2_DEEPSEEK_FIELD_VALUE_UNSUPPORTED')
    }
    for (const constraint of field.constraints) {
      const target = explicit.get(constraint.path)
      const matched = constraint.values.includes(target as never)
      if ((constraint.kind === 'requires_value' && !matched) ||
          (constraint.kind === 'forbids_value' && matched)) {
        if (path === 'generation.temperature' || path === 'generation.topP') {
          throw new DeepSeekStableGenerationAuthorityV2Error(
            'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED',
          )
        }
        throw new DeepSeekStableGenerationAuthorityV2Error(
          'GENERATION_V2_DEEPSEEK_FIELD_VALUE_UNSUPPORTED',
        )
      }
    }
  }
}

function composeBindingAuthority(input: Readonly<{
  modelEvidence: VerifiedDeepSeekStableModelEvidenceV2
  commandFacts: GenerationCommandFactsAuthorityV2
  operation: 'text'
}>): VerifiedDeepSeekStableProviderBindingAuthorityV2 {
  const profile = readVerifiedDeepSeekStableEndpointProfileV2()
  const definition = readReviewedDeepSeekStableChatDefinitionV2()
  if (!isReviewedProviderContractDefinitionV2(definition) ||
      definition.protocolContractId.value !== 'deepseek-stable-chat-v1' ||
      definition.providerId.value !== 'deepseek' || !definition.operations.includes(input.operation)) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  const candidate = Object.freeze({
    credentialScopeId: readGenerationV2Identity(input.modelEvidence.credentialScopeId, 'credential_scope_id'),
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: readGenerationV2Identity(profile.endpointSetRevision, 'endpoint_set_revision'),
      descriptors: [{
        endpointId: readGenerationV2Identity(profile.descriptor.endpointId, 'endpoint_id'),
        descriptorRevision: readGenerationV2Identity(
          profile.descriptor.descriptorRevision, 'descriptor_revision',
        ),
      }],
    },
    protocolContractId: readGenerationV2Identity(definition.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(definition.contractRevision, 'contract_revision'),
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: readGenerationV2Identity(definition.registryRevision, 'registry_revision'),
    modelId: readGenerationV2Identity(input.modelEvidence.modelId, 'model_id'),
    operation: input.operation,
  })
  const binding = decodeProviderBindingRecordV2(candidate)
  const contractReference = verifyProviderContractReferenceV2(candidate)
  if (!isVerifiedProviderContractReferenceV2(contractReference) ||
      contractReference.reviewedDefinition !== definition ||
      !sameIdentity(binding.credentialScopeId, input.modelEvidence.credentialScopeId) ||
      !sameIdentity(binding.modelId, input.modelEvidence.modelId) ||
      !sameIdentity(binding.endpointProfileId, profile.endpointProfileId) ||
      binding.operation !== input.operation) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  const authority: VerifiedDeepSeekStableProviderBindingAuthorityV2 = Object.freeze({
    trust: 'verified_deepseek_stable_provider_binding',
    usage: 'runtime_capability_and_snapshot_input_only',
    executionAuthority: 'none',
    binding,
    contractReference,
    credentialRevision: input.modelEvidence.credentialRevision,
    modelEvidenceRevision: input.modelEvidence.modelsResponseRevision,
    assertCurrent: () => {
      if (!bindingAuthorities.has(authority) ||
          !isVerifiedDeepSeekStableModelEvidenceV2(input.modelEvidence)) {
        throw new DeepSeekStableGenerationAuthorityV2Error(
          'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
        )
      }
      input.modelEvidence.assertCurrent()
    },
  })
  bindingAuthorities.add(authority)
  return authority
}

function evidenceId(baseId: string, effect: 'supports' | 'rejects' | 'requires_confirmation'): string {
  return `${baseId}.${effect}`
}

function buildRuntimeEvidence(
  policy: VerifiedDeepSeekStableCapabilityPolicyV2,
  modelEvidence: VerifiedDeepSeekStableModelEvidenceV2,
) {
  const familyEvidence = policy.evidence.flatMap((entry) => {
    const isOwnerPolicy = entry.evidenceId.startsWith('starverse.')
    const effects: readonly ('supports' | 'rejects' | 'requires_confirmation')[] = isOwnerPolicy
      ? ['supports', 'rejects', 'requires_confirmation']
      : ['supports']
    return effects.map((effect) => Object.freeze({
      evidenceId: evidenceId(entry.evidenceId, effect),
      kind: isOwnerPolicy ? 'contract_invariant' as const : 'official_documentation' as const,
      effect,
      sourceRef: isOwnerPolicy ? entry.localArtifact.id : entry.sourceRefs[0],
      verifiedAt: `${entry.verifiedAt}T00:00:00.000Z`,
      contentDigest: readGenerationV2Digest(entry.contentDigest, 'evidence_digest'),
    }))
  })
  return Object.freeze([...familyEvidence, Object.freeze({
    evidenceId: `deepseek.stable.models.visibility.${modelEvidence.modelsResponseDigest.value}`,
    kind: 'live_probe' as const,
    effect: 'supports' as const,
    sourceRef: modelEvidence.modelsResponseRevision,
    verifiedAt: new Date(modelEvidence.observedAtMs).toISOString(),
    contentDigest: readGenerationV2Digest(modelEvidence.modelsResponseDigest, 'evidence_digest'),
  })])
}

function buildField(
  rule: DeepSeekStableCapabilityRuleV2,
): PersistedRuntimeCapabilityFieldV2 {
  if (rule.path === 'tools.allowedToolIds' || rule.path === 'tools.sideEffectConfirmation' ||
      rule.path === 'tools.toolChoice') {
    return Object.freeze({ path: rule.path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
  }
  if (rule.path === 'tools.mode') {
    return Object.freeze({
      path: rule.path,
      state: 'supported',
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['disabled']) }),
      constraints: Object.freeze([]),
      evidenceIds: Object.freeze([evidenceId(rule.evidenceId!, 'supports')]),
    })
  }
  if (rule.kind === 'unavailable_pending_authority' || rule.kind === 'requires_tool_registry_authority') {
    return Object.freeze({ path: rule.path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
  }
  if (rule.kind === 'unsupported') {
    return Object.freeze({
      path: rule.path,
      state: 'unsupported',
      constraints: Object.freeze([]),
      evidenceIds: Object.freeze([evidenceId(rule.evidenceId!, 'rejects')]),
    })
  }
  if (rule.kind === 'requires_side_effect_confirmation_policy') {
    return Object.freeze({
      path: rule.path,
      state: 'requires_confirmation',
      domain: rule.domain!,
      constraints: Object.freeze([]),
      evidenceIds: Object.freeze([evidenceId(rule.evidenceId!, 'requires_confirmation')]),
    })
  }
  if (rule.kind === 'supported_conditional_tool_choice') {
    return Object.freeze({ path: rule.path, state: 'unavailable', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
  }
  if (!rule.domain || !rule.evidenceId) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  const constraints = rule.kind === 'supported_when_reasoning_disabled'
    ? Object.freeze([{ kind: 'requires_value' as const, path: 'reasoning.mode' as const, values: Object.freeze(['disabled']) }])
    : rule.kind === 'supported_with_effort_mapping'
      ? Object.freeze([{ kind: 'requires_value' as const, path: 'reasoning.mode' as const, values: Object.freeze(['enabled']) }])
      : Object.freeze([])
  return Object.freeze({
    path: rule.path,
    state: 'supported',
    domain: rule.domain,
    constraints,
    evidenceIds: Object.freeze([evidenceId(rule.evidenceId, 'supports')]),
  })
}

function composeCapabilityAuthority(input: Readonly<{
  bindingAuthority: VerifiedDeepSeekStableProviderBindingAuthorityV2
  modelEvidence: VerifiedDeepSeekStableModelEvidenceV2
  commandFacts: GenerationCommandFactsAuthorityV2
  policy: VerifiedDeepSeekStableCapabilityPolicyV2
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  resolvedAt: string
}>): VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 {
  input.bindingAuthority.assertCurrent()
  const evidence = buildRuntimeEvidence(input.policy, input.modelEvidence)
  const continuationSupports = evidenceId(
    'starverse.deepseek.stable.policy.2026-07-17',
    'supports',
  )
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: input.resolvedAt,
    binding: projectDecodedProviderBindingRecordV2(input.bindingAuthority.binding),
    evidence,
    fields: input.fields,
    tools: [],
    continuation: {
      ...input.policy.continuation,
      evidenceIds: [continuationSupports],
    },
  })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.binding)) !==
        stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.bindingAuthority.binding)) ||
      snapshot.revision.value !== record.revision ||
      snapshot.evidenceDigest.value !== record.evidenceDigest ||
      snapshot.semanticFieldsDigest.value !== record.semanticFieldsDigest) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  const authority: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 = Object.freeze({
    trust: 'verified_deepseek_stable_runtime_capability',
    usage: 'snapshot_commit_input_only',
    executionAuthority: 'none',
    bindingAuthority: input.bindingAuthority,
    record,
    snapshot,
    policyDigest: input.policy.policyDigest,
    modelEvidenceRevision: input.modelEvidence.modelsResponseRevision,
    assertCurrent: () => {
      if (!capabilityAuthorities.has(authority) ||
          !isVerifiedDeepSeekStableProviderBindingAuthorityV2(input.bindingAuthority)) {
        throw new DeepSeekStableGenerationAuthorityV2Error(
          'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
        )
      }
      input.bindingAuthority.assertCurrent()
    },
  })
  capabilityAuthorities.add(authority)
  return authority
}

export function readVerifiedDeepSeekStableProviderBindingRecordV2(
  authority: VerifiedDeepSeekStableProviderBindingAuthorityV2,
): Readonly<Record<string, unknown>> {
  if (!isVerifiedDeepSeekStableProviderBindingAuthorityV2(authority)) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function')
}

export function withVerifiedDeepSeekStableGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: VerifiedDeepSeekStableModelEvidenceV2
  commandFacts: GenerationCommandFactsAuthorityV2
  operation: 'text' | 'tool_continue'
  use: (authorities: Readonly<{
    binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
    capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
  }>) => T extends PromiseLike<unknown> ? never : T
}>): T {
  const policy = readVerifiedDeepSeekStableCapabilityPolicyV2()
  requireCompleteBrandedInputs(input.modelEvidence, input.commandFacts, policy)
  if (!isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context)) {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  if (input.operation !== 'text') {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_OPERATION_AUTHORITY_REQUIRED',
    )
  }
  const resolvedAtMs = Date.now()
  if (!Number.isSafeInteger(resolvedAtMs) ||
      resolvedAtMs < input.modelEvidence.observedAtMs || resolvedAtMs < Date.parse('2026-07-17T00:00:00.000Z') ||
      typeof input.use !== 'function') {
    throw new DeepSeekStableGenerationAuthorityV2Error(
      'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
    )
  }
  const resolvedAt = new Date(resolvedAtMs).toISOString()
  const fields = Object.freeze(policy.rules.map(buildField))
  validateIntentSubset(input.commandFacts, fields)
  let binding: VerifiedDeepSeekStableProviderBindingAuthorityV2 | undefined
  let capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2 | undefined
  let lifecycleRegistered = false
  let useCompleted = false
  try {
    binding = composeBindingAuthority({
      modelEvidence: input.modelEvidence,
      commandFacts: input.commandFacts,
      operation: input.operation,
    })
    capability = composeCapabilityAuthority({
      bindingAuthority: binding,
      modelEvidence: input.modelEvidence,
      commandFacts: input.commandFacts,
      policy,
      fields,
      resolvedAt,
    })
    const revoke = () => {
      if (capability) capabilityAuthorities.delete(capability)
      if (binding) bindingAuthorities.delete(binding)
    }
    registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
      preCommit: () => {
        if (!useCompleted) {
          throw new DeepSeekStableGenerationAuthorityV2Error(
            'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
          )
        }
        capability?.assertCurrent()
        binding?.assertCurrent()
      },
      committed: revoke,
      rolledBack: revoke,
    })
    lifecycleRegistered = true
    const result = input.use(Object.freeze({ binding, capability }))
    if (isPromiseLike(result)) {
      throw new DeepSeekStableGenerationAuthorityV2Error(
        'GENERATION_V2_DEEPSEEK_GENERATION_AUTHORITY_INVALID',
      )
    }
    capability.assertCurrent()
    useCompleted = true
    return result
  } finally {
    if (!lifecycleRegistered || !useCompleted) {
      if (capability) capabilityAuthorities.delete(capability)
      if (binding) bindingAuthorities.delete(binding)
    }
  }
}
