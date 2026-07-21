import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isOpenRouterRequestHistoryRepositoryFactForContextV2,
  type OpenRouterRequestHistoryRepositoryFactV2,
} from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import { createSemanticConsumptionLedgerV2, type SemanticConsumptionLedgerEntryV2 } from '../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  issuePreparedProviderRequestV2,
  type PreparedProviderRequestV2,
} from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { buildOpenRouterNativeRequestHistoryV1, buildOpenRouterProjectedNativeRequestHistoryV1, OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 } from '../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import { compileOpenRouterChatRequestV1 } from '../../src/next/generation-v2/providers/openrouter/chatRequestV1'
import {
  readVerifiedOpenRouterFirstPartyEndpointProfileV2,
  resolveOpenRouterFirstPartyOperationV2,
} from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'

export class OpenRouterChatPreparedRequestCompilerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_COMPILER_BINDING_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED') {
    super(code); this.name = 'OpenRouterChatPreparedRequestCompilerV2Error'
  }
}

function consumed(path: string, nativeField: string, evidence: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'encoded', nativeField, evidence })
}
function accepted(path: string, evidence: string): SemanticConsumptionLedgerEntryV2 {
  return Object.freeze({ kind: 'consumed', path, disposition: 'accepted_no_wire', nativeField: null, evidence })
}

export function compileOpenRouterChatPreparedRequestV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  execution: GenerationExecutionOperationBundleV2
  history: OpenRouterRequestHistoryRepositoryFactV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  attachmentRepo?: AttachmentAssetV2Repo
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
}>): PreparedProviderRequestV2 {
  if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
      !isOpenRouterRequestHistoryRepositoryFactForContextV2(input.history, input.context) ||
      (input.toolRegistry !== null && !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context))) {
    throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID')
  }
  const { operation, snapshot, capability } = input.execution
  if (!['initial_send', 'edit_resend', 'regenerate_question', 'retry_as_new', 'retry_replace'].includes(operation.actionKind) ||
      operation.operationId.value !== input.history.operationId.value || operation.resultAnswerRootId.value !== input.history.answerRootId.value ||
      !Number.isSafeInteger(input.history.requestSequence) || input.history.requestSequence < 1) {
    throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID')
  }
  const binding = snapshot.providerBinding
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const route = resolveOpenRouterFirstPartyOperationV2(profile, 'chat_completions')
  const descriptor = profile.operations.chat_completions.descriptor
  if (binding.providerId.value !== 'openrouter' || binding.endpointProfileId.value !== profile.endpointProfileId.value ||
      binding.protocolContractId.value !== route.contract.protocolContractId.value || binding.operation !== 'text' ||
      binding.endpointBinding.kind !== 'provider_managed_set' ||
      binding.endpointBinding.endpointSetRevision.value !== profile.endpointSetRevision.value ||
      binding.endpointBinding.descriptors.length !== 1 ||
      binding.endpointBinding.descriptors[0].endpointId.value !== descriptor.endpointId.value ||
      binding.endpointBinding.descriptors[0].descriptorRevision.value !== descriptor.descriptorRevision.value ||
      capability.continuation.kind !== 'client_managed_native_replay' ||
      capability.continuation.artifactKind !== OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1) {
    throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_BINDING_INVALID')
  }
  const intent = snapshot.semanticIntent
  if (intent.image.mode !== 'disabled' || intent.providerExtension.kind !== 'none' ||
      intent.reasoning.mode === 'enabled' && intent.reasoning.summary !== undefined ||
      (intent.tools.mode === 'enabled') !== (input.toolRegistry !== null)) {
    throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED')
  }
  const generation: Record<string, unknown> = {}
  const generationMap = Object.freeze({
    maxOutputTokens: 'maxTokens', temperature: 'temperature', topP: 'topP', topK: 'topK', minP: 'minP', topA: 'topA', seed: 'seed', stop: 'stop',
    frequencyPenalty: 'frequencyPenalty', presencePenalty: 'presencePenalty',
  } as const)
  const ledger: SemanticConsumptionLedgerEntryV2[] = []
  let messages = input.history.projectedPrefixMessages === null
    ? buildOpenRouterNativeRequestHistoryV1({
      priorArtifact: input.history.priorArtifact, clientMessages: input.history.clientMessages,
    })
    : buildOpenRouterProjectedNativeRequestHistoryV1({
      replayMessages: [...input.history.projectedPrefixMessages, ...input.history.clientMessages],
    })
  if (intent.attachments.length > 0) {
    if (input.history.requestSequence !== 1) {
      // Continuations already replay the original native multimodal user message.
      if (input.history.priorArtifact === null) {
        throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID')
      }
    } else {
      if (!(input.attachmentRepo instanceof AttachmentAssetV2Repo) || !input.attachmentBlobStore) {
        throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID')
      }
      const parts: Record<string, unknown>[] = []
      for (let attachmentIndex = 0; attachmentIndex < intent.attachments.length; attachmentIndex += 1) {
        const attachment = intent.attachments[attachmentIndex]
        if (attachment.kind !== 'managed_file') {
          throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED')
        }
        for (const field of ['assetId', 'assetRevisionId', 'assetSha256', 'include', 'sendAs', 'conversion']) {
          ledger.push(attachment.include ? consumed(`attachments[${attachmentIndex}].${field}`, 'messages[].content', route.contract.protocolContractId.value)
            : accepted(`attachments[${attachmentIndex}].${field}`, route.contract.protocolContractId.value))
        }
        if (!attachment.include) continue
        const part = input.attachmentRepo.withSynchronousSnapshotReferenceAuthority(input.context, attachment, (authority) => {
          const bytes = input.attachmentBlobStore!.readRevisionBytes(authority.revision)
          try {
            if (attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text' &&
                authority.revision.assetKind === 'file' && authority.revision.blob.mime.startsWith('text/')) {
              let text: string
              try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
              catch { throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED') }
              return Object.freeze({ type: 'text', text })
            }
            const dataUrl = `data:${authority.revision.blob.mime};base64,${Buffer.from(bytes).toString('base64')}`
            if (attachment.sendAs === 'image_reference' && attachment.conversion === 'none' &&
                authority.revision.assetKind === 'image' && authority.revision.blob.mime.startsWith('image/')) {
              return Object.freeze({ type: 'image_url', image_url: Object.freeze({ url: dataUrl }) })
            }
            if ((attachment.sendAs === 'provider_file' && attachment.conversion === 'none' ||
                attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf') &&
                authority.revision.blob.mime === 'application/pdf') {
              return Object.freeze({ type: 'file', file: Object.freeze({ filename: authority.revision.filename, file_data: dataUrl }) })
            }
            throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED')
          } finally { bytes.fill(0) }
        })
        parts.push(part)
      }
      if (parts.length > 0) {
        let userIndex = -1
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index].role === 'user') { userIndex = index; break }
        }
        const user = messages[userIndex]
        if (userIndex < 0 || !user || typeof user.content !== 'string') {
          throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_AUTHORITY_INVALID')
        }
        messages = Object.freeze(messages.map((message, index) => index === userIndex
          ? Object.freeze({ ...message, content: Object.freeze([{ type: 'text', text: user.content }, ...parts]) })
          : message))
      }
    }
  }
  for (const [semanticKey, codecKey] of Object.entries(generationMap)) {
    const value = intent.generation[semanticKey as keyof typeof intent.generation]
    if (value === undefined) continue
    generation[codecKey] = value
    ledger.push(consumed(`generation.${semanticKey}`, codecKey.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`), route.contract.protocolContractId.value))
  }
  const reasoning = intent.reasoning.mode === 'disabled'
    ? Object.freeze({ effort: 'none' })
    : intent.reasoning.effort === undefined && intent.reasoning.exclude === undefined ? undefined : Object.freeze({
        ...(intent.reasoning.effort === undefined ? {} : { effort: intent.reasoning.effort }),
        ...(intent.reasoning.exclude === undefined ? {} : { exclude: intent.reasoning.exclude }),
      })
  ledger.push(reasoning === undefined
    ? accepted('reasoning.mode', route.contract.protocolContractId.value)
    : consumed('reasoning.mode', 'reasoning.effort', route.contract.protocolContractId.value))
  if (intent.reasoning.mode === 'enabled' && intent.reasoning.effort !== undefined) ledger.push(consumed('reasoning.effort', 'reasoning.effort', route.contract.protocolContractId.value))
  if (intent.reasoning.mode === 'enabled' && intent.reasoning.exclude !== undefined) ledger.push(consumed('reasoning.exclude', 'reasoning.exclude', route.contract.protocolContractId.value))
  if (intent.web.mode === 'disabled') ledger.push(accepted('web.mode', route.contract.protocolContractId.value))
  else {
    if (intent.web.types.length !== 1 || intent.web.types[0] !== 'web') {
      throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED')
    }
    ledger.push(consumed('web.mode', 'tools[].type', route.contract.protocolContractId.value))
    ledger.push(consumed('web.types', 'tools[].type', route.contract.protocolContractId.value))
    const webFieldMap = Object.freeze({
      engine: 'tools[].parameters.engine',
      maxResults: 'tools[].parameters.max_results',
      maxTotalResults: 'tools[].parameters.max_total_results',
      searchContextSize: 'tools[].parameters.search_context_size',
      maxCharacters: 'tools[].parameters.max_characters',
      userLocation: 'tools[].parameters.user_location',
      allowedDomains: 'tools[].parameters.allowed_domains',
      excludedDomains: 'tools[].parameters.excluded_domains',
    } as const)
    for (const [key, nativeField] of Object.entries(webFieldMap)) {
      if (intent.web[key as keyof typeof intent.web] !== undefined) {
        ledger.push(consumed(`web.${key}`, nativeField, route.contract.protocolContractId.value))
      }
    }
  }
  ledger.push(accepted('image.mode', route.contract.protocolContractId.value))
  let tools: readonly Record<string, unknown>[] | undefined
  let toolChoice: unknown
  const toolPolicy = intent.tools
  if (toolPolicy.mode === 'disabled') ledger.push(accepted('tools.mode', route.contract.protocolContractId.value))
  else {
    tools = Object.freeze(input.toolRegistry!.selectedDefinitions.map((tool) => Object.freeze({
      type: 'function', function: Object.freeze({ name: tool.function.name,
        ...(tool.function.description === undefined ? {} : { description: tool.function.description }),
        ...(tool.function.parameters === undefined ? {} : { parameters: tool.function.parameters }) }),
    })))
    ledger.push(accepted('tools.mode', route.contract.protocolContractId.value))
    ledger.push(consumed('tools.allowedToolIds', 'tools', route.contract.protocolContractId.value))
    ledger.push(accepted('tools.sideEffectConfirmation', route.contract.protocolContractId.value))
    const toolChoicePolicy = toolPolicy.toolChoice
    if (toolChoicePolicy.mode === 'omitted') ledger.push(accepted('tools.toolChoice', route.contract.protocolContractId.value))
    else {
      const named = toolChoicePolicy.mode === 'named'
        ? input.toolRegistry!.selectedDefinitions.find((tool) => tool.toolId === toolChoicePolicy.toolId.value)
        : undefined
      if (toolChoicePolicy.mode === 'named' && !named) {
        throw new OpenRouterChatPreparedRequestCompilerV2Error('GENERATION_V2_OPENROUTER_CHAT_COMPILER_SEMANTIC_REJECTED')
      }
      toolChoice = toolChoicePolicy.mode === 'named'
        ? { type: 'function', function: { name: named!.function.name } }
        : toolChoicePolicy.mode
      ledger.push(consumed('tools.toolChoice', 'tool_choice', route.contract.protocolContractId.value))
    }
  }
  ledger.push(accepted('providerExtension.kind', route.contract.protocolContractId.value))
  const compilation = compileOpenRouterChatRequestV1({
    model: binding.modelId.value,
    messages,
    generation, ...(reasoning === undefined ? {} : { reasoning }),
    ...(tools === undefined ? {} : { tools }),
    ...(toolChoice === undefined ? {} : { toolChoice }),
    ...(intent.web.mode === 'provider_search' ? { webSearch: {
      ...(intent.web.engine === undefined ? {} : { engine: intent.web.engine }),
      ...(intent.web.maxResults === undefined ? {} : { maxResults: intent.web.maxResults }),
      ...(intent.web.maxTotalResults === undefined ? {} : { maxTotalResults: intent.web.maxTotalResults }),
      ...(intent.web.searchContextSize === undefined ? {} : { searchContextSize: intent.web.searchContextSize }),
      ...(intent.web.maxCharacters === undefined ? {} : { maxCharacters: intent.web.maxCharacters }),
      ...(intent.web.userLocation === undefined ? {} : { userLocation: intent.web.userLocation }),
      ...(intent.web.allowedDomains === undefined ? {} : { allowedDomains: intent.web.allowedDomains }),
      ...(intent.web.excludedDomains === undefined ? {} : { excludedDomains: intent.web.excludedDomains }),
    } } : {}),
  })
  return issuePreparedProviderRequestV2({
    operationId: operation.operationId.value, answerRootId: operation.resultAnswerRootId.value,
    requestSequence: input.history.requestSequence, providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value, credentialScopeId: binding.credentialScopeId.value,
    contractId: binding.protocolContractId.value, modelId: binding.modelId.value,
    effectiveEndpointId: descriptor.endpointId.value, endpoint: route.url,
    headersPlan: createBearerAuthorizationHeaderPlanV2(), body: compilation.preparedBody,
    ledger: createSemanticConsumptionLedgerV2(ledger), capabilityRevision: capability.revision.value,
    snapshotHash: snapshot.snapshotHash.value,
  })
}
