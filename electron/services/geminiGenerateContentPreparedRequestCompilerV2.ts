import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isGeminiGenerateContentHistoryRepositoryFactForContextV2,
  type GeminiGenerateContentHistoryRepositoryFactV2,
} from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { createSemanticConsumptionLedgerV2, type SemanticConsumptionLedgerEntryV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createGoogleApiKeyHeaderPlanV2,
  issuePreparedProviderRequestV2,
  createPreparedAttachmentRequirementsV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedProviderRequestV2,
} from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { compileGeminiGenerateContentRequestV1 } from '../../src/core/generation-v2/providers/gemini/generateContentRequestV1'
import type { GeminiGenerateContentNativeContentV1 } from '../../src/core/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import { GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1 } from '../../src/core/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import {
  readGeminiDeveloperApiContractV2,
  resolveGeminiDeveloperApiEndpointV2,
} from '../../src/core/generation-v2/contracts/geminiDeveloperApiContractV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/core/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import { stableSerializeProviderRequestV2 } from '../../src/shared/serialization/canonicalJsonV2'
import { validateGenerationExecutionCapabilityV2 } from '../../infra/generation-v2/semanticCapabilityValidatorV2'
import { validateWebSearchProtocolParametersV2 } from '../../src/core/generation-v2/contracts/webSearchProtocolParametersV2'
/* eslint-enable no-restricted-imports */

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
const GEMINI_INLINE_DATA_MAX_BYTES_V2 = 4 * 1024 * 1024
function consumed(path: string, nativeField: string, encodingKind: 'identity' | 'structural' = 'identity'): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'encoded', nativeField, encodingKind, evidence })
}
function accepted(path: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'accepted_no_wire', nativeField: null, encodingKind: 'omitted', evidence })
}

type GeminiPartV2 = GeminiGenerateContentNativeContentV1['parts'][number]

function encodeGeminiAttachmentPartV2(
  context: GenerationV2AuthorityTransactionContextV2,
  attachmentRepo: AttachmentAssetV2Repo,
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2,
  attachment: GenerationExecutionOperationBundleV2['snapshot']['semanticIntent']['attachments'][number],
): GeminiPartV2 {
  if (attachment.kind !== 'managed_file') {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
  }
  return attachmentRepo.withSynchronousSnapshotReferenceAuthority(context, attachment, (authority) => {
    const bytes = attachmentBlobStore.readRevisionBytes(authority.revision)
    try {
      if (attachment.sendAs === 'inline_text' && ['none', 'plain_text'].includes(attachment.conversion) && authority.revision.blob.mime.startsWith('text/')) {
        return Object.freeze({ text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) })
      }
      if (attachment.sendAs === 'image_reference' && attachment.conversion === 'none' &&
          authority.revision.assetKind === 'image' && authority.revision.blob.mime.startsWith('image/')) {
        return Object.freeze({ inlineData: Object.freeze({ mimeType: authority.revision.blob.mime, data: Buffer.from(bytes).toString('base64') }) })
      }
      if (attachment.sendAs === 'provider_file' && attachment.conversion === 'none' &&
          authority.revision.blob.sizeBytes <= GEMINI_INLINE_DATA_MAX_BYTES_V2 &&
          (/^(?:image|audio|video)\//u.test(authority.revision.blob.mime) || authority.revision.blob.mime === 'application/pdf')) {
        return Object.freeze({ inlineData: Object.freeze({ mimeType: authority.revision.blob.mime, data: Buffer.from(bytes).toString('base64') }) })
      }
      if (attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf' && authority.revision.blob.mime === 'application/pdf') {
        return Object.freeze({ inlineData: Object.freeze({ mimeType: authority.revision.blob.mime, data: Buffer.from(bytes).toString('base64') }) })
      }
      throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
    } finally { bytes.fill(0) }
  })
}

export function compileGeminiGenerateContentPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: GeminiGenerateContentHistoryRepositoryFactV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentRepo?: AttachmentAssetV2Repo
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isGeminiGenerateContentHistoryRepositoryFactForContextV2(input.history, input.context) ||
      input.execution.operation.operationId.value !== input.history.operationId.value ||
      input.execution.operation.targetAnswerId.value !== input.history.answerRootId.value) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  validateGenerationExecutionCapabilityV2(capability, snapshot.semanticIntent, snapshot.requestPlan)
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
  try {
    validateWebSearchProtocolParametersV2({providerId:binding.providerId.value,protocolContractId:binding.protocolContractId.value,operation:binding.operation},intent.web)
  } catch {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
  }
  const toolsEnabled = intent.tools.mode === 'enabled'
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
  const thinkingBudget = extension.kind === 'gemini_generate_content' && extension.thinkingMode === 'budget'
    ? extension.thinkingBudget : null
  const reasoning = intent.reasoning.mode === 'disabled'
    ? Object.freeze({ mode: 'disabled' as const,
        ...(thinkingBudget === 0 ? { thinkingBudget: 0 } : {}),
        ...(extension.kind !== 'gemini_generate_content' || extension.includeThoughts === 'provider_default' ? {} : { includeThoughts: extension.includeThoughts === 'enabled' }) })
    : (() => {
        if (intent.reasoning.summary !== undefined || intent.reasoning.exclude !== undefined ||
            extension.kind !== 'gemini_generate_content' ||
            extension.thinkingMode === 'default' && intent.reasoning.effort !== undefined ||
            extension.thinkingMode === 'budget' && thinkingBudget === null) {
          throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
        }
        return Object.freeze({ mode: 'enabled' as const,
          ...(extension.thinkingMode === 'budget' ? { thinkingBudget: thinkingBudget! } :
            extension.thinkingMode === 'level' ? { thinkingLevel: extension.thinkingLevel } : {}),
          ...(extension.includeThoughts === 'provider_default' ? {} : { includeThoughts: extension.includeThoughts === 'enabled' }) })
      })()
  const webSearch = intent.web.mode === 'provider_search'
  if (intent.image.mode !== 'disabled' ||
      extension.kind !== 'gemini_generate_content' ||
      (intent.reasoning.mode === 'disabled' && extension.thinkingMode !== 'default' &&
        !(extension.thinkingMode === 'budget' && extension.thinkingBudget === 0)) ||
      (webSearch && (intent.web.types.length !== 1 || intent.web.types[0] !== 'web' ||
        intent.web.engine !== undefined || intent.web.maxResults !== undefined || intent.web.maxTotalResults !== undefined ||
        intent.web.searchContextSize !== undefined || intent.web.maxCharacters !== undefined ||
        intent.web.userLocation !== undefined || intent.web.allowedDomains !== undefined || intent.web.excludedDomains !== undefined))) {
    throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
  }
  const ledger: SemanticConsumptionLedgerEntryV2[] = [
    ('thinkingBudget' in reasoning || 'thinkingLevel' in reasoning || 'includeThoughts' in reasoning)
      ? consumed('reasoning.mode', 'generationConfig.thinkingConfig', 'structural') : accepted('reasoning.mode'),
    ...(reasoning.mode === 'enabled' && intent.reasoning.mode === 'enabled' && intent.reasoning.effort !== undefined
      ? [consumed('reasoning.effort', 'generationConfig.thinkingConfig', 'structural')] : [accepted('reasoning.effort')]),
    webSearch ? consumed('web.mode', 'tools[].googleSearch', 'structural') : accepted('web.mode'), accepted('image.mode'),
    toolsEnabled ? consumed('tools.mode', 'tools[].functionDeclarations', 'structural') : accepted('tools.mode'),
    accepted('providerExtension.kind'),
    reasoning.mode === 'enabled' && extension.thinkingMode !== 'default'
      ? consumed('providerExtension.thinkingMode', 'generationConfig.thinkingConfig', 'structural')
      : accepted('providerExtension.thinkingMode'),
    ...(extension.thinkingMode === 'level'
      ? [consumed('providerExtension.thinkingLevel', 'generationConfig.thinkingConfig.thinkingLevel')] : []),
    ...(extension.thinkingMode === 'budget'
      ? [consumed('providerExtension.thinkingBudget', 'generationConfig.thinkingConfig.thinkingBudget')] : []),
    extension.includeThoughts === 'provider_default' ? accepted('providerExtension.includeThoughts')
      : consumed('providerExtension.includeThoughts', 'generationConfig.thinkingConfig.includeThoughts', 'structural'),
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
  const tools = intent.tools
  let toolChoice
  if (tools.mode === 'disabled' || tools.toolChoice.mode === 'omitted') {
    toolChoice = Object.freeze({ mode: 'provider_default' as const })
  } else if (tools.toolChoice.mode === 'named') {
    const namedToolId = tools.toolChoice.toolId.value
    const name = toolRegistry!.selectedDefinitions.find((tool) => tool.toolId === namedToolId)?.function.name
    if (name === undefined) throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
    toolChoice = Object.freeze({ mode: 'named' as const, name })
  } else {
    toolChoice = Object.freeze({ mode: tools.toolChoice.mode })
  }
  const attachmentRequirements = createPreparedAttachmentRequirementsV2(intent.attachments)
  const attachmentEncodingProofs: PreparedAttachmentEncodingProofV2[] = []
  let replayContents = input.history.replayContents
  // Prior turns replay their own snapshot attachments (included only) after the turn's text, like the current turn.
  if (input.history.historicalTurnAttachments.length > 0) {
    if (!(input.attachmentRepo instanceof AttachmentAssetV2Repo) || !input.attachmentBlobStore) {
      throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
    }
    const replaced = new Map<number, GeminiGenerateContentNativeContentV1>()
    for (const turn of input.history.historicalTurnAttachments) {
      const user = replayContents[turn.replayIndex]
      if (user?.role !== 'user' || !user.parts.some((part) => 'text' in part)) {
        throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
      }
      replaced.set(turn.replayIndex, Object.freeze({ ...user, parts: Object.freeze([
        ...user.parts,
        ...turn.attachments.map((attachment) => encodeGeminiAttachmentPartV2(input.context, input.attachmentRepo!, input.attachmentBlobStore!, attachment)),
      ]) }))
    }
    replayContents = Object.freeze(replayContents.map((content, index) => replaced.get(index) ?? content))
  }
  const included = intent.attachments.filter((attachment) => attachment.include)
  if (included.length > 0) {
    if (!(input.attachmentRepo instanceof AttachmentAssetV2Repo) || !input.attachmentBlobStore) {
      throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
    }
    // Current-turn attachments belong to the originating question. In a tool continuation the trailing user
    // content is a functionResponse turn (no text part), so target the last user content that carries text.
    const reverseUserIndex = [...replayContents].reverse().findIndex((content: GeminiGenerateContentNativeContentV1) =>
      content.role === 'user' && content.parts.some((part) => 'text' in part))
    const userIndex = reverseUserIndex < 0 ? -1 : replayContents.length - 1 - reverseUserIndex
    const user = userIndex < 0 ? undefined : replayContents[userIndex]
    if (!user || !user.parts.some((part) => 'text' in part)) {
      throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID')
    }
    const parts: GeminiGenerateContentNativeContentV1['parts'][number][] = []
    for (const attachment of included) {
      const index = intent.attachments.indexOf(attachment)
      const requirement = attachmentRequirements.find((candidate) => candidate.semanticPath === `attachments[${index}]`)
      if (!requirement || attachment.kind !== 'managed_file') {
        throw new GeminiGenerateContentPreparedRequestCompilerV2Error('GENERATION_V2_GEMINI_COMPILER_SEMANTIC_REJECTED')
      }
      const part = encodeGeminiAttachmentPartV2(input.context, input.attachmentRepo, input.attachmentBlobStore, attachment)
      parts.push(part)
      attachmentEncodingProofs.push(Object.freeze({ semanticPath: requirement.semanticPath, requirement, wireFragment: part }))
      for (const field of ['assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion']) {
        ledger.push(consumed(`attachments[${index}].${field}`, 'contents[].parts'))
      }
    }
    replayContents = Object.freeze(replayContents.map((content, index) => index === userIndex
      ? Object.freeze({ ...content, parts: Object.freeze([...content.parts, ...parts]) }) : content))
  }
  for (const attachment of intent.attachments.filter((item) => !item.include)) {
    const index = intent.attachments.indexOf(attachment)
    for (const field of ['assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion']) {
      ledger.push(accepted(`attachments[${index}].${field}`))
    }
  }
  const compilation = compileGeminiGenerateContentRequestV1({
    replayContents,
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
  }, binding.operation, snapshot.requestPlan?.resolution?.bodySchemaRevision)
  const endpoint = resolveGeminiDeveloperApiEndpointV2(readGeminiDeveloperApiContractV2(), {
    surfaceId: 'gemini-generate-content-v1beta', modelId: binding.modelId.value,
  })
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value,
    answerRootId: operation.targetAnswerId.value,
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
    ledger: createSemanticConsumptionLedgerV2(ledger), requestPlan: snapshot.requestPlan, identitySemanticSource: snapshot.semanticIntent,
    attachmentRequirements,
    attachmentEncodingProofs,
    capabilityRevision: capability.revision.value,
    encoderRevision: capability.encoderRevision,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
