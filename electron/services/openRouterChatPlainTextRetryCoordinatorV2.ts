import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import {
  decodeOpenRouterPlainTextRetryCommandV2,
  type OpenRouterPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/openrouter/plainTextActionCommandsV2'
import { compileOpenRouterChatPreparedRequestV2 } from './openRouterChatPreparedRequestCompilerV2'
import { commitOpenRouterChatRetrySnapshotV2 } from './openRouterChatSnapshotCommitV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'

export function createOpenRouterChatPlainTextRetryCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  nowMs?: () => number
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new OpenRouterNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  function replay(command: OpenRouterPlainTextRetryCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== command.actionKind || observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.operation.sourceAnswerId?.value !== command.sourceAnswerId.value || observed.snapshot.providerBinding.providerId.value !== 'openrouter') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }
  return Object.freeze({
    submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
      const command = decodeOpenRouterPlainTextRetryCommandV2(raw)
      const existing = replay(command); if (existing) return existing
      const credential = await input.credentialService.getStatus('openrouter')
      if (!credential.configured || !credential.credentialScopeId) throw new Error('GENERATION_V2_OPENROUTER_RETRY_CREDENTIAL_INVALID')
      try {
        return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.commandFingerprint !== command.requestFingerprint) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            const history = historyRepo.loadRequestHistory(context, command.operationId.value)
            const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
            const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution: raced, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
            return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced,
              projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
              preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest) })
          }
          const targetRow = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
            .get(command.sourceAnswerId.value) as { operationId?: unknown } | undefined
          if (!targetRow || typeof targetRow.operationId !== 'string') throw new Error('GENERATION_V2_OPENROUTER_RETRY_TARGET_INVALID')
          const target = executionRepo.findOperationInTransaction(context, targetRow.operationId)
          if (!target || target.operation.targetAnswerId.value !== command.sourceAnswerId.value ||
              target.operation.questionId.value !== command.questionId.value || target.snapshot.providerBinding.providerId.value !== 'openrouter' ||
              target.snapshot.providerBinding.operation !== 'text' || target.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) {
            throw new Error('GENERATION_V2_OPENROUTER_RETRY_TARGET_INVALID')
          }
          const pending = graphRepo.beginAnswerAction(context, {
            operationId: command.operationId.value, actionKind: command.actionKind, sourceBranchId: command.sourceBranchId.value,
            questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
            expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs(),
          })
          const persisted = commitOpenRouterChatRetrySnapshotV2({ context, executionRepo, pending, command, target })
          graphRepo.commitAnswerActionProjection(context, pending)
          const history = historyRepo.loadRequestHistory(context, command.operationId.value)
          const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, persisted.bundle)
          const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution: persisted.bundle, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
          return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
            projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
            preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
        })
      } catch (error) { const winner = replay(command); if (winner) return winner; throw error }
    },
  })
}
