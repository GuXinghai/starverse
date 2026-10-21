import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isOpenAIResponsesRequestHistoryFactForContextV2, type OpenAIResponsesRequestHistoryFactV2 } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import { isReviewedProviderContractDefinitionV2, readReviewedOpenAIResponsesDefinitionV2 } from '../../src/core/generation-v2/contracts/providerContractRegistryV2'
import { isVerifiedProviderContractReferenceV2, verifyProviderContractReferenceV2 } from '../../src/core/generation-v2/contracts/providerContractReferenceAuthorityV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/core/generation-v2/domain/providerBindingV2'
import { validateWebSearchProtocolParametersV2 } from '../../src/core/generation-v2/contracts/webSearchProtocolParametersV2'
import { requiresProviderFileBindingV2, type AttachmentIntentV2 } from '../../src/core/generation-v2/domain/generationIntentV2'
import { OPENAI_RESPONSES_ARTIFACT_KIND_V2 } from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { compileOpenAIResponsesRequestV1, type OpenAIResponsesToolV1, type OpenAIResponsesToolChoiceV1 } from '../../src/core/generation-v2/providers/openai-responses/responsesRequestV1'
import { isOpenAILegacyReasoningEncoderRevisionV2, isOpenAILegacyImageEncoderRevisionV2 } from '../../src/core/generation-v2/capability/encodingCoverageRegistryV2'
import { isVerifiedOpenAIResponsesEndpointProfileV2, readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/core/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createSemanticConsumptionLedgerV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { validateGenerationExecutionCapabilityV2 } from '../../infra/generation-v2/semanticCapabilityValidatorV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  createPreparedAttachmentRequirementsV2,
  issuePreparedProviderRequestV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedProviderRequestV2,
} from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { stableSerializeProviderRequestV2 } from '../../src/shared/serialization/canonicalJsonV2'
import { REQUEST_RULE_RESOLVER_REVISION_V2 } from '../../src/core/generation-v2/compiler/resolvedInvocationV2'

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

type OpenAIResponsesCompilerToolInputV2 = Exclude<OpenAIResponsesToolV1, {type:'web_search'}> | Readonly<{
  type:'web_search'
  searchContextSize?:string
  allowedDomains?:readonly string[]
}>
type EncodedOpenAIResponsesIntentV2 = Readonly<{
  reasoning?: Readonly<{ effort?: string; summary?: string; mode?: 'standard' | 'pro'; context?: 'auto' | 'current_turn' | 'all_turns' }>
  generation: Readonly<{ maxOutputTokens?: number; temperature?: number; topP?: number; verbosity?: string }>
  tools?: readonly OpenAIResponsesCompilerToolInputV2[]
  maxToolCalls?: number
  parallelToolCalls?: boolean
  serviceTier?: 'auto' | 'default' | 'flex' | 'priority'
  dispositions: readonly Readonly<{
    semanticPath: string
    outcome: 'encoded' | 'accepted_no_wire' | 'rejected'
    wireKey?: string
    encodingKind?: 'identity' | 'structural' | 'omitted'
    evidence: string
  }>[]
  issues: readonly string[]
}>

function isOpenAIResponsesEncodedAttachmentV2(attachment: AttachmentIntentV2): boolean {
  return (attachment.kind === 'managed_file' && attachment.include && attachment.sendAs === 'image_reference' && attachment.conversion === 'none') ||
    requiresProviderFileBindingV2(attachment) ||
    (attachment.kind === 'url_reference' && attachment.include && attachment.mediaKind === 'image')
}

function encodeOpenAIResponsesIntentV2(intent: GenerationExecutionOperationBundleV2['snapshot']['semanticIntent'],
  encoderRevision: string, inputImageMask?: Readonly<{ imageUrl: string }>): EncodedOpenAIResponsesIntentV2 {
  const dispositions: Array<EncodedOpenAIResponsesIntentV2['dispositions'][number]> = []
  const issues: string[] = []
  const contract = 'openai-responses-api-contract-20260715'
  const accept = (semanticPath: string) => dispositions.push(Object.freeze({ semanticPath, outcome: 'accepted_no_wire' as const, encodingKind: 'omitted' as const, evidence: contract }))
  const encode = (semanticPath: string, wireKey: string, encodingKind: 'identity' | 'structural' = 'identity') => dispositions.push(Object.freeze({ semanticPath, outcome: 'encoded' as const, wireKey, encodingKind, evidence: contract }))
  const reject = (semanticPath: string, wireKey?: string) => {
    issues.push(semanticPath)
    dispositions.push(Object.freeze({ semanticPath, outcome: 'rejected' as const, ...(wireKey === undefined ? {} : { wireKey }), evidence: contract }))
  }
  const generation: { maxOutputTokens?: number; temperature?: number; topP?: number; verbosity?: string } = {}
  for (const [key, value] of Object.entries(intent.generation)) {
    if (value === undefined) continue
    if (key === 'maxOutputTokens') { generation.maxOutputTokens = value as number; encode('generation.maxOutputTokens', 'max_output_tokens') }
    else if (key === 'temperature') { generation.temperature = value as number; encode('generation.temperature', 'temperature') }
    else if (key === 'topP') { generation.topP = value as number; encode('generation.topP', 'top_p') }
    else reject(`generation.${key}`)
  }
  const legacyReasoningOmission = isOpenAILegacyReasoningEncoderRevisionV2(encoderRevision)
  let reasoning: { effort?: string; summary?: string; mode?: 'standard' | 'pro'; context?: 'auto' | 'current_turn' | 'all_turns' } | undefined
  if (intent.reasoning.mode === 'disabled') {
    if (legacyReasoningOmission || intent.reasoning.effort !== 'none') {
      accept('reasoning.mode')
      if (intent.reasoning.effort !== undefined) accept('reasoning.effort')
    } else {
      reasoning = { effort: 'none' }
      encode('reasoning.mode', 'reasoning', 'structural')
      encode('reasoning.effort', 'reasoning.effort')
    }
  } else {
    reasoning = intent.providerExtension.kind === 'openai_responses'
      ? { ...(intent.providerExtension.reasoningMode === undefined ? {} : { mode: intent.providerExtension.reasoningMode }) }
      : {}
    if (intent.reasoning.effort !== undefined) {
      if (intent.reasoning.effort === 'none') accept('reasoning.effort')
      else { reasoning.effort = intent.reasoning.effort; encode('reasoning.effort', 'reasoning.effort') }
    }
    if (intent.reasoning.summary !== undefined) { reasoning.summary = intent.reasoning.summary; encode('reasoning.summary', 'reasoning.summary') }
    if (intent.reasoning.exclude !== undefined) reject('reasoning.exclude')
  }
  const tools: OpenAIResponsesCompilerToolInputV2[] = []
  if (intent.web.mode === 'disabled') accept('web.mode')
  else if (intent.web.types.length !== 1 || intent.web.types[0] !== 'web') reject('web.types')
  else {
    accept('web.types'); encode('web.mode', 'tools[].type', 'structural')
    const webTool: { type: 'web_search'; searchContextSize?: string; allowedDomains?: readonly string[] } = { type: 'web_search' }
    for (const [key, value] of Object.entries(intent.web)) {
      if (key === 'mode' || key === 'types' || value === undefined) continue
      if (key === 'searchContextSize') { webTool.searchContextSize = value as string; encode('web.searchContextSize', 'tools[].search_context_size') }
      else if (key === 'allowedDomains') { webTool.allowedDomains = value as readonly string[]; encode('web.allowedDomains', 'tools[].filters.allowed_domains', 'structural') }
      else reject(`web.${key}`)
    }
    tools.push(Object.freeze(webTool))
  }
  if (intent.image.mode === 'disabled') accept('image.mode')
  else {
    const image: Record<string, unknown> = { type: 'image_generation', ...(isOpenAILegacyImageEncoderRevisionV2(encoderRevision) ? { action: 'generate' } : {}) }
    encode('image.mode', 'tools[].type', 'structural')
    for (const [key, value] of Object.entries(intent.image)) {
      if (key === 'mode' || value === undefined) continue
      if (key === 'size') {
        const size = value as 'auto' | { width: number; height: number }
        image.size = size === 'auto' ? 'auto' : `${size.width}x${size.height}`; encode('image.size', 'tools[].size', 'structural')
      } else if (key === 'quality' || key === 'format' || key === 'background') {
        image[key === 'format' ? 'outputFormat' : key] = value; encode(`image.${key}`, `tools[].${key === 'format' ? 'output_format' : key}`)
      } else if (key === 'toolModel') {
        image.model = value; encode('image.toolModel', 'tools[].model')
      } else if (key === 'action' || key === 'moderation') {
        image[key] = value; encode(`image.${key}`, `tools[].${key}`)
      } else if (key === 'partialImages' || key === 'inputFidelity' || key === 'outputCompression') {
        const wireKey = { partialImages: 'partial_images', inputFidelity: 'input_fidelity', outputCompression: 'output_compression' }[key]
        if (key === 'outputCompression' && !['jpeg', 'webp'].includes(intent.image.format ?? '')) accept('image.outputCompression')
        else { image[key] = value; encode(`image.${key}`, `tools[].${wireKey}`) }
      } else if (key === 'toolChoice') {
        encode('image.toolChoice', 'tool_choice', value === 'required' ? 'structural' : 'identity')
      } else if (key === 'maskAsset') {
        if (!inputImageMask) reject('image.maskAsset')
        else { image.inputImageMask = inputImageMask; encode('image.maskAsset', 'tools[].input_image_mask', 'structural') }
      } else reject(`image.${key}`)
    }
    if (inputImageMask && !intent.image.maskAsset) reject('image.maskAsset')
    if ((intent.image.action === 'edit' || intent.image.maskAsset) && !intent.attachments.some((attachment) => attachment.include && isOpenAIResponsesEncodedAttachmentV2(attachment) &&
        (attachment.kind === 'managed_file' ? attachment.sendAs === 'image_reference' : attachment.mediaKind === 'image'))) reject('image.action')
    tools.push(Object.freeze(image) as Extract<OpenAIResponsesToolV1,{type:'image_generation'}>)
  }
  if (intent.attachments.length > 0) {
    const included = intent.attachments.filter((attachment) => attachment.include)
    if (included.length === 0) {
      accept('attachments[].include'); accept('attachments[].sendAs'); accept('attachments[].conversion')
    } else if (included.every(isOpenAIResponsesEncodedAttachmentV2)) {
      encode('attachments[].include', 'input[].content[].type', 'structural')
      encode('attachments[].sendAs', 'input[].content[].type', 'structural')
      encode('attachments[].conversion', 'input[].content[].type', 'structural')
    } else {
      reject('attachments[].include', 'input[].content[].type')
      reject('attachments[].sendAs', 'input[].content[].type')
      reject('attachments[].conversion', 'input[].content[].type')
    }
    accept('attachments[].assetId'); accept('attachments[].assetRevisionId'); accept('attachments[].assetSha256')
  }
  if (intent.providerExtension.kind === 'none') accept('providerExtension.kind')
  else if (intent.providerExtension.kind === 'openai_responses') {
    accept('providerExtension.kind')
    if (intent.providerExtension.verbosity !== undefined) { generation.verbosity = intent.providerExtension.verbosity; encode('providerExtension.verbosity', 'text.verbosity') }
    if (intent.providerExtension.maxToolCalls !== undefined) { encode('providerExtension.maxToolCalls', 'max_tool_calls'); }
    if (intent.providerExtension.parallelToolCalls !== undefined) { encode('providerExtension.parallelToolCalls', 'parallel_tool_calls') }
    if (intent.providerExtension.serviceTier !== undefined) { encode('providerExtension.serviceTier', 'service_tier') }
    if (intent.providerExtension.reasoningMode !== undefined) {
      if (intent.reasoning.mode === 'disabled') reject('providerExtension.reasoningMode', 'reasoning.mode')
      else { if (reasoning) reasoning.mode = intent.providerExtension.reasoningMode; encode('providerExtension.reasoningMode', 'reasoning.mode') }
    }
    if (intent.providerExtension.reasoningContext !== undefined) {
      if (intent.reasoning.mode === 'disabled') reject('providerExtension.reasoningContext', 'reasoning.context')
      else { if (reasoning) reasoning.context = intent.providerExtension.reasoningContext; encode('providerExtension.reasoningContext', 'reasoning.context') }
    }
  } else {
    reject('providerExtension.kind')
    if (intent.providerExtension.kind === 'anthropic_messages') {
      if (intent.providerExtension.manualThinkingBudgetTokens !== undefined) reject('providerExtension.manualThinkingBudgetTokens')
      reject('providerExtension.thinkingDisplay'); reject('providerExtension.thinkingMode')
    } else {
      reject('providerExtension.thinkingMode')
      if ('thinkingLevel' in intent.providerExtension && intent.providerExtension.thinkingLevel !== undefined) reject('providerExtension.thinkingLevel')
      if ('thinkingBudget' in intent.providerExtension && intent.providerExtension.thinkingBudget !== undefined) reject('providerExtension.thinkingBudget')
      reject('providerExtension.includeThoughts')
    }
  }
  if (intent.reasoning.mode === 'enabled') {
    if (reasoning && Object.keys(reasoning).length > 0) encode('reasoning.mode', 'reasoning', 'structural')
    else { accept('reasoning.mode'); reasoning = undefined }
  }
  if (new Set(dispositions.map((entry) => entry.semanticPath)).size !== dispositions.length) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  return Object.freeze({
    ...(reasoning === undefined ? {} : { reasoning: Object.freeze(reasoning) }), generation: Object.freeze(generation),
    ...(tools.length === 0 ? {} : { tools: Object.freeze(tools) }),
    ...(intent.providerExtension.kind === 'openai_responses' && intent.providerExtension.maxToolCalls !== undefined ? { maxToolCalls: intent.providerExtension.maxToolCalls } : {}),
    ...(intent.providerExtension.kind === 'openai_responses' && intent.providerExtension.parallelToolCalls !== undefined ? { parallelToolCalls: intent.providerExtension.parallelToolCalls } : {}),
    ...(intent.providerExtension.kind === 'openai_responses' && intent.providerExtension.serviceTier !== undefined ? { serviceTier: intent.providerExtension.serviceTier } : {}),
    dispositions: Object.freeze(dispositions), issues: Object.freeze(issues),
  })
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
  validateGenerationExecutionCapabilityV2(capability, snapshot.semanticIntent, snapshot.requestPlan)
  if (!['initial_send', 'retry_as_new', 'retry_replace', 'regenerate_question', 'edit_resend'].includes(operation.actionKind) ||
      operation.operationId.value !== input.history.operationId.value ||
      operation.targetAnswerId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value || snapshot.answerRootId.value !== operation.targetAnswerId.value ||
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
  const ruleResolution = snapshot.requestPlan?.resolution
  const frozenToolDefinitions = ruleResolution?.toolDefinitions
  try {
    validateWebSearchProtocolParametersV2({providerId:binding.providerId.value,protocolContractId:binding.protocolContractId.value,operation:binding.operation},snapshot.semanticIntent.web)
  } catch {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  if (tools.mode === 'enabled') {
    if (snapshot.toolAuthority.kind !== 'registry' ||
        !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context) ||
        input.toolRegistry.registry.revision !== snapshot.toolAuthority.toolRegistryRevision.value ||
        input.toolRegistry.registry.definitionsDigest !== snapshot.toolAuthority.toolDefinitionsDigest.value ||
        stableSerializeProviderRequestV2(input.toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
          stableSerializeProviderRequestV2(tools.allowedToolIds.map((tool) => tool.value)) ||
        (ruleResolution?.resolverRevision === REQUEST_RULE_RESOLVER_REVISION_V2 && frozenToolDefinitions === undefined) ||
        (frozenToolDefinitions !== undefined && (frozenToolDefinitions.registryRevision !== input.toolRegistry.registry.revision ||
          frozenToolDefinitions.definitionsDigest !== input.toolRegistry.registry.definitionsDigest ||
          stableSerializeProviderRequestV2(frozenToolDefinitions.definitions.map((entry) => entry.sourceDefinition)) !==
            stableSerializeProviderRequestV2(input.toolRegistry.selectedDefinitions) ||
          stableSerializeProviderRequestV2(frozenToolDefinitions.definitions.map((entry) => entry.sourceDefinition.toolId)) !==
            stableSerializeProviderRequestV2(tools.allowedToolIds.map((tool) => tool.value))))) {
      throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
    }
  } else if (snapshot.toolAuthority.kind !== 'none' || input.toolRegistry !== null || frozenToolDefinitions !== undefined) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
  }
  const encodedIntent = encodeOpenAIResponsesIntentV2(snapshot.semanticIntent, capability.encoderRevision, input.history.inputImageMask)
  if (encodedIntent.issues.length > 0) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  const selectedMask = snapshot.semanticIntent.image.mode === 'generate' ? snapshot.semanticIntent.image.maskAsset : undefined
  if (selectedMask && (!snapshot.semanticIntent.attachments.some((attachment) => attachment.kind === 'managed_file' &&
      attachment.include && attachment.sendAs === 'image_reference' && attachment.conversion === 'none' &&
      attachment.assetId.value === selectedMask.assetId.value && attachment.assetRevisionId.value === selectedMask.assetRevisionId.value &&
      attachment.assetSha256.value === selectedMask.assetSha256.value) || input.history.inputImageMask === undefined)) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  let toolChoice: OpenAIResponsesToolChoiceV1 | undefined
  if (tools.mode === 'enabled' && tools.toolChoice.mode !== 'omitted') {
    const semanticToolChoice = tools.toolChoice
    if (semanticToolChoice.mode === 'named') {
      const selected = input.toolRegistry?.selectedDefinitions.find((tool) =>
        tool.toolId === semanticToolChoice.toolId.value)
      if (!selected) throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_AUTHORITY_INVALID')
      toolChoice = Object.freeze({ type: 'function', name: selected.function.name })
    } else toolChoice = semanticToolChoice.mode
  }
  if (snapshot.semanticIntent.image.mode === 'generate' && snapshot.semanticIntent.image.toolChoice !== undefined) {
    if (toolChoice !== undefined) throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
    toolChoice = snapshot.semanticIntent.image.toolChoice === 'required' ? Object.freeze({ type: 'image_generation' }) : 'auto'
  }
  const functionTools = frozenToolDefinitions !== undefined
    ? frozenToolDefinitions.definitions.map(({ effectiveDefinition }) => Object.freeze({
      type: 'function' as const, name: effectiveDefinition.function.name,
      ...(effectiveDefinition.function.description === undefined ? {} : { description: effectiveDefinition.function.description }),
      parameters: effectiveDefinition.function.parameters!, strict: effectiveDefinition.function.strict!,
    }))
    : input.toolRegistry?.selectedDefinitions.map((tool) => Object.freeze({
      type: 'function' as const, name: tool.function.name,
      ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
      parameters: tool.function.parameters ?? Object.freeze({}), strict: tool.function.strict ?? true,
    })) ?? []
  const compiled = compileOpenAIResponsesRequestV1({
    model: binding.modelId.value,
    ...(input.history.projectedPrefixItems === null
      ? { priorArtifact: input.history.priorArtifact, clientItems: input.history.clientItems }
      : { replayItems: [...input.history.projectedPrefixItems, ...input.history.clientItems] }),
    ...(encodedIntent.reasoning === undefined ? {} : { reasoning: encodedIntent.reasoning }),
    generation: encodedIntent.generation,
    ...((encodedIntent.tools === undefined && functionTools.length === 0) ? {} : {
      tools: [...functionTools, ...(encodedIntent.tools ?? [])],
    }),
    ...(toolChoice === undefined ? {} : { toolChoice }),
    ...(encodedIntent.maxToolCalls === undefined ? {} : { maxToolCalls: encodedIntent.maxToolCalls }),
    ...(encodedIntent.parallelToolCalls === undefined ? {} : { parallelToolCalls: encodedIntent.parallelToolCalls }),
    ...(encodedIntent.serviceTier === undefined ? {} : { serviceTier: encodedIntent.serviceTier }),
  }, binding.operation, snapshot.requestPlan?.resolution?.bodySchemaRevision)
  const attachmentRequirements = createPreparedAttachmentRequirementsV2(snapshot.semanticIntent.attachments)
  // Attachment provenance comes from canonical history, before historical image
  // tools are projected to synthetic user image messages for stateless replay.
  // Prepared-request issuance still checks each proof against the final body.
  const canonicalReplay = [...(input.history.projectedPrefixItems ?? input.history.priorArtifact?.orderedItems ?? []),
    ...input.history.clientItems]
  const latestUser = canonicalReplay.reverse().find((item) => 'role' in item && item.role === 'user')
  const wireFiles = latestUser && 'content' in latestUser
    ? latestUser.content.filter((part) => part.type === 'input_file' || part.type === 'input_image')
    : []
  const maskAsset = snapshot.semanticIntent.image.mode === 'generate' ? snapshot.semanticIntent.image.maskAsset : undefined
  let referenceIndex = 0
  const encodedFiles = attachmentRequirements.map((requirement) => {
    const mask = maskAsset && requirement.kind === 'managed_file' &&
      requirement.assetRevisionId === maskAsset.assetRevisionId.value && requirement.assetSha256 === maskAsset.assetSha256.value
    return mask ? compiled.nativeRequest.tools?.find((tool) => tool.type === 'image_generation')?.input_image_mask : wireFiles[referenceIndex++]
  })
  if (referenceIndex !== wireFiles.length || encodedFiles.some((fragment) => fragment === undefined) ||
      (maskAsset && (input.history.inputImageMask === undefined || wireFiles.filter((part) => part.type === 'input_image').length === 0))) {
    throw new OpenAIResponsesPreparedRequestCompilerV2Error('GENERATION_V2_OPENAI_COMPILER_SEMANTIC_REJECTED')
  }
  const attachmentEncodingProofs: PreparedAttachmentEncodingProofV2[] = attachmentRequirements.map((requirement, index) => Object.freeze({
    semanticPath: requirement.semanticPath,
    requirement,
    wireFragment: encodedFiles[index]!,
  }))
  const ledger = createSemanticConsumptionLedgerV2(encodedIntent.dispositions.map((value) => ({
    kind: 'consumed' as const, path: value.semanticPath, disposition: value.outcome,
    nativeField: value.wireKey ?? null,
    encodingKind: value.encodingKind ?? (value.wireKey === undefined ? 'omitted' as const : 'structural' as const),
    evidence: value.evidence,
  })))
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value, answerRootId: operation.targetAnswerId.value,
    requestSequence: input.history.requestSequence, providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value, credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value, modelId: binding.modelId.value,
    effectiveEndpointId: profile.descriptor.endpointId.value,
    endpoint: new URL(profile.descriptor.responsesPath, profile.descriptor.apiOrigin).toString(),
    headersPlan: createBearerAuthorizationHeaderPlanV2(),
    body: compiled.preparedBody, ledger, attachmentRequirements, attachmentEncodingProofs,
    requestPlan: snapshot.requestPlan,
    identitySemanticSource: snapshot.semanticIntent,
    capabilityRevision: capability.revision.value,
    encoderRevision: capability.encoderRevision,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
