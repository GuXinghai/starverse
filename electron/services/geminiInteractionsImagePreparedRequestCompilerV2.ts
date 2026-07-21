import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import { createGoogleApiKeyHeaderPlanV2, issuePreparedProviderRequestV2, type PreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { readGeminiDeveloperApiContractV2, resolveGeminiDeveloperApiEndpointV2 } from '../../src/next/generation-v2/contracts/geminiDeveloperApiContractV2'
import { compileGeminiInteractionsRequestV1 } from '../../src/next/generation-v2/providers/gemini/interactionsRequestV1'
import { projectGeminiInteractionsImageIntentV1 } from '../../src/next/generation-v2/providers/gemini/interactionsImageIntentV1'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'

export class GeminiInteractionsImagePreparedRequestCompilerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_AUTHORITY_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_BINDING_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED') { super(code); this.name = 'GeminiInteractionsImagePreparedRequestCompilerV2Error' }
}

export function compileGeminiInteractionsImagePreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  prompt: string
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !['initial_send', 'regenerate_question', 'edit_resend', 'retry_as_new', 'retry_replace'].includes(input.execution.operation.actionKind) ||
      input.execution.operation.state !== 'committed' || typeof input.prompt !== 'string' || !input.prompt.trim()) {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  const binding = snapshot.providerBinding
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const descriptor = profile.descriptors.interactions
  if (binding.providerId.value !== 'google_ai_studio' || binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== 'gemini-interactions-v1beta' || binding.operation !== 'image_generate' ||
      binding.modelId.value !== 'gemini-3.1-flash-image' || binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.descriptors[0].endpointId.value !== descriptor.endpointId.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'none') {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_BINDING_INVALID')
  }
  const projection = projectGeminiInteractionsImageIntentV1(projectGenerationIntentLayerV2(snapshot.semanticIntent))
  if (projection.issues.length !== 0 || snapshot.semanticIntent.attachments.some((attachment) => attachment.include)) {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
  }
  const compilation = compileGeminiInteractionsRequestV1({
    model: binding.modelId.value,
    prompt: input.prompt,
    outputMode: 'image_only',
    image: { mimeType: 'image/jpeg', aspectRatio: '1:1', imageSize: '1K' },
  })
  const endpoint = resolveGeminiDeveloperApiEndpointV2(readGeminiDeveloperApiContractV2(), {
    surfaceId: 'gemini-interactions-v1beta',
  })
  const ledger = createSemanticConsumptionLedgerV2(projection.dispositions.map((entry) => Object.freeze({
    kind: 'consumed' as const, path: entry.path, disposition: entry.disposition,
    nativeField: entry.nativeField, evidence: 'gemini-interactions-v1beta',
  })))
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value, answerRootId: operation.resultAnswerRootId.value,
    requestSequence: 1, providerId: binding.providerId.value, endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value, contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value, effectiveEndpointId: descriptor.endpointId.value, endpoint: endpoint.url,
    headersPlan: createGoogleApiKeyHeaderPlanV2(), body: compilation.preparedBody, ledger,
    capabilityRevision: capability.revision.value, snapshotHash: snapshot.snapshotHash.value,
  })
}
