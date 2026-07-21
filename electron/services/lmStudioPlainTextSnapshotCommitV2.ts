import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2, decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { isPendingAnswerActionForContextV2, isPendingEditedTurnForContextV2, isPendingInitialTurnForContextV2,
  type PendingAnswerActionV2, type PendingEditedTurnV2, type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isGenerationCommandFactsAuthorityForContextV2, type GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from '../../infra/db/repo/toolRegistryV2Repo'
import { createLmStudioOpenResponsesProviderBindingV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/verifiedContractV2'
import { isLmStudioPlainTextEditResendCommandV2, isLmStudioPlainTextInitialCommandV2,
  isLmStudioPlainTextRegenerateCommandV2, isLmStudioPlainTextRetryCommandV2,
  type LmStudioPlainTextEditResendCommandV2, type LmStudioPlainTextInitialCommandV2,
  type LmStudioPlainTextRegenerateCommandV2, type LmStudioPlainTextRetryCommandV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/plainTextCommandsV2'

type CurrentCommand = LmStudioPlainTextInitialCommandV2 | LmStudioPlainTextRegenerateCommandV2 | LmStudioPlainTextEditResendCommandV2
function baseline(
  context: GenerationV2AuthorityTransactionContextV2,
  facts: GenerationCommandFactsAuthorityV2,
  toolRegistry: ToolRegistryRepositoryFactV2 | null,
): void {
  const intent = facts.semanticIntent
  const unsupportedGeneration = ['topK', 'minP', 'topA', 'seed', 'stop', 'candidateCount', 'repetitionPenalty'] as const
  if (unsupportedGeneration.some((key) => intent.generation[key] !== undefined) ||
      (intent.reasoning.mode === 'enabled' && (intent.reasoning.effort !== 'low' ||
        intent.reasoning.summary !== undefined || intent.reasoning.exclude !== undefined)) ||
      intent.web.mode !== 'disabled' || intent.image.mode !== 'disabled' ||
      intent.attachments.length !== 0 || intent.providerExtension.kind !== 'none' ||
      facts.attachmentSet.attachments.length !== 0 || facts.attachmentSet.providerFileRequirements.length !== 0) {
    throw new Error('GENERATION_V2_LMSTUDIO_BASELINE_EXPLICIT_FIELD_UNSUPPORTED')
  }
  if (intent.tools.mode === 'enabled') {
    if (!isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        toolRegistry.selectedDefinitions.length !== intent.tools.allowedToolIds.length ||
        toolRegistry.selectedDefinitions.some((definition, index) => definition.toolId !== intent.tools.allowedToolIds[index].value) ||
        !['omitted', 'none', 'required'].includes(intent.tools.toolChoice.mode)) {
      throw new Error('GENERATION_V2_LMSTUDIO_BASELINE_EXPLICIT_FIELD_UNSUPPORTED')
    }
  } else if (toolRegistry !== null) throw new Error('GENERATION_V2_LMSTUDIO_BASELINE_EXPLICIT_FIELD_UNSUPPORTED')
}
function snapshotToolAuthority(toolRegistry: ToolRegistryRepositoryFactV2 | null) {
  return toolRegistry === null
    ? { kind: 'none' as const }
    : { kind: 'registry' as const, toolRegistryRevision: toolRegistry.registry.revision,
        toolDefinitionsDigest: toolRegistry.registry.definitionsDigest }
}
export function commitLmStudioCurrentSnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo; capabilityRepo: RuntimeCapabilityV2Repo
  pending: PendingInitialTurnV2 | PendingAnswerActionV2 | PendingEditedTurnV2; command: CurrentCommand
  commandFacts: GenerationCommandFactsAuthorityV2; profile: LocalEndpointProfileV2; capability: DecodedRuntimeCapabilitySnapshotV2
  toolRegistry: ToolRegistryRepositoryFactV2 | null
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  const initial = isLmStudioPlainTextInitialCommandV2(input.command) && isPendingInitialTurnForContextV2(input.pending, input.context)
  const regenerate = isLmStudioPlainTextRegenerateCommandV2(input.command) && isPendingAnswerActionForContextV2(input.pending, input.context) && input.pending.actionKind === 'regenerate_question'
  const edit = isLmStudioPlainTextEditResendCommandV2(input.command) && isPendingEditedTurnForContextV2(input.pending, input.context)
  if ((!initial && !regenerate && !edit) || !isGenerationCommandFactsAuthorityForContextV2(input.commandFacts, input.context) ||
      input.command.operationId.value !== input.pending.operationId.value || input.command.branchId.value !== input.pending.branchId.value ||
      input.command.endpointProfileId.value !== input.profile.endpointProfileId) throw new Error('GENERATION_V2_LMSTUDIO_SNAPSHOT_INPUT_INVALID')
  baseline(input.context, input.commandFacts, input.toolRegistry)
  const binding = createLmStudioOpenResponsesProviderBindingV2(input.profile, input.command.modelId.value)
  if (stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(binding)) !==
      stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.capability.binding))) {
    throw new Error('GENERATION_V2_LMSTUDIO_SNAPSHOT_CAPABILITY_INVALID')
  }
  input.capabilityRepo.insertCanonical(input.context, input.capability.canonicalJson, input.pending.createdAtMs)
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2, answerRootId: input.pending.answerRootId.value, operationId: input.pending.operationId.value,
    semanticIntent: projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),
    resolvedConfigRevisions: input.commandFacts.resolvedConfigRevisions.map((entry) => ({ ownerKind: entry.ownerKind,
      ownerId: entry.ownerId, revision: entry.revision.value })), providerBinding: projectDecodedProviderBindingRecordV2(binding),
    capabilityBinding: { capabilityRevision: input.capability.revision.value, evidenceDigest: input.capability.evidenceDigest.value,
      semanticFieldsDigest: input.capability.semanticFieldsDigest.value, snapshotHash: input.capability.snapshotHash.value },
    attachmentProviderFileBindings: [], toolAuthority: snapshotToolAuthority(input.toolRegistry),
  }))
  const actionKind = initial ? 'initial_send' : regenerate ? 'regenerate_question' : 'edit_resend'
  return Object.freeze({ bundle: input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.pending.operationId.value, actionKind, branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value, targetAnswerRootId: null,
    resultAnswerRootId: input.pending.answerRootId.value, snapshot: snapshot.canonicalJson,
    commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  }).bundle })
}
export function commitLmStudioRetrySnapshotV2(input: Readonly<{
  context: GenerationV2AuthorityTransactionContextV2; executionRepo: GenerationExecutionV2Repo; pending: PendingAnswerActionV2
  command: LmStudioPlainTextRetryCommandV2; target: GenerationExecutionOperationBundleV2
}>): Readonly<{ bundle: GenerationExecutionOperationBundleV2 }> {
  if (!isPendingAnswerActionForContextV2(input.pending, input.context) || !isLmStudioPlainTextRetryCommandV2(input.command) ||
      !isGenerationExecutionOperationBundleForContextV2(input.target, input.context) || input.pending.actionKind !== input.command.actionKind ||
      input.target.operation.resultAnswerRootId.value !== input.command.targetAnswerRootId.value ||
      input.target.snapshot.providerBinding.protocolContractId.value !== 'lmstudio-openresponses') throw new Error('GENERATION_V2_LMSTUDIO_SNAPSHOT_INPUT_INVALID')
  const payload = JSON.parse(input.target.snapshot.canonicalJson) as Record<string, unknown>; delete payload.snapshotHash
  const snapshot = decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({ ...payload,
    answerRootId: input.pending.answerRootId.value, operationId: input.command.operationId.value }))
  return Object.freeze({ bundle: input.executionRepo.insertOperationAndSnapshot(input.context, {
    operationId: input.command.operationId.value, actionKind: input.command.actionKind, branchId: input.pending.branchId.value,
    conversationId: input.pending.conversationId.value, questionId: input.pending.questionId.value,
    targetAnswerRootId: input.command.targetAnswerRootId.value, resultAnswerRootId: input.pending.answerRootId.value,
    snapshot: snapshot.canonicalJson, commandFingerprint: input.command.requestFingerprint, createdAtMs: input.pending.createdAtMs,
  }).bundle })
}
