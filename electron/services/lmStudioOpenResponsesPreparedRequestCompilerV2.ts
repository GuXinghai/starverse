import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import type { LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import { isLmStudioOpenResponsesRequestHistoryFactForContextV2,
  type LmStudioOpenResponsesRequestHistoryFactV2 } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import { createNoCredentialHeaderPlanV2, issuePreparedProviderRequestV2, type PreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { compileLmStudioOpenResponsesRequestV1 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/responsesRequestV1'
import { readLmStudioOpenResponsesEndpointV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/verifiedContractV2'

export function compileLmStudioOpenResponsesPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  profile: LocalEndpointProfileV2
  history: LmStudioOpenResponsesRequestHistoryFactV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isLmStudioOpenResponsesRequestHistoryFactForContextV2(input.history, input.context) ||
      !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(input.execution.operation.state)) {
    throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  const binding = snapshot.providerBinding
  if (binding.providerId.value !== 'lmstudio' || binding.protocolContractId.value !== 'lmstudio-openresponses' ||
      binding.endpointProfileId.value !== input.profile.endpointProfileId || binding.credentialScopeId.value !== input.profile.credentialScopeId ||
      binding.operation !== 'text' || binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== input.profile.profileRevision ||
      input.profile.protocolContractId !== 'lmstudio-openresponses') throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_BINDING_INVALID')
  const intent = snapshot.semanticIntent
  const tools = intent.tools
  const unsupportedGeneration = ['topK', 'minP', 'topA', 'seed', 'stop', 'candidateCount', 'repetitionPenalty'] as const
  if (unsupportedGeneration.some((key) => intent.generation[key] !== undefined) ||
      (intent.reasoning.mode === 'enabled' && (intent.reasoning.effort !== 'low' ||
        intent.reasoning.summary !== undefined || intent.reasoning.exclude !== undefined)) ||
      intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.attachments.length !== 0 || intent.providerExtension.kind !== 'none') {
    throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_EXPLICIT_FIELD_UNSUPPORTED')
  }
  if (tools.mode === 'enabled') {
    if (snapshot.toolAuthority.kind !== 'registry' ||
        !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context) ||
        input.toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        input.toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        input.toolRegistry.selectedDefinitions.length !== tools.allowedToolIds.length ||
        input.toolRegistry.selectedDefinitions.some((tool, index) => tool.toolId !== tools.allowedToolIds[index].value) ||
        !['omitted', 'none', 'required'].includes(tools.toolChoice.mode)) {
      throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_AUTHORITY_INVALID')
    }
  } else if (snapshot.toolAuthority.kind !== 'none' || input.toolRegistry !== null) {
    throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_AUTHORITY_INVALID')
  }
  const functionTools = input.toolRegistry?.selectedDefinitions.map((tool) => Object.freeze({
    type: 'function' as const, name: tool.function.name,
    ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
    parameters: tool.function.parameters ?? Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false }),
    strict: true as const,
  }))
  const toolChoice = tools.mode === 'enabled' && tools.toolChoice.mode !== 'omitted'
    ? tools.toolChoice.mode as 'none' | 'required'
    : undefined
  const rawReasoningEffort = intent.reasoning.mode === 'enabled' ? intent.reasoning.effort : undefined
  let reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | undefined
  if (rawReasoningEffort === undefined) reasoningEffort = undefined
  else if (rawReasoningEffort === 'minimal' || rawReasoningEffort === 'low' || rawReasoningEffort === 'medium' || rawReasoningEffort === 'high') reasoningEffort = rawReasoningEffort
  else throw new Error('GENERATION_V2_LMSTUDIO_COMPILER_EXPLICIT_FIELD_UNSUPPORTED')
  const compiled = compileLmStudioOpenResponsesRequestV1({ model: binding.modelId.value,
    replayItems: input.history.projectedReplayItems,
    generation: {
      temperature: intent.generation.temperature, topP: intent.generation.topP,
      maxOutputTokens: intent.generation.maxOutputTokens, frequencyPenalty: intent.generation.frequencyPenalty,
      presencePenalty: intent.generation.presencePenalty,
    },
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(functionTools === undefined ? {} : { tools: functionTools }),
    ...(toolChoice === undefined ? {} : { toolChoice }),
  })
  const generationLedger = [
    ['temperature', 'temperature'], ['topP', 'top_p'], ['maxOutputTokens', 'max_output_tokens'],
    ['frequencyPenalty', 'frequency_penalty'], ['presencePenalty', 'presence_penalty'],
  ].filter(([key]) => intent.generation[key as keyof typeof intent.generation] !== undefined).map(([key, nativeField]) => ({
    kind: 'consumed' as const, path: `generation.${key}`, disposition: 'encoded' as const,
    nativeField, evidence: 'lmstudio-openresponses-compliance-20260714',
  }))
  const toolLedger = tools.mode === 'disabled' ? [{ kind: 'consumed' as const, path: 'tools.mode',
    disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'lmstudio-openresponses-compliance-20260714' }] : [
    { kind: 'consumed' as const, path: 'tools.mode', disposition: 'encoded' as const, nativeField: 'tools', evidence: 'lmstudio-openresponses-compliance-20260714' },
    { kind: 'consumed' as const, path: 'tools.allowedToolIds', disposition: 'encoded' as const, nativeField: 'tools', evidence: 'lmstudio-openresponses-compliance-20260714' },
    { kind: 'consumed' as const, path: 'tools.toolChoice', disposition: tools.toolChoice.mode === 'omitted' ? 'accepted_no_wire' as const : 'encoded' as const,
      nativeField: tools.toolChoice.mode === 'omitted' ? null : 'tool_choice', evidence: 'lmstudio-openresponses-compliance-20260714' },
    { kind: 'consumed' as const, path: 'tools.sideEffectConfirmation', disposition: 'accepted_no_wire' as const, nativeField: null, evidence: 'starverse-tool-confirmation-v2' },
  ]
  const ledger = createSemanticConsumptionLedgerV2([
    ...generationLedger,
    { kind: 'consumed', path: 'reasoning.mode', disposition: intent.reasoning.mode === 'enabled' ? 'encoded' : 'accepted_no_wire', nativeField: intent.reasoning.mode === 'enabled' ? 'reasoning' : null, evidence: 'lmstudio-openresponses-compliance-20260714' },
    ...(intent.reasoning.mode === 'enabled' ? [{ kind: 'consumed' as const, path: 'reasoning.effort', disposition: 'encoded' as const, nativeField: 'reasoning.effort', evidence: 'lmstudio-openresponses-compliance-20260714' }] : []),
    { kind: 'consumed', path: 'web.mode', disposition: 'accepted_no_wire', nativeField: null, evidence: 'lmstudio-openresponses' },
    { kind: 'consumed', path: 'image.mode', disposition: 'accepted_no_wire', nativeField: null, evidence: 'lmstudio-openresponses' },
    ...toolLedger,
    { kind: 'consumed', path: 'providerExtension.kind', disposition: 'accepted_no_wire', nativeField: null, evidence: 'lmstudio-openresponses' },
  ])
  return issuePreparedProviderRequestV2({ operationId: operation.operationId.value,
    answerRootId: operation.resultAnswerRootId.value, requestSequence: input.history.requestSequence, providerId: 'lmstudio',
    endpointProfileId: input.profile.endpointProfileId, credentialScopeId: input.profile.credentialScopeId,
    contractId: 'lmstudio-openresponses', modelId: binding.modelId.value,
    effectiveEndpointId: input.profile.endpointProfileId, endpoint: readLmStudioOpenResponsesEndpointV2(input.profile),
    headersPlan: createNoCredentialHeaderPlanV2(), body: compiled.preparedBody, ledger,
    capabilityRevision: capability.revision.value, snapshotHash: snapshot.snapshotHash.value })
}
