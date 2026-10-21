import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { createSemanticConsumptionLedgerV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { validateGenerationExecutionCapabilityV2 } from '../../infra/generation-v2/semanticCapabilityValidatorV2'
import { validateWebSearchProtocolParametersV2 } from '../../src/core/generation-v2/contracts/webSearchProtocolParametersV2'
import { createGoogleApiKeyHeaderPlanV2, issuePreparedProviderRequestV2, type PreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { readGeminiDeveloperApiContractV2, resolveGeminiDeveloperApiEndpointV2 } from '../../src/core/generation-v2/contracts/geminiDeveloperApiContractV2'
import { compileGeminiInteractionsRequestV1 } from '../../src/core/generation-v2/providers/gemini/interactionsRequestV1'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/core/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { readImageAspectRatioV2 } from '../../src/core/generation-v2/domain/generationIntentV2'
/* eslint-enable no-restricted-imports */

export class GeminiInteractionsImagePreparedRequestCompilerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_AUTHORITY_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_BINDING_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED') { super(code); this.name = 'GeminiInteractionsImagePreparedRequestCompilerV2Error' }
}

export function resolveGeminiInteractionsImageOutputModeV2(
  outputMode: 'image_only' | 'image_and_text' | undefined,
  requestPlanSchemaVersion: 1 | 2 | undefined,
): 'image_only' | 'image_and_text' {
  if (outputMode !== undefined) return outputMode
  if (requestPlanSchemaVersion === 2) {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
  }
  return 'image_only'
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
  validateGenerationExecutionCapabilityV2(capability, snapshot.semanticIntent, snapshot.requestPlan)
  const binding = snapshot.providerBinding
  const profile = readVerifiedGeminiDeveloperApiEndpointProfileV2()
  const descriptor = profile.descriptors.interactions
  if (binding.providerId.value !== 'google_ai_studio' || binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== 'gemini-interactions-v1beta' || binding.operation !== 'image_generate' ||
      binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.descriptors[0].endpointId.value !== descriptor.endpointId.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'none') {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_BINDING_INVALID')
  }
  if (snapshot.semanticIntent.attachments.some((attachment) => attachment.include)) {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
  }
  const intent = snapshot.semanticIntent
  try {
    validateWebSearchProtocolParametersV2({providerId:binding.providerId.value,protocolContractId:binding.protocolContractId.value,operation:binding.operation},intent.web)
  } catch {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
  }
  if (intent.image.mode !== 'generate') {
    throw new GeminiInteractionsImagePreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
  }
  const outputMode = resolveGeminiInteractionsImageOutputModeV2(intent.image.outputMode, snapshot.requestPlan?.schemaVersion)
  const generation = intent.generation
  const nativeLevel = intent.providerExtension.kind === 'gemini_interactions' ? intent.providerExtension.thinkingLevel
    : intent.reasoning.mode === 'enabled' ? intent.reasoning.effort : undefined
  const compilation = compileGeminiInteractionsRequestV1({
    model: binding.modelId.value,
    prompt: input.prompt,
    outputMode,
    image: {
      ...(intent.image.format === 'jpeg' ? { mimeType: 'image/jpeg' } : {}),
      ...(intent.image.aspectRatio === undefined ? {} : { aspectRatio: readImageAspectRatioV2(intent.image.aspectRatio) }),
      ...(intent.image.resolution === undefined ? {} : { imageSize: intent.image.resolution }),
    },
    generation: {
      ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
      ...(generation.topP === undefined ? {} : { topP: generation.topP }),
      ...(generation.maxOutputTokens === undefined ? {} : { maxOutputTokens: generation.maxOutputTokens }),
      ...(generation.stop === undefined ? {} : { stop: generation.stop }),
    },
    reasoning: intent.reasoning.mode === 'disabled' ? {} : {
      ...(nativeLevel === undefined ? {} : { thinkingLevel: nativeLevel }),
      ...(intent.reasoning.summary === 'auto' ? { thinkingSummaries: 'auto' } : {}),
    },
    webTypes: intent.web.mode === 'provider_search' ? intent.web.types : [],
  }, binding.operation, snapshot.requestPlan?.resolution?.bodySchemaRevision)
  const endpoint = resolveGeminiDeveloperApiEndpointV2(readGeminiDeveloperApiContractV2(), {
    surfaceId: 'gemini-interactions-v1beta',
  })
  const dispositions: Array<Readonly<{ path: string; nativeField: string | null; disposition: 'encoded' | 'accepted_no_wire'; encodingKind: 'identity' | 'structural' | 'omitted' }>> = []
  const accept = (path: string) => dispositions.push(Object.freeze({ path, disposition: 'accepted_no_wire' as const, nativeField: null, encodingKind: 'omitted' as const }))
  const encode = (path: string, nativeField: string, encodingKind: 'identity' | 'structural' = 'identity') => dispositions.push(Object.freeze({ path, disposition: 'encoded' as const, nativeField, encodingKind }))
  const addIf = (value: unknown, path: string, nativeField: string, encodingKind: 'identity' | 'structural' = 'identity') => { if (value !== undefined) encode(path, nativeField, encodingKind) }
  addIf(generation.temperature, 'generation.temperature', 'generation_config.temperature')
  addIf(generation.topP, 'generation.topP', 'generation_config.top_p')
  addIf(generation.maxOutputTokens, 'generation.maxOutputTokens', 'generation_config.max_output_tokens')
  addIf(generation.stop, 'generation.stop', 'generation_config.stop_sequences')
  if (intent.reasoning.mode === 'disabled') accept('reasoning.mode')
  else {
    if (nativeLevel !== undefined || intent.reasoning.summary !== undefined) encode('reasoning.mode', 'generation_config', 'structural')
    else accept('reasoning.mode')
    if (intent.providerExtension.kind !== 'gemini_interactions') addIf(intent.reasoning.effort, 'reasoning.effort', 'generation_config.thinking_level')
    addIf(intent.reasoning.summary, 'reasoning.summary', 'generation_config.thinking_summaries', 'structural')
  }
  if (intent.web.mode === 'disabled') accept('web.mode')
  else { encode('web.mode', 'tools', 'structural'); encode('web.types', 'tools', 'structural') }
  if (intent.tools.mode === 'disabled') accept('tools.mode')
  accept('providerExtension.kind')
  if (intent.providerExtension.kind === 'gemini_interactions') addIf(nativeLevel, 'providerExtension.thinkingLevel', 'generation_config.thinking_level')
  if (intent.image.mode === 'generate') {
    encode('image.mode', 'response_format.type', 'structural')
    addIf(intent.image.outputMode, 'image.outputMode', 'response_format', 'structural')
    if (intent.image.aspectRatio !== undefined && readImageAspectRatioV2(intent.image.aspectRatio) !== 'auto') encode('image.aspectRatio', 'response_format.aspect_ratio')
    addIf(intent.image.resolution, 'image.resolution', 'response_format.image_size')
    addIf(intent.image.format, 'image.format', 'response_format.mime_type', 'structural')
    if (intent.image.stream === true) accept('image.stream')
  }
  for (const [index, attachment] of intent.attachments.entries()) {
    const path = attachment.kind === 'managed_file'
      ? `attachments.${attachment.assetId.value}@${attachment.assetRevisionId.value}`
      : `attachments.${attachment.referenceId.value}@${attachment.referenceRevision.value}`
    accept(path)
    void index
  }
  const ledger = createSemanticConsumptionLedgerV2(dispositions.map((entry) => Object.freeze({
    kind: 'consumed' as const, path: entry.path, disposition: entry.disposition,
    nativeField: entry.nativeField, encodingKind: entry.encodingKind,
    evidence: 'gemini-interactions-v1beta',
  })))
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value, answerRootId: operation.targetAnswerId.value,
    requestSequence: 1, providerId: binding.providerId.value, endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value, contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value, effectiveEndpointId: descriptor.endpointId.value, endpoint: endpoint.url,
    headersPlan: createGoogleApiKeyHeaderPlanV2(), body: compilation.preparedBody, ledger, requestPlan: snapshot.requestPlan, identitySemanticSource: snapshot.semanticIntent,
    capabilityRevision: capability.revision.value, encoderRevision: capability.encoderRevision, snapshotHash: snapshot.snapshotHash.value,
  })
}
