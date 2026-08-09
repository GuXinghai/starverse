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
import { RuntimeCapabilityV2Repo, isRuntimeCapabilityRepositoryFactV2 } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import {
  isOpenAIResponsesPlainTextInitialSendCommandV2,
  type OpenAIResponsesPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextInitialSendCommandV2'
import {
  isOpenAIResponsesPlainTextRetryCommandV2,
  type OpenAIResponsesPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextRetryCommandV2'
import {
  isOpenAIResponsesPlainTextRegenerateCommandV2,
  type OpenAIResponsesPlainTextRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextRegenerateCommandV2'
import {
  isOpenAIResponsesPlainTextEditResendCommandV2,
  type OpenAIResponsesPlainTextEditResendCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextEditResendCommandV2'
import {
  isVerifiedOpenAIResponsesProviderBindingAuthorityV2,
  isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
  readVerifiedOpenAIResponsesProviderBindingRecordV2,
  type VerifiedOpenAIResponsesProviderBindingAuthorityV2,
  type VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
} from './openAIResponsesGenerationAuthorityV2Service'
import {
  isOpenAIResponsesFileDescriptorV2,
  type OpenAIResponsesFileDescriptorV2,
} from '../../infra/db/repo/openAIResponsesFileDescriptorV2Repo'

export class OpenAIResponsesPlainTextSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextSnapshotCommitV2Error'
  }
}

export type OpenAIResponsesPlainTextSnapshotCommitResultV2 = Readonly<{
  capabilityPersistence: 'created' | 'idempotent_replay'
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}>

function fail(code: OpenAIResponsesPlainTextSnapshotCommitV2Error['code']): never {
  throw new OpenAIResponsesPlainTextSnapshotCommitV2Error(code)
}

function snapshotToolAuthority(
  context: GenerationV2AuthorityTransactionContextV2,
  commandFacts: GenerationCommandFactsAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
): Readonly<Record<string, unknown>> {
  const tools = commandFacts.semanticIntent.tools
  if (tools.mode === 'disabled') {
    if (toolRegistry !== null) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    return Object.freeze({ kind: 'none' })
  }
  if (!isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
      stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
        stableSerializeProviderRequestV2(tools.allowedToolIds.map((tool) => tool.value))) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  return Object.freeze({
    kind: 'registry', toolRegistryRevision: toolRegistry.registry.revision,
    toolDefinitionsDigest: toolRegistry.registry.definitionsDigest,
  })
}

function snapshotAttachmentBindings(
  commandFacts: GenerationCommandFactsAuthorityV2,
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2,
  descriptors: readonly OpenAIResponsesFileDescriptorV2[],
): readonly Readonly<Record<string, unknown>>[] {
  const requirements = commandFacts.attachmentSet.providerFileRequirements
  if (requirements.length !== descriptors.length || new Set(descriptors).size !== descriptors.length ||
      descriptors.some((descriptor) => !isOpenAIResponsesFileDescriptorV2(descriptor) ||
        descriptor.credentialScopeId.value !== binding.binding.credentialScopeId.value ||
        descriptor.endpointProfileId.value !== binding.binding.endpointProfileId.value)) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  const byRevision = new Map(descriptors.map((descriptor) => [descriptor.assetRevisionId.value, descriptor]))
  if (byRevision.size !== descriptors.length) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  return Object.freeze(requirements.map((requirement) => {
    const descriptor = byRevision.get(requirement.assetRevisionId.value)
    if (!descriptor || descriptor.assetSha256.value !== requirement.assetSha256.value) {
      return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    }
    return Object.freeze({
      assetRevisionId: requirement.assetRevisionId.value,
      providerFileDescriptor: Object.freeze({ descriptorId: descriptor.descriptorId.value,
        descriptorRevision: descriptor.descriptorRevision.value, descriptorHash: descriptor.descriptorHash.value }),
    })
  }))
}

export function commitVerifiedOpenAIResponsesPlainTextInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: OpenAIResponsesPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors: readonly OpenAIResponsesFileDescriptorV2[]
}>): OpenAIResponsesPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isOpenAIResponsesPlainTextInitialSendCommandV2(input.command) ||
      !isVerifiedOpenAIResponsesProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(input.capability) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.expectedHeadMessageId?.value !== input.pending.expectedHeadMessageId?.value ||
      input.command.userBody !== input.pending.userBody ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding ||
      input.binding.binding.providerId.value !== 'openai_responses' || input.binding.binding.operation !== 'text') {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const intent = input.commandFacts.semanticIntent
  if (intent.attachments.length !== input.commandFacts.attachmentSet.attachments.length) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
      input.binding.assertCurrent(); input.capability.assertCurrent()
    },
    committed: () => undefined, rolledBack: () => undefined,
  })
  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact) ||
      persistedCapability.fact.capability.canonicalJson !== input.capability.snapshot.canonicalJson) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
    })),
    providerBinding: readVerifiedOpenAIResponsesProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: snapshotAttachmentBindings(input.commandFacts, input.binding, input.attachmentDescriptors),
    toolAuthority: snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry),
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind: 'initial_send',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.operation.operationId.value !== input.pending.operationId.value ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(execution.bundle.snapshot.semanticIntent)) !==
        stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(input.commandFacts.semanticIntent)) ||
      execution.bundle.snapshot.providerBinding.providerId.value !== 'openai_responses' ||
      execution.bundle.snapshot.capabilityBinding.snapshotHash.value !== input.capability.snapshot.snapshotHash.value) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  completed = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitOpenAIResponsesPlainTextRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: OpenAIResponsesPlainTextRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isOpenAIResponsesPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind ||
      input.pending.operationId.value !== input.command.operationId.value ||
      pendingSourceBranchIdV2(input.pending).value !== input.command.sourceBranchId.value ||
      input.pending.questionId.value !== input.command.questionId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.pending.expectedHeadMessageId.value !== input.command.expectedHeadMessageId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.operation.questionId.value !== input.command.questionId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'openai_responses' ||
      input.target.snapshot.providerBinding.operation !== 'text') {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const targetPayload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete targetPayload.snapshotHash
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    ...targetPayload,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.command.operationId.value,
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
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
  delete copiedPayload.answerRootId
  delete copiedPayload.operationId
  delete copiedPayload.snapshotHash
  const expectedPayload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete expectedPayload.answerRootId
  delete expectedPayload.operationId
  delete expectedPayload.snapshotHash
  if (execution.bundle.operation.actionKind !== input.command.actionKind ||
      execution.bundle.operation.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      stableSerializeProviderRequestV2(copiedPayload) !== stableSerializeProviderRequestV2(expectedPayload)) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  return Object.freeze({ executionPersistence: execution.kind, bundle: execution.bundle })
}

export function commitVerifiedOpenAIResponsesPlainTextRegenerateSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2
  command: OpenAIResponsesPlainTextRegenerateCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors: readonly OpenAIResponsesFileDescriptorV2[]
}>): OpenAIResponsesPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      input.pending.actionKind !== 'regenerate_question' || !isOpenAIResponsesPlainTextRegenerateCommandV2(input.command) ||
      !isVerifiedOpenAIResponsesProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(input.capability) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.sourceBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.questionId.value !== input.pending.questionId.value ||
      input.command.expectedHeadMessageId.value !== input.pending.expectedHeadMessageId.value ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding ||
      input.binding.binding.providerId.value !== 'openai_responses' || input.binding.binding.operation !== 'text') {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const intent = input.commandFacts.semanticIntent
  if (intent.attachments.length !== input.commandFacts.attachmentSet.attachments.length) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
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
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
    })),
    providerBinding: readVerifiedOpenAIResponsesProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: snapshotAttachmentBindings(input.commandFacts, input.binding, input.attachmentDescriptors),
    toolAuthority: snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry),
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: 'regenerate_question',
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.operation.actionKind !== 'regenerate_question' ||
      execution.bundle.operation.sourceAnswerId !== null ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  completed = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitVerifiedOpenAIResponsesPlainTextEditResendSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingEditedTurnV2
  command: OpenAIResponsesPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
  attachmentDescriptors: readonly OpenAIResponsesFileDescriptorV2[]
}>): OpenAIResponsesPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingEditedTurnForContextV2(input.pending, input.context) ||
      !isOpenAIResponsesPlainTextEditResendCommandV2(input.command) ||
      !isVerifiedOpenAIResponsesProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(input.capability) ||
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
      input.capability.bindingAuthority !== input.binding ||
      input.binding.binding.providerId.value !== 'openai_responses' || input.binding.binding.operation !== 'text') {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const intent = input.commandFacts.semanticIntent
  if (intent.attachments.length !== input.commandFacts.attachmentSet.attachments.length) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let completed = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!completed) return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
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
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value,
    })),
    providerBinding: readVerifiedOpenAIResponsesProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: snapshotAttachmentBindings(input.commandFacts, input.binding, input.attachmentDescriptors),
    toolAuthority: snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry),
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind: 'edit_resend',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.operation.actionKind !== 'edit_resend' ||
      execution.bundle.operation.sourceAnswerId !== null ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson) {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  completed = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}
