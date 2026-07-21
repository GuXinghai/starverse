import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isGeminiGenerateContentHistoryRepositoryFactForContextV2,
  type GeminiGenerateContentHistoryRepositoryFactV2,
} from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { createSemanticConsumptionLedgerV2, type SemanticConsumptionLedgerEntryV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createGoogleApiKeyHeaderPlanV2,
  issuePreparedProviderRequestV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { compileGeminiGenerateContentRequestV1 } from '../../src/next/generation-v2/providers/gemini/generateContentRequestV1'
import { GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1 } from '../../src/next/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import {
  readGeminiDeveloperApiContractV2,
  resolveGeminiDeveloperApiEndpointV2,
} from '../../src/next/generation-v2/contracts/geminiDeveloperApiContractV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  hasReviewedGeminiGenerateContentReasoningWebCapabilityV2,
  hasReviewedGeminiGenerateContentToolCapabilityV2,
} from '../../src/next/generation-v2/providers/gemini/toolCapabilityPolicyV2'

export class GeminiGenerateContentPreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_GEMINI_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED') {
    super(code)
    this.name = 'GeminiGenerateContentPreparedRequestCompilerV2Error'
  }
}

const evidence = 'gemini-generate-content-v1beta'
function consumed(path: string, nativeField: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'encoded', nativeField, evidence })
}
function accepted(path: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'accepted_no_wire', nativeField: null, evidence })
}

export function compileGeminiGenerateContentPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: GeminiGenerateContentHistoryRepositoryFactV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isGeminiGenerateContentHistoryRepositoryFactForContextV2(input.history, input.context) ||
      input.execution.operation.operationId.value !== input.history.operationId.value ||
      input.execution.operation.resultAnswerRootId.value !== input.history.answerRootId.value) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  const toolRegistry = input.toolRegistry ?? null
  const binding = snapshot.providerBinding
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const descriptor = profile.descriptors.generateContent
  if (binding.providerId.value !== 'google_ai_studio' ||
      binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== 'gemini-generate-content-v1beta' || binding.operation !== 'text' ||
      binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.descriptors[0].endpointId.value !== descriptor.endpointId.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'client_managed_native_replay' ||
      capability.continuation.artifactKind !== GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_BINDING_INVALID')
  }
  const intent = snapshot.semanticIntent
  const toolsEnabled = intent.tools.mode === 'enabled'
  if ((toolsEnabled && !hasReviewedGeminiGenerateContentToolCapabilityV2(binding.modelId.value)) ||
      ((intent.reasoning.mode === 'enabled' || intent.web.mode === 'provider_search') &&
        !hasReviewedGeminiGenerateContentReasoningWebCapabilityV2(binding.modelId.value))) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
  }
  if (toolsEnabled) {
    if (snapshot.toolAuthority.kind !== 'registry' ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, input.context) ||
        toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
          stableSerializeProviderRequestV2(intent.tools.allowedToolIds.map((toolId) => toolId.value))) {
      throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
    }
  } else if (snapshot.toolAuthority.kind !== 'none' || toolRegistry !== null) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
  }
  const extension = intent.providerExtension
  const reasoning = intent.reasoning.mode === 'disabled'
    ? Object.freeze({ mode: 'disabled' as const })
    : (() => {
        if (intent.reasoning.effort === undefined || !['minimal', 'low', 'medium', 'high'].includes(intent.reasoning.effort) ||
            intent.reasoning.summary !== undefined || intent.reasoning.exclude !== undefined ||
            extension.kind !== 'gemini_generate_content' || extension.thinkingMode !== 'level' ||
            extension.thinkingLevel !== intent.reasoning.effort) {
          throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
        }
        return Object.freeze({ mode: 'enabled' as const, thinkingLevel: intent.reasoning.effort,
          ...(extension.includeThoughts === 'provider_default' ? {} : { includeThoughts: extension.includeThoughts === 'enabled' }) })
      })()
  const webSearch = intent.web.mode === 'provider_search'
  if (intent.attachments.length !== 0 || intent.image.mode !== 'disabled' ||
      extension.kind !== 'gemini_generate_content' ||
      (intent.reasoning.mode === 'disabled' && (extension.thinkingMode !== 'provider_default' ||
        extension.includeThoughts !== 'provider_default')) ||
      (webSearch && (intent.web.types.length !== 1 || intent.web.types[0] !== 'web' ||
        intent.web.engine !== undefined || intent.web.maxResults !== undefined || intent.web.maxTotalResults !== undefined ||
        intent.web.searchContextSize !== undefined || intent.web.maxCharacters !== undefined ||
        intent.web.userLocation !== undefined || intent.web.allowedDomains !== undefined || intent.web.excludedDomains !== undefined)) ||
      intent.generation.candidateCount !== 1 || intent.generation.seed !== undefined ||
      intent.generation.frequencyPenalty !== undefined || intent.generation.presencePenalty !== undefined ||
      intent.generation.repetitionPenalty !== undefined) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
  }
  const ledger: SemanticConsumptionLedgerEntryV2[] = [
    consumed('generation.candidateCount', 'generationConfig.candidateCount'),
    reasoning.mode === 'enabled' ? consumed('reasoning.mode', 'generationConfig.thinkingConfig') : accepted('reasoning.mode'),
    ...(reasoning.mode === 'enabled' ? [consumed('reasoning.effort', 'generationConfig.thinkingConfig.thinkingLevel')] : []),
    webSearch ? consumed('web.mode', 'tools.googleSearch') : accepted('web.mode'), accepted('image.mode'),
    toolsEnabled ? consumed('tools.mode', 'tools.functionDeclarations') : accepted('tools.mode'),
    accepted('providerExtension.kind'),
    reasoning.mode === 'enabled' ? consumed('providerExtension.thinkingMode', 'generationConfig.thinkingConfig.thinkingLevel')
      : accepted('providerExtension.thinkingMode'),
    ...(extension.thinkingMode === 'level'
      ? [consumed('providerExtension.thinkingLevel', 'generationConfig.thinkingConfig.thinkingLevel')] : []),
    extension.includeThoughts === 'provider_default' ? accepted('providerExtension.includeThoughts')
      : consumed('providerExtension.includeThoughts', 'generationConfig.thinkingConfig.includeThoughts'),
  ]
  const generation: Record<string, unknown> = {}
  const fields = Object.freeze({ maxOutputTokens: 'maxOutputTokens', temperature: 'temperature', topP: 'topP',
    topK: 'topK', stop: 'stopSequences' } as const)
  for (const [semantic, native] of Object.entries(fields)) {
    const value = intent.generation[semantic as keyof typeof intent.generation]
    if (value === undefined) continue
    generation[semantic === 'stop' ? 'stopSequences' : semantic] = value
    ledger.push(consumed(`generation.${semantic}`, `generationConfig.${native}`))
  }
  const toolChoice = intent.tools.mode === 'disabled' || intent.tools.toolChoice.mode === 'omitted'
    ? Object.freeze({ mode: 'provider_default' as const })
    : intent.tools.toolChoice.mode === 'named'
      ? Object.freeze({ mode: 'named' as const, name: toolRegistry!.selectedDefinitions.find(
        (tool) => tool.toolId === intent.tools.toolChoice.toolId.value,
      )?.function.name ?? (() => { throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID') })() })
      : Object.freeze({ mode: intent.tools.toolChoice.mode })
  const compilation = compileGeminiGenerateContentRequestV1({
    replayContents: input.history.replayContents,
    ...(input.history.systemInstruction === null ? {} : { systemInstruction: input.history.systemInstruction }),
    generation,
    reasoning,
    webSearch,
    ...(toolRegistry === null ? {} : { tools: toolRegistry.selectedDefinitions.map((tool) => ({
      name: tool.function.name,
      ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
      ...(tool.function.parameters === undefined ? {} : { parameters: tool.function.parameters }),
    })) }),
    toolChoice,
  })
  const endpoint = resolveGeminiDeveloperApiEndpointV2(readGeminiDeveloperApiContractV2(), {
    surfaceId: 'gemini-generate-content-v1beta', modelId: binding.modelId.value,
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
    effectiveEndpointId: descriptor.endpointId.value,
    endpoint: endpoint.url,
    headersPlan: createGoogleApiKeyHeaderPlanV2(),
    body: compilation.preparedBody,
    ledger: createSemanticConsumptionLedgerV2(ledger),
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
