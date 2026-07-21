import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  isPendingInitialTurnForContextV2,
  isPendingAnswerActionForContextV2,
  isPendingEditedTurnForContextV2,
  type PendingAnswerActionV2,
  type PendingEditedTurnV2,
  type PendingInitialTurnV2,
} from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import {
  isGenerationCommandFactsAuthorityForContextV2,
  type GenerationCommandFactsAuthorityV2,
} from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  isOpenRouterImageBindingRepositoryFactV2,
  type OpenRouterImageBindingRepositoryFactV2,
} from '../../infra/db/repo/openRouterImageBindingRepo'
import {
  isGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo, isRuntimeCapabilityRepositoryFactV2 } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isOpenRouterImageInitialSendCommandV2,
  type OpenRouterImageInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/openrouter-images/imageInitialSendCommandV2'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import {
  isOpenRouterImageEditResendCommandV2,
  isOpenRouterImageRegenerateCommandV2,
  isOpenRouterImageRetryCommandV2,
  type OpenRouterImageEditResendCommandV2,
  type OpenRouterImageRegenerateCommandV2,
  type OpenRouterImageRetryCommandV2,
} from '../../src/next/generation-v2/providers/openrouter-images/imageActionCommandsV2'

export class OpenRouterImageInitialSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_INPUT_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_ATTACHMENT_REFERENCE_UNAVAILABLE'
    | 'GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_RESULT_INVALID') {
    super(code)
    this.name = 'OpenRouterImageInitialSnapshotCommitV2Error'
  }
}

export function commitOpenRouterImageRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: OpenRouterImageRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      !isOpenRouterImageRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind || input.pending.operationId.value !== input.command.operationId.value ||
      input.pending.targetAnswerRootId?.value !== input.command.targetAnswerRootId.value ||
      input.target.operation.resultAnswerRootId.value !== input.command.targetAnswerRootId.value ||
      input.target.snapshot.providerBinding.providerId.value !== 'openrouter' ||
      input.target.snapshot.providerBinding.operation !== 'image_generate') {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_INPUT_INVALID')
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

export function commitOpenRouterImageCurrentSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingAnswerActionV2 | PendingEditedTurnV2
  command: OpenRouterImageRegenerateCommandV2 | OpenRouterImageEditResendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: OpenRouterImageBindingRepositoryFactV2
  capability: DecodedRuntimeCapabilitySnapshotV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const regenerate = isOpenRouterImageRegenerateCommandV2(input.command) &&
    isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const edit = isOpenRouterImageEditResendCommandV2(input.command) && isPendingEditedTurnForContextV2(input.pending, input.context)
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      (!regenerate && !edit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isOpenRouterImageBindingRepositoryFactV2(input.binding) || input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== input.pending.branchId.value || input.command.modelId.value !== input.binding.record.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      (input.commandFacts.attachmentSet.attachments.some((attachment) => attachment.intent.include) ||
        input.commandFacts.attachmentSet.urlReferenceIntents.some((attachment) =>
          attachment.include && attachment.mediaKind !== 'image'))) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const binding = assertBindingAndCapability(input.binding, input.capability)
  const persistedCapability = input.capabilityRepo.insertCanonical(input.context, input.capability.canonicalJson, input.pending.createdAtMs)
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact)) return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_RESULT_INVALID')
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value })),
    providerBinding: projectDecodedProviderBindingRecordV2(binding),
    capabilityBinding: { capabilityRevision: input.capability.revision.value, evidenceDigest: input.capability.evidenceDigest.value,
      semanticFieldsDigest: input.capability.semanticFieldsDigest.value, snapshotHash: input.capability.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind: regenerate ? 'regenerate_question' : 'edit_resend',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  return Object.freeze({ bundle: execution.bundle })
}

export type OpenRouterImageInitialSnapshotCommitResultV2 = Readonly<{
  capabilityPersistence: 'created' | 'idempotent_replay'
  executionPersistence: 'created' | 'idempotent_replay'
  bundle: GenerationExecutionOperationBundleV2
}>

function fail(code: OpenRouterImageInitialSnapshotCommitV2Error['code']): never {
  throw new OpenRouterImageInitialSnapshotCommitV2Error(code)
}

function assertBindingAndCapability(
  bindingFact: OpenRouterImageBindingRepositoryFactV2,
  capability: DecodedRuntimeCapabilitySnapshotV2,
): DecodedProviderBindingRecordV2 {
  const binding = bindingFact.record
  if (binding.providerId.value !== 'openrouter' ||
      binding.endpointProfileId.value !== OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 ||
      binding.protocolContractId.value !== 'openrouter-images-v1' || binding.operation !== 'image_generate' ||
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(binding)) !==
        stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(capability.binding))) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  return binding
}

/**
 * Persists only an already-selected Images endpoint. Descriptor fetch and
 * selection happen before this synchronous authority transaction; this
 * function neither refreshes descriptors nor changes a binding.
 */
export function commitOpenRouterImageInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: OpenRouterImageInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: OpenRouterImageBindingRepositoryFactV2
  capability: DecodedRuntimeCapabilitySnapshotV2
}>): OpenRouterImageInitialSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isGenerationV2AuthorityTransactionContextV2(input.context) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isOpenRouterImageInitialSendCommandV2(input.command) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      !isOpenRouterImageBindingRepositoryFactV2(input.binding) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== input.pending.branchId.value ||
      input.command.expectedHeadMessageId?.value !== input.pending.expectedHeadMessageId?.value ||
      input.command.prompt !== input.pending.userBody ||
      input.command.modelId.value !== input.binding.record.modelId.value ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_INPUT_INVALID')
  }
  const binding = assertBindingAndCapability(input.binding, input.capability)
  if (input.commandFacts.attachmentSet.attachments.some((attachment) => attachment.intent.include) ||
      input.commandFacts.attachmentSet.urlReferenceIntents.some((attachment) =>
        attachment.include && attachment.mediaKind !== 'image')) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_ATTACHMENT_REFERENCE_UNAVAILABLE')
  }
  const persistedCapability = input.capabilityRepo.insertCanonical(
    input.context, input.capability.canonicalJson, input.pending.createdAtMs,
  )
  if (!isRuntimeCapabilityRepositoryFactV2(persistedCapability.fact) ||
      persistedCapability.fact.capability.canonicalJson !== input.capability.canonicalJson) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_RESULT_INVALID')
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
      providerBinding: projectDecodedProviderBindingRecordV2(binding),
      capabilityBinding: {
        capabilityRevision: input.capability.revision.value,
        evidenceDigest: input.capability.evidenceDigest.value,
        semanticFieldsDigest: input.capability.semanticFieldsDigest.value,
        snapshotHash: input.capability.snapshotHash.value,
      },
      attachmentProviderFileBindings: [],
      toolAuthority: { kind: 'none' },
    }),
  )
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value,
    actionKind: 'initial_send',
    branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value,
    targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint,
    createdAtMs: input.pending.createdAtMs,
  })
  if (execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      execution.bundle.snapshot.providerBinding.providerId.value !== 'openrouter' ||
      execution.bundle.snapshot.providerBinding.operation !== 'image_generate') {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_RESULT_INVALID')
  }
  registerGenerationV2AuthorityTransactionParticipantForContextV2(input.context, {
    preCommit: () => {
      if (execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson) {
        fail('GENERATION_V2_OPENROUTER_IMAGE_SNAPSHOT_COMMIT_RESULT_INVALID')
      }
    },
    committed: () => undefined,
    rolledBack: () => undefined,
  })
  return Object.freeze({
    capabilityPersistence: persistedCapability.kind,
    executionPersistence: execution.kind,
    bundle: execution.bundle,
  })
}
