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
import { isGenerationCommandFactsAuthorityForContextV2, type GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { registerGenerationV2AuthorityTransactionParticipantForContextV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo, isRuntimeCapabilityRepositoryFactV2 } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isGeminiInteractionsImageEditResendCommandV2,
  isGeminiInteractionsImageInitialCommandV2,
  isGeminiInteractionsImageRegenerateCommandV2,
  isGeminiInteractionsImageRetryCommandV2,
  type GeminiInteractionsImageEditResendCommandV2,
  type GeminiInteractionsImageInitialCommandV2,
  type GeminiInteractionsImageRegenerateCommandV2,
  type GeminiInteractionsImageRetryCommandV2,
} from '../../src/next/generation-v2/providers/gemini/interactionsImageCommandsV2'
import {
  isVerifiedGeminiInteractionsImageProviderBindingAuthorityV2,
  isVerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2,
  readVerifiedGeminiInteractionsImageProviderBindingRecordV2,
  type VerifiedGeminiInteractionsImageProviderBindingAuthorityV2,
  type VerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2,
} from './geminiInteractionsImageGenerationAuthorityV2Service'

export class GeminiInteractionsImageSnapshotCommitV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_INPUT_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_RESULT_INVALID') { super(code); this.name = 'GeminiInteractionsImageSnapshotCommitV2Error' }
}
function fail(code: GeminiInteractionsImageSnapshotCommitV2Error['code']): never { throw new GeminiInteractionsImageSnapshotCommitV2Error(code) }

function commitCurrent(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2 | PendingAnswerActionV2 | PendingEditedTurnV2
  command: GeminiInteractionsImageInitialCommandV2 | GeminiInteractionsImageRegenerateCommandV2 | GeminiInteractionsImageEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedGeminiInteractionsImageProviderBindingAuthorityV2
  capability: VerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const commandBranchId = input.command.kind === 'gemini_interactions_image_initial'
    ? input.command.branchId
    : input.command.sourceBranchId
  const initial = isGeminiInteractionsImageInitialCommandV2(input.command) && isPendingInitialTurnForContextV2(input.pending, input.context)
  const regenerate = isGeminiInteractionsImageRegenerateCommandV2(input.command) &&
    isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const edit = isGeminiInteractionsImageEditResendCommandV2(input.command) && isPendingEditedTurnForContextV2(input.pending, input.context)
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      (!initial && !regenerate && !edit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isVerifiedGeminiInteractionsImageProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedGeminiInteractionsImageRuntimeCapabilityAuthorityV2(input.capability) ||
      input.capability.bindingAuthority !== input.binding || input.command.operationId.value !== input.pending.operationId.value ||
      commandBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.binding.binding.modelId.value !== input.command.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      (initial && (input.command as GeminiInteractionsImageInitialCommandV2).prompt !== (input.pending as PendingInitialTurnV2).userBody)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_INPUT_INVALID')
  }
  input.binding.assertCurrent(); input.capability.assertCurrent()
  const persistedCapability = input.capabilityRepo.insertCanonical(input.context, input.capability.snapshot.canonicalJson, input.pending.createdAtMs)
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_RESULT_INVALID')
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind,
      ownerId: entry.ownerId, revision: entry.revision.value })),
    providerBinding: readVerifiedGeminiInteractionsImageProviderBindingRecordV2(input.binding),
    capabilityBinding: { capabilityRevision: input.capability.snapshot.revision.value,
      evidenceDigest: input.capability.snapshot.evidenceDigest.value,
      semanticFieldsDigest: input.capability.snapshot.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshot.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: initial ? 'initial_send' : regenerate ? 'regenerate_question' : 'edit_resend',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta' ||
      execution.bundle.snapshot.providerBinding.operation !== 'image_generate') return fail('GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_RESULT_INVALID')
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => { input.binding.assertCurrent(); input.capability.assertCurrent() },
    committed: () => undefined, rolledBack: () => undefined,
  })
  return Object.freeze({ bundle: execution.bundle })
}

export function commitGeminiInteractionsImageInitialSnapshotV2(input: Parameters<typeof commitCurrent>[0] & Readonly<{
  pending: PendingInitialTurnV2; command: GeminiInteractionsImageInitialCommandV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrent(input) }
export function commitGeminiInteractionsImageCurrentSnapshotV2(input: Parameters<typeof commitCurrent>[0] & Readonly<{
  pending: PendingAnswerActionV2 | PendingEditedTurnV2
  command: GeminiInteractionsImageRegenerateCommandV2 | GeminiInteractionsImageEditResendCommandV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> { return commitCurrent(input) }

export function commitGeminiInteractionsImageRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: GeminiInteractionsImageRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isGeminiInteractionsImageRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind || input.pending.operationId.value !== input.command.operationId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'google_ai_studio' ||
      input.target.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta' ||
      input.target.snapshot.providerBinding.operation !== 'image_generate') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_SNAPSHOT_INPUT_INVALID')
  }
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    ...payload, answerRootId: input.pending.answerRootId.value, operationId: input.command.operationId.value,
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value, actionKind: input.command.actionKind,
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, sourceAnswerId: input.command.sourceAnswerId.value,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  return Object.freeze({ bundle: execution.bundle })
}
