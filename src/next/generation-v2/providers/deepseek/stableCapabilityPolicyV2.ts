import { createHash } from 'node:crypto'
import {
  MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type ModelCapabilityDomainV2 as RuntimeCapabilityDomainV2,
  type ModelCapabilitySemanticPathV2 as RuntimeCapabilitySemanticPathV2,
} from '../../capability/modelCapabilitySchemaV2'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isDeepSeekStableApiContractV2,
  readDeepSeekStableApiContractV2,
  type DeepSeekStableApiContractV2,
} from '../../contracts/deepSeekStableApiContractV2'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedDeepSeekStableChatDefinitionV2,
} from '../../contracts/providerContractRegistryV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'
import { DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2 } from './nativeMessagesV1'

export const DEEPSEEK_STABLE_OWNER_CAPABILITY_POLICY_EVIDENCE_ID_V2 =
  'starverse.deepseek.stable.policy.v2.2026-07-17' as const

export type DeepSeekStableCapabilityRuleKindV2 =
  | 'supported_static'
  | 'supported_when_reasoning_disabled'
  | 'supported_when_reasoning_enabled'
  | 'supported_conditional_tool_choice'
  | 'accepted_no_wire'
  | 'unavailable_pending_authority'
  | 'requires_tool_registry_authority'
  | 'requires_side_effect_confirmation_policy'
  | 'unsupported'

export type DeepSeekStableCapabilityRuleV2 = Readonly<{
  path: RuntimeCapabilitySemanticPathV2
  kind: DeepSeekStableCapabilityRuleKindV2
  domain?: RuntimeCapabilityDomainV2
  wireKey?: string
  evidenceId?: string
  rejectionCode?: string
  toolChoiceMatrix?: Readonly<{
    appliesWhenToolsMode: 'enabled'
    registryAuthority: 'required_exact_revision'
    allowedToolSet: 'nonempty_exact'
    reasoningEnabled: Readonly<{
      allowedModes: readonly ['omitted']
      explicitRejectionCode: 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED'
    }>
    reasoningDisabled: Readonly<{
      allowedModes: readonly ['omitted', 'auto', 'none', 'required', 'named']
      autoRequiresVerifiedNonemptyToolSet: true
      requiredRequiresVerifiedNonemptyToolSet: true
      namedToolRequiresRegistryMembership: true
    }>
  }>
}>

export type VerifiedDeepSeekStableCapabilityPolicyV2 = Readonly<{
  classification: 'verified_deepseek_stable_family_capability_policy_non_executable'
  trust: 'verified_deepseek_stable_capability_policy'
  usage: 'runtime_capability_resolution_input_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  contractFamilyId: string
  verifiedAt: DeepSeekStableApiContractV2['evidence']['verifiedAt']
  evidence: readonly Readonly<{
    evidenceId: string
    verifiedAt: string
    sourceRefs: readonly string[]
    localArtifact: Readonly<{ id: string; path: string }>
    contentDigest: GenerationV2Digest<'evidence_digest'>
  }>[]
  rules: readonly DeepSeekStableCapabilityRuleV2[]
  toolPolicy: Readonly<{
    kind: 'function_tools_only'
    betaStrictField: 'forbidden'
    thinkingEnabledToolChoice: 'omitted_only'
    thinkingDisabledToolChoice: 'formal_chat_schema'
  }>
  continuation: Readonly<{
    kind: 'client_managed_native_replay'
    artifactKind: typeof DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2
    supportsBranchReplay: true
    supportsRestartReplay: true
  }>
  policyDigest: GenerationV2Digest<'evidence_digest'>
}>

export class DeepSeekStableCapabilityPolicyV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_CAPABILITY_CONTRACT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_CAPABILITY_EVIDENCE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_CAPABILITY_POLICY_INCOMPLETE') {
    super(code)
    this.name = 'DeepSeekStableCapabilityPolicyV2Error'
  }
}

const OFFICIAL_CHAT = 'deepseek.stable.chat.2026-07-15'
const OFFICIAL_THINKING = 'deepseek.stable.thinking.2026-07-15'
const STARVERSE_POLICY = DEEPSEEK_STABLE_OWNER_CAPABILITY_POLICY_EVIDENCE_ID_V2
const policyAuthorities = new WeakSet<object>()

function digest(value: unknown): GenerationV2Digest<'evidence_digest'> {
  return GenerationV2Digest.create(
    'evidence_digest',
    createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex'),
  )
}

function rule(
  path: RuntimeCapabilitySemanticPathV2,
  kind: DeepSeekStableCapabilityRuleKindV2,
  evidenceId: string | undefined,
  rest: Omit<DeepSeekStableCapabilityRuleV2, 'path' | 'kind' | 'evidenceId'> = {},
): DeepSeekStableCapabilityRuleV2 {
  return Object.freeze({ path, kind, ...(evidenceId === undefined ? {} : { evidenceId }), ...rest })
}

function createPolicy(): VerifiedDeepSeekStableCapabilityPolicyV2 {
  const contract = readDeepSeekStableApiContractV2()
  const reviewedDefinition = readReviewedDeepSeekStableChatDefinitionV2()
  if (!isDeepSeekStableApiContractV2(contract)) {
    throw new DeepSeekStableCapabilityPolicyV2Error('GENERATION_V2_DEEPSEEK_CAPABILITY_CONTRACT_INVALID')
  }
  if (!isReviewedProviderContractDefinitionV2(reviewedDefinition) ||
      reviewedDefinition.protocolContractId.value !== 'deepseek-stable-chat-v1' ||
      reviewedDefinition.providerId.value !== contract.providerId ||
      reviewedDefinition.evidence.localArtifacts.length !== 2) {
    throw new DeepSeekStableCapabilityPolicyV2Error('GENERATION_V2_DEEPSEEK_CAPABILITY_EVIDENCE_INVALID')
  }
  const contractArtifact = reviewedDefinition.evidence.localArtifacts.find(
    (artifact) => artifact.id === 'deepseek-stable-api-contract-20260715',
  )
  const ownerPolicyArtifact = reviewedDefinition.evidence.localArtifacts.find(
    (artifact) => artifact.id === 'deepseek-stable-owner-capability-policy-v2-20260717',
  )
  if (!contractArtifact || !ownerPolicyArtifact) {
    throw new DeepSeekStableCapabilityPolicyV2Error('GENERATION_V2_DEEPSEEK_CAPABILITY_EVIDENCE_INVALID')
  }
  const contractArtifactDigest = GenerationV2Digest.create('evidence_digest', contractArtifact.sha256)
  const ownerPolicyArtifactDigest = GenerationV2Digest.create('evidence_digest', ownerPolicyArtifact.sha256)
  const unsupported = (path: RuntimeCapabilitySemanticPathV2, evidenceId = STARVERSE_POLICY) =>
    rule(path, 'unsupported', evidenceId, {
      rejectionCode: 'DEEPSEEK_UNSUPPORTED_EXPLICIT_FIELD',
    })
  const unavailable = (path: RuntimeCapabilitySemanticPathV2) =>
    rule(path, 'unavailable_pending_authority', undefined)
  const acceptedNoWire = (
    path: RuntimeCapabilitySemanticPathV2,
    domain?: RuntimeCapabilityDomainV2,
  ) => rule(path, 'accepted_no_wire', STARVERSE_POLICY, domain === undefined ? {} : { domain })
  const rules: DeepSeekStableCapabilityRuleV2[] = [
    acceptedNoWire('attachments[].assetId', Object.freeze({ kind: 'identity' })),
    acceptedNoWire('attachments[].assetRevisionId', Object.freeze({ kind: 'identity' })),
    acceptedNoWire('attachments[].assetSha256', Object.freeze({ kind: 'identity' })),
    unavailable('attachments[].capturedAtMs'),
    unavailable('attachments[].conversion'),
    unavailable('attachments[].declaredMediaType'),
    unavailable('attachments[].include'),
    unavailable('attachments[].kind'),
    unavailable('attachments[].mediaKind'),
    unavailable('attachments[].originalUrl'),
    unavailable('attachments[].provenance'),
    unavailable('attachments[].referenceId'),
    unavailable('attachments[].referenceRevision'),
    unavailable('attachments[].sendAs'),
    unavailable('attachments[].urlDigest'),
    unsupported('generation.candidateCount'),
    unsupported('generation.frequencyPenalty'),
    unavailable('generation.maxOutputTokens'),
    unsupported('generation.minP'),
    unsupported('generation.presencePenalty'),
    unsupported('generation.repetitionPenalty'),
    unsupported('generation.seed'),
    unavailable('generation.stop'),
    rule('generation.temperature', 'supported_when_reasoning_disabled', OFFICIAL_THINKING, {
      wireKey: 'temperature', domain: Object.freeze({ kind: 'range', min: 0, max: 2, integer: false }),
      rejectionCode: 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED',
    }),
    unsupported('generation.topA'),
    unsupported('generation.topK'),
    rule('generation.topP', 'supported_when_reasoning_disabled', OFFICIAL_THINKING, {
      wireKey: 'top_p', domain: Object.freeze({ kind: 'range', min: 0, max: 1, integer: false }),
      rejectionCode: 'DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED',
    }),
    unsupported('image.aspectRatio'),
    unsupported('image.background'),
    unsupported('image.format'),
    rule('image.mode', 'accepted_no_wire', STARVERSE_POLICY, {
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['disabled']) }),
    }),
    unsupported('image.outputCompression'),
    unsupported('image.outputMode'),
    unsupported('image.quality'),
    unsupported('image.resolution'),
    unsupported('image.size'),
    unsupported('image.stream'),
    unsupported('providerExtension.includeThoughts'),
    rule('providerExtension.kind', 'supported_static', STARVERSE_POLICY, {
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['none']) }),
    }),
    unsupported('providerExtension.maxToolCalls'),
    unsupported('providerExtension.manualThinkingBudgetTokens'),
    unsupported('providerExtension.parallelToolCalls'),
    unsupported('providerExtension.reasoningContext'),
    unsupported('providerExtension.reasoningMode'),
    unsupported('providerExtension.responseFormat'),
    unsupported('providerExtension.serviceTier'),
    unsupported('providerExtension.thinkingBudget'),
    unsupported('providerExtension.thinkingDisplay'),
    unsupported('providerExtension.thinkingLevel'),
    unsupported('providerExtension.thinkingMode'),
    unsupported('providerExtension.verbosity'),
    unavailable('reasoning.effort'),
    rule('reasoning.mode', 'accepted_no_wire', STARVERSE_POLICY, {
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['disabled']) }),
    }),
    unsupported('reasoning.summary'),
    unsupported('reasoning.exclude'),
    unavailable('tools.allowedToolIds'),
    rule('tools.mode', 'supported_static', OFFICIAL_CHAT, {
      wireKey: 'tools', domain: Object.freeze({ kind: 'enum', values: Object.freeze(['disabled', 'enabled']) }),
    }),
    rule('tools.sideEffectConfirmation', 'requires_side_effect_confirmation_policy', STARVERSE_POLICY, {
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['required_each_retry']) }),
    }),
    rule('tools.toolChoice', 'supported_conditional_tool_choice', OFFICIAL_THINKING, {
      wireKey: 'tool_choice',
      domain: Object.freeze({
        kind: 'enum', values: Object.freeze(['omitted', 'auto', 'none', 'required', 'named']),
      }),
      toolChoiceMatrix: Object.freeze({
        appliesWhenToolsMode: 'enabled' as const,
        registryAuthority: 'required_exact_revision' as const,
        allowedToolSet: 'nonempty_exact' as const,
        reasoningEnabled: Object.freeze({
          allowedModes: Object.freeze(['omitted'] as const),
          explicitRejectionCode: 'DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED' as const,
        }),
        reasoningDisabled: Object.freeze({
          allowedModes: Object.freeze(['omitted', 'auto', 'none', 'required', 'named'] as const),
          autoRequiresVerifiedNonemptyToolSet: true as const,
          requiredRequiresVerifiedNonemptyToolSet: true as const,
          namedToolRequiresRegistryMembership: true as const,
        }),
      }),
    }),
    rule('web.mode', 'accepted_no_wire', STARVERSE_POLICY, {
      domain: Object.freeze({ kind: 'enum', values: Object.freeze(['disabled']) }),
    }),
    unsupported('web.allowedDomains'),
    unsupported('web.engine'),
    unsupported('web.excludedDomains'),
    unsupported('web.maxCharacters'),
    unsupported('web.maxResults'),
    unsupported('web.maxTotalResults'),
    unsupported('web.searchContextSize'),
    unsupported('web.types'),
    unsupported('web.userLocation'),
  ]
  rules.sort((left, right) =>
    RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.indexOf(left.path) -
      RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.indexOf(right.path))
  if (rules.length !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.length ||
      rules.some((entry, index) => entry.path !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2[index]) ||
      new Set(rules.map((entry) => entry.path)).size !== rules.length) {
    throw new DeepSeekStableCapabilityPolicyV2Error('GENERATION_V2_DEEPSEEK_CAPABILITY_POLICY_INCOMPLETE')
  }
  const evidence = Object.freeze([
    Object.freeze({
      evidenceId: OFFICIAL_CHAT,
      verifiedAt: contract.evidence.verifiedAt,
      sourceRefs: Object.freeze([
        contract.evidence.provenanceUrls[0], contract.evidence.provenanceUrls[3],
      ]),
      localArtifact: Object.freeze({ id: contractArtifact.id, path: contractArtifact.path }),
      contentDigest: contractArtifactDigest,
    }),
    Object.freeze({
      evidenceId: OFFICIAL_THINKING,
      verifiedAt: contract.evidence.verifiedAt,
      sourceRefs: Object.freeze([
        contract.evidence.provenanceUrls[2], contract.evidence.provenanceUrls[3],
      ]),
      localArtifact: Object.freeze({ id: contractArtifact.id, path: contractArtifact.path }),
      contentDigest: contractArtifactDigest,
    }),
    Object.freeze({
      evidenceId: STARVERSE_POLICY,
      verifiedAt: '2026-07-17',
      sourceRefs: Object.freeze([
        'docs/architecture/generation-compiler-v2/tp7-provider-contracts.md',
      ]),
      localArtifact: Object.freeze({ id: ownerPolicyArtifact.id, path: ownerPolicyArtifact.path }),
      contentDigest: ownerPolicyArtifactDigest,
    }),
  ])
  const toolPolicy = Object.freeze({
    kind: 'function_tools_only' as const,
    betaStrictField: 'forbidden' as const,
    thinkingEnabledToolChoice: 'omitted_only' as const,
    thinkingDisabledToolChoice: 'formal_chat_schema' as const,
  })
  const continuation = Object.freeze({
    kind: 'client_managed_native_replay' as const,
    artifactKind: DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
    supportsBranchReplay: true as const,
    supportsRestartReplay: true as const,
  })
  const policyDigest = digest({
    providerId: contract.providerId,
    contractFamilyId: contract.contractFamilyId,
    verifiedAt: contract.evidence.verifiedAt,
    evidence: evidence.map((entry) => ({
      evidenceId: entry.evidenceId,
      verifiedAt: entry.verifiedAt,
      sourceRefs: entry.sourceRefs,
      localArtifact: entry.localArtifact,
      contentDigest: entry.contentDigest.value,
    })),
    rules,
    toolPolicy,
    continuation,
  })
  const policy = Object.freeze({
    classification: 'verified_deepseek_stable_family_capability_policy_non_executable' as const,
    trust: 'verified_deepseek_stable_capability_policy' as const,
    usage: 'runtime_capability_resolution_input_only' as const,
    executionAuthority: 'none' as const,
    providerId: GenerationV2Identity.create('provider_id', contract.providerId),
    contractFamilyId: contract.contractFamilyId,
    verifiedAt: contract.evidence.verifiedAt,
    evidence,
    rules: Object.freeze(rules),
    toolPolicy,
    continuation,
    policyDigest,
  })
  policyAuthorities.add(policy)
  return policy
}

const policy = createPolicy()

export function readVerifiedDeepSeekStableCapabilityPolicyV2(): VerifiedDeepSeekStableCapabilityPolicyV2 {
  return policy
}

export function isVerifiedDeepSeekStableCapabilityPolicyV2(
  value: unknown,
): value is VerifiedDeepSeekStableCapabilityPolicyV2 {
  return Boolean(value && typeof value === 'object' && policyAuthorities.has(value))
}
