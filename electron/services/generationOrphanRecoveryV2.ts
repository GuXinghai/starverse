import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

const ERROR_CODE = 'stream_interrupted'
const ERROR_MESSAGE = 'Assistant generation was interrupted before completion.'

type ActiveRow = Readonly<{
  operationId: unknown
  operationState: unknown
  requestSequence: unknown
  requestState: unknown
  answerStatus: unknown
  openAttemptCount: unknown
}>

export type GenerationOrphanRecoveryResultV2 = Readonly<{
  recovered: number
  operationIds: readonly string[]
}>

export class GenerationOrphanRecoveryV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ORPHAN_RECOVERY_STATE_INVALID') {
    super(code)
    this.name = 'GenerationOrphanRecoveryV2Error'
  }
}

function invalid(): never {
  throw new GenerationOrphanRecoveryV2Error('GENERATION_V2_ORPHAN_RECOVERY_STATE_INVALID')
}

export function recoverGenerationOrphansV2(
  db: BetterSqlite3.Database,
  atMs: number = Date.now(),
): GenerationOrphanRecoveryResultV2 {
  if (!Number.isSafeInteger(atMs) || atMs < 0 || db.inTransaction) invalid()
  const executionRepo = new GenerationExecutionV2Repo(db, () => atMs)
  const requestRepo = new GenerationRequestV2Repo(db, () => atMs)
  const graphRepo = new ConversationGraphV2Repo(db)
  const recovered: string[] = []
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const operationIds = (db.prepare(`SELECT operation_id AS operationId
      FROM generation_operation_v2
      WHERE state IN ('committed', 'streaming')
      ORDER BY operation_id COLLATE BINARY`).all() as { operationId: unknown }[]).map((row) => {
        if (typeof row.operationId !== 'string' || row.operationId.length < 1) invalid()
        return row.operationId
      })
    for (const operationId of operationIds) {
      const operation = executionRepo.findOperationInTransaction(context, operationId)
      if (!operation || (operation.operation.state !== 'committed' && operation.operation.state !== 'streaming')) invalid()
      const rows = db.prepare(`SELECT operation.operation_id AS operationId,
        operation.state AS operationState, request.request_sequence AS requestSequence,
        request.state AS requestState, answer.status AS answerStatus,
        (SELECT count(*) FROM generation_attempt_v2 AS attempt
          WHERE attempt.operation_id=request.operation_id
            AND attempt.request_sequence=request.request_sequence AND attempt.state='open') AS openAttemptCount
        FROM generation_operation_v2 AS operation
        JOIN generation_request_v2 AS request ON request.operation_id=operation.operation_id
          AND request.state IN ('prepared', 'streaming')
        JOIN message_v2 AS answer ON answer.message_id=operation.result_answer_root_id
        WHERE operation.operation_id=?
        ORDER BY request.request_sequence`).all(operationId) as ActiveRow[]
      if (rows.length !== 1) invalid()
      const row = rows[0]
      if (row.operationId !== operationId || row.operationState !== operation.operation.state ||
          row.answerStatus !== 'streaming' || !Number.isSafeInteger(row.requestSequence) ||
          (row.requestSequence as number) < 1 || !Number.isSafeInteger(row.openAttemptCount)) invalid()
      const requestState = row.requestState
      const openAttemptCount = row.openAttemptCount as number
      const coherentPrepared = operation.operation.state === 'committed' && requestState === 'prepared' &&
        openAttemptCount === 0
      const coherentStreaming = operation.operation.state === 'streaming' && requestState === 'streaming' &&
        openAttemptCount === 1
      if (!coherentPrepared && !coherentStreaming) invalid()
      const request = requestRepo.loadExistingForOperation(context, operation, row.requestSequence as number)
      if (coherentStreaming) {
        const attempt = db.prepare(`SELECT attempt FROM generation_attempt_v2
          WHERE operation_id=? AND request_sequence=? AND state='open'`).get(
          operationId, row.requestSequence,
        ) as { attempt: unknown } | undefined
        if (!attempt || !Number.isSafeInteger(attempt.attempt) || (attempt.attempt as number) < 1) invalid()
        const transition = executionRepo.terminalizeAttempt(context, {
          key: { operationId, requestSequence: row.requestSequence, attempt: attempt.attempt },
          outcome: { kind: 'process_interrupted', phase: 'mid_stream' },
        }, atMs)
        if (transition.kind === 'conflict') {
          throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
        }
      }
      requestRepo.terminalize(context, request, 'failed', atMs)
      graphRepo.terminalizeAssistantMessage(
        context, operation.operation.resultAnswerRootId.value, 'failed', null, atMs,
      )
      executionRepo.terminalizeOperation(context, operation, {
        state: 'failed', errorCode: ERROR_CODE, errorMessage: ERROR_MESSAGE,
      }, atMs)
      recovered.push(operationId)
    }
  })
  return Object.freeze({ recovered: recovered.length, operationIds: Object.freeze(recovered) })
}
