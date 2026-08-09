import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isPendingInitialTurnForContextV2,
  isPendingAnswerActionForContextV2,
  isPendingEditedTurnForContextV2,
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
import {
  RuntimeCapabilityV2Repo,
  isRuntimeCapabilityRepositoryFactV2,
} from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { isAnthropicMessagesFileDescriptorV2, type AnthropicMessagesFileDescriptorV2 } from '../../infra/db/repo/anthropicMessagesFileDescriptorV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import {
  isAnthropicPlainTextInitialSendCommandV2,
  type AnthropicPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/anthropic/plainTextInitialSendCommandV2'
import {
  isAnthropicPlainTextRetryCommandV2,
  type AnthropicPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/anthropic/plainTextRetryCommandV2'
import {
  isAnthropicPlainTextRegenerateCommandV2,
  type AnthropicPlainTextRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/anthropic/plainTextRegenerateCommandV2'
import {
  isAnthropicPlainTextEditResendCommandV2,
  type AnthropicPlainTextEditResendCommandV2,
} from '../../src/next/generation-v2/providers/anthropic/plainTextEditResendCommandV2'
import {
  isVerifiedAnthropicProviderBindingAuthorityV2,
  isVerifiedAnthropicRuntimeCapabilityAuthorityV2,
  readVerifiedAnthropicProviderBindingRecordV2,
  type VerifiedAnthropicProviderBindingAuthorityV2,
  type VerifiedAnthropicRuntimeCapabilityAuthorityV2,
} from './anthropicGenerationAuthorityV2Service'

export class AnthropicPlainTextSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID'
    | 'GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID') {
    super(code)
    this.name = 'AnthropicPlainTextSnapshotCommitV2Error'
  }
}

export type AnthropicPlainTextSnapshotCommitResultV2 = Readonly<{
  capabilityPersistence: 'created' | 'idempotent_replay'
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}>

function fail(code: AnthropicPlainTextSnapshotCommitV2Error['code']): never {
  throw new AnthropicPlainTextSnapshotCommitV2Error(code)
}

function assertPlainTextFacts(facts: GenerationCommandFactsAuthorityV2, context: GenerationV2AuthorityTransactionContextV2, toolRegistry?: ToolRegistryRepositoryFactV2 | null): void {
  const intent = facts.semanticIntent
  const tools = intent.tools ?? { mode: 'disabled' as const }
  if (intent.attachments.length !== facts.attachmentSet.attachments.length + facts.attachmentSet.urlReferenceIntents.length ||
      intent.image.mode !== 'disabled' ||
      intent.providerExtension.kind !== 'anthropic_messages') {
    throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  for (const attachment of intent.attachments) {
    if (!attachment.include) continue
    if (attachment.kind === 'url_reference') {
      if (attachment.mediaKind !== 'image' && attachment.mediaKind !== 'document') {
        throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
      }
      continue
    }
    const resolved = facts.attachmentSet.attachments.find((item) => item.intent === attachment)
    const mime = resolved?.revision.blob.mime ?? ''
    const requiresFile = facts.attachmentSet.providerFileRequirements.some((item) => item.assetRevisionId.value === attachment.assetRevisionId.value)
    const admissible = attachment.sendAs === 'provider_file' && attachment.conversion === 'none' && requiresFile ||
      attachment.sendAs === 'inline_text' && attachment.conversion === 'plain_text' && mime.startsWith('text/') ||
      attachment.sendAs === 'image_reference' && attachment.conversion === 'none' && resolved?.revision.assetKind === 'image' && mime.startsWith('image/') ||
      attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf' && mime === 'application/pdf' && requiresFile
    if (!resolved || !admissible || (requiresFile && !['provider_file', 'converted_document'].includes(attachment.sendAs))) {
      throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    }
  }
  if (tools.mode === 'enabled') {
    if (!toolRegistry || !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        toolRegistry.selectedDefinitions.length !== tools.allowedToolIds.length ||
        toolRegistry.selectedDefinitions.some((definition, index) => definition.toolId !== tools.allowedToolIds[index].value)) {
      throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    }
  } else if (toolRegistry !== undefined && toolRegistry !== null) {
    throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
}

function snapshotAttachmentBindings(
  facts: GenerationCommandFactsAuthorityV2,
  binding: VerifiedAnthropicProviderBindingAuthorityV2,
  descriptors: readonly AnthropicMessagesFileDescriptorV2[],
): readonly Readonly<Record<string, unknown>>[] {
  const requirements = facts.attachmentSet.providerFileRequirements
  if (requirements.length !== descriptors.length || descriptors.some((descriptor) =>
      !isAnthropicMessagesFileDescriptorV2(descriptor) ||
      descriptor.credentialScopeId.value !== binding.binding.credentialScopeId.value ||
      descriptor.endpointProfileId.value !== binding.binding.endpointProfileId.value)) {
    return fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  const byRevision = new Map(descriptors.map((descriptor) => [descriptor.assetRevisionId.value, descriptor]))
  return Object.freeze(requirements.map((requirement) => {
    const descriptor = byRevision.get(requirement.assetRevisionId.value)
    if (!descriptor || descriptor.assetSha256.value !== requirement.assetSha256.value) return fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    return Object.freeze({
      assetRevisionId: requirement.assetRevisionId.value,
      providerFileDescriptor: Object.freeze({
        descriptorId: descriptor.descriptorId.value,
        descriptorRevision: descriptor.descriptorRevision.value,
        descriptorHash: descriptor.descriptorHash.value,
        providerFileId: descriptor.fileId,
      }),
    })
  }))
}

function snapshotToolAuthority(facts: GenerationCommandFactsAuthorityV2, toolRegistry?: ToolRegistryRepositoryFactV2 | null) {
  const tools = facts.semanticIntent.tools ?? { mode: 'disabled' as const }
  if (tools.mode === 'disabled') return { kind: 'none' as const }
  if (!toolRegistry) fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  return { kind: 'registry' as const, toolRegistryRevision: toolRegistry.registry.revision, toolDefinitionsDigest: toolRegistry.registry.definitionsDigest }
}

function commitCurrentVerifiedSnapshot(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2 | PendingEditedTurnV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedAnthropicProviderBindingAuthorityV2
  capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2
  operationId: string
  actionKind: 'regenerate_question' | 'edit_resend'
  commandFingerprint: string
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors?: readonly AnthropicMessagesFileDescriptorV2[]
}>): AnthropicPlainTextSnapshotCommitResultV2 {
  assertPlainTextFacts(input.commandFacts, input.context, input.toolRegistry)
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
      input.binding.assertCurrent()
      input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })
  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact) ||
      persistedCapability.fact.capability.canonicalJson !== input.capability.snapshot.canonicalJson) {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(
    canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      schemaVersion: 2,
      answerRootId: input.pending.answerRootId.value,
      operationId: input.operationId,
      semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
      resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
        ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
      })),
      providerBinding: readVerifiedAnthropicProviderBindingRecordV2(input.binding),
      capabilityBinding: {
        capabilityRevision: input.capability.snapshot.revision.value,
        evidenceDigest: input.capability.snapshot.evidenceDigest.value,
        semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
        snapshotHash: input.capability.snapshot.snapshotHash.value,
      },
      attachmentProviderFileBindings: snapshotAttachmentBindings(input.commandFacts, input.binding, input.attachmentDescriptors ?? []),
      toolAuthority: snapshotToolAuthority(input.commandFacts, input.toolRegistry),
    }),
  )
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.operationId,
    actionKind: input.actionKind,
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.commandFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.operation.actionKind !== input.actionKind ||
      execution.bundle.operation.sourceAnswerId !== null ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      execution.bundle.snapshot.providerBinding.providerId.value !== 'anthropic' ||
      execution.bundle.snapshot.capabilityBinding.snapshotHash.value !== input.capability.snapshot.snapshotHash.value) {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  completed = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitVerifiedAnthropicPlainTextInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: AnthropicPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedAnthropicProviderBindingAuthorityV2
  capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors?: readonly AnthropicMessagesFileDescriptorV2[]
}>): AnthropicPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isAnthropicPlainTextInitialSendCommandV2(input.command) ||
      !isVerifiedAnthropicProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedAnthropicRuntimeCapabilityAuthorityV2(input.capability) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.expectedHeadMessageId?.value !== input.pending.expectedHeadMessageId?.value ||
      input.command.userBody !== input.pending.userBody ||
      input.command.providerId.value !== 'anthropic' ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding || input.binding.binding.operation !== 'text') {
    throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  assertPlainTextFacts(input.commandFacts, input.context, input.toolRegistry)
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
      input.binding.assertCurrent()
      input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })

  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact) ||
      persistedCapability.fact.capability.canonicalJson !== input.capability.snapshot.canonicalJson) {
    throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(
    canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      schemaVersion: 2,
      answerRootId: input.pending.answerRootId.value,
      operationId: input.pending.operationId.value,
      semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
      resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
        ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
      })),
      providerBinding: readVerifiedAnthropicProviderBindingRecordV2(input.binding),
      capabilityBinding: {
        capabilityRevision: input.capability.snapshot.revision.value,
        evidenceDigest: input.capability.snapshot.evidenceDigest.value,
        semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
        snapshotHash: input.capability.snapshot.snapshotHash.value,
      },
      attachmentProviderFileBindings: snapshotAttachmentBindings(input.commandFacts, input.binding, input.attachmentDescriptors ?? []),
      toolAuthority: snapshotToolAuthority(input.commandFacts, input.toolRegistry),
    }),
  )
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: 'initial_send',
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.operation.operationId.value !== input.pending.operationId.value ||
      execution.bundle.operation.actionKind !== 'initial_send' || execution.bundle.operation.sourceAnswerId !== null ||
      execution.bundle.operation.targetAnswerId.value !== input.pending.answerRootId.value ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      execution.bundle.snapshot.providerBinding.providerId.value !== 'anthropic' ||
      execution.bundle.snapshot.capabilityBinding.snapshotHash.value !== input.capability.snapshot.snapshotHash.value ||
      stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(execution.bundle.snapshot.semanticIntent)) !==
        stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(input.commandFacts.semanticIntent))) {
    throw new AnthropicPlainTextSnapshotCommitV2Error('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  completed = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitAnthropicPlainTextRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: AnthropicPlainTextRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isAnthropicPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind ||
      input.pending.operationId.value !== input.command.operationId.value ||
      pendingSourceBranchIdV2(input.pending).value !== input.command.sourceBranchId.value ||
      input.pending.questionId.value !== input.command.questionId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.pending.expectedHeadMessageId.value !== input.command.expectedHeadMessageId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.operation.questionId.value !== input.command.questionId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'anthropic' ||
      input.target.snapshot.providerBinding.operation !== 'text') {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const targetPayload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete targetPayload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(
    canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
      ...targetPayload,
      answerRootId: input.pending.answerRootId.value,
      operationId: input.command.operationId.value,
    }),
  )
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value,
    actionKind: input.command.actionKind,
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: input.pending.sourceAnswerId.value,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  const copiedPayload = JSON.parse(execution.bundle.snapshot.canonicalJson) as Record<string, unknown>
  const expectedPayload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  for (const payload of [copiedPayload, expectedPayload]) {
    delete payload.answerRootId
    delete payload.operationId
    delete payload.snapshotHash
  }
  if (execution.bundle.operation.actionKind !== input.command.actionKind ||
      execution.bundle.operation.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      stableSerializeProviderRequestV2(copiedPayload) !== stableSerializeProviderRequestV2(expectedPayload)) {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  return Object.freeze({ executionPersistence: execution.kind, bundle: execution.bundle })
}

export function commitVerifiedAnthropicPlainTextRegenerateSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2
  command: AnthropicPlainTextRegenerateCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedAnthropicProviderBindingAuthorityV2
  capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors?: readonly AnthropicMessagesFileDescriptorV2[]
}>): AnthropicPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      input.pending.actionKind !== 'regenerate_question' || !isAnthropicPlainTextRegenerateCommandV2(input.command) ||
      !isVerifiedAnthropicProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedAnthropicRuntimeCapabilityAuthorityV2(input.capability) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.sourceBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.questionId.value !== input.pending.questionId.value ||
      input.command.expectedHeadMessageId.value !== input.pending.expectedHeadMessageId.value ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding || input.binding.binding.operation !== 'text') {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  return commitCurrentVerifiedSnapshot({
    ...input,
    operationId: input.command.operationId.value,
    actionKind: 'regenerate_question',
    commandFingerprint: input.command.requestFingerprint,
    toolRegistry: input.toolRegistry,
    attachmentDescriptors: input.attachmentDescriptors ?? [],
  })
}

export function commitVerifiedAnthropicPlainTextEditResendSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingEditedTurnV2
  command: AnthropicPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedAnthropicProviderBindingAuthorityV2
  capability: VerifiedAnthropicRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors?: readonly AnthropicMessagesFileDescriptorV2[]
}>): AnthropicPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingEditedTurnForContextV2(input.pending, input.context) ||
      !isAnthropicPlainTextEditResendCommandV2(input.command) ||
      !isVerifiedAnthropicProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedAnthropicRuntimeCapabilityAuthorityV2(input.capability) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.sourceBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.sourceQuestionId.value !== input.pending.sourceQuestionId.value ||
      input.command.sourceAnswerRootId.value !== input.pending.sourceAnswerRootId.value ||
      input.command.expectedHeadMessageId.value !== input.pending.expectedHeadMessageId.value ||
      input.command.userBody !== input.pending.userBody ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding || input.binding.binding.operation !== 'text') {
    fail('GENERATION_V2_ANTHROPIC_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  return commitCurrentVerifiedSnapshot({
    ...input,
    operationId: input.command.operationId.value,
    actionKind: 'edit_resend',
    commandFingerprint: input.command.requestFingerprint,
    toolRegistry: input.toolRegistry,
    attachmentDescriptors: input.attachmentDescriptors ?? [],
  })
}
