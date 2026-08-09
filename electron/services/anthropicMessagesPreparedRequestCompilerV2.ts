import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
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
  createPreparedAttachmentRequirementsV2,
  type PreparedAttachmentEncodingProofV2,
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
  type AnthropicMessagesRequestMessageV1,
  type AnthropicMessagesUserContentBlockV1,
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

function appendAttachmentBlocks(
  messages: readonly AnthropicMessagesRequestMessageV1[],
  blocks: readonly AnthropicMessagesUserContentBlockV1[],
): readonly AnthropicMessagesRequestMessageV1[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message.content === 'string') {
      return Object.freeze(messages.map((candidate, candidateIndex) => candidateIndex === index
        ? Object.freeze({ role: 'user' as const, content: Object.freeze([
            Object.freeze({ type: 'text' as const, text: message.content as string }), ...blocks,
          ]) })
        : candidate))
    }
  }
  throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
}

function providerFileIdFor(
  snapshot: GenerationExecutionOperationBundleV2['snapshot'],
  revisionId: string,
): string | null {
  const binding = snapshot.attachmentProviderFileBindings.find((candidate) =>
    candidate.assetRevisionId.value === revisionId)
  const fileId = binding?.providerFileDescriptor.providerFileId
  return typeof fileId === 'string' && fileId.length > 0 ? fileId : null
}

function webSearchTool(intent: GenerationExecutionOperationBundleV2['snapshot']['semanticIntent']): Readonly<Record<string, unknown>> | null {
  if (intent.web.mode === 'disabled') return null
  if (intent.web.types.length !== 1 || intent.web.types[0] !== 'web') {
    throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
  }
  return Object.freeze({
    type: 'web_search_20250305', name: 'web_search',
    ...(intent.web.maxResults === undefined ? {} : { max_uses: intent.web.maxResults }),
    ...(intent.web.allowedDomains === undefined ? {} : { allowed_domains: intent.web.allowedDomains }),
    ...(intent.web.excludedDomains === undefined ? {} : { blocked_domains: intent.web.excludedDomains }),
    ...(intent.web.userLocation === undefined ? {} : {
      user_location: Object.freeze({ type: 'approximate' as const, ...intent.web.userLocation }),
    }),
  })
}

export function compileAnthropicMessagesPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: AnthropicRequestHistoryRepositoryFactV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentRepo?: AttachmentAssetV2Repo
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
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
  })) : []
  const webTool = webSearchTool(snapshot.semanticIntent)
  const allNativeTools = webTool === null
    ? (nativeTools.length === 0 ? undefined : Object.freeze(nativeTools))
    : Object.freeze([...nativeTools, webTool])
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
      operation.targetAnswerId.value !== input.history.answerRootId.value ||
      snapshot.operationId.value !== operation.operationId.value ||
      snapshot.answerRootId.value !== operation.targetAnswerId.value) {
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

  const attachmentRequirements = createPreparedAttachmentRequirementsV2(snapshot.semanticIntent.attachments)
  const attachmentEncodingProofs: PreparedAttachmentEncodingProofV2[] = []
  const attachmentBlocks: AnthropicMessagesUserContentBlockV1[] = []
  for (const [index, attachment] of snapshot.semanticIntent.attachments.entries()) {
    if (!attachment.include) continue
    const requirement = attachmentRequirements.find((candidate) => candidate.semanticPath === `attachments[${index}]`)
    if (!requirement) throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
    let block: AnthropicMessagesUserContentBlockV1
    if (attachment.kind === 'url_reference') {
      if (attachment.mediaKind === 'image') block = Object.freeze({ type: 'image' as const, source: Object.freeze({ type: 'url' as const, url: attachment.originalUrl }) })
      else if (attachment.mediaKind === 'document') block = Object.freeze({ type: 'document' as const, source: Object.freeze({ type: 'url' as const, url: attachment.originalUrl }) })
      else throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
    } else {
      if (!(input.attachmentRepo instanceof AttachmentAssetV2Repo)) {
        throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
      }
      block = input.attachmentRepo.withSynchronousSnapshotReferenceAuthority(input.context, attachment, (authority) => {
        const revision = authority.revision
        const providerFileId = providerFileIdFor(snapshot, attachment.assetRevisionId.value)
        if (attachment.sendAs === 'provider_file' || (attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf')) {
          if (!providerFileId) throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
          return Object.freeze({
            type: revision.assetKind === 'image' ? 'image' as const : 'document' as const,
            source: Object.freeze({ type: 'file' as const, file_id: providerFileId }),
          })
        }
        if (!input.attachmentBlobStore) throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_AUTHORITY_INVALID')
        const bytes = input.attachmentBlobStore.readRevisionBytes(revision)
        try {
          if (attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text' && revision.blob.mime === 'text/plain') {
            return Object.freeze({ type: 'document' as const, source: Object.freeze({
              type: 'text' as const, media_type: 'text/plain' as const,
              data: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            }) })
          }
          if (attachment.sendAs === 'image_reference' && attachment.conversion === 'none' && revision.assetKind === 'image' && revision.blob.mime.startsWith('image/')) {
            return Object.freeze({ type: 'image' as const, source: Object.freeze({
              type: 'base64' as const, media_type: revision.blob.mime, data: Buffer.from(bytes).toString('base64'),
            }) })
          }
          if (attachment.sendAs === 'converted_document' && attachment.conversion === 'plain_text' && revision.blob.mime === 'text/plain') {
            return Object.freeze({ type: 'document' as const, source: Object.freeze({ type: 'content' as const,
              content: Object.freeze([{ type: 'text' as const, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }]),
            }) })
          }
          throw new AnthropicMessagesPreparedRequestCompilerV2Error('GENERATION_V2_ANTHROPIC_COMPILER_SEMANTIC_REJECTED')
        } finally { bytes.fill(0) }
      })
    }
    attachmentBlocks.push(block)
    attachmentEncodingProofs.push(Object.freeze({ semanticPath: requirement.semanticPath, requirement, wireFragment: block }))
  }
  const messages = attachmentBlocks.length === 0
    ? input.history.messages
    : appendAttachmentBlocks(input.history.messages, attachmentBlocks)
  const compilation = compileAnthropicMessagesRequestV1({
    modelId: binding.modelId.value,
    intent: snapshot.semanticIntent,
    ...(input.history.system === null ? {} : { system: input.history.system }),
    messages,
    ...(allNativeTools === undefined ? {} : { tools: allNativeTools }),
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
      ? allNativeTools
      : disposition.semanticPath === 'tools.toolChoice' ? nativeToolChoice : disposition.value
    if (disposition.outcome === 'encoded' && !disposition.semanticPath.startsWith('attachments[') &&
        !disposition.semanticPath.startsWith('web.') &&
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
    answerRootId: operation.targetAnswerId.value,
    requestSequence: input.history.requestSequence,
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value,
    modelId: binding.modelId.value,
    effectiveEndpointId: binding.endpointBinding.descriptors[0].endpointId.value,
    endpoint: endpoint.url,
    headersPlan: createAnthropicMessagesNonSecretHeaderPlanV2(
      snapshot.attachmentProviderFileBindings.some((candidate) => typeof candidate.providerFileDescriptor.providerFileId === 'string')
        ? [{ name: 'anthropic-beta', value: 'files-api-2025-04-14' }] : [],
    ),
    body: compilation.preparedBody,
    ledger,
    attachmentRequirements,
    attachmentEncodingProofs,
    capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
