import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isPendingAnswerActionForContextV2, isPendingEditedTurnForContextV2, isPendingInitialTurnForContextV2,
  pendingSourceAnswerIdV2, pendingSourceBranchIdV2,
  type PendingAnswerActionV2, type PendingEditedTurnV2, type PendingInitialTurnV2,
} from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isGenerationCommandFactsAuthorityForContextV2, type GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { OpenAICompatibleActiveConfigurationV2, OpenAICompatibleEndpointRevisionV2, OpenAICompatibleProviderDetailsV2 } from '../../infra/db/repo/openAICompatibleV2Repo'
import { createOpenAIChatCompatibleProviderBindingV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/verifiedContractV2'
import {
  type OpenAIChatCompatibleEditResendCommandV2, type OpenAIChatCompatibleInitialCommandV2,
  type OpenAIChatCompatibleRegenerateCommandV2, type OpenAIChatCompatibleRetryCommandV2,
} from '../../src/next/generation-v2/providers/openai-chat-compatible/plainTextCommandsV2'

type CurrentCommand = OpenAIChatCompatibleInitialCommandV2 | OpenAIChatCompatibleRegenerateCommandV2 | OpenAIChatCompatibleEditResendCommandV2
type CurrentPending = PendingInitialTurnV2 | PendingAnswerActionV2 | PendingEditedTurnV2

export class OpenAIChatCompatibleSnapshotCommitV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_RESULT_INVALID') {
    super(code)
    this.name = 'OpenAIChatCompatibleSnapshotCommitV2Error'
  }
}

function fail(code: OpenAIChatCompatibleSnapshotCommitV2Error['code']): never {
  throw new OpenAIChatCompatibleSnapshotCommitV2Error(code)
}
function digest(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}
function provenance(configuration: OpenAICompatibleActiveConfigurationV2, endpoint: OpenAICompatibleEndpointRevisionV2,
  providerInstanceId: string, credentialRevision: number, extraBody: unknown | null) {
  if (!Number.isSafeInteger(credentialRevision) || credentialRevision < 0) fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_INPUT_INVALID')
  const config = (entry: { configId: string; version: number; payloadDigest: string }) => Object.freeze({
    id: entry.configId, version: entry.version, digest: entry.payloadDigest,
  })
  return Object.freeze({ kind: 'openai_chat_compatible' as const, providerInstanceId,
    endpointRevisionId: endpoint.endpointRevisionId, endpointDigest: endpoint.endpointDigest, credentialRevision,
    requestProfile: config(configuration.requestProfile), requestMappings: configuration.requestMappings.map(config),
    reasoningMapping: config(configuration.reasoningMapping), inlinePolicy: config(configuration.inlinePolicy),
    responseProfile: config(configuration.responseProfile), extraBody, extraBodyDigest: digest(extraBody ?? {}) })
}
function assertCurrentShape(context: GenerationV2AuthorityTransactionContextV2, pending: CurrentPending, command: CurrentCommand): 'initial_send' | 'regenerate_question' | 'edit_resend' {
  if (command.kind === 'openai_chat_compatible_initial' && isPendingInitialTurnForContextV2(pending, context) &&
      command.operationId.value === pending.operationId.value && command.branchId.value === pending.branchId.value &&
      command.expectedHeadMessageId?.value === pending.expectedHeadMessageId?.value && command.userBody === pending.userBody) return 'initial_send'
  if (command.kind === 'openai_chat_compatible_regenerate' && isPendingAnswerActionForContextV2(pending, context) &&
      pending.actionKind === 'regenerate_question' && command.operationId.value === pending.operationId.value &&
      command.sourceBranchId.value === pendingSourceBranchIdV2(pending).value &&
      command.sourceAnswerId.value === pendingSourceAnswerIdV2(pending)?.value) return 'regenerate_question'
  if (command.kind === 'openai_chat_compatible_edit_resend' && isPendingEditedTurnForContextV2(pending, context) &&
      command.operationId.value === pending.operationId.value &&
      command.sourceBranchId.value === pendingSourceBranchIdV2(pending).value &&
      command.userBody === pending.userBody) return 'edit_resend'
  return fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_INPUT_INVALID')
}

/** Commits only immutable, already-preflighted configuration facts. */
export function commitOpenAIChatCompatibleCurrentSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  capabilityRepo: RuntimeCapabilityV2Repo
  pending: CurrentPending
  command: CurrentCommand
  commandFacts: GenerationCommandFactsAuthorityV2
  provider: OpenAICompatibleProviderDetailsV2
  endpoint: OpenAICompatibleEndpointRevisionV2
  configuration: OpenAICompatibleActiveConfigurationV2
  credentialScopeId: CredentialScopeIdV2
  credentialRevision: number
  capability: DecodedRuntimeCapabilitySnapshotV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const actionKind = assertCurrentShape(input.context, input.pending, input.command)
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !(input.capabilityRepo instanceof RuntimeCapabilityV2Repo) ||
      !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) || input.provider.status !== 'active' ||
      input.provider.providerInstanceId !== input.command.providerInstanceId.value || input.endpoint.providerInstanceId !== input.provider.providerInstanceId ||
      input.commandFacts.conversationId.value !== input.pending.conversationId.value ||
      input.command.modelId.value.length === 0 || input.command.commandAttachments.length !== 0 ||
      input.commandFacts.attachmentSet.attachments.length !== 0 || input.commandFacts.attachmentSet.providerFileRequirements.length !== 0 ||
      input.commandFacts.semanticIntent.attachments.length !== 0 || input.commandFacts.semanticIntent.tools.mode !== 'disabled') {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_INPUT_INVALID')
  }
  const binding = createOpenAIChatCompatibleProviderBindingV2({ provider: input.provider, endpoint: input.endpoint,
    credentialScopeId: input.credentialScopeId, modelId: input.command.modelId.value })
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(binding)) !==
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.capability.binding))) {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_AUTHORITY_INVALID')
  }
  const persistedCapability = input.capabilityRepo.insertCanonical(input.context, input.capability.canonicalJson, input.pending.createdAtMs)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind, ownerId: entry.ownerId, revision: entry.revision.value })),
    providerBinding: projectDecodedProviderBindingRecordV2(binding),
    capabilityBinding: { capabilityRevision: input.capability.revision.value, evidenceDigest: input.capability.evidenceDigest.value,
      semanticFieldsDigest: input.capability.semanticFieldsDigest.value, snapshotHash: input.capability.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: { kind: 'none' },
    providerConfiguration: provenance(input.configuration, input.endpoint, input.provider.providerInstanceId,
      input.credentialRevision, input.command.extraBody),
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind, branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value, sourceAnswerId: pendingSourceAnswerIdV2(input.pending)?.value ?? null,
    targetAnswerId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  if (persistedCapability.fact.capability.canonicalJson !== input.capability.canonicalJson ||
      execution.bundle.snapshot.canonicalJson !== snapshot.canonicalJson ||
      execution.bundle.snapshot.providerConfiguration.kind !== 'openai_chat_compatible') {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_RESULT_INVALID')
  }
  return Object.freeze({ bundle: execution.bundle })
}

export function commitOpenAIChatCompatibleRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2
  executionRepo: GenerationExecutionV2Repo
  pending: PendingAnswerActionV2
  command: OpenAIChatCompatibleRetryCommandV2
  target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!(input.executionRepo instanceof GenerationExecutionV2Repo) || !isPendingAnswerActionForContextV2(input.pending, input.context) ||
      input.command.kind !== 'openai_chat_compatible_retry' || !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) ||
      input.pending.actionKind !== input.command.actionKind || input.pending.operationId.value !== input.command.operationId.value ||
      input.pending.sourceAnswerId?.value !== input.command.sourceAnswerId.value ||
      input.target.operation.targetAnswerId.value !== input.command.sourceAnswerId.value ||
      input.target.snapshot.providerBinding.protocolContractId.value !== 'openai_chat_compatible' ||
      input.target.snapshot.providerConfiguration.kind !== 'openai_chat_compatible') {
    return fail('GENERATION_V2_OPENAI_COMPATIBLE_SNAPSHOT_INPUT_INVALID')
  }
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>
  delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    ...payload, answerRootId: input.pending.answerRootId.value, operationId: input.command.operationId.value,
  }))
  const execution = input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value, actionKind: input.command.actionKind, branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value,
    sourceAnswerId: input.command.sourceAnswerId.value, targetAnswerId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson, commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  })
  return Object.freeze({ bundle: execution.bundle })
}
