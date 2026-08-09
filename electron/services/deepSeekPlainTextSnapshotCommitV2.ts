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
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from '../../infra/db/repo/toolRegistryV2Repo'
import {
  RuntimeCapabilityV2Repo,
  isRuntimeCapabilityRepositoryFactV2,
} from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isVerifiedDeepSeekStableProviderBindingAuthorityV2,
  isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
  readVerifiedDeepSeekStableProviderBindingRecordV2,
  type VerifiedDeepSeekStableProviderBindingAuthorityV2,
  type VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
} from './deepSeekStableGenerationAuthorityV2Service'
import {
  isDeepSeekPlainTextInitialSendCommandV2,
  type DeepSeekPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextInitialSendCommandV2'
import {
  isDeepSeekPlainTextRetryCommandV2,
  type DeepSeekPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextRetryCommandV2'
import {
  isDeepSeekPlainTextRegenerateCommandV2,
  type DeepSeekPlainTextRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextRegenerateCommandV2'
import {
  isDeepSeekPlainTextEditResendCommandV2,
  type DeepSeekPlainTextEditResendCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextEditResendCommandV2'

export class DeepSeekPlainTextSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID'
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID',
    readonly diagnostic: Readonly<{
      check: string
      actionKind: string
      operationId: string
      expected: unknown
      actual: unknown
    }> | null = null) {
    super(diagnostic === null ? code : `${code}: ${stableSerializeProviderRequestV2(diagnostic)}`)
    this.name = 'DeepSeekPlainTextSnapshotCommitV2Error'
  }
}

export type DeepSeekPlainTextSnapshotCommitResultV2 = Readonly<{
  capabilityPersistence: 'created' | 'idempotent_replay'
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}>

function failCommitResult(input: Readonly<{
  check: string
  actionKind: string
  operationId: string
  expected: unknown
  actual: unknown
}>): never {
  throw new DeepSeekPlainTextSnapshotCommitV2Error(
    'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID',
    Object.freeze({
      check: input.check,
      actionKind: input.actionKind,
      operationId: input.operationId,
      expected: input.expected,
      actual: input.actual,
    }),
  )
}

function assertPlainTextFacts(commandFacts: GenerationCommandFactsAuthorityV2): void {
  const intent = commandFacts.semanticIntent
  if (intent.attachments.length !== 0 ||
      commandFacts.attachmentSet.attachments.length !== 0 ||
      commandFacts.attachmentSet.providerFileRequirements.length !== 0 ||
      commandFacts.attachmentSet.requiresProviderFileAuthority ||
      intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.providerExtension.kind !== 'none') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID',
    )
  }
}

function snapshotToolAuthority(
  context: GenerationV2AuthorityTransactionContextV2,
  commandFacts: GenerationCommandFactsAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null | undefined,
): Readonly<Record<string, unknown>> {
  if (commandFacts.semanticIntent.tools.mode === 'disabled') {
    if (toolRegistry !== undefined && toolRegistry !== null) {
      throw new DeepSeekPlainTextSnapshotCommitV2Error('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
    }
    return Object.freeze({ kind: 'none' })
  }
  if (!isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
      stableSerializeProviderRequestV2(toolRegistry.selectedDefinitions.map((tool) => tool.toolId)) !==
        stableSerializeProviderRequestV2(commandFacts.semanticIntent.tools.allowedToolIds.map((tool) => tool.value))) {
    throw new DeepSeekPlainTextSnapshotCommitV2Error('GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
  return Object.freeze({
    kind: 'registry',
    toolRegistryRevision: toolRegistry.registry.revision,
    toolDefinitionsDigest: toolRegistry.registry.definitionsDigest,
  })
}

function assertCommittedProjection(
  pending: PendingInitialTurnV2,
  commandFacts: GenerationCommandFactsAuthorityV2,
  binding: VerifiedDeepSeekStableProviderBindingAuthorityV2,
  capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
  bundle: GenerationExecutionOperationBundleV2,
  expectedCanonicalJson: string,
): void {
  const operation = bundle.operation
  const snapshot = bundle.snapshot
  const expectedIntent = projectGenerationIntentLayerV2(commandFacts.semanticIntent)
  const expectedRevisions = commandFacts.resolvedConfigRevisions.map((entry) => ({
    ownerKind: entry.ownerKind,
    ownerId: entry.ownerId,
    revision: entry.revision.value,
  }))
  if (operation.operationId.value !== pending.operationId.value ||
      operation.actionKind !== 'initial_send' || operation.branchId.value !== pending.branchId.value ||
      operation.conversationId.value !== pending.conversationId.value ||
      operation.questionId.value !== pending.questionId.value || operation.sourceAnswerId !== null ||
      operation.targetAnswerId.value !== pending.answerRootId.value ||
      operation.createdAtMs !== pending.createdAtMs || snapshot.canonicalJson !== expectedCanonicalJson ||
      snapshot.operationId.value !== pending.operationId.value ||
      snapshot.answerRootId.value !== pending.answerRootId.value ||
      stableSerializeProviderRequestV2(projectGenerationIntentLayerV2(snapshot.semanticIntent)) !==
        stableSerializeProviderRequestV2(expectedIntent) ||
      stableSerializeProviderRequestV2(snapshot.resolvedConfigRevisions.map((entry) => ({
        ownerKind: entry.ownerKind,
        ownerId: entry.ownerId,
        revision: entry.revision.value,
      }))) !== stableSerializeProviderRequestV2(expectedRevisions) ||
      snapshot.capabilityBinding.snapshotHash.value !== capability.snapshot.snapshotHash.value ||
      snapshot.capabilityBinding.capabilityRevision.value !== capability.snapshot.revision.value ||
      snapshot.capabilityBinding.evidenceDigest.value !== capability.snapshot.evidenceDigest.value ||
      snapshot.capabilityBinding.semanticFieldsDigest.value !== capability.snapshot.semanticFieldsDigest.value ||
      snapshot.providerBinding.operation !== 'text' || binding.binding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID',
    )
  }
}

export function commitVerifiedDeepSeekPlainTextInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: DeepSeekPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
  capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): DeepSeekPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isDeepSeekPlainTextInitialSendCommandV2(input.command) ||
      !isVerifiedDeepSeekStableProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(input.capability) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.expectedHeadMessageId?.value !== input.pending.expectedHeadMessageId?.value ||
      input.command.userBody !== input.pending.userBody ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.binding.binding.operation !== 'text' ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding ||
      input.binding.binding.providerId.value !== 'deepseek' ||
      input.binding.binding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID',
    )
  }
  assertPlainTextFacts(input.commandFacts)
  const toolAuthority = snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry)
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let commitCompleted = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!commitCompleted) {
        throw new DeepSeekPlainTextSnapshotCommitV2Error(
          'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID',
        )
      }
      input.binding.assertCurrent()
      input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })

  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context,
    input.capability.snapshot.canonicalJson,
    input.pending.createdAtMs,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact) ||
      persistedCapability.fact.capability.canonicalJson !== input.capability.snapshot.canonicalJson) {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID',
    )
  }

  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind,
      ownerId: entry.ownerId,
      revision: entry.revision.value,
    })),
    providerBinding: readVerifiedDeepSeekStableProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority,
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
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
  assertCommittedProjection(
    input.pending,
    input.commandFacts,
    input.binding,
    input.capability,
    execution.bundle,
    snapshot.canonicalJson,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact)) {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID',
    )
  }
  commitCompleted = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitDeepSeekPlainTextRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: DeepSeekPlainTextRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isDeepSeekPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind ||
      input.pending.operationId.value !== input.command.operationId.value ||
      pendingSourceBranchIdV2(input.pending).value !== input.command.sourceBranchId.value ||
      input.pending.questionId.value !== input.command.questionId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.pending.expectedHeadMessageId.value !== input.command.expectedHeadMessageId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.operation.questionId.value !== input.command.questionId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'deepseek' ||
      input.target.snapshot.providerBinding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID',
    )
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
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID',
    )
  }
  return Object.freeze({ executionPersistence: execution.kind, bundle: execution.bundle })
}

export function commitVerifiedDeepSeekPlainTextRegenerateSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2
  command: DeepSeekPlainTextRegenerateCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
  capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): DeepSeekPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      input.pending.actionKind !== 'regenerate_question' || !isDeepSeekPlainTextRegenerateCommandV2(input.command) ||
      !isVerifiedDeepSeekStableProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(input.capability) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.sourceBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.questionId.value !== input.pending.questionId.value ||
      input.command.expectedHeadMessageId.value !== input.pending.expectedHeadMessageId.value ||
      input.command.providerId.value !== input.binding.binding.providerId.value ||
      input.command.endpointProfileId.value !== input.binding.binding.endpointProfileId.value ||
      input.command.modelId.value !== input.binding.binding.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.capability.bindingAuthority !== input.binding || input.binding.binding.providerId.value !== 'deepseek' ||
      input.binding.binding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID',
    )
  }
  assertPlainTextFacts(input.commandFacts)
  const toolAuthority = snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry)
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let commitCompleted = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!commitCompleted) {
        throw new DeepSeekPlainTextSnapshotCommitV2Error(
          'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID',
        )
      }
      input.binding.assertCurrent()
      input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })
  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs,
  )
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind,
      ownerId: entry.ownerId,
      revision: entry.revision.value,
    })),
    providerBinding: readVerifiedDeepSeekStableProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority,
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
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact)) {
    failCommitResult({
      check: 'capability_persistence',
      actionKind: 'regenerate_question',
      operationId: input.pending.operationId.value,
      expected: 'runtime_capability_repository_fact_v2',
      actual: persistedCapability.fact,
    })
  }
  if (execution.bundle.operation.actionKind !== 'regenerate_question') {
    failCommitResult({
      check: 'action_kind',
      actionKind: 'regenerate_question',
      operationId: input.pending.operationId.value,
      expected: 'regenerate_question',
      actual: execution.bundle.operation.actionKind,
    })
  }
  const expectedRegenerateSourceAnswerId = pendingSourceAnswerIdV2(input.pending)?.value ?? null
  const actualRegenerateSourceAnswerId = execution.bundle.operation.sourceAnswerId?.value ?? null
  if (actualRegenerateSourceAnswerId !== expectedRegenerateSourceAnswerId) {
    failCommitResult({
      check: 'source_answer_binding',
      actionKind: 'regenerate_question',
      operationId: input.pending.operationId.value,
      expected: Object.freeze({ sourceAnswerId: expectedRegenerateSourceAnswerId }),
      actual: Object.freeze({ sourceAnswerId: actualRegenerateSourceAnswerId }),
    })
  }
  if (execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson) {
    failCommitResult({
      check: 'snapshot_canonical_json',
      actionKind: 'regenerate_question',
      operationId: input.pending.operationId.value,
      expected: snapshot.snapshotHash.value,
      actual: execution.bundle.snapshot.snapshotHash.value,
    })
  }
  commitCompleted = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}

export function commitVerifiedDeepSeekPlainTextEditResendSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingEditedTurnV2
  command: DeepSeekPlainTextEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
  capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
  toolRegistry?: ToolRegistryRepositoryFactV2 | null
}>): DeepSeekPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingEditedTurnForContextV2(input.pending, input.context) ||
      !isDeepSeekPlainTextEditResendCommandV2(input.command) ||
      !isVerifiedDeepSeekStableProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(input.capability) ||
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
      input.capability.bindingAuthority !== input.binding || input.binding.binding.providerId.value !== 'deepseek' ||
      input.binding.binding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID',
    )
  }
  assertPlainTextFacts(input.commandFacts)
  const toolAuthority = snapshotToolAuthority(input.context, input.commandFacts, input.toolRegistry)
  input.binding.assertCurrent()
  input.capability.assertCurrent()
  let commitCompleted = false
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (!commitCompleted) {
        throw new DeepSeekPlainTextSnapshotCommitV2Error(
          'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID',
        )
      }
      input.binding.assertCurrent()
      input.capability.assertCurrent()
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })
  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs,
  )
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value,
    operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({
      ownerKind: entry.ownerKind,
      ownerId: entry.ownerId,
      revision: entry.revision.value,
    })),
    providerBinding: readVerifiedDeepSeekStableProviderBindingRecordV2(input.binding),
    capabilityBinding: {
      capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority,
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: 'edit_resend',
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact)) {
    failCommitResult({
      check: 'capability_persistence',
      actionKind: 'edit_resend',
      operationId: input.pending.operationId.value,
      expected: 'runtime_capability_repository_fact_v2',
      actual: persistedCapability.fact,
    })
  }
  if (execution.bundle.operation.actionKind !== 'edit_resend') {
    failCommitResult({
      check: 'action_kind',
      actionKind: 'edit_resend',
      operationId: input.pending.operationId.value,
      expected: 'edit_resend',
      actual: execution.bundle.operation.actionKind,
    })
  }
  const expectedEditSourceAnswerId = pendingSourceAnswerIdV2(input.pending)?.value ?? null
  const actualEditSourceAnswerId = execution.bundle.operation.sourceAnswerId?.value ?? null
  if (actualEditSourceAnswerId !== expectedEditSourceAnswerId) {
    failCommitResult({
      check: 'source_answer_binding',
      actionKind: 'edit_resend',
      operationId: input.pending.operationId.value,
      expected: Object.freeze({ sourceAnswerId: expectedEditSourceAnswerId }),
      actual: Object.freeze({ sourceAnswerId: actualEditSourceAnswerId }),
    })
  }
  if (execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson) {
    failCommitResult({
      check: 'snapshot_canonical_json',
      actionKind: 'edit_resend',
      operationId: input.pending.operationId.value,
      expected: snapshot.snapshotHash.value,
      actual: execution.bundle.snapshot.snapshotHash.value,
    })
  }
  commitCompleted = true
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}
