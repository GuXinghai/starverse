import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../domain/providerBindingV2'
import type { ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import type { PersistedModelCapabilityFieldV2, PersistedModelCapabilityEvidenceV2 } from '../capability/modelCapabilitySchemaV2'
import { projectCanonicalModelFactsV2 } from '../capability/canonicalModelFactsV2'
import type { RequestRuleDecisionV2, RequestRuleResolutionResultV2 } from '../capability-rules/requestRuleResolverV2'
import type { BoundRequestRulesV2 } from '../capability-rules/boundRequestRulesV2'
import { decodeResolvedToolDefinitionsV2, type ResolvedToolDefinitionsV2 } from '../capability-rules/operations/toolDefinitionsV2'
import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { stableSerializeProviderRequestBoundedV2 } from './stableSerialize'
import { readApiRequestBodyContractV2 } from '../contracts/apiRequestBodyContractV2'
import { readEndpointTransportDefinitionV2 } from '../contracts/endpointTransportDefinitionV2'

export const REQUEST_RULE_RESOLVER_REVISION_V2 = 'request-rule-resolver-v2:20261017-4'
const MAX_BYTES = 1024 * 1024
function digest(value: unknown): string { return sha256Hex(stableSerializeProviderRequestBoundedV2(value, MAX_BYTES)) }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
export type ResolvedInvocationV2 = Readonly<{
  schemaVersion: 2
  resolverRevision: string
  requestedIntentDigest: string
  effectiveIntentDigest: string
  targetFingerprint: string
  baseCapabilityRevision: string
  baseSemanticFieldsDigest: string
  sourcePriorityConfigRevision: string | null
  ruleBundleRevision: string
  ownerSnapshotRevisions: readonly string[]
  decisions: readonly RequestRuleDecisionV2[]
  toolDefinitions?: ResolvedToolDefinitionsV2
  capabilityFields: readonly PersistedModelCapabilityFieldV2[]
  capabilityEvidence: readonly PersistedModelCapabilityEvidenceV2[]
  nativeParameters: Readonly<Record<string, unknown>>
  bodySchemaRevision: string
  transportRevision: string
  encoderRevision: string
  invocationHash: string
}>

export function createResolvedInvocationV2(input: Readonly<{
  requested: GenerationIntentLayerV2
  capability: ResolvedCapabilityV2
  bundle: BoundRequestRulesV2
  resolution: RequestRuleResolutionResultV2
  toolDefinitions?: ResolvedToolDefinitionsV2
}>): ResolvedInvocationV2 {
  const execution = input.capability.executionContext
  const binding = execution.binding
  const projected = projectGenerationIntentLayerV2(input.resolution.intent.value)
  const toolDefinitions = input.toolDefinitions ?? input.resolution.toolDefinitions
  if (input.toolDefinitions !== undefined && input.resolution.toolDefinitions !== undefined &&
      digest(input.toolDefinitions) !== digest(input.resolution.toolDefinitions)) {
    throw new Error('GENERATION_V2_RESOLVED_INVOCATION_TOOL_DEFINITIONS_MISMATCH')
  }
  const payload = {
    schemaVersion: 2 as const, resolverRevision: REQUEST_RULE_RESOLVER_REVISION_V2,
    requestedIntentDigest: digest(projectGenerationIntentLayerV2(input.requested)),
    effectiveIntentDigest: digest(projected), targetFingerprint: digest(projectDecodedProviderBindingRecordV2(binding)),
    baseCapabilityRevision: input.capability.modelFacts.capabilityRevision,
    baseSemanticFieldsDigest: input.capability.modelFacts.semanticFieldsDigest,
    sourcePriorityConfigRevision: input.capability.modelFactsResolution?.sourcePriorityConfigRevision ?? null,
    ruleBundleRevision: input.bundle.bundleRevision, ownerSnapshotRevisions: input.bundle.ownerSnapshotRevisions,
    decisions: input.resolution.decisions, capabilityFields: input.resolution.capabilityFields,
    ...(toolDefinitions === undefined ? {} : { toolDefinitions: decodeResolvedToolDefinitionsV2(toolDefinitions) }),
    capabilityEvidence: projectCanonicalModelFactsV2({ ...input.capability.modelFacts,
      fields: input.resolution.capabilityFields, evidence: input.resolution.capabilityEvidence }).evidence,
    nativeParameters: { generation: projected.generation, reasoning: projected.reasoning, providerExtension: projected.providerExtension },
    bodySchemaRevision: readApiRequestBodyContractV2(binding.providerId.value, binding.operation).bodySchemaRevision,
    transportRevision: readEndpointTransportDefinitionV2(binding.providerId.value, binding.operation).transportRevision,
    encoderRevision: execution.encodingCoverage.encoderRevision,
  }
  return freeze({ ...payload, invocationHash: digest(payload) })
}

export function decodeResolvedInvocationV2(value: unknown): ResolvedInvocationV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GENERATION_V2_RESOLVED_INVOCATION_INVALID')
  const input = JSON.parse(stableSerializeProviderRequestBoundedV2(value, MAX_BYTES)) as ResolvedInvocationV2
  const requiredKeys = ['schemaVersion', 'resolverRevision', 'requestedIntentDigest', 'effectiveIntentDigest', 'targetFingerprint',
    'baseCapabilityRevision', 'baseSemanticFieldsDigest', 'sourcePriorityConfigRevision', 'ruleBundleRevision',
    'ownerSnapshotRevisions', 'decisions', 'capabilityFields', 'capabilityEvidence', 'nativeParameters', 'bodySchemaRevision',
    'transportRevision', 'encoderRevision', 'invocationHash']
  const allowedKeys = [...requiredKeys, 'toolDefinitions'].sort()
  const inputKeys = Object.keys(input).sort()
  if (input.schemaVersion !== 2 || requiredKeys.some((key) => !inputKeys.includes(key)) ||
      inputKeys.some((key) => !allowedKeys.includes(key)) ||
      !Array.isArray(input.decisions) || !Array.isArray(input.capabilityFields) || !Array.isArray(input.capabilityEvidence) || !Array.isArray(input.ownerSnapshotRevisions)) {
    throw new Error('GENERATION_V2_RESOLVED_INVOCATION_INVALID')
  }
  const normalizedInput = input.toolDefinitions === undefined ? input : Object.freeze({
    ...input,
    toolDefinitions: decodeResolvedToolDefinitionsV2(input.toolDefinitions),
  })
  const { invocationHash, ...payload } = normalizedInput
  if (digest(payload) !== invocationHash) throw new Error('GENERATION_V2_RESOLVED_INVOCATION_HASH_MISMATCH')
  return freeze(normalizedInput)
}

export function assertResolvedInvocationBindingV2(invocation: ResolvedInvocationV2, input: Readonly<{
  requested?: GenerationIntentLayerV2
  effective: GenerationIntentLayerV2
  capabilityRevision: string
  encoderRevision: string
  binding: ResolvedCapabilityV2['executionContext']['binding']
  semanticFieldsDigest?: string
}>): void {
  decodeResolvedInvocationV2(invocation)
  if (invocation.effectiveIntentDigest !== digest(projectGenerationIntentLayerV2(input.effective)) ||
      invocation.targetFingerprint !== digest(projectDecodedProviderBindingRecordV2(input.binding)) ||
      invocation.baseCapabilityRevision !== input.capabilityRevision || invocation.encoderRevision !== input.encoderRevision ||
      input.semanticFieldsDigest !== undefined && invocation.baseSemanticFieldsDigest !== input.semanticFieldsDigest ||
      input.requested !== undefined && invocation.requestedIntentDigest !== digest(projectGenerationIntentLayerV2(input.requested))) {
    throw new Error('GENERATION_V2_RESOLVED_INVOCATION_BINDING_MISMATCH')
  }
}
