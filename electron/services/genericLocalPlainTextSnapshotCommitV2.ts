import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { isPendingAnswerActionForContextV2, isPendingEditedTurnForContextV2, isPendingInitialTurnForContextV2,
  pendingSourceAnswerIdV2, pendingSourceBranchIdV2,
  type PendingAnswerActionV2, type PendingEditedTurnV2, type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isGenerationCommandFactsAuthorityForContextV2, type GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { createGenericLocalOpenAIChatProviderBindingV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/verifiedContractV2'
import { isGenericLocalOpenAIChatEditResendCommandV2, isGenericLocalOpenAIChatInitialCommandV2,
  isGenericLocalOpenAIChatRegenerateCommandV2, isGenericLocalOpenAIChatRetryCommandV2,
  type GenericLocalOpenAIChatEditResendCommandV2, type GenericLocalOpenAIChatInitialCommandV2,
  type GenericLocalOpenAIChatRegenerateCommandV2, type GenericLocalOpenAIChatRetryCommandV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/plainTextCommandsV2'

type Current = GenericLocalOpenAIChatInitialCommandV2 | GenericLocalOpenAIChatRegenerateCommandV2 | GenericLocalOpenAIChatEditResendCommandV2
function assertIntent(facts: GenerationCommandFactsAuthorityV2): void {
  const intent = facts.semanticIntent; const generation = intent.generation
  if (generation.topK !== undefined || generation.seed !== undefined || generation.candidateCount !== undefined ||
      generation.frequencyPenalty !== undefined || generation.presencePenalty !== undefined || generation.repetitionPenalty !== undefined ||
      intent.reasoning.mode !== 'disabled' || intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.tools.mode !== 'disabled' || intent.attachments.length !== 0 || intent.providerExtension.kind !== 'none' ||
      facts.attachmentSet.attachments.length !== 0 || facts.attachmentSet.providerFileRequirements.length !== 0) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_EXPLICIT_FIELD_UNSUPPORTED')
  }
}
export function commitGenericLocalCurrentSnapshotV2(input: Readonly<{ context: GenerationV2AuthorityTransactionContextV2;
  executionRepo: GenerationExecutionV2Repo; capabilityRepo: RuntimeCapabilityV2Repo;
  pending: PendingInitialTurnV2 | PendingAnswerActionV2 | PendingEditedTurnV2; command: Current;
  commandFacts: GenerationCommandFactsAuthorityV2; profile: LocalEndpointProfileV2; capability: DecodedRuntimeCapabilitySnapshotV2 }>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const initial = isGenericLocalOpenAIChatInitialCommandV2(input.command) && isPendingInitialTurnForContextV2(input.pending, input.context)
  const regenerate = isGenericLocalOpenAIChatRegenerateCommandV2(input.command) && isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const edit = isGenericLocalOpenAIChatEditResendCommandV2(input.command) && isPendingEditedTurnForContextV2(input.pending, input.context)
  const commandBranchId = input.command.kind === 'generic_local_openai_chat_initial'
    ? input.command.branchId
    : input.command.sourceBranchId
  if ((!initial && !regenerate && !edit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      commandBranchId.value !== pendingSourceBranchIdV2(input.pending).value ||
      input.command.endpointProfileId.value !== input.profile.endpointProfileId) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_SNAPSHOT_INPUT_INVALID')
  }
  assertIntent(input.commandFacts)
  const binding = createGenericLocalOpenAIChatProviderBindingV2(input.profile, input.command.modelId.value)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(binding)) !== stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.capability.binding))) throw new Error('GENERATION_V2_GENERIC_LOCAL_SNAPSHOT_CAPABILITY_INVALID')
  input.capabilityRepo.insertCanonical(input.context, input.capability.canonicalJson, input.pending.createdAtMs)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ schemaVersion: 2,
    answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent), resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value })),
    providerBinding: projectDecodedProviderBindingRecordV2(binding), capabilityBinding: { capabilityRevision: input.capability.revision.value,
      evidenceDigest: input.capability.evidenceDigest.value, semanticFieldsDigest: input.capability.semanticFieldsDigest.value,
      snapshotHash: input.capability.snapshotHash.value }, attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' } }))
  return Object.freeze({ bundle: input.executionRepo.insertOperationAndSnapshot(input.context, { operationId: input.pending.operationId.value,
    actionKind: initial ? 'initial_send' : regenerate ? 'regenerate_question' : 'edit_resend', branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value, sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs }).bundle })
}
export function commitGenericLocalRetrySnapshotV2(input: Readonly<{ context: GenerationV2AuthorityTransactionContextV2;
  executionRepo: GenerationExecutionV2Repo; pending: PendingAnswerActionV2; command: GenericLocalOpenAIChatRetryCommandV2;
  target: GenerationExecutionOperationBundleV2 }>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!isPendingAnswerActionForContextV2(input.pending, input.context) || !isGenericLocalOpenAIChatRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) || input.pending.actionKind !== input.command.actionKind ||
      pendingSourceBranchIdV2(input.pending).value !== input.command.sourceBranchId.value ||
      pendingSourceAnswerIdV2(input.pending)?.value !== input.command.sourceAnswerId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.snapshot.providerBinding.protocolContractId.value !== 'generic-local-openai-chat-completions') throw new Error('GENERATION_V2_GENERIC_LOCAL_SNAPSHOT_INPUT_INVALID')
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>; delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ ...payload,
    answerRootId: input.pending.answerRootId.value, operationId: input.command.operationId.value }))
  return Object.freeze({ bundle: input.executionRepo.insertOperationAndSnapshot(input.context, { operationId: input.command.operationId.value,
    actionKind: input.command.actionKind, branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, sourceAnswerId: input.command.sourceAnswerId.value,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs }).bundle })
}
