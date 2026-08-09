import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  createPreparedAttachmentRequirementsV2,
  issuePreparedProviderRequestV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import {
  readVerifiedOpenRouterFirstPartyEndpointProfileV2,
  resolveOpenRouterFirstPartyOperationV2,
} from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import type { CanonicalOpenRouterImageDescriptorSetV2 } from '../../src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { projectOpenRouterImageIntentCapabilityV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageIntentCapabilityProjectionV2'
import { compileOpenRouterImageRequestV1 } from '../../src/next/generation-v2/providers/openrouter-images/imageRequestV1'

export class OpenRouterImagePreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_SEMANTIC_REJECTED') {
    super(code)
    this.name = 'OpenRouterImagePreparedRequestCompilerV2Error'
  }
}

/**
 * Compiles only the Images contract. It cannot be reached from OpenRouter Chat
 * and accepts an already selected descriptor set rather than choosing one.
 */
export function compileOpenRouterImagePreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  prompt: string
  descriptorSet: CanonicalOpenRouterImageDescriptorSetV2
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !['initial_send', 'regenerate_question', 'edit_resend', 'retry_as_new', 'retry_replace'].includes(input.execution.operation.actionKind) ||
      input.execution.operation.state !== 'committed') {
    throw new OpenRouterImagePreparedRequestCompilerV2Error(
      'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_AUTHORITY_INVALID',
    )
  }
  const { operation, snapshot, capability } = input.execution
  const binding = snapshot.providerBinding
  const selector = binding.endpointBinding.kind === 'pinned' ? binding.endpointBinding.selector : null
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const operationContract = resolveOpenRouterFirstPartyOperationV2(profile, 'image_generate')
  if (binding.providerId.value !== profile.providerId.value ||
      binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== operationContract.contract.protocolContractId.value ||
      binding.operation !== 'image_generate' || binding.modelId.value !== input.descriptorSet.modelId.value ||
      !selector || selector.kind !== 'openrouter_images_v1') {
    throw new OpenRouterImagePreparedRequestCompilerV2Error(
      'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_BINDING_INVALID',
    )
  }
  const projection = projectOpenRouterImageIntentCapabilityV2(
    projectGenerationIntentLayerV2(snapshot.semanticIntent),
  )
  const urlReferences = snapshot.semanticIntent.attachments
    .filter((attachment): attachment is Extract<typeof attachment,{kind:'url_reference'}> => attachment.kind === 'url_reference' && attachment.include)
  if (projection.issues.length > 0 || snapshot.semanticIntent.attachments.some((attachment) =>
    attachment.include && attachment.kind !== 'url_reference')) {
    throw new OpenRouterImagePreparedRequestCompilerV2Error(
      'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_SEMANTIC_REJECTED',
    )
  }
  const attachmentRequirements = createPreparedAttachmentRequirementsV2(snapshot.semanticIntent.attachments)
  const inputReferences = urlReferences.map((attachment) => attachment.originalUrl)
  const compiled = compileOpenRouterImageRequestV1({
    prompt: input.prompt,
    intent: projectGenerationIntentLayerV2(snapshot.semanticIntent),
    modelId: binding.modelId.value,
    providerTag: selector.providerTag.value,
    providerSlug: selector.providerSlug.value,
    descriptorSet: input.descriptorSet,
    inputReferences,
  })
  const attachmentEncodingProofs: PreparedAttachmentEncodingProofV2[] = attachmentRequirements.map((requirement, index) => Object.freeze({
    semanticPath: requirement.semanticPath,
    requirement,
    wireFragment: inputReferences[index],
  }))
  const ledger = createSemanticConsumptionLedgerV2(projection.dispositions.map((disposition) => {
    if (disposition.outcome === 'rejected') {
      throw new OpenRouterImagePreparedRequestCompilerV2Error(
        'GENERATION_V2_OPENROUTER_IMAGE_COMPILER_SEMANTIC_REJECTED',
      )
    }
    return {
      kind: 'consumed' as const,
      path: disposition.semanticPath,
      disposition: disposition.outcome,
      nativeField: disposition.wireKey ?? null,
      evidence: operationContract.contract.protocolContractId.value,
    }
  }))
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value,
    answerRootId: operation.targetAnswerId.value,
    requestSequence: 1,
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value,
    effectiveEndpointId: selector.providerSlug.value,
    endpoint: operationContract.url,
    headersPlan: createBearerAuthorizationHeaderPlanV2(),
    body: compiled.preparedBody,
    ledger,
    attachmentRequirements,
    attachmentEncodingProofs,
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
