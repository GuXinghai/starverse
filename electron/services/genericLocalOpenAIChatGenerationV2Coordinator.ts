import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo, type PendingAnswerActionV2, type PendingEditedTurnV2, type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GenericLocalOpenAIChatNativeHistoryV2Repo } from '../../infra/db/repo/genericLocalOpenAIChatNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { composeGenericLocalOpenAIChatBaselineCapabilityV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/runtimeCapabilityV2'
import { createGenericLocalOpenAIChatProviderBindingV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/verifiedContractV2'
import { decodeGenericLocalOpenAIChatEditResendCommandV2, decodeGenericLocalOpenAIChatInitialCommandV2,
  decodeGenericLocalOpenAIChatRegenerateCommandV2, decodeGenericLocalOpenAIChatRetryCommandV2,
  type GenericLocalOpenAIChatEditResendCommandV2, type GenericLocalOpenAIChatInitialCommandV2,
  type GenericLocalOpenAIChatRegenerateCommandV2, type GenericLocalOpenAIChatRetryCommandV2 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/plainTextCommandsV2'
import { compileGenericLocalOpenAIChatPreparedRequestV2 } from './genericLocalOpenAIChatPreparedRequestCompilerV2'
import { commitGenericLocalCurrentSnapshotV2, commitGenericLocalRetrySnapshotV2 } from './genericLocalPlainTextSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'

type Current = GenericLocalOpenAIChatInitialCommandV2 | GenericLocalOpenAIChatRegenerateCommandV2 | GenericLocalOpenAIChatEditResendCommandV2
export function createGenericLocalOpenAIChatGenerationV2Coordinator(input: Readonly<{ db: BetterSqlite3.Database; nowMs?: () => number;
  createQuestionId?: () => string; createAnswerId?: () => string }>) {
  const nowMs = input.nowMs ?? Date.now; const createQuestionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`); const graph = new ConversationGraphV2Repo(input.db)
  const execution = new GenerationExecutionV2Repo(input.db, nowMs); const requests = new GenerationRequestV2Repo(input.db, nowMs)
  const history = new GenericLocalOpenAIChatNativeHistoryV2Repo(input.db); const profiles = new LocalEndpointProfileV2Repo(input.db, nowMs)
  const config = new GenerationConfigV2Repo(input.db, nowMs); const attachments = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilities = new RuntimeCapabilityV2Repo(input.db)
  function compile(context: GenerationV2AuthorityTransactionContextV2, bundle: GenerationExecutionOperationBundleV2) {
    return compileGenericLocalOpenAIChatPreparedRequestV2({ context, execution: bundle,
      profile: profiles.get(bundle.snapshot.providerBinding.endpointProfileId.value),
      history: history.loadRequestHistory(context, bundle.operation.operationId.value) })
  }
  function replay(command: { operationId: { value: string }; requestFingerprint: string }, action: string): GenerationTextCommandResultV2 | null {
    const found = execution.findOperation(command.operationId.value); if (!found) return null
    if (found.operation.actionKind !== action || found.operation.commandFingerprint !== command.requestFingerprint ||
        found.snapshot.providerBinding.protocolContractId.value !== 'generic-local-openai-chat-completions') throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => { const bundle = execution.findOperationInTransaction(context, command.operationId.value)!
      const preparedRequest = compile(context, bundle); const projection = action === 'initial_send'
        ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
        : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: bundle, projection, preparedRequest,
        request: requests.replayPrepared(context, bundle, preparedRequest) }) })
  }
  function persistCurrent(context: GenerationV2AuthorityTransactionContextV2, command: Current) {
    const raced = execution.findOperationInTransaction(context, command.operationId.value)
    if (raced) { if (raced.operation.commandFingerprint !== command.requestFingerprint) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const preparedRequest = compile(context, raced); const projection = command.kind === 'generic_local_openai_chat_initial'
        ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
        : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced, projection, preparedRequest,
        request: requests.replayPrepared(context, raced, preparedRequest) }) }
    const profile = profiles.get(command.endpointProfileId.value)
    if (profile.protocolContractId !== 'generic-local-openai-chat-completions') throw new Error('GENERATION_V2_GENERIC_LOCAL_PROFILE_CONTRACT_INVALID')
    const at = nowMs(); const pending = command.kind === 'generic_local_openai_chat_initial'
      ? graph.beginInitialTurn(context, { operationId: command.operationId.value, branchId: command.branchId.value,
        expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null, questionId: createQuestionId(), answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
      : command.kind === 'generic_local_openai_chat_regenerate'
        ? graph.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: 'regenerate_question', sourceBranchId: command.sourceBranchId.value,
          questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value, expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: at })
        : graph.beginEditedTurn(context, { operationId: command.operationId.value, sourceBranchId: command.sourceBranchId.value,
          sourceQuestionId: command.sourceQuestionId.value, sourceAnswerRootId: command.sourceAnswerRootId.value,
          expectedHeadMessageId: command.expectedHeadMessageId.value, questionId: createQuestionId(), answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
    return withSynchronousGenerationCommandFactsAuthorityV2(context, config, attachments, pending.conversationId.value,
      projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined, (facts) => {
        const binding = createGenericLocalOpenAIChatProviderBindingV2(profile, command.modelId.value)
        const capability = composeGenericLocalOpenAIChatBaselineCapabilityV2({ binding, resolvedAt: new Date(at).toISOString() })
        const persisted = commitGenericLocalCurrentSnapshotV2({ context, executionRepo: execution, capabilityRepo: capabilities,
          pending, command, commandFacts: facts, profile, capability })
        if (command.kind === 'generic_local_openai_chat_initial') graph.commitInitialTurnProjection(context, pending as PendingInitialTurnV2)
        else if (command.kind === 'generic_local_openai_chat_regenerate') graph.commitAnswerActionProjection(context, pending as PendingAnswerActionV2)
        else graph.commitEditedTurnProjection(context, pending as PendingEditedTurnV2)
        const preparedRequest = compile(context, persisted.bundle); const projection = command.kind === 'generic_local_openai_chat_initial'
          ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
          : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
        return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle, projection, preparedRequest,
          request: requests.createPrepared(context, persisted.bundle, preparedRequest) }) })
  }
  async function current(command: Current, action: 'initial_send' | 'regenerate_question' | 'edit_resend') {
    const existing = replay(command, action); if (existing) return existing
    try { return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => persistCurrent(context, command)) }
    catch (error) { const winner = replay(command, action); if (winner) return winner; throw error }
  }
  async function retry(command: GenericLocalOpenAIChatRetryCommandV2) {
    const existing = replay(command, command.actionKind); if (existing) return existing
    try { return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const row = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?').get(command.sourceAnswerId.value) as { operationId?: unknown } | undefined
      if (!row || typeof row.operationId !== 'string') throw new Error('GENERATION_V2_GENERIC_LOCAL_RETRY_TARGET_INVALID')
      const target = execution.findOperationInTransaction(context, row.operationId)
      if (!target || target.operation.questionId.value !== command.questionId.value || target.snapshot.providerBinding.protocolContractId.value !== 'generic-local-openai-chat-completions') throw new Error('GENERATION_V2_GENERIC_LOCAL_RETRY_TARGET_INVALID')
      const profile = profiles.get(target.snapshot.providerBinding.endpointProfileId.value)
      if (profile.profileRevision !== (target.snapshot.providerBinding.endpointBinding.kind === 'provider_managed_set' ? target.snapshot.providerBinding.endpointBinding.endpointSetRevision.value : '')) throw new Error('GENERATION_V2_GENERIC_LOCAL_PROFILE_STALE')
      const pending = graph.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: command.actionKind,
        sourceBranchId: command.sourceBranchId.value, questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
        expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs() })
      const persisted = commitGenericLocalRetrySnapshotV2({ context, executionRepo: execution, pending, command, target })
      graph.commitAnswerActionProjection(context, pending); const preparedRequest = compile(context, persisted.bundle)
      return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
        projection: graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
        request: requests.createPrepared(context, persisted.bundle, preparedRequest) }) }) }
    catch (error) { const winner = replay(command, command.actionKind); if (winner) return winner; throw error }
  }
  return Object.freeze({ submitInitial: (raw: unknown) => current(decodeGenericLocalOpenAIChatInitialCommandV2(raw), 'initial_send'),
    retry: (raw: unknown) => retry(decodeGenericLocalOpenAIChatRetryCommandV2(raw)),
    regenerate: (raw: unknown) => current(decodeGenericLocalOpenAIChatRegenerateCommandV2(raw), 'regenerate_question'),
    editResend: (raw: unknown) => current(decodeGenericLocalOpenAIChatEditResendCommandV2(raw), 'edit_resend') })
}
