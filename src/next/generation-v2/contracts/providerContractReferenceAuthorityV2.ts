import {
  readGenerationV2Digest,
  readGenerationV2Identity,
  type GenerationV2Digest,
  type GenerationV2Identity,
} from '../domain/identityV2'
import {
  decodeProviderBindingRecordV2,
  type GenerationOperationV2,
} from '../domain/providerBindingV2'
import {
  isReviewedProviderContractDefinitionV2,
  lookupReviewedProviderContractDefinitionV2,
  readProviderContractRegistryRevisionV2,
  type ReviewedProviderContractDefinitionV2,
} from './providerContractRegistryV2'

export type VerifiedProviderContractReferenceV2 = Readonly<{
  classification: 'verified_provider_contract_reference_non_executable'
  trust: 'verified_provider_contract_reference'
  usage: 'snapshot_contract_provenance_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  protocolContractId: GenerationV2Identity<'protocol_contract_id'>
  contractRevision: GenerationV2Identity<'contract_revision'>
  contractDefinitionDigest: GenerationV2Digest<'contract_digest'>
  registryRevision: GenerationV2Identity<'registry_revision'>
  operation: GenerationOperationV2
  reviewedDefinition: ReviewedProviderContractDefinitionV2
}>

export class ProviderContractReferenceAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONTRACT_REFERENCE_MISMATCH'
    | 'GENERATION_V2_CONTRACT_REFERENCE_REGISTRY_INVALID') {
    super(code)
    this.name = 'ProviderContractReferenceAuthorityV2Error'
  }
}

const verifiedReferences = new WeakSet<object>()

export function verifyProviderContractReferenceV2(value: unknown): VerifiedProviderContractReferenceV2 {
  const binding = decodeProviderBindingRecordV2(value)
  const definition = lookupReviewedProviderContractDefinitionV2({
    protocolContractId: readGenerationV2Identity(binding.protocolContractId, 'protocol_contract_id'),
    contractRevision: readGenerationV2Identity(binding.contractRevision, 'contract_revision'),
  })
  if (!isReviewedProviderContractDefinitionV2(definition) ||
      definition.registryRevision !== readProviderContractRegistryRevisionV2() ||
      definition.implementationStatus !== 'definition_only' ||
      definition.executionAuthority !== 'none') {
    throw new ProviderContractReferenceAuthorityV2Error('GENERATION_V2_CONTRACT_REFERENCE_REGISTRY_INVALID')
  }
  if (readGenerationV2Identity(binding.providerId, 'provider_id') !==
        readGenerationV2Identity(definition.providerId, 'provider_id') ||
      readGenerationV2Digest(binding.contractDefinitionDigest, 'contract_digest') !==
        readGenerationV2Digest(definition.definitionDigest, 'contract_digest') ||
      readGenerationV2Identity(binding.registryRevision, 'registry_revision') !==
        readGenerationV2Identity(definition.registryRevision, 'registry_revision') ||
      !definition.operations.includes(binding.operation)) {
    throw new ProviderContractReferenceAuthorityV2Error('GENERATION_V2_CONTRACT_REFERENCE_MISMATCH')
  }
  const reference: VerifiedProviderContractReferenceV2 = Object.freeze({
    classification: 'verified_provider_contract_reference_non_executable',
    trust: 'verified_provider_contract_reference',
    usage: 'snapshot_contract_provenance_only',
    executionAuthority: 'none',
    providerId: definition.providerId,
    protocolContractId: definition.protocolContractId,
    contractRevision: definition.contractRevision,
    contractDefinitionDigest: definition.definitionDigest,
    registryRevision: definition.registryRevision,
    operation: binding.operation,
    reviewedDefinition: definition,
  })
  verifiedReferences.add(reference)
  return reference
}

export function isVerifiedProviderContractReferenceV2(
  value: unknown,
): value is VerifiedProviderContractReferenceV2 {
  return Boolean(value && typeof value === 'object' && verifiedReferences.has(value))
}
