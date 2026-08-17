import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo, type PendingAnswerActionV2, type PendingEditedTurnV2,
  type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { composeLmStudioOpenResponsesBaselineCapabilityV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/runtimeCapabilityV2'
import { createLmStudioOpenResponsesProviderBindingV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/verifiedContractV2'
import { decodeLmStudioPlainTextEditResendCommandV2, decodeLmStudioPlainTextInitialCommandV2,
  decodeLmStudioPlainTextRegenerateCommandV2, decodeLmStudioPlainTextRetryCommandV2,
  type LmStudioPlainTextEditResendCommandV2, type LmStudioPlainTextInitialCommandV2,
  type LmStudioPlainTextRegenerateCommandV2, type LmStudioPlainTextRetryCommandV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/plainTextCommandsV2'
import { compileLmStudioOpenResponsesPreparedRequestV2 } from './lmStudioOpenResponsesPreparedRequestCompilerV2'
import { commitLmStudioCurrentSnapshotV2, commitLmStudioRetrySnapshotV2 } from './lmStudioPlainTextSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2, resolveGenerationToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'
import { assertExpectedCapabilityRevisionV2 } from '../../src/next/generation-v2/capability/capabilityRevisionExpectationV2'

type CurrentCommand = LmStudioPlainTextInitialCommandV2 | LmStudioPlainTextRegenerateCommandV2 | LmStudioPlainTextEditResendCommandV2
export function createLmStudioOpenResponsesGenerationV2Coordinator(input: Readonly<{
  db: BetterSqlite3.Database; nowMs?: () => number
  createQuestionId?: () => string; createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createQuestionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const graph = new ConversationGraphV2Repo(input.db); const execution = new GenerationExecutionV2Repo(input.db, nowMs)
  const requests = new GenerationRequestV2Repo(input.db, nowMs); const history = new LmStudioOpenResponsesNativeHistoryV2Repo(input.db)
  const profiles = new LocalEndpointProfileV2Repo(input.db, nowMs); const config = new GenerationConfigV2Repo(input.db, nowMs)
  const attachments = new AttachmentAssetV2Repo(input.db, nowMs); const capabilities = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function compile(context: GenerationV2AuthorityTransactionContextV2, bundle: GenerationExecutionOperationBundleV2) {
    const profile = profiles.get(bundle.snapshot.providerBinding.endpointProfileId.value)
    const requestHistory = history.loadRequestHistory(context, bundle.operation.operationId.value)
    const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, bundle)
    return compileLmStudioOpenResponsesPreparedRequestV2({ context, execution: bundle, profile, history: requestHistory, toolRegistry })
  }
  function replay(command: { operationId: { value: string }; requestFingerprint: string }, actionKind: string): GenerationTextCommandResultV2 | null {
    const observed = execution.findOperation(command.operationId.value); if (!observed) return null
    if (observed.operation.actionKind !== actionKind || observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.protocolContractId.value !== 'lmstudio-openresponses') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    assertExpectedCapabilityRevisionV2(observed.capability.revision.value)
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const bundle = execution.findOperationInTransaction(context, command.operationId.value)
      if (!bundle) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const preparedRequest = compile(context, bundle)
      const projection = actionKind === 'initial_send'
        ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
        : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: bundle, projection,
        preparedRequest, request: requests.replayPrepared(context, bundle, preparedRequest) })
    })
  }
  function persistCurrent(context: GenerationV2AuthorityTransactionContextV2, command: CurrentCommand) {
    const raced = execution.findOperationInTransaction(context, command.operationId.value)
    if (raced) {
      if (raced.operation.commandFingerprint !== command.requestFingerprint) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const preparedRequest = compile(context, raced)
      const projection = command.kind === 'lmstudio_plain_text_initial'
        ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
        : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced, projection,
        preparedRequest, request: requests.replayPrepared(context, raced, preparedRequest) })
    }
    const profile = profiles.get(command.endpointProfileId.value)
    if (profile.protocolContractId !== 'lmstudio-openresponses') throw new Error('GENERATION_V2_LMSTUDIO_PROFILE_CONTRACT_INVALID')
    const at = nowMs()
    const pending = command.kind === 'lmstudio_plain_text_initial'
      ? graph.beginInitialTurn(context, { operationId: command.operationId.value, branchId: command.branchId.value,
        expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null, questionId: createQuestionId(),
        answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
      : command.kind === 'lmstudio_plain_text_regenerate'
        ? graph.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: 'regenerate_question',
          sourceBranchId: command.sourceBranchId.value, questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
          expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: at })
        : graph.beginEditedTurn(context, { operationId: command.operationId.value, sourceBranchId: command.sourceBranchId.value, sourceQuestionId: command.sourceQuestionId.value,
          sourceAnswerRootId: command.sourceAnswerRootId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
          questionId: createQuestionId(), answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
    return withSynchronousGenerationCommandFactsAuthorityV2(context, config, attachments, pending.conversationId.value,
      projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined, (facts) => {
        const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, facts)
        const providerBinding = createLmStudioOpenResponsesProviderBindingV2(profile, command.modelId.value)
        const capability = composeLmStudioOpenResponsesBaselineCapabilityV2({
          binding: providerBinding, resolvedAt: new Date(at).toISOString(),
          credentialRevision: profile.revisionGeneration,
          selectedTools: toolRegistry?.selectedDefinitions,
        })
        assertExpectedCapabilityRevisionV2(capability.revision.value)
        const persisted = commitLmStudioCurrentSnapshotV2({ context, executionRepo: execution, capabilityRepo: capabilities,
          pending, command, commandFacts: facts, profile, capability, toolRegistry })
        if (command.kind === 'lmstudio_plain_text_initial') {
          graph.commitInitialTurnProjection(context, pending as PendingInitialTurnV2)
        } else if (command.kind === 'lmstudio_plain_text_regenerate') {
          graph.commitAnswerActionProjection(context, pending as PendingAnswerActionV2)
        } else {
          graph.commitEditedTurnProjection(context, pending as PendingEditedTurnV2)
        }
        const preparedRequest = compile(context, persisted.bundle)
        const projection = command.kind === 'lmstudio_plain_text_initial'
          ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
          : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
        return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle, projection,
          preparedRequest, request: requests.createPrepared(context, persisted.bundle, preparedRequest) })
      })
  }

  async function submitCurrent(command: CurrentCommand, action: 'initial_send' | 'regenerate_question' | 'edit_resend') {
    const existing = replay(command, action); if (existing) return existing
    try { return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => persistCurrent(context, command)) }
    catch (error) { const winner = replay(command, action); if (winner) return winner; throw error }
  }
  async function submitRetry(command: LmStudioPlainTextRetryCommandV2) {
    const existing = replay(command, command.actionKind); if (existing) return existing
    try { return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const targetRow = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
        .get(command.sourceAnswerId.value) as { operationId?: unknown } | undefined
      if (!targetRow || typeof targetRow.operationId !== 'string') throw new Error('GENERATION_V2_LMSTUDIO_RETRY_TARGET_INVALID')
      const target = execution.findOperationInTransaction(context, targetRow.operationId)
      if (!target || target.operation.questionId.value !== command.questionId.value ||
          target.snapshot.providerBinding.protocolContractId.value !== 'lmstudio-openresponses') throw new Error('GENERATION_V2_LMSTUDIO_RETRY_TARGET_INVALID')
      const profile = profiles.get(target.snapshot.providerBinding.endpointProfileId.value)
      if (profile.profileRevision !== (target.snapshot.providerBinding.endpointBinding.kind === 'provider_managed_set'
        ? target.snapshot.providerBinding.endpointBinding.endpointSetRevision.value : '')) throw new Error('GENERATION_V2_LMSTUDIO_PROFILE_STALE')
      if (profile.protocolConfig.modelId !== target.snapshot.providerBinding.modelId.value) throw new Error('GENERATION_V2_LMSTUDIO_PROFILE_MODEL_STALE')
      assertExpectedCapabilityRevisionV2(target.capability.revision.value)
      const pending = graph.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: command.actionKind,
        sourceBranchId: command.sourceBranchId.value, questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
        expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs() })
      const persisted = commitLmStudioRetrySnapshotV2({ context, executionRepo: execution, pending, command, target })
      graph.commitAnswerActionProjection(context, pending)
      const preparedRequest = compile(context, persisted.bundle)
      return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
        projection: graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
        request: requests.createPrepared(context, persisted.bundle, preparedRequest) })
    }) } catch (error) { const winner = replay(command, command.actionKind); if (winner) return winner; throw error }
  }
  return Object.freeze({
    submitInitial: (raw: unknown) => submitCurrent(decodeLmStudioPlainTextInitialCommandV2(raw), 'initial_send'),
    retry: (raw: unknown) => submitRetry(decodeLmStudioPlainTextRetryCommandV2(raw)),
    regenerate: (raw: unknown) => submitCurrent(decodeLmStudioPlainTextRegenerateCommandV2(raw), 'regenerate_question'),
    editResend: (raw: unknown) => submitCurrent(decodeLmStudioPlainTextEditResendCommandV2(raw), 'edit_resend'),
  })
}
