import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import type { LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { isGenericLocalOpenAIChatRequestHistoryFactForContextV2,
  type GenericLocalOpenAIChatRequestHistoryFactV2 } from '../../infra/db/repo/genericLocalOpenAIChatNativeHistoryV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import { validateGenerationExecutionCapabilityV2 } from '../../src/next/generation-v2/compiler/semanticCapabilityValidatorV2'
import { createNoCredentialHeaderPlanV2, issuePreparedProviderRequestV2, type PreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { compileGenericLocalOpenAIChatRequestV1 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/chatRequestV1'
import { createGenericLocalOpenAIChatArtifactV1 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/nativeMessagesV1'
import { readGenericLocalOpenAIChatEndpointV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/verifiedContractV2'

export function compileGenericLocalOpenAIChatPreparedRequestV2(input: Readonly<{ context: GenerationV2AuthorityTransactionContextV2;
  execution: GenerationExecutionOperationBundleV2; profile: LocalEndpointProfileV2;
  history: GenericLocalOpenAIChatRequestHistoryFactV2 }>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isGenericLocalOpenAIChatRequestHistoryFactForContextV2(input.history, input.context) ||
      !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(input.execution.operation.state)) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  validateGenerationExecutionCapabilityV2(capability, snapshot.semanticIntent)
  const binding = snapshot.providerBinding
  if (binding.providerId.value !== 'generic_local' || binding.protocolContractId.value !== 'generic-local-openai-chat-completions' ||
      binding.endpointProfileId.value !== input.profile.endpointProfileId || binding.credentialScopeId.value !== input.profile.credentialScopeId ||
      binding.modelId.value !== input.profile.protocolConfig.modelId ||
      binding.operation !== 'text' || binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== input.profile.profileRevision ||
      input.profile.protocolContractId !== 'generic-local-openai-chat-completions') throw new Error('GENERATION_V2_GENERIC_LOCAL_COMPILER_BINDING_INVALID')
  const intent = snapshot.semanticIntent; const generation = intent.generation
  if (generation.topK !== undefined || generation.seed !== undefined || generation.candidateCount !== undefined ||
      generation.frequencyPenalty !== undefined || generation.presencePenalty !== undefined || generation.repetitionPenalty !== undefined ||
      intent.reasoning.mode !== 'disabled' || intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.tools.mode !== 'disabled' || intent.attachments.length !== 0 || intent.providerExtension.kind !== 'none') throw new Error('GENERATION_V2_GENERIC_LOCAL_COMPILER_EXPLICIT_FIELD_UNSUPPORTED')
  const messages = createGenericLocalOpenAIChatArtifactV1(input.history.replayMessages).messages
  const compiled = compileGenericLocalOpenAIChatRequestV1({ model: binding.modelId.value, messages,
    generation: { maxTokens: generation.maxOutputTokens, temperature: generation.temperature, topP: generation.topP, stop: generation.stop } })
  const entries = [
    { kind: 'consumed' as const, path: 'reasoning.mode', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'generic-local-openai-chat' },
    { kind: 'consumed' as const, path: 'web.mode', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'generic-local-openai-chat' },
    { kind: 'consumed' as const, path: 'image.mode', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'generic-local-openai-chat' },
    { kind: 'consumed' as const, path: 'tools.mode', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'generic-local-openai-chat' },
    { kind: 'consumed' as const, path: 'providerExtension.kind', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'generic-local-openai-chat' },
    ...(generation.maxOutputTokens === undefined ? [] : [{ kind: 'consumed' as const, path: 'generation.maxOutputTokens', disposition: 'encoded' as const, nativeField: 'max_tokens', evidence: 'generic-local-openai-chat' }]),
    ...(generation.temperature === undefined ? [] : [{ kind: 'consumed' as const, path: 'generation.temperature', disposition: 'encoded' as const, nativeField: 'temperature', evidence: 'generic-local-openai-chat' }]),
    ...(generation.topP === undefined ? [] : [{ kind: 'consumed' as const, path: 'generation.topP', disposition: 'encoded' as const, nativeField: 'top_p', evidence: 'generic-local-openai-chat' }]),
    ...(generation.stop === undefined ? [] : [{ kind: 'consumed' as const, path: 'generation.stop', disposition: 'encoded' as const, nativeField: 'stop', evidence: 'generic-local-openai-chat' }]),
  ]
  return issuePreparedProviderRequestV2({ operationId: operation.operationId.value, answerRootId: operation.targetAnswerId.value,
    requestSequence: 1, providerId: 'generic_local', endpointProfileId: input.profile.endpointProfileId,
    credentialScopeId: input.profile.credentialScopeId, contractId: 'generic-local-openai-chat-completions',
    modelId: binding.modelId.value, effectiveEndpointId: input.profile.endpointProfileId,
    endpoint: readGenericLocalOpenAIChatEndpointV2(input.profile), headersPlan: createNoCredentialHeaderPlanV2(),
    body: compiled.preparedBody, ledger: createSemanticConsumptionLedgerV2(entries),
    capabilityRevision: capability.revision.value, snapshotHash: snapshot.snapshotHash.value })
}
