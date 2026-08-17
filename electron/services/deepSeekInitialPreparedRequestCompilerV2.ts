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
import {
  DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
} from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import {
  compileDeepSeekStableChatRequestV1,
  type DeepSeekToolChoiceV1,
  type DeepSeekStableChatRequestV1,
} from '../../src/next/generation-v2/providers/deepseek/chatRequestV1'
import {
  isVerifiedDeepSeekStableEndpointProfileV2,
  readVerifiedDeepSeekStableEndpointProfileV2,
} from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { validateGenerationExecutionCapabilityV2 } from '../../src/next/generation-v2/compiler/semanticCapabilityValidatorV2'
import { createSemanticConsumptionLedgerV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
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
  if (wireKey === 'frequency_penalty') return request.frequency_penalty
  if (wireKey === 'presence_penalty') return request.presence_penalty
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
  validateGenerationExecutionCapabilityV2(capability, snapshot.semanticIntent)
  const toolRegistry = input.toolRegistry ?? null
  if (!['initial_send', 'edit_resend', 'regenerate_question', 'retry_as_new', 'retry_replace']
        .includes(operation.actionKind) ||
      !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(operation.state) ||
      operation.operationId.value !== input.history.operationId.value ||
      operation.branchId.value !== input.history.branchId.value ||
      operation.conversationId.value !== input.history.conversationId.value ||
      operation.questionId.value !== input.history.questionId.value ||
      operation.targetAnswerId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value ||
      snapshot.answerRootId.value !== operation.targetAnswerId.value) {
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
  const nativeFields = new Map<string, string | number | boolean | readonly string[]>()
  const issues: string[] = []
  const dispositions: Array<Readonly<{
    semanticPath: string
    outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
    wireKey?: string
    value?: string | number | boolean | readonly string[]
    encodingKind?: 'identity' | 'structural' | 'omitted'
    evidence: string
  }>> = []
  const encode = (semanticPath: string, wireKey: string, value: string | number | boolean | readonly string[], evidence = 'deepseek-create-chat-completion-verified-2026-07-15', encodingKind: 'identity' | 'structural' = 'identity') => {
    if (nativeFields.has(wireKey)) throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH')
    const stableValue = Array.isArray(value) ? Object.freeze([...value]) : value
    nativeFields.set(wireKey, stableValue)
    dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded' as const, wireKey, value: stableValue, encodingKind, evidence }))
  }
  const accept = (semanticPath: string, evidence = 'starverse-generation-v2-authority-boundary-2026-07-15') => {
    dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire' as const, encodingKind: 'omitted' as const, evidence }))
  }
  const reject = (semanticPath: string, wireKey?: string) => {
    issues.push(semanticPath)
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected' as const, ...(wireKey === undefined ? {} : { wireKey }), evidence: 'deepseek-create-chat-completion-verified-2026-07-15' }))
  }
  const intent = snapshot.semanticIntent
  const generation = intent.generation
  if (generation.maxOutputTokens !== undefined) encode('generation.maxOutputTokens', 'max_tokens', generation.maxOutputTokens)
  if (generation.stop !== undefined) encode('generation.stop', 'stop', generation.stop)
  if (generation.temperature !== undefined) encode('generation.temperature', 'temperature', generation.temperature)
  if (generation.topP !== undefined) encode('generation.topP', 'top_p', generation.topP)
  if (generation.frequencyPenalty !== undefined) encode('generation.frequencyPenalty', 'frequency_penalty', generation.frequencyPenalty)
  if (generation.presencePenalty !== undefined) encode('generation.presencePenalty', 'presence_penalty', generation.presencePenalty)
  for (const key of ['topK', 'minP', 'topA', 'seed', 'candidateCount', 'repetitionPenalty'] as const) {
    if (generation[key] !== undefined) accept(`generation.${key}`)
  }
  encode('reasoning.mode', 'thinking.type', intent.reasoning.mode, 'deepseek-thinking-mode-verified-2026-07-15')
  if (intent.reasoning.mode === 'enabled') {
    if (intent.reasoning.effort !== undefined) encode('reasoning.effort', 'reasoning_effort', intent.reasoning.effort, 'deepseek-thinking-mode-verified-2026-07-15')
    if (intent.reasoning.summary !== undefined) accept('reasoning.summary', 'deepseek-thinking-mode-verified-2026-07-15')
    if (intent.reasoning.exclude !== undefined) accept('reasoning.exclude', 'deepseek-thinking-mode-verified-2026-07-15')
  }
  if (intent.web.mode === 'disabled') accept('web.mode')
  else { accept('web.mode'); accept('web.types') }
  if (intent.image.mode === 'disabled') accept('image.mode')
  else for (const key of ['mode', 'outputMode', 'aspectRatio', 'resolution', 'size', 'quality', 'format', 'background', 'outputCompression', 'stream'] as const) {
    if (key === 'mode' || intent.image[key] !== undefined) accept(`image.${key}`)
  }
  if (!toolsEnabled) accept('tools.mode')
  else if (!isToolRegistryRepositoryFactForContextV2(toolRegistry, input.context)) {
    reject('tools.mode', 'tools'); reject('tools.allowedToolIds', 'tools'); reject('tools.toolChoice', 'tool_choice'); accept('tools.sideEffectConfirmation')
  } else {
    accept('tools.mode')
    dispositions.push(Object.freeze({ semanticPath: 'tools.allowedToolIds', outcome: 'encoded' as const, wireKey: 'tools', encodingKind: 'structural' as const, evidence: 'deepseek-create-chat-completion-verified-2026-07-15' }))
    if (intent.tools.mode === 'enabled' && intent.tools.toolChoice.mode === 'omitted') accept('tools.toolChoice', 'deepseek-thinking-mode-verified-2026-07-15')
    else if (intent.tools.mode === 'enabled') dispositions.push(Object.freeze({ semanticPath: 'tools.toolChoice', outcome: 'encoded' as const, wireKey: 'tool_choice', encodingKind: 'structural' as const, evidence: 'deepseek-thinking-mode-verified-2026-07-15' }))
    accept('tools.sideEffectConfirmation')
  }
  for (const [index, attachment] of intent.attachments.entries()) {
    const base = `attachments[${index}]`
    accept(`${base}.assetId`); accept(`${base}.assetRevisionId`); accept(`${base}.assetSha256`)
    if (attachment.include) { reject(`${base}.include`); reject(`${base}.sendAs`); reject(`${base}.conversion`) }
    else { accept(`${base}.include`); accept(`${base}.sendAs`); accept(`${base}.conversion`) }
  }
  if (intent.providerExtension.kind === 'none') accept('providerExtension.kind')
  else accept('providerExtension.kind')
  if (intent.providerExtension.kind === 'openai_responses') {
    if (intent.providerExtension.maxToolCalls !== undefined) accept('providerExtension.maxToolCalls')
    if (intent.providerExtension.parallelToolCalls !== undefined) accept('providerExtension.parallelToolCalls')
    if (intent.providerExtension.serviceTier !== undefined) accept('providerExtension.serviceTier')
    if (intent.providerExtension.verbosity !== undefined) accept('providerExtension.verbosity')
  } else if (intent.providerExtension.kind === 'anthropic_messages') {
    if (intent.providerExtension.manualThinkingBudgetTokens !== undefined) accept('providerExtension.manualThinkingBudgetTokens')
    accept('providerExtension.thinkingDisplay'); accept('providerExtension.thinkingMode')
  } else if (intent.providerExtension.kind === 'gemini_generate_content') {
    accept('providerExtension.thinkingMode')
    if ('thinkingLevel' in intent.providerExtension && intent.providerExtension.thinkingLevel !== undefined) accept('providerExtension.thinkingLevel')
    if ('thinkingBudget' in intent.providerExtension && intent.providerExtension.thinkingBudget !== undefined) accept('providerExtension.thinkingBudget')
    accept('providerExtension.includeThoughts')
  }
  if (new Set(dispositions.map((entry) => entry.semanticPath)).size !== dispositions.length) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH')
  }
  if (issues.length > 0) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_SEMANTIC_REJECTED')
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
    ...(input.history.projectedPrefixEntries === null
      ? { priorArtifact: input.history.priorArtifact, clientEntries: input.history.clientEntries }
      : { replayEntries: [...input.history.projectedPrefixEntries, ...input.history.clientEntries] }),
    thinking: {
      type: nativeFields.get('thinking.type'),
      ...(nativeFields.has('reasoning_effort') ? { reasoningEffort: nativeFields.get('reasoning_effort') } : {}),
    },
    generation: {
      ...(nativeFields.has('max_tokens') ? { maxTokens: nativeFields.get('max_tokens') } : {}),
      ...(nativeFields.has('stop') ? { stop: nativeFields.get('stop') } : {}),
      ...(nativeFields.has('temperature') ? { temperature: nativeFields.get('temperature') } : {}),
      ...(nativeFields.has('top_p') ? { topP: nativeFields.get('top_p') } : {}),
      ...(nativeFields.has('frequency_penalty') ? { frequencyPenalty: nativeFields.get('frequency_penalty') } : {}),
      ...(nativeFields.has('presence_penalty') ? { presencePenalty: nativeFields.get('presence_penalty') } : {}),
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
  if ([...nativeFields.entries()].some(([wireKey, value]) =>
    !equalValue(requestWireValue(compilation.nativeRequest, wireKey), value))) {
    throw new DeepSeekInitialPreparedRequestCompilerV2Error('GENERATION_V2_DEEPSEEK_COMPILER_LEDGER_MISMATCH')
  }
  const ledger = createSemanticConsumptionLedgerV2(dispositions.map((disposition) => ({
    kind: 'consumed' as const,
    path: disposition.semanticPath,
    disposition: disposition.outcome,
    nativeField: disposition.wireKey ?? null,
    encodingKind: disposition.encodingKind ?? (disposition.wireKey === undefined ? 'omitted' as const : 'identity' as const),
    evidence: disposition.evidence,
  })))
  const endpoint = new URL(profile.descriptor.chatPath, profile.descriptor.apiOrigin).toString()
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value,
    answerRootId: operation.targetAnswerId.value,
    requestSequence: input.history.requestSequence,
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value,
    effectiveEndpointId: profile.descriptor.endpointId.value,
    endpoint,
    headersPlan: createBearerAuthorizationHeaderPlanV2(),
    body: compilation.preparedBody,
    ledger,
    capabilityRevision: capability.revision.value,
    encoderRevision: capability.encoderRevision,
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
