import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import {
  isPendingAnswerActionForContextV2,
  isPendingEditedTurnForContextV2,
  isPendingInitialTurnForContextV2,
  pendingSourceBranchIdV2,
  pendingSourceAnswerIdV2,
  type PendingAnswerActionV2,
  type PendingEditedTurnV2,
  type PendingInitialTurnV2,
} from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isGeminiPlainTextInitialSendCommandV2,
  type GeminiPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/gemini/plainTextInitialSendCommandV2'
import {
  isGeminiPlainTextEditResendCommandV2,
  isGeminiPlainTextRegenerateCommandV2,
  isGeminiPlainTextRetryCommandV2,
  type GeminiPlainTextEditResendCommandV2,
  type GeminiPlainTextRegenerateCommandV2,
  type GeminiPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/gemini/plainTextActionCommandsV2'
import {
  isVerifiedGeminiGenerateContentProviderBindingAuthorityV2,
  isVerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2,
  readVerifiedGeminiGenerateContentProviderBindingRecordV2,
  type VerifiedGeminiGenerateContentProviderBindingAuthorityV2,
  type VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2,
} from './geminiGenerateContentGenerationAuthorityV2Service'

export class GeminiPlainTextSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_SNAPSHOT_INPUT_INVALID'
    | 'GENERATION_V2_GEMINI_SNAPSHOT_AUTHORITY_INVALID') {
    super(code)
    this.name = 'GeminiPlainTextSnapshotCommitV2Error'
  }
}

function commitCurrentSnapshot(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2 | PendingAnswerActionV2 | PendingEditedTurnV2
  command: GeminiPlainTextInitialSendCommandV2 | GeminiPlainTextRegenerateCommandV2 | GeminiPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
  capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const initial = isGeminiPlainTextInitialSendCommandV2(input.command) && isPendingInitialTurnForContextV2(input.pending, input.context)
  const regenerate = isGeminiPlainTextRegenerateCommandV2(input.command) &&
    isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const edit = isGeminiPlainTextEditResendCommandV2(input.command) && isPendingEditedTurnForContextV2(input.pending, input.context)
  const commandBranchId = input.command.kind === 'gemini_plain_text_initial_send'
    ? input.command.branchId
    : input.command.sourceBranchId
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      (!initial && !regenerate && !edit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isVerifiedGeminiGenerateContentProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2(input.capability) ||
      input.capability.bindingAuthority !== input.binding || input.command.operationId.value !== input.pending.operationId.value ||
      commandBranchId.value !== pendingSourceBranchIdV2(input.pending).value || input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      (initial && input.command.userBody !== input.pending.userBody)) {
    throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_INPUT_INVALID')
  }
  const intent = input.commandFacts.semanticIntent
  const attachmentUnsupported = intent.attachments.some((attachment) => {
    if (!attachment.include || attachment.kind !== 'managed_file') return attachment.include
    if ((attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text') ||
        (attachment.sendAs === 'image_reference' && attachment.conversion === 'none') ||
        (attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf')) return false
    const assetRevisionId = attachment.kind === 'managed_file' ? attachment.assetRevisionId.value : null
    const resolved = input.commandFacts.attachmentSet.attachments.find((item) => item.revision.assetRevisionId.value === assetRevisionId)
    return !(attachment.sendAs === 'provider_file' && attachment.conversion === 'none' && resolved !== undefined &&
      resolved.revision.blob.sizeBytes <= 4 * 1024 * 1024 &&
      (/^(?:image|audio|video)\//u.test(resolved.revision.blob.mime) || resolved.revision.blob.mime === 'application/pdf'))
  })
  if (intent.attachments.length !== input.commandFacts.attachmentSet.attachments.length + input.commandFacts.attachmentSet.urlReferenceIntents.length ||
      attachmentUnsupported) {
    throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_AUTHORITY_INVALID')
  }
  const toolRegistry = input.toolRegistry ?? null
  const toolAuthority = intent.tools.mode === 'disabled' ? (() => {
    if (toolRegistry !== null) throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_AUTHORITY_INVALID')
    return Object.freeze({ kind: 'none' as const })
  })() : (() => {
    if (!isToolRegistryRepositoryFactForContextV2(toolRegistry, input.context) ||
        stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
          stableSerializeProviderRequestV2(intent.tools.allowedToolIds.map((toolId) => toolId.value))) {
      throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_AUTHORITY_INVALID')
    }
    return Object.freeze({ kind: 'registry' as const, toolRegistryRevision: toolRegistry.registry.revision,
      toolDefinitionsDigest: toolRegistry.registry.definitionsDigest })
  })()
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let complete = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!complete) throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_AUTHORITY_INVALID')
      input.binding.assertCurrent(); input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })
  input.capabilityRepo.insertCanonical(input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(intent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
    })),
    providerBinding: readVerifiedGeminiGenerateContentProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority,
  }))
  const actionKind = initial ? 'initial_send' as const : regenerate ? 'regenerate_question' as const : 'edit_resend' as const
  const operation = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind,
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  complete = true
  return Object.freeze({ bundle: operation.bundle })
}

export function commitVerifiedGeminiPlainTextInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo; pending: PendingInitialTurnV2; command: GeminiPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2; binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
  capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrentSnapshot(input) }

export function commitVerifiedGeminiPlainTextRegenerateSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo; pending: PendingAnswerActionV2; command: GeminiPlainTextRegenerateCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2; binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
  capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrentSnapshot(input) }

export function commitVerifiedGeminiPlainTextEditResendSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo; pending: PendingEditedTurnV2; command: GeminiPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2; binding: VerifiedGeminiGenerateContentProviderBindingAuthorityV2
  capability: VerifiedGeminiGenerateContentRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrentSnapshot(input) }

export function commitGeminiPlainTextRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: GeminiPlainTextRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isGeminiPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind || input.pending.operationId.value !== input.command.operationId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'google_ai_studio' ||
      input.target.snapshot.providerBinding.protocolContractId.value !== 'gemini-generate-content-v1beta' ||
      input.target.snapshot.providerBinding.operation !== 'text') {
    throw new GeminiPlainTextSnapshotCommitV2Error('GENERATION_V2_GEMINI_SNAPSHOT_INPUT_INVALID')
  }
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    ...payload,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.command.operationId.value,
  }))
  const operation = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value,
    actionKind: input.command.actionKind,
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: input.command.sourceAnswerId.value,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  return Object.freeze({ bundle: operation.bundle })
}
