import type { GenerationOperationV2 } from '../domain/providerBindingV2'
import {
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from '../domain/providerBindingV2'
import {
  decodeRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilitySnapshotV2,
} from './runtimeCapabilitySnapshotV2'
import {
  projectGenerationControlsProjectionV2,
  resolvedCapabilityFromRuntimeSnapshotV2,
  type GenerationControlsProjectionV2,
  type ResolvedCapabilityV2,
} from './resolvedCapabilityV2'
import { projectCanonicalModelFactsV2 } from './canonicalModelFactsV2'

export type GenerationCapabilityProviderIdV2 =
  | 'openrouter'
  | 'openai_responses'
  | 'anthropic'
  | 'deepseek'
  | 'google_ai_studio'
  | 'lmstudio'
  | 'generic_local'
  | 'ollama'
  | 'openai_compatible'

export type GenerationCapabilityResolutionRequestV2 = Readonly<{
  providerId: GenerationCapabilityProviderIdV2
  credentialRevision: number
  credentialScopeId: string
  /** Capability-scope identity; for OpenAI-compatible this is providerInstanceId. */
  endpointProfileId: string
  protocolId: string
  modelId: string
  operation: Extract<GenerationOperationV2, 'text' | 'image_generate'>
}>

/** Plain IPC-safe form of the command-independent resolved capability. */
export type ResolvedCapabilityV2Wire = Readonly<{
  schemaVersion: 2
  modelFacts: Readonly<{
    schemaVersion: 1
    identity: ResolvedCapabilityV2['modelFacts']['identity']
    evidence: readonly Readonly<Record<string, unknown>>[]
    fields: ResolvedCapabilityV2['modelFacts']['fields']
    evidenceDigest: string
    semanticFieldsDigest: string
    capabilityRevision: string
  }>
  executionContext: Readonly<{
    binding: Readonly<Record<string, unknown>>
    catalogAuthority?: Readonly<Record<string, unknown>>
    continuation: ResolvedCapabilityV2['executionContext']['continuation']
    encodingCoverage: Readonly<{
      providerId: string
      protocolContractId: string
      operation: string
      semanticPaths: readonly string[]
      encoderRevision: string
    }>
  }>
}>

export type GenerationCapabilityResolutionResultV2 = Readonly<{
  resolvedCapability: ResolvedCapabilityV2Wire
  controlsProjection: GenerationControlsProjectionV2
}>

export class GenerationCapabilityResolutionV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_INVALID_REQUEST'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE'
    | 'GENERATION_V2_CAPABILITY_RESOLUTION_STALE') {
    super(code)
    this.name = 'GenerationCapabilityResolutionV2Error'
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value
}

export function decodeGenerationCapabilityResolutionRequestV2(
  value: unknown,
): GenerationCapabilityResolutionRequestV2 {
  if (!plainObject(value)) throw new GenerationCapabilityResolutionV2Error('GENERATION_V2_CAPABILITY_RESOLUTION_INVALID_REQUEST')
  const keys = Object.keys(value).sort()
  const expected = ['credentialRevision', 'credentialScopeId', 'endpointProfileId', 'modelId', 'operation', 'protocolId', 'providerId']
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      !nonEmpty(value.credentialScopeId) || !nonEmpty(value.endpointProfileId) || !nonEmpty(value.protocolId) ||
      !nonEmpty(value.modelId) ||
      !Number.isSafeInteger(value.credentialRevision) || (value.credentialRevision as number) < 0 ||
      !['text', 'image_generate'].includes(value.operation as string) ||
      !['openrouter', 'openai_responses', 'anthropic', 'deepseek', 'google_ai_studio', 'lmstudio',
        'generic_local', 'ollama', 'openai_compatible'].includes(value.providerId as string)) {
    throw new GenerationCapabilityResolutionV2Error('GENERATION_V2_CAPABILITY_RESOLUTION_INVALID_REQUEST')
  }
  return Object.freeze({
    providerId: value.providerId as GenerationCapabilityProviderIdV2,
    credentialRevision: value.credentialRevision as number,
    credentialScopeId: value.credentialScopeId,
    endpointProfileId: value.endpointProfileId,
    protocolId: value.protocolId,
    modelId: value.modelId,
    operation: value.operation as 'text' | 'image_generate',
  })
}

function wireCapability(capability: ResolvedCapabilityV2): ResolvedCapabilityV2Wire {
  const facts = capability.modelFacts
  const execution = capability.executionContext
  const binding = projectDecodedProviderBindingRecordV2(execution.binding)
  return Object.freeze({
    schemaVersion: 2,
    modelFacts: projectCanonicalModelFactsV2(facts),
    executionContext: Object.freeze({ binding,
      ...(execution.catalogAuthority ? { catalogAuthority: execution.catalogAuthority } : {}),
      continuation: execution.continuation,
      encodingCoverage: Object.freeze({ providerId: execution.encodingCoverage.providerId,
        protocolContractId: execution.encodingCoverage.protocolContractId,
        operation: execution.encodingCoverage.operation,
        semanticPaths: execution.encodingCoverage.semanticPaths,
        encoderRevision: execution.encodingCoverage.encoderRevision }) }),
  })
}

export function projectGenerationCapabilityResolutionV2(
  capability: ResolvedCapabilityV2,
): GenerationCapabilityResolutionResultV2 {
  return Object.freeze({
    resolvedCapability: wireCapability(capability),
    controlsProjection: projectGenerationControlsProjectionV2(capability),
  })
}

export function assertCapabilityResolutionScopeV2(
  request: GenerationCapabilityResolutionRequestV2,
  binding: DecodedProviderBindingRecordV2,
): void {
  if (binding.providerId.value !== request.providerId || binding.credentialScopeId.value !== request.credentialScopeId ||
      binding.endpointProfileId.value !== request.endpointProfileId || binding.protocolContractId.value !== request.protocolId ||
      binding.modelId.value !== request.modelId || binding.operation !== request.operation) {
    throw new GenerationCapabilityResolutionV2Error('GENERATION_V2_CAPABILITY_RESOLUTION_UNSUPPORTED_SCOPE')
  }
}

/** Runtime snapshot to capability result without creating another authority. */
export function projectPersistedGenerationCapabilityV2(
  record: PersistedRuntimeCapabilitySnapshotV2,
): GenerationCapabilityResolutionResultV2 {
  // Kept as a small adapter for callers that already own the canonical record;
  // the decoded snapshot remains the validation boundary.
  return projectGenerationCapabilityResolutionV2(resolvedCapabilityFromRuntimeSnapshotV2(decodeRuntimeCapabilitySnapshotV2(record)))
}
