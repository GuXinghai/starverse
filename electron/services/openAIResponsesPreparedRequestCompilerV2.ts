import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isOpenAIResponsesRequestHistoryFactForContextV2, type OpenAIResponsesRequestHistoryFactV2 } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import { isReviewedProviderContractDefinitionV2, readReviewedOpenAIResponsesDefinitionV2 } from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import { isVerifiedProviderContractReferenceV2, verifyProviderContractReferenceV2 } from '../../src/next/generation-v2/contracts/providerContractReferenceAuthorityV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import { compileOpenAIResponsesRequestV1 } from '../../src/next/generation-v2/providers/openai-responses/responsesRequestV1'
import { projectOpenAIResponsesIntentV1 } from '../../src/next/generation-v2/providers/openai-responses/responsesIntentProjectionV1'
import { isVerifiedOpenAIResponsesEndpointProfileV2, readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  createPreparedAttachmentRequirementsV2,
  issuePreparedProviderRequestV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'

export class OpenAIResponsesPreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_OPENAI_COMPILER_CAPABILITY_MISMATCH'
    | 'GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED') {
    super(code)
    this.name = 'OpenAIResponsesPreparedRequestCompilerV2Error'
  }
}

export function compileOpenAIResponsesPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: OpenAIResponsesRequestHistoryFactV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isOpenAIResponsesRequestHistoryFactForContextV2(input.history, input.context)) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  if (!['initial_send', 'retry_as_new', 'retry_replace', 'regenerate_question', 'edit_resend'].includes(operation.actionKind) ||
      operation.operationId.value !== input.history.operationId.value ||
      operation.resultAnswerRootId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value || snapshot.answerRootId.value !== operation.resultAnswerRootId.value ||
      !Number.isSafeInteger(input.history.requestSequence) || input.history.requestSequence < 1) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
  }
  const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
  const definition = readReviewedOpenAIResponsesDefinitionV2()
  const binding = snapshot.providerBinding
  const reference = verifyProviderContractReferenceV2(projectDecodedProviderBindingRecordV2(binding))
  if (!isVerifiedOpenAIResponsesEndpointProfileV2(profile) || !isReviewedProviderContractDefinitionV2(definition) ||
      !isVerifiedProviderContractReferenceV2(reference) || reference.reviewedDefinition !== definition ||
      binding.providerId.value !== 'openai_responses' || binding.operation !== 'text' ||
      binding.endpointProfileId.value !== profile.endpointProfileId.value || binding.protocolContractId.value !== 'openai-responses-v1' ||
      binding.endpointBinding.kind !== 'provider_managed_set' || binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== profile.descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'client_managed_native_replay' ||
      capability.continuation.artifactKind !== OPENAI_RESPONSES_ARTIFACT_KIND_V2) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_BINDING_INVALID')
  }
  const tools = snapshot.semanticIntent.tools
  if (tools.mode === 'enabled') {
    if (snapshot.toolAuthority.kind !== 'registry' ||
        !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context) ||
        input.toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        input.toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        stableSerializeProviderRequestV2(input.toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
          stableSerializeProviderRequestV2(tools.allowedToolIds.map((tool) => tool.value))) {
      throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
    }
  } else if (snapshot.toolAuthority.kind !== 'none' || input.toolRegistry !== null) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
  }
  const projection = projectOpenAIResponsesIntentV1(projectGenerationIntentLayerV2(snapshot.semanticIntent))
  if (projection.issues.length > 0) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  const fields = new Map(capability.fields.map((field) => [field.path, field]))
  if (projection.dispositions.some((value) => {
    const state = fields.get(value.semanticPath as never)?.state
    return state !== 'supported' && state !== 'requires_confirmation'
  })) throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_CAPABILITY_MISMATCH')
  let toolChoice: 'auto' | 'none' | 'required' | Readonly<{ type: 'function'; name: string }> | undefined
  if (tools.mode === 'enabled' && tools.toolChoice.mode !== 'omitted') {
    const semanticToolChoice = tools.toolChoice
    if (semanticToolChoice.mode === 'named') {
      const selected = input.toolRegistry?.selectedDefinitions.find((tool) =>
        tool.toolId === semanticToolChoice.toolId.value)
      if (!selected) throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
      toolChoice = Object.freeze({ type: 'function', name: selected.function.name })
    } else toolChoice = semanticToolChoice.mode
  }
  const functionTools = input.toolRegistry?.selectedDefinitions.map((tool) => Object.freeze({
    type: 'function' as const, name: tool.function.name,
    ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
    parameters: tool.function.parameters ?? Object.freeze({}), strict: tool.function.strict ?? true,
  })) ?? []
  const compiled = compileOpenAIResponsesRequestV1({
    model: binding.modelId.value,
    ...(input.history.projectedPrefixItems === null
      ? { priorArtifact: input.history.priorArtifact, clientItems: input.history.clientItems }
      : { replayItems: [...input.history.projectedPrefixItems, ...input.history.clientItems] }),
    ...(projection.request.reasoning === undefined ? {} : { reasoning: projection.request.reasoning }),
    generation: projection.request.generation,
    ...((projection.request.tools === undefined && functionTools.length === 0) ? {} : {
      tools: [...functionTools, ...(projection.request.tools ?? [])],
    }),
    ...(toolChoice === undefined ? {} : { toolChoice }),
    ...(projection.request.maxToolCalls === undefined ? {} : { maxToolCalls: projection.request.maxToolCalls }),
    ...(projection.request.parallelToolCalls === undefined ? {} : { parallelToolCalls: projection.request.parallelToolCalls }),
    ...(projection.request.serviceTier === undefined ? {} : { serviceTier: projection.request.serviceTier }),
  })
  const attachmentRequirements = createPreparedAttachmentRequirementsV2(snapshot.semanticIntent.attachments)
  const latestUser = [...compiled.nativeRequest.input].reverse().find((item) => 'role' in item && item.role === 'user')
  const wireFiles = latestUser && 'content' in latestUser
    ? latestUser.content.filter((part) => part.type === 'input_file' || part.type === 'input_image')
    : []
  if (wireFiles.length !== attachmentRequirements.length) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  const attachmentEncodingProofs: PreparedAttachmentEncodingProofV2[] = attachmentRequirements.map((requirement, index) => Object.freeze({
    semanticPath: requirement.semanticPath,
    requirement,
    wireFragment: wireFiles[index],
  }))
  const ledger = createSemanticConsumptionLedgerV2(projection.dispositions.map((value) => ({
    kind: 'consumed' as const, path: value.semanticPath, disposition: value.outcome,
    nativeField: value.wireKey ?? null, evidence: value.evidence,
  })))
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value, answerRootId: operation.resultAnswerRootId.value,
    requestSequence: input.history.requestSequence, providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value, credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value, modelId: binding.modelId.value,
    effectiveEndpointId: profile.descriptor.endpointId.value,
    endpoint: new URL(profile.descriptor.responsesPath, profile.descriptor.apiOrigin).toString(),
    headersPlan: createBearerAuthorizationHeaderPlanV2(),
    body: compiled.preparedBody, ledger, attachmentRequirements, attachmentEncodingProofs,
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
