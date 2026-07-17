import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isPendingInitialTurnForContextV2,
  type PendingInitialTurnV2,
} from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
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
import {
  isVerifiedDeepSeekStableProviderBindingAuthorityV2,
  isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
  readVerifiedDeepSeekStableProviderBindingRecordV2,
  type VerifiedDeepSeekStableProviderBindingAuthorityV2,
  type VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2,
} from './deepSeekStableGenerationAuthorityV2Service'

export class DeepSeekPlainTextSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_AUTHORITY_INVALID'
    | 'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_RESULT_INVALID') {
    super(code)
    this.name = 'DeepSeekPlainTextSnapshotCommitV2Error'
  }
}

export type DeepSeekPlainTextSnapshotCommitResultV2 = Readonly<{
  capabilityPersistence: 'created' | 'idempotent_replay'
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}>

function assertPlainTextFacts(commandFacts: GenerationCommandFactsAuthorityV2): void {
  const intent = commandFacts.semanticIntent
  if (intent.tools.mode !== 'disabled' || intent.attachments.length !== 0 ||
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
      operation.questionId.value !== pending.questionId.value || operation.targetAnswerRootId !== null ||
      operation.resultAnswerRootId.value !== pending.answerRootId.value ||
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
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedDeepSeekStableProviderBindingAuthorityV2
  capability: VerifiedDeepSeekStableRuntimeCapabilityAuthorityV2
}>): DeepSeekPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      !isVerifiedDeepSeekStableProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedDeepSeekStableRuntimeCapabilityAuthorityV2(input.capability) ||
      input.capability.bindingAuthority !== input.binding ||
      input.binding.binding.providerId.value !== 'deepseek' ||
      input.binding.binding.operation !== 'text') {
    throw new DeepSeekPlainTextSnapshotCommitV2Error(
      'GENERATION_V2_DEEPSEEK_SNAPSHOT_COMMIT_INPUT_INVALID',
    )
  }
  assertPlainTextFacts(input.commandFacts)
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
    toolAuthority: { kind: 'none' },
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: 'initial_send',
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
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
