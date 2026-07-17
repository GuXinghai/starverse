import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeDeepSeekPlainTextRetryCommandV2,
  type DeepSeekPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextRetryCommandV2'
import { compileDeepSeekPreparedRequestV2 } from './deepSeekInitialPreparedRequestCompilerV2'
import {
  issueDeepSeekPlainTextCommandResultV2,
  type DeepSeekPlainTextCommandResultV2,
} from './deepSeekPlainTextCommandResultV2'
import { commitDeepSeekPlainTextRetrySnapshotV2 } from './deepSeekPlainTextSnapshotCommitV2'

export class DeepSeekPlainTextRetryCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_RETRY_TARGET_INVALID'
    | 'GENERATION_V2_DEEPSEEK_RETRY_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'DeepSeekPlainTextRetryCoordinatorV2Error'
  }
}

export function createDeepSeekPlainTextRetryCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new DeepSeekNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)

  function replay(command: DeepSeekPlainTextRetryCommandV2): DeepSeekPlainTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== command.actionKind ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== command.actionKind ||
          execution.operation.commandFingerprint !== command.requestFingerprint ||
          execution.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution, history })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      return issueDeepSeekPlainTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request,
      })
    })
  }

  return Object.freeze({
    submit: async (raw: unknown): Promise<DeepSeekPlainTextCommandResultV2> => {
      const command = decodeDeepSeekPlainTextRetryCommandV2(raw)
      const existing = replay(command)
      if (existing) return existing
      const credential = await input.credentialService.getStatus('deepseek')
      if (!credential.configured) {
        throw new DeepSeekPlainTextRetryCoordinatorV2Error('GENERATION_V2_DEEPSEEK_RETRY_CREDENTIAL_INVALID')
      }
      try {
        return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.actionKind !== command.actionKind ||
                raced.operation.commandFingerprint !== command.requestFingerprint ||
                raced.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value) {
              throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            }
            const history = historyRepo.loadRequestHistory(context, command.operationId.value)
            const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution: raced, history })
            const request = requestRepo.replayPrepared(context, raced, preparedRequest)
            return issueDeepSeekPlainTextCommandResultV2({
              kind: 'idempotent_replay', execution: raced,
              projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
              preparedRequest, request,
            })
          }
          const targetRow = input.db.prepare(`SELECT operation_id AS operationId
            FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?`).get(
            command.targetAnswerRootId.value,
          ) as { operationId: unknown } | undefined
          if (!targetRow || typeof targetRow.operationId !== 'string') {
            throw new DeepSeekPlainTextRetryCoordinatorV2Error('GENERATION_V2_DEEPSEEK_RETRY_TARGET_INVALID')
          }
          const target = executionRepo.findOperationInTransaction(context, targetRow.operationId)
          if (!target || target.operation.resultAnswerRootId.value !== command.targetAnswerRootId.value ||
              target.operation.questionId.value !== command.questionId.value ||
              target.snapshot.providerBinding.providerId.value !== 'deepseek' ||
              target.snapshot.providerBinding.operation !== 'text' ||
              target.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) {
            throw new DeepSeekPlainTextRetryCoordinatorV2Error('GENERATION_V2_DEEPSEEK_RETRY_TARGET_INVALID')
          }
          const createdAtMs = nowMs()
          const pending = graphRepo.beginAnswerAction(context, {
            operationId: command.operationId.value,
            actionKind: command.actionKind,
            branchId: command.branchId.value,
            questionId: command.questionId.value,
            targetAnswerRootId: command.targetAnswerRootId.value,
            answerRootId: createAnswerId(),
            createdAtMs,
          })
          const persisted = commitDeepSeekPlainTextRetrySnapshotV2({
            context, executionRepo, pending, command, target,
          })
          graphRepo.commitAnswerActionProjection(context, pending)
          const history = historyRepo.loadRequestHistory(context, command.operationId.value)
          const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution: persisted.bundle, history })
          const request = requestRepo.createPrepared(context, persisted.bundle, preparedRequest)
          return issueDeepSeekPlainTextCommandResultV2({
            kind: 'created', execution: persisted.bundle,
            projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
            preparedRequest, request,
          })
        })
      } catch (error) {
        const winner = replay(command)
        if (winner) return winner
        throw error
      }
    },
  })
}
