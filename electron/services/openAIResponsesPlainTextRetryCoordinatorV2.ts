import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeOpenAIResponsesPlainTextRetryCommandV2,
  type OpenAIResponsesPlainTextRetryCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextRetryCommandV2'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { commitOpenAIResponsesPlainTextRetrySnapshotV2 } from './openAIResponsesPlainTextSnapshotCommitV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export class OpenAIResponsesPlainTextRetryCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_RETRY_TARGET_INVALID'
    | 'GENERATION_V2_OPENAI_RETRY_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesPlainTextRetryCoordinatorV2Error'
  }
}

export function createOpenAIResponsesPlainTextRetryCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new OpenAIResponsesNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function replay(command: OpenAIResponsesPlainTextRetryCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== command.actionKind ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value ||
        observed.snapshot.providerBinding.providerId.value !== 'openai_responses') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== command.actionKind ||
          execution.operation.commandFingerprint !== command.requestFingerprint ||
          execution.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value ||
          execution.snapshot.providerBinding.providerId.value !== 'openai_responses') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history, toolRegistry })
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request: requestRepo.replayPrepared(context, execution, preparedRequest),
      })
    })
  }

  return Object.freeze({
    submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
      const command = decodeOpenAIResponsesPlainTextRetryCommandV2(raw)
      const existing = replay(command)
      if (existing) return existing
      const credential = await input.credentialService.getStatus('openai_responses')
      if (!credential.configured) {
        throw new OpenAIResponsesPlainTextRetryCoordinatorV2Error('GENERATION_V2_OPENAI_RETRY_CREDENTIAL_INVALID')
      }
      try {
        return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.actionKind !== command.actionKind ||
                raced.operation.commandFingerprint !== command.requestFingerprint ||
                raced.operation.targetAnswerRootId?.value !== command.targetAnswerRootId.value ||
                raced.snapshot.providerBinding.providerId.value !== 'openai_responses') {
              throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            }
            const history = historyRepo.loadRequestHistory(context, command.operationId.value)
            const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
            const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
              context, execution: raced, history, toolRegistry,
            })
            return issueGenerationTextCommandResultV2({
              kind: 'idempotent_replay', execution: raced,
              projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
              preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest),
            })
          }
          const targetRow = input.db.prepare(`SELECT operation_id AS operationId
            FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?`).get(
            command.targetAnswerRootId.value,
          ) as { operationId: unknown } | undefined
          if (!targetRow || typeof targetRow.operationId !== 'string') {
            throw new OpenAIResponsesPlainTextRetryCoordinatorV2Error('GENERATION_V2_OPENAI_RETRY_TARGET_INVALID')
          }
          const target = executionRepo.findOperationInTransaction(context, targetRow.operationId)
          if (!target || target.operation.resultAnswerRootId.value !== command.targetAnswerRootId.value ||
              target.operation.questionId.value !== command.questionId.value ||
              target.snapshot.providerBinding.providerId.value !== 'openai_responses' ||
              target.snapshot.providerBinding.operation !== 'text' ||
              target.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) {
            throw new OpenAIResponsesPlainTextRetryCoordinatorV2Error('GENERATION_V2_OPENAI_RETRY_TARGET_INVALID')
          }
          const pending = graphRepo.beginAnswerAction(context, {
            operationId: command.operationId.value, actionKind: command.actionKind,
            branchId: command.branchId.value, questionId: command.questionId.value,
            targetAnswerRootId: command.targetAnswerRootId.value,
            expectedHeadMessageId: command.expectedHeadMessageId.value,
            answerRootId: createAnswerId(), createdAtMs: nowMs(),
          })
          const persisted = commitOpenAIResponsesPlainTextRetrySnapshotV2({
            context, executionRepo, pending, command, target,
          })
          graphRepo.commitAnswerActionProjection(context, pending)
          const history = historyRepo.loadRequestHistory(context, command.operationId.value)
          const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(
            context, toolRegistryRepo, persisted.bundle,
          )
          const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
            context, execution: persisted.bundle, history, toolRegistry,
          })
          return issueGenerationTextCommandResultV2({
            kind: 'created', execution: persisted.bundle,
            projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
            preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest),
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
