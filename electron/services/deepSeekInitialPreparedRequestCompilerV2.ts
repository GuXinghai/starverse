import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isDeepSeekRequestHistoryRepositoryFactForContextV2,
  type DeepSeekRequestHistoryRepositoryFactV2,
} from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedDeepSeekStableChatDefinitionV2,
} from '../../src/next/generation-v2/contracts/providerContractRegistryV2'
import {
  isVerifiedProviderContractReferenceV2,
  verifyProviderContractReferenceV2,
} from '../../src/next/generation-v2/contracts/providerContractReferenceAuthorityV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import {
  DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
} from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import {
  compileDeepSeekStableChatRequestV1,
  type DeepSeekToolChoiceV1,
  type DeepSeekStableChatRequestV1,
} from '../../src/next/generation-v2/providers/deepseek/chatRequestV1'
import { projectDeepSeekStableIntentV1 } from '../../src/next/generation-v2/providers/deepseek/chatIntentProjectionV1'
import {
  isVerifiedDeepSeekStableEndpointProfileV2,
  readVerifiedDeepSeekStableEndpointProfileV2,
} from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  issuePreparedProviderRequestV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'

export class DeepSeekInitialPreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_DEEPSEEK_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_DEEPSEEK_COMPILER_CAPABILITY_MISMATCH'
    | 'GENERATION_V2_DEEPSEEK_COMPILER_SEMANTIC_REJECTED'
    | 'GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH') {
    super(code)
    this.name = 'DeepSeekInitialPreparedRequestCompilerV2Error'
  }
}

function equalValue(left: unknown, right: unknown): boolean {
  return stableSerializeProviderRequestV2({ value: left }) === stableSerializeProviderRequestV2({ value: right })
}

function requestWireValue(request: DeepSeekStableChatRequestV1, wireKey: string): unknown {
  if (wireKey === 'thinking.type') return request.thinking.type
  if (wireKey === 'reasoning_effort') return request.reasoning_effort
  if (wireKey === 'max_tokens') return request.max_tokens
  if (wireKey === 'stop') return request.stop
  if (wireKey === 'temperature') return request.temperature
  if (wireKey === 'top_p') return request.top_p
  return undefined
}

export function compileDeepSeekPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: DeepSeekRequestHistoryRepositoryFactV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isDeepSeekRequestHistoryRepositoryFactForContextV2(input.history, input.context)) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  const toolRegistry = input.toolRegistry ?? null
  if (!['initial_send', 'edit_resend', 'regenerate_question', 'retry_as_new', 'retry_replace']
        .includes(operation.actionKind) ||
      !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(operation.state) ||
      operation.operationId.value !== input.history.operationId.value ||
      operation.branchId.value !== input.history.branchId.value ||
      operation.conversationId.value !== input.history.conversationId.value ||
      operation.questionId.value !== input.history.questionId.value ||
      operation.resultAnswerRootId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value ||
      snapshot.answerRootId.value !== operation.resultAnswerRootId.value) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
  }

  const binding = snapshot.providerBinding
  const profile = readVerifiedDeepSeekStableEndpointProfileV2()
  const definition = readReviewedDeepSeekStableChatDefinitionV2()
  const contractReference = verifyProviderContractReferenceV2(projectDecodedProviderBindingRecordV2(binding))
  if (!isVerifiedDeepSeekStableEndpointProfileV2(profile) ||
      !isReviewedProviderContractDefinitionV2(definition) ||
      !isVerifiedProviderContractReferenceV2(contractReference) ||
      contractReference.reviewedDefinition !== definition || binding.providerId.value !== 'deepseek' ||
      binding.operation !== 'text' || binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== 'deepseek-stable-chat-v1' ||
      binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.descriptors[0].endpointId.value !== profile.descriptor.endpointId.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== profile.descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'client_managed_native_replay' ||
      capability.continuation.artifactKind !== DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_BINDING_INVALID')
  }

  const toolsEnabled = snapshot.semanticIntent.tools.mode === 'enabled'
  if (toolsEnabled) {
    if (snapshot.toolAuthority.kind !== 'registry' ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, input.context) ||
        toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
          stableSerializeProviderRequestV2(snapshot.semanticIntent.tools.allowedToolIds.map((tool) => tool.value))) {
      throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
    }
  } else if (snapshot.toolAuthority.kind !== 'none' || toolRegistry !== null) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
  }
  const projection = projectDeepSeekStableIntentV1(
    projectGenerationIntentLayerV2(snapshot.semanticIntent),
    toolsEnabled,
  )
  if (projection.issues.length > 0) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_SEMANTIC_REJECTED')
  }
  const capabilityFields = new Map<string, typeof capability.fields[number]>(
    capability.fields.map((field) => [field.path, field]),
  )
  if (projection.dispositions.some((disposition) => {
    const state = capabilityFields.get(disposition.semanticPath)?.state
    return state !== 'supported' && state !== 'requires_confirmation'
  })) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_CAPABILITY_MISMATCH')
  }
  const nativeFields = new Map(projection.nativeSemanticFields.map((field) => [field.wireKey, field.value]))
  if (nativeFields.size !== projection.nativeSemanticFields.length) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH')
  }
  const intentTools = snapshot.semanticIntent.tools
  let compiledToolChoice: DeepSeekToolChoiceV1 | undefined
  if (intentTools.mode === 'enabled' && intentTools.toolChoice.mode !== 'omitted') {
    if (intentTools.toolChoice.mode === 'named') {
      const namedToolId = intentTools.toolChoice.toolId.value
      const selected = toolRegistry?.selectedDefinitions.find((tool) => tool.toolId === namedToolId)
      if (!selected) {
        throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
      }
      compiledToolChoice = Object.freeze({
        type: 'function' as const,
        function: Object.freeze({ name: selected.function.name }),
      })
    } else compiledToolChoice = intentTools.toolChoice.mode
  }
  const compilation = compileDeepSeekStableChatRequestV1({
    model: binding.modelId.value,
    priorArtifact: input.history.priorArtifact,
    clientEntries: input.history.clientEntries,
    thinking: {
      type: nativeFields.get('thinking.type'),
      ...(nativeFields.has('reasoning_effort') ? { reasoningEffort: nativeFields.get('reasoning_effort') } : {}),
    },
    generation: {
      ...(nativeFields.has('max_tokens') ? { maxTokens: nativeFields.get('max_tokens') } : {}),
      ...(nativeFields.has('stop') ? { stop: nativeFields.get('stop') } : {}),
      ...(nativeFields.has('temperature') ? { temperature: nativeFields.get('temperature') } : {}),
      ...(nativeFields.has('top_p') ? { topP: nativeFields.get('top_p') } : {}),
    },
    ...(toolRegistry === null ? {} : {
      tools: toolRegistry.selectedDefinitions.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
          ...(tool.function.parameters === undefined ? {} : { parameters: tool.function.parameters }),
        },
      })),
      ...(compiledToolChoice === undefined ? {} : { toolChoice: compiledToolChoice }),
    }),
  })
  if (projection.nativeSemanticFields.some((field) =>
    !equalValue(requestWireValue(compilation.nativeRequest, field.wireKey), field.value))) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH')
  }
  const ledger = createSemanticConsumptionLedgerV2(projection.dispositions.map((disposition) => ({
    kind: 'consumed' as const,
    path: disposition.semanticPath,
    disposition: disposition.outcome,
    nativeField: disposition.wireKey ?? null,
    evidence: disposition.evidence,
  })))
  const endpoint = new URL(profile.descriptor.chatPath, profile.descriptor.apiOrigin).toString()
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value,
    answerRootId: operation.resultAnswerRootId.value,
    requestSequence: input.history.requestSequence,
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value,
    effectiveEndpointId: profile.descriptor.endpointId.value,
    endpoint,
    body: compilation.preparedBody,
    ledger,
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}

export function compileDeepSeekInitialPreparedRequestV2(
  input: Parameters<typeof compileDeepSeekPreparedRequestV2>[0],
): PreparedProviderRequestV2 {
  if (input.execution.operation.actionKind !== 'initial_send') {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_AUTHORITY_INVALID')
  }
  return compileDeepSeekPreparedRequestV2(input)
}
