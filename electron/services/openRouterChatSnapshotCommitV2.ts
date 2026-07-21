import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isPendingAnswerActionForContextV2,
  isPendingEditedTurnForContextV2,
  isPendingInitialTurnForContextV2,
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
import {
  isOpenRouterPlainTextInitialSendCommandV2,
  type OpenRouterPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/openrouter/plainTextInitialSendCommandV2'
import {
  isOpenRouterPlainTextEditResendCommandV2,
  isOpenRouterPlainTextRegenerateCommandV2,
  isOpenRouterPlainTextRetryCommandV2,
  type OpenRouterPlainTextEditResendCommandV2,
  type OpenRouterPlainTextRegenerateCommandV2,
  type OpenRouterPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/openrouter/plainTextActionCommandsV2'
import {
  isVerifiedOpenRouterChatBindingAuthorityV2,
  isVerifiedOpenRouterChatCapabilityAuthorityV2,
  readVerifiedOpenRouterChatBindingRecordV2,
  type VerifiedOpenRouterChatBindingAuthorityV2,
  type VerifiedOpenRouterChatCapabilityAuthorityV2,
} from './openRouterChatGenerationAuthorityV2Service'

export class OpenRouterChatSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_INPUT_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_AUTHORITY_INVALID') {
    super(code); this.name = 'OpenRouterChatSnapshotCommitV2Error'
  }
}

export function commitVerifiedOpenRouterChatInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: OpenRouterPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenRouterChatBindingAuthorityV2
  capability: VerifiedOpenRouterChatCapabilityAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isOpenRouterPlainTextInitialSendCommandV2(input.command) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isVerifiedOpenRouterChatBindingAuthorityV2(input.binding) ||
      !isVerifiedOpenRouterChatCapabilityAuthorityV2(input.capability) ||
      input.capability.bindingAuthority !== input.binding || input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== input.pending.branchId.value || input.command.userBody !== input.pending.userBody ||
      input.command.modelId.value !== input.binding.binding.modelId.value || input.binding.binding.providerId.value !== 'openrouter' ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value) {
    throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_INPUT_INVALID')
  }
  const intent = input.commandFacts.semanticIntent
  if (intent.attachments.length !== input.commandFacts.attachmentSet.attachments.length ||
      intent.image.mode !== 'disabled' || intent.providerExtension.kind !== 'none' ||
      (intent.tools.mode === 'enabled') !== (input.toolRegistry !== null) ||
      (input.toolRegistry !== null && !isToolRegistryRepositoryFactForContextV2(input.toolRegistry, input.context))) {
    throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_AUTHORITY_INVALID')
  }
  const toolAuthority = input.toolRegistry === null ? Object.freeze({ kind: 'none' as const }) : Object.freeze({
    kind: 'registry' as const,
    toolRegistryRevision: input.toolRegistry.registry.revision,
    toolDefinitionsDigest: input.toolRegistry.registry.definitionsDigest,
  })
  input.binding.assertCurrent(); input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_AUTHORITY_INVALID')
      input.binding.assertCurrent(); input.capability.assertCurrent()
    },
    committed: () => undefined, rolledBack: () => undefined,
  })
  input.capabilityRepo.insertCanonical(input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs)
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(intent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
    })),
    providerBinding: readVerifiedOpenRouterChatBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: [], toolAuthority,
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind: 'initial_send',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(execution.bundle.snapshot.semanticIntent)) !==
        stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(intent))) {
    throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_AUTHORITY_INVALID')
  }
  completed = true
  return Object.freeze({ bundle: execution.bundle })
}

export function commitOpenRouterChatRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: OpenRouterPlainTextRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isOpenRouterPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind || input.pending.operationId.value !== input.command.operationId.value ||
      input.pending.targetAnswerRootId?.value !== input.command.targetAnswerRootId.value ||
      input.target.operation.resultAnswerRootId.value !== input.command.targetAnswerRootId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'openrouter' || input.target.snapshot.providerBinding.operation !== 'text') {
    throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_INPUT_INVALID')
  }
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    ...payload, answerRootId: input.pending.answerRootId.value, operationId: input.command.operationId.value,
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value, actionKind: input.command.actionKind,
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, targetAnswerRootId: input.command.targetAnswerRootId.value,
    resultAnswerRootId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  return Object.freeze({ bundle: execution.bundle })
}

function commitCurrentAnswerSnapshot(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2 | PendingEditedTurnV2
  command: OpenRouterPlainTextRegenerateCommandV2 | OpenRouterPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenRouterChatBindingAuthorityV2
  capability: VerifiedOpenRouterChatCapabilityAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const isRegenerate = isOpenRouterPlainTextRegenerateCommandV2(input.command) &&
    isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const isEdit = isOpenRouterPlainTextEditResendCommandV2(input.command) &&
    isPendingEditedTurnForContextV2(input.pending, input.context)
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      (!isRegenerate && !isEdit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isVerifiedOpenRouterChatBindingAuthorityV2(input.binding) || !isVerifiedOpenRouterChatCapabilityAuthorityV2(input.capability) ||
      input.capability.bindingAuthority !== input.binding || input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== input.pending.branchId.value || input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      (input.commandFacts.semanticIntent.tools.mode === 'enabled') !== (input.toolRegistry !== null)) {
    throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_INPUT_INVALID')
  }
  const toolAuthority = input.toolRegistry === null ? Object.freeze({ kind: 'none' as const }) : Object.freeze({
    kind: 'registry' as const, toolRegistryRevision: input.toolRegistry.registry.revision,
    toolDefinitionsDigest: input.toolRegistry.registry.definitionsDigest,
  })
  input.binding.assertCurrent(); input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => { if (!completed) throw new OpenRouterChatSnapshotCommitV2Error('GENERATION_V2_OPENROUTER_CHAT_SNAPSHOT_AUTHORITY_INVALID'); input.binding.assertCurrent(); input.capability.assertCurrent() },
    committed: () => undefined, rolledBack: () => undefined,
  })
  input.capabilityRepo.insertCanonical(input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value })),
    providerBinding: readVerifiedOpenRouterChatBindingRecordV2(input.binding),
    capabilityBinding: { capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value, semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority,
  }))
  const actionKind = isRegenerate ? 'regenerate_question' as const : 'edit_resend' as const
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind, branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value,
    targetAnswerRootId: null, resultAnswerRootId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson, commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  completed = true
  return Object.freeze({ bundle: execution.bundle })
}

export function commitVerifiedOpenRouterChatRegenerateSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo; capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2; command: OpenRouterPlainTextRegenerateCommandV2; commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenRouterChatBindingAuthorityV2; capability: VerifiedOpenRouterChatCapabilityAuthorityV2; toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrentAnswerSnapshot(input) }

export function commitVerifiedOpenRouterChatEditResendSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo; capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingEditedTurnV2; command: OpenRouterPlainTextEditResendCommandV2; commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenRouterChatBindingAuthorityV2; capability: VerifiedOpenRouterChatCapabilityAuthorityV2; toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrentAnswerSnapshot(input) }
