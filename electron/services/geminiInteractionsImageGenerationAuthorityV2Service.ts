import { createHash } from 'node:crypto'
import {
  decodeRuntimeCapabilitySnapshotV2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilitySnapshotV2,
} from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 as RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type PersistedModelCapabilityFieldV2 as PersistedRuntimeCapabilityFieldV2,
  type ModelCapabilityDomainV2 as RuntimeCapabilityDomainV2,
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
  isReviewedProviderContractDefinitionV2,
  readReviewedGeminiInteractionsDefinitionV2,
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
import {
  isGenerationCommandFactsAuthorityForContextV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isVerifiedGeminiDeveloperApiEndpointProfileV2,
  readVerifiedGeminiDeveloperApiEndpointProfileV2,
} from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import {
  applyCapabilityRuleProjectionV2,
  assertCapabilityRuleProjectionIdentityV2,
  type CapabilityRuleProjectionV2,
} from '../../src/next/generation-v2/capability-rules/capabilityRuleV2'
import {
  isActiveCatalogModelAuthorityV2,
  projectActiveCatalogSnapshotAuthorityV2,
  type ActiveCatalogModelAuthorityV2,
} from './activeCatalogModelAuthorityV2Service'

export type VerifiedGeminiInteractionsImageProviderBindingAuthorityV2 = Readonly<{
  trust: 'verified_gemini_interactions_image_provider_binding'
  usage: 'runtime_capability_and_snapshot_input_only'
  executionAuthority: 'none'
  binding: DecodedProviderBindingRecordV2
  contractReference: VerifiedProviderContractReferenceV2
  catalogAuthority: ActiveCatalogModelAuthorityV2
  credentialRevision: number
  assertCurrent(): void
}>
export type VerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2 = Readonly<{
  trust: 'verified_gemini_interactions_image_runtime_capability'
  usage: 'snapshot_commit_input_only'
  executionAuthority: 'none'
  bindingAuthority: VerifiedGeminiInteractionsImageProviderBindingAuthorityV2
  resolvedCapability: ResolvedCapabilityV2
  record: PersistedRuntimeCapabilitySnapshotV2
  snapshot: DecodedRuntimeCapabilitySnapshotV2
  assertCurrent(): void
}>

export class GeminiInteractionsImageGenerationAuthorityV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_AUTHORITY_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_INTENT_UNSUPPORTED') { super(code); this.name = 'GeminiInteractionsImageGenerationAuthorityV2Error' }
}

const bindings = new WeakSet<object>()
const capabilities = new WeakSet<object>()
const SUPPORTS = 'gemini.interactions.image.v1beta.official.supports'
const REJECTS = 'gemini.interactions.image.v1beta.model-matrix.rejects'
function invalid(): never { throw new GeminiInteractionsImageGenerationAuthorityV2Error('GENERATION_V2_GEMINI_INTERACTIONS_AUTHORITY_INVALID') }
function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function supported(path: RuntimeCapabilitySemanticPathV2, domain: RuntimeCapabilityDomainV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'supported', domain, constraints: Object.freeze([]), evidenceIds: Object.freeze([SUPPORTS]) })
}
function unsupported(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'unsupported', constraints: Object.freeze([]), evidenceIds: Object.freeze([REJECTS]) })
}
function missing(path: RuntimeCapabilitySemanticPathV2): PersistedRuntimeCapabilityFieldV2 {
  return Object.freeze({ path, state: 'missing', constraints: Object.freeze([]), evidenceIds: Object.freeze([]) })
}
function baseFields(): readonly PersistedRuntimeCapabilityFieldV2[] {
  const values = new Map(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => [path, missing(path)] as const))
  values.set('generation.temperature', supported('generation.temperature', { kind: 'range', min: 0, max: 2, integer: false }))
  values.set('generation.topP', supported('generation.topP', { kind: 'range', min: 0, max: 1, integer: false }))
  values.set('reasoning.mode', supported('reasoning.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('web.mode', supported('web.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('tools.mode', supported('tools.mode', { kind: 'enum', values: Object.freeze(['disabled']) }))
  values.set('providerExtension.kind', supported('providerExtension.kind', { kind: 'enum', values: Object.freeze(['none']) }))
  values.set('image.format', supported('image.format', { kind: 'enum', values: Object.freeze(['jpeg']) }))
  values.set('image.stream', supported('image.stream', { kind: 'boolean' }))
  for (const path of ['generation.seed', 'generation.frequencyPenalty', 'generation.presencePenalty',
    'generation.repetitionPenalty'] as const) values.set(path, unsupported(path))
  return Object.freeze(RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((path) => values.get(path)!))
}

function validateFacts(facts: GenerationCommandFactsAuthorityV2): void {
  if (facts.attachmentSet.attachments.some((attachment) => attachment.intent.include) ||
      facts.attachmentSet.urlReferenceIntents.some((attachment) => attachment.include) ||
      facts.attachmentSet.providerFileRequirements.length !== 0 || facts.attachmentSet.requiresProviderFileAuthority) {
    throw new GeminiInteractionsImageGenerationAuthorityV2Error('GENERATION_V2_GEMINI_INTERACTIONS_INTENT_UNSUPPORTED')
  }
}

function composeBinding(catalogAuthority: ActiveCatalogModelAuthorityV2, modelId: string) {
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const definition = readReviewedGeminiInteractionsDefinitionV2()
  if (!isVerifiedGeminiDeveloperApiEndpointProfileV2(profile) || !isReviewedProviderContractDefinitionV2(definition) ||
      definition.protocolContractId.value !== 'gemini-interactions-v1beta' || definition.providerId.value !== 'google_ai_studio' ||
      !isActiveCatalogModelAuthorityV2(catalogAuthority, 'google_ai_studio') ||
      catalogAuthority.modelId?.value !== modelId) invalid()
  catalogAuthority.assertCurrent()
  const descriptor = profile.descriptors.interactions
  const candidate = Object.freeze({
    credentialScopeId: typeof catalogAuthority.credentialScopeId === 'string'
      ? catalogAuthority.credentialScopeId
      : catalogAuthority.credentialScopeId?.value,
    providerId: readGenerationV2Identity(profile.providerId, 'provider_id'),
    endpointProfileId: readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id'),
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: readGenerationV2Identity(profile.endpointSetRevision, 'endpoint_set_revision'),
      descriptors: [{ endpointId: readGenerationV2Identity(descriptor.endpointId, 'endpoint_id'),
        descriptorRevision: readGenerationV2Identity(descriptor.descriptorRevision, 'descriptor_revision') }] },
    protocolContractId: readGenerationV2Identity(definition.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(definition.contractRevision, 'contract_revision'),
    contractDefinitionDigest: readGenerationV2Digest(definition.definitionDigest, 'contract_digest'),
    registryRevision: readGenerationV2Identity(definition.registryRevision, 'registry_revision'),
    modelId, operation: 'image_generate',
  })
  const binding = decodeProviderBindingRecordV2(candidate)
  const contractReference = verifyProviderContractReferenceV2(candidate)
  if (!isVerifiedProviderContractReferenceV2(contractReference) || contractReference.reviewedDefinition !== definition) invalid()
  const authority = Object.freeze({
    trust: 'verified_gemini_interactions_image_provider_binding' as const,
    usage: 'runtime_capability_and_snapshot_input_only' as const, executionAuthority: 'none' as const,
    binding, contractReference, catalogAuthority,
    credentialRevision: catalogAuthority.credentialRevision,
    assertCurrent: () => { if (!bindings.has(authority)) invalid(); catalogAuthority.assertCurrent() },
  })
  bindings.add(authority)
  return authority
}
function composeCapability(binding: VerifiedGeminiInteractionsImageProviderBindingAuthorityV2,
  capabilityRules: CapabilityRuleProjectionV2) {
  const baseEvidence = [
      { evidenceId: SUPPORTS, kind: 'official_documentation' as const, effect: 'supports' as const,
        sourceRef: 'https://ai.google.dev/gemini-api/docs/image-generation', verifiedAt: '2026-07-20T00:00:00.000Z', contentDigest: hash(SUPPORTS) },
      { evidenceId: REJECTS, kind: 'contract_invariant' as const, effect: 'rejects' as const,
        sourceRef: 'generation-v2-gemini-interactions-api-boundary', verifiedAt: '2026-07-20T00:00:00.000Z', contentDigest: hash(REJECTS) },
    ]
  assertCapabilityRuleProjectionIdentityV2(capabilityRules, { providerId: binding.binding.providerId.value,
    endpointProfileId: binding.binding.endpointProfileId.value, nativeModelId: binding.binding.modelId.value })
  const merged = applyCapabilityRuleProjectionV2({ baseEvidence, baseFields: baseFields(), projection: capabilityRules })
  const resolvedCapability = canonicalizeResolvedCapabilityV2({
    binding: projectDecodedProviderBindingRecordV2(binding.binding),
    evidence: merged.evidence,
    ...projectActiveCatalogSnapshotAuthorityV2(binding.catalogAuthority),
    fields: merged.fields, continuation: { kind: 'none', evidenceIds: [SUPPORTS] },
  })
  const record = runtimeSnapshotRecordFromResolvedCapabilityV2({ capability: resolvedCapability,
    resolvedAt: new Date(Date.now()).toISOString(), tools: [] })
  const snapshot = decodeRuntimeCapabilitySnapshotV2(record)
  const authority = Object.freeze({
    trust: 'verified_gemini_interactions_image_runtime_capability' as const,
    usage: 'snapshot_commit_input_only' as const, executionAuthority: 'none' as const,
    bindingAuthority: binding, resolvedCapability, record, snapshot,
    assertCurrent: () => { if (!capabilities.has(authority) || !isVerifiedGeminiInteractionsImageProviderBindingAuthorityV2(binding)) invalid(); binding.assertCurrent() },
  })
  capabilities.add(authority)
  return authority
}

/** Command-independent image capability projection for the same model matrix. */
export function resolveGeminiInteractionsImageCapabilityV2(
  modelEvidence: ActiveCatalogModelAuthorityV2,
  modelId: string,
  capabilityRules: CapabilityRuleProjectionV2,
): ResolvedCapabilityV2 {
  return composeCapability(composeBinding(modelEvidence, modelId), capabilityRules).resolvedCapability
}
export function isVerifiedGeminiInteractionsImageProviderBindingAuthorityV2(value: unknown): value is VerifiedGeminiInteractionsImageProviderBindingAuthorityV2 {
  return Boolean(value && typeof value === 'object' && bindings.has(value))
}
export function isVerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2(value: unknown): value is VerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2 {
  return Boolean(value && typeof value === 'object' && capabilities.has(value))
}
export function readVerifiedGeminiInteractionsImageProviderBindingRecordV2(
  authority: VerifiedGeminiInteractionsImageProviderBindingAuthorityV2,
): Readonly<Record<string, unknown>> {
  if (!isVerifiedGeminiInteractionsImageProviderBindingAuthorityV2(authority)) invalid()
  authority.assertCurrent()
  return projectDecodedProviderBindingRecordV2(authority.binding)
}
export function withVerifiedGeminiInteractionsImageGenerationAuthoritiesV2<T>(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  modelEvidence: ActiveCatalogModelAuthorityV2
  modelId: string
  commandFacts: GenerationCommandFactsAuthorityV2
  capabilityRules: CapabilityRuleProjectionV2
  use: (authorities: Readonly<{ binding: VerifiedGeminiInteractionsImageProviderBindingAuthorityV2;
    capability: VerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2 }>) => T
}>): T {
  if (!isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context)) invalid()
  validateFacts(input.commandFacts)
  const binding = composeBinding(input.modelEvidence, input.modelId)
  const capability = composeCapability(binding, input.capabilityRules)
  validateSemanticIntentAgainstResolvedCapabilityV2(
    capability.resolvedCapability,
    input.commandFacts.semanticIntent,
  )
  assertExpectedCapabilityRevisionV2(capability.snapshot.revision.value)
  binding.assertCurrent(); capability.assertCurrent()
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => { binding.assertCurrent(); capability.assertCurrent(); validateFacts(input.commandFacts) },
    committed: () => undefined, rolledBack: () => undefined,
  })
  return input.use(Object.freeze({ binding, capability }))
}
