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
import { RuntimeCapabilityV2Repo, isRuntimeCapabilityRepositoryFactV2 } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import {
  isOpenAIResponsesPlainTextInitialSendCommandV2,
  type OpenAIResponsesPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextInitialSendCommandV2'
import {
  isVerifiedOpenAIResponsesProviderBindingAuthorityV2,
  isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
  readVerifiedOpenAIResponsesProviderBindingRecordV2,
  type VerifiedOpenAIResponsesProviderBindingAuthorityV2,
  type VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2,
} from './openAIResponsesGenerationAuthorityV2Service'

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

export function commitVerifiedOpenAIResponsesPlainTextInitialSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2
  command: OpenAIResponsesPlainTextInitialSendCommandV2
  commandFacts: GenerationCommandFactsAuthorityV2
  binding: VerifiedOpenAIResponsesProviderBindingAuthorityV2
  capability: VerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2
}>): OpenAIResponsesPlainTextSnapshotCommitResultV2 {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) ||
      !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isPendingInitialTurnForContextV2(input.pending, input.context) ||
      !isOpenAIResponsesPlainTextInitialSendCommandV2(input.command) ||
      !isVerifiedOpenAIResponsesProviderBindingAuthorityV2(input.binding) ||
      !isVerifiedOpenAIResponsesRuntimeCapabilityAuthorityV2(input.capability) ||
      input.command.operationId.value !== input.pending.operationId.value ||
      input.command.branchId.value !== input.pending.branchId.value ||
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
  if (intent.attachments.length !== 0 || input.commandFacts.attachmentSet.attachments.length !== 0 ||
      input.commandFacts.attachmentSet.providerFileRequirements.length !== 0 ||
      input.commandFacts.attachmentSet.requiresProviderFileAuthority || intent.tools.mode !== 'disabled') {
    return fail('GENERATION_V2_OPENAI_SNAPSHOT_COMMIT_AUTHORITY_INVALID')
  }
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
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
  })
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(record)
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind: 'initial_send',
    branchId: input.pending.branchId.value, conversationId: input.pending.conversationId.value,
    questionId: input.pending.questionId.value, targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
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
