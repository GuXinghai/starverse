import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isAnthropicRequestHistoryRepositoryFactForContextV2,
  type AnthropicRequestHistoryRepositoryFactV2,
} from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  issuePreparedProviderRequestV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedAnthropicMessagesDefinitionV2,
} from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import {
  isVerifiedProviderContractReferenceV2,
  verifyProviderContractReferenceV2,
} from '../../src/next/generation-v2/contracts/providerContractReferenceAuthorityV2'
import {
  isAnthropicDeveloperApiContractV2,
  createAnthropicMessagesNonSecretHeaderPlanV2,
  readAnthropicDeveloperApiContractV2,
  resolveAnthropicDeveloperApiEndpointV2,
} from '../../src/next/generation-v2/contracts/anthropicDeveloperApiContractV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import {
  compileAnthropicMessagesRequestV1,
  type AnthropicMessagesNativeRequestV1,
} from '../../src/next/generation-v2/providers/anthropic/messagesRequestV1'

export class AnthropicMessagesPreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_ANTHROPIC_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_ANTHROPIC_COMPILER_CAPABILITY_MISMATCH'
    | 'GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED'
    | 'GENERATION_V2_ANTHROPIC_COMPILER_LEDGER_MISMATCH') {
    super(code)
    this.name = 'AnthropicMessagesPreparedRequestCompilerV2Error'
  }
}

function wireValue(request: AnthropicMessagesNativeRequestV1, key: string): unknown {
  if (key === 'model') return request.model
  if (key === 'max_tokens') return request.max_tokens
  if (key === 'temperature') return request.temperature
  if (key === 'top_p') return request.top_p
  if (key === 'top_k') return request.top_k
  if (key === 'stop_sequences') return request.stop_sequences
  if (key === 'thinking.type') return request.thinking?.type
  if (key === 'thinking.budget_tokens') return request.thinking?.budget_tokens
  if (key === 'thinking.display') return request.thinking?.display
  if (key === 'output_config.effort') return request.output_config?.effort
  if (key === 'tools') return request.tools
  if (key === 'tool_choice') return request.tool_choice
  return undefined
}

function capabilityPath(path: string): string {
  return path.replace(/^attachments\[\d+\]\./u, 'attachments[].')
}

export function compileAnthropicMessagesPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: AnthropicRequestHistoryRepositoryFactV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isAnthropicRequestHistoryRepositoryFactForContextV2(input.history, input.context) ||
      (input.toolRegistry !== undefined && input.toolRegistry !== null &&
        !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context))) {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
  }

  const { operation, snapshot, capability } = input.execution
  const tools = snapshot.semanticIntent.tools ?? { mode: 'disabled' as const }
  if (tools.mode === 'enabled') {
    if (!input.toolRegistry || snapshot.toolAuthority.kind !== 'registry' ||
        input.toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        input.toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        input.toolRegistry.selectedDefinitions.length !== tools.allowedToolIds.length ||
        input.toolRegistry.selectedDefinitions.some((definition, index) => definition.toolId !== tools.allowedToolIds[index].value ||
          definition.function.parameters === undefined)) {
      throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
    }
  } else if (input.toolRegistry !== undefined && input.toolRegistry !== null || snapshot.toolAuthority.kind !== 'none') {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
  }
  const nativeTools = tools.mode === 'enabled' ? input.toolRegistry!.selectedDefinitions.map((definition) => Object.freeze({
    name: definition.function.name,
    ...(definition.function.description === undefined ? {} : { description: definition.function.description }),
    input_schema: definition.function.parameters!,
  })) : undefined
  let nativeToolChoice: unknown
  if (tools.mode === 'enabled') {
    const choice = tools.toolChoice
    nativeToolChoice = choice.mode === 'omitted' ? undefined
      : choice.mode === 'required' ? Object.freeze({ type: 'any' as const })
        : choice.mode === 'named' ? Object.freeze({ type: 'tool' as const,
          name: input.toolRegistry!.selectedDefinitions.find((definition) => definition.toolId === choice.toolId.value)!.function.name })
          : Object.freeze({ type: choice.mode })
  }
  if (tools.mode === 'enabled' && snapshot.semanticIntent.reasoning.mode === 'enabled' &&
      (tools.toolChoice.mode === 'required' || tools.toolChoice.mode === 'named')) {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
  }
  if (operation.operationId.value !== input.history.operationId.value ||
      operation.branchId.value !== input.history.branchId.value ||
      operation.conversationId.value !== input.history.conversationId.value ||
      operation.questionId.value !== input.history.questionId.value ||
      operation.resultAnswerRootId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value ||
      snapshot.answerRootId.value !== operation.resultAnswerRootId.value) {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
  }

  const binding = snapshot.providerBinding
  const definition = readReviewedAnthropicMessagesDefinitionV2()
  const contract = readAnthropicDeveloperApiContractV2()
  const reference = verifyProviderContractReferenceV2(projectDecodedProviderBindingRecordV2(binding))
  if (!isReviewedProviderContractDefinitionV2(definition) ||
      !isAnthropicDeveloperApiContractV2(contract) ||
      !isVerifiedProviderContractReferenceV2(reference) || reference.reviewedDefinition !== definition ||
      binding.providerId.value !== 'anthropic' || binding.operation !== 'text' ||
      binding.protocolContractId.value !== 'anthropic-messages-2023-06-01' ||
      binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.descriptors.length !== 1 ||
      capability.continuation.kind !== 'client_managed_native_replay' ||
      capability.continuation.artifactKind !== ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1) {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_BINDING_INVALID')
  }

  const compilation = compileAnthropicMessagesRequestV1({
    modelId: binding.modelId.value,
    intent: snapshot.semanticIntent,
    ...(input.history.system === null ? {} : { system: input.history.system }),
    messages: input.history.messages,
    ...(nativeTools === undefined ? {} : { tools: nativeTools }),
    ...(nativeToolChoice === undefined ? {} : { toolChoice: nativeToolChoice }),
  })
  if (compilation.issues.length > 0 || !compilation.nativeRequest || !compilation.preparedBody) {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
  }
  const fields = new Map(capability.fields.map((field) => [field.path, field]))
  for (const disposition of compilation.dispositions) {
    if (disposition.semanticPath === 'modelId') continue
    const state = fields.get(capabilityPath(disposition.semanticPath) as typeof capability.fields[number]['path'])?.state
    if (state !== 'supported' && state !== 'requires_confirmation') {
      throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_CAPABILITY_MISMATCH')
    }
    const expectedWireValue = disposition.semanticPath === 'tools.mode' || disposition.semanticPath === 'tools.allowedToolIds'
      ? nativeTools
      : disposition.semanticPath === 'tools.toolChoice' ? nativeToolChoice : disposition.value
    if (disposition.outcome === 'encoded' &&
        stableSerializeProviderRequestV2(wireValue(compilation.nativeRequest, disposition.wireKey!)) !==
          stableSerializeProviderRequestV2(expectedWireValue)) {
      throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_LEDGER_MISMATCH')
    }
  }
  const ledger = createSemanticConsumptionLedgerV2(compilation.dispositions.map((disposition) => ({
    kind: 'consumed' as const,
    path: disposition.semanticPath,
    disposition: disposition.outcome,
    nativeField: disposition.wireKey ?? null,
    evidence: disposition.evidence,
  })))
  const endpoint = resolveAnthropicDeveloperApiEndpointV2(contract, {
    surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
  })
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value,
    answerRootId: operation.resultAnswerRootId.value,
    requestSequence: input.history.requestSequence,
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value,
    effectiveEndpointId: binding.endpointBinding.descriptors[0].endpointId.value,
    endpoint: endpoint.url,
    headersPlan: createAnthropicMessagesNonSecretHeaderPlanV2(),
    body: compilation.preparedBody,
    ledger,
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
