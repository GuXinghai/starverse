import type BetterSqlite3 from 'better-sqlite3'
import { loadNativeArtifactJsonV2, NativeArtifactStorageV2Error } from '../../infra/db/repo/nativeArtifactStorageV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo, GenerationRequestV2RepoError } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GeminiGenerateContentNativeHistoryV2Repo, GeminiGenerateContentNativeHistoryV2RepoError } from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { LmStudioOpenResponsesNativeHistoryV2Repo, LmStudioOpenResponsesNativeHistoryV2RepoError } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import {
  decodeOpenRouterNativeHistoryArtifactV1,
  hasCompleteOpenRouterAssistantToolCallsV1,
} from '../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { decodeOpenRouterChatTerminalArtifactV1 } from '../../src/core/generation-v2/providers/openrouter/terminalArtifactV1'
import {
  decodeDeepSeekNativeHistoryArtifactV2,
  hasPendingDeepSeekAssistantToolCallsV2,
} from '../../src/core/generation-v2/providers/deepseek/nativeMessagesV1'
import { decodeDeepSeekStableTerminalArtifactV1 } from '../../src/core/generation-v2/providers/deepseek/terminalArtifactV1'
import {
  decodeAnthropicNativeHistoryArtifactV1,
  hasPendingAnthropicToolUseBlocksV1,
} from '../../src/core/generation-v2/providers/anthropic/nativeContentBlocksV1'
import {
  decodeOpenAIResponsesContinuationArtifactV2,
  hasPendingOpenAIResponsesFunctionCallsV2,
} from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import { decodeOpenAIResponsesTerminalArtifactV1 } from '../../src/core/generation-v2/providers/openai-responses/terminalArtifactV1'
import { stableSerializeProviderRequestV2 } from '../../src/shared/serialization/canonicalJsonV2'

const ERROR_CODE = 'stream_interrupted'
const ERROR_MESSAGE = 'Assistant generation was interrupted before completion.'
const ARTIFACT_CORRUPT_ERROR_CODE = 'GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT'
const ARTIFACT_CORRUPT_ERROR_MESSAGE = 'A stored result of this generation is corrupt. The generation was stopped and its records were kept.'

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
  unrecoveredOperationIds: readonly string[]
  /** Ended as failed because one of their own stored artifacts is corrupt (R2-06). */
  failedOperationIds: readonly string[]
}>

export class GenerationOrphanRecoveryV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ORPHAN_RECOVERY_STATE_INVALID' | 'GENERATION_V2_ORPHAN_RECOVERY_ARTIFACT_CORRUPT') {
    super(code)
    this.name = 'GenerationOrphanRecoveryV2Error'
  }
}

function invalid(): never {
  throw new GenerationOrphanRecoveryV2Error('GENERATION_V2_ORPHAN_RECOVERY_STATE_INVALID')
}

function loadRecoveryArtifactJson(
  db: BetterSqlite3.Database,
  row: Readonly<Record<string, unknown>>,
  jsonField: string,
  hashField: string,
  artifactKind: string,
  artifactCodecVersion: number,
): string {
  if (typeof row.operationId !== 'string' || typeof row.answerRootId !== 'string' ||
      !Number.isSafeInteger(row.requestSequence) || typeof row[jsonField] !== 'string' ||
      typeof row[hashField] !== 'string') invalid()
  try {
    return loadNativeArtifactJsonV2(db, {
      operationId: row.operationId,
      answerRootId: row.answerRootId,
      requestSequence: row.requestSequence as number,
      artifactKind,
    }, row[jsonField] as string, {
      artifactCodecVersion,
      artifactHash: row[hashField] as string,
    })
  } catch (error) {
    // A corrupt stored artifact belongs to this operation alone (P2b-05).
    if (error instanceof NativeArtifactStorageV2Error) {
      throw new GenerationOrphanRecoveryV2Error('GENERATION_V2_ORPHAN_RECOVERY_ARTIFACT_CORRUPT')
    }
    throw error
  }
}

export function hasPersistedOpenRouterAwaitingToolStateV2(row: Readonly<Record<string, unknown>>): boolean {
  if (row.requestState !== 'completed' || row.answerStatus !== 'streaming' ||
      typeof row.terminalJson !== 'string' || typeof row.terminalHash !== 'string' ||
      typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') return false
  try {
    const terminal = decodeOpenRouterChatTerminalArtifactV1(JSON.parse(row.terminalJson))
    const artifact = decodeOpenRouterNativeHistoryArtifactV1(JSON.parse(row.artifactJson))
    return terminal.artifactHash === row.terminalHash && artifact.artifactHash === row.artifactHash &&
      hasCompleteOpenRouterAssistantToolCallsV1(artifact)
  } catch {
    return false
  }
}

export function hasPersistedDeepSeekAwaitingToolStateV2(row: Readonly<Record<string, unknown>>): boolean {
  if (row.requestState !== 'completed' || row.answerStatus !== 'streaming' ||
      typeof row.terminalJson !== 'string' || typeof row.terminalHash !== 'string' ||
      typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') return false
  try {
    const terminal = decodeDeepSeekStableTerminalArtifactV1(JSON.parse(row.terminalJson))
    const artifact = decodeDeepSeekNativeHistoryArtifactV2(JSON.parse(row.artifactJson))
    const finalEntry = artifact.orderedEntries.at(-1)
    return terminal.artifactHash === row.terminalHash && artifact.artifactHash === row.artifactHash &&
      finalEntry?.kind === 'assistant' &&
      finalEntry.generatedWithThinking === terminal.generatedWithThinking &&
      stableSerializeProviderRequestV2(finalEntry.message) ===
        stableSerializeProviderRequestV2(terminal.assistantMessage) &&
      hasPendingDeepSeekAssistantToolCallsV2(artifact)
  } catch {
    return false
  }
}

export function hasPersistedAnthropicAwaitingToolStateV2(row: Readonly<Record<string, unknown>>): boolean {
  if (row.requestState !== 'completed' || row.answerStatus !== 'streaming' ||
      typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') return false
  try {
    const artifact = decodeAnthropicNativeHistoryArtifactV1(JSON.parse(row.artifactJson))
    return artifact.artifactHash === row.artifactHash && hasPendingAnthropicToolUseBlocksV1(artifact)
  } catch {
    return false
  }
}

export function hasPersistedOpenAIResponsesAwaitingToolStateV2(row: Readonly<Record<string, unknown>>): boolean {
  if (row.requestState !== 'completed' || row.answerStatus !== 'streaming' ||
      typeof row.terminalJson !== 'string' || typeof row.terminalHash !== 'string' ||
      typeof row.historyJson !== 'string' || typeof row.historyHash !== 'string') return false
  try {
    const terminal = decodeOpenAIResponsesTerminalArtifactV1(row.terminalJson)
    const history = decodeOpenAIResponsesContinuationArtifactV2(JSON.parse(row.historyJson))
    return terminal.artifactHash === row.terminalHash && terminal.terminalKind === 'completed' &&
      history.artifactHash === row.historyHash && hasPendingOpenAIResponsesFunctionCallsV2(history)
  } catch {
    return false
  }
}

function persistedRecoveryTime(db: BetterSqlite3.Database, operationId: string, answerId: string): number {
  const persistedTime = db.prepare(`SELECT max(at_ms) AS atMs FROM (
    SELECT updated_at_ms AS at_ms FROM generation_operation_v2 WHERE operation_id=?
    UNION ALL SELECT updated_at_ms FROM generation_request_v2 WHERE operation_id=?
    UNION ALL SELECT started_at_ms FROM generation_attempt_v2 WHERE operation_id=?
    UNION ALL SELECT updated_at_ms FROM message_v2 WHERE message_id=?
  )`).get(operationId, operationId, operationId, answerId) as { atMs: unknown }
  if (!Number.isSafeInteger(persistedTime.atMs) || (persistedTime.atMs as number) < 0) invalid()
  return persistedTime.atMs as number
}

/**
 * Ends an awaiting-tool operation whose own stored artifact is corrupt as
 * failed (R2-06). This releases its branch lock and shows the failure on its
 * answer. Requests, attempts and artifacts are kept unchanged as evidence; the
 * corrupt artifact is never decoded or used. Returns false, changing nothing,
 * unless the operation still decodes, is streaming, has no prepared or
 * streaming request and no open attempt, and its answer is still streaming.
 */
function failOperationWithCorruptArtifact(
  db: BetterSqlite3.Database,
  executionRepo: GenerationExecutionV2Repo,
  graphRepo: ConversationGraphV2Repo,
  operationId: string,
  atMs: number,
): boolean {
  let failed = false
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    let operation: GenerationExecutionOperationBundleV2 | null
    try {
      operation = executionRepo.findOperationInTransaction(context, operationId)
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError &&
          (error.code === 'GENERATION_V2_EXECUTION_STATE_INVALID' || error.code === 'GENERATION_V2_EXECUTION_NOT_FOUND')) return
      throw error
    }
    if (!operation || operation.operation.state !== 'streaming') return
    const answerId = operation.operation.targetAnswerId.value
    const active = db.prepare(`SELECT
      (SELECT count(*) FROM generation_request_v2 WHERE operation_id=? AND state IN ('prepared', 'streaming')) AS requests,
      (SELECT count(*) FROM generation_attempt_v2 WHERE operation_id=? AND state='open') AS attempts,
      (SELECT status FROM message_v2 WHERE message_id=?) AS answerStatus`).get(
      operationId, operationId, answerId,
    ) as { requests: unknown, attempts: unknown, answerStatus: unknown }
    if (active.requests !== 0 || active.attempts !== 0 || active.answerStatus !== 'streaming') return
    const recoveryAtMs = Math.max(atMs, persistedRecoveryTime(db, operationId, answerId))
    graphRepo.terminalizeAssistantMessage(context, answerId, 'failed', null, recoveryAtMs)
    executionRepo.terminalizeOperation(context, operation, {
      state: 'failed', errorCode: ARTIFACT_CORRUPT_ERROR_CODE, errorMessage: ARTIFACT_CORRUPT_ERROR_MESSAGE,
    }, recoveryAtMs)
    failed = true
  })
  return failed
}

export const GENERATION_V2_BRANCH_RESTRICTION_CODE = 'GENERATION_V2_RECOVERY_STATE_INVALID' as const

export type GenerationV2BranchIntegrityRestriction = Readonly<{
  scope: 'branch'
  code: typeof GENERATION_V2_BRANCH_RESTRICTION_CODE
}>

/**
 * Branches whose operation recovery could neither recover nor safely end
 * (R2-06). Those rows keep their branch lock, so only these branches are
 * restricted; every other branch and conversation stays fully usable.
 */
export function readGenerationRecoveryBranchRestrictionsV2(
  db: BetterSqlite3.Database,
  result: GenerationOrphanRecoveryResultV2,
): ReadonlyMap<string, GenerationV2BranchIntegrityRestriction> {
  const restrictions = new Map<string, GenerationV2BranchIntegrityRestriction>()
  const restriction = Object.freeze({ scope: 'branch' as const, code: GENERATION_V2_BRANCH_RESTRICTION_CODE })
  for (const operationId of result.unrecoveredOperationIds) {
    const row = db.prepare('SELECT branch_id AS branchId FROM generation_operation_v2 WHERE operation_id=?')
      .get(operationId) as { branchId: unknown } | undefined
    if (typeof row?.branchId === 'string') restrictions.set(row.branchId, restriction)
  }
  return restrictions
}

export function recoverGenerationOrphansV2(
  db: BetterSqlite3.Database,
  atMs: number = Date.now(),
): GenerationOrphanRecoveryResultV2 {
  if (!Number.isSafeInteger(atMs) || atMs < 0 || db.inTransaction) invalid()
  const executionRepo = new GenerationExecutionV2Repo(db, () => atMs)
  const requestRepo = new GenerationRequestV2Repo(db, () => atMs)
  const graphRepo = new ConversationGraphV2Repo(db)
  const geminiHistoryRepo = new GeminiGenerateContentNativeHistoryV2Repo(db)
  const lmStudioHistoryRepo = new LmStudioOpenResponsesNativeHistoryV2Repo(db)
  const recovered: string[] = []
  const unrecovered: string[] = []
  const failed: string[] = []
    const operationIds = (db.prepare(`SELECT operation_id AS operationId
      FROM generation_operation_v2
      WHERE state IN ('committed', 'streaming')
      ORDER BY operation_id COLLATE BINARY`).all() as { operationId: unknown }[]).map((row) => {
        if (typeof row.operationId !== 'string' || row.operationId.length < 1) invalid()
        return row.operationId
      })
    for (const operationId of operationIds) {
      // Provider completion is already durable. Its local materializer, rather
      // than the interrupted-stream path, owns recovery for this operation.
      if (db.prepare(`SELECT 1 FROM generation_native_completion_receipt_v2
        WHERE operation_id=? AND materialization_state='pending' LIMIT 1`).get(operationId)) continue
      try {
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
      let operation: GenerationExecutionOperationBundleV2 | null
      try {
        operation = executionRepo.findOperationInTransaction(context, operationId)
      } catch (error) {
        if (error instanceof GenerationExecutionV2RepoError &&
            (error.code === 'GENERATION_V2_EXECUTION_STATE_INVALID' || error.code === 'GENERATION_V2_EXECUTION_NOT_FOUND')) invalid()
        throw error
      }
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
        JOIN message_v2 AS answer ON answer.message_id=operation.target_answer_id
        WHERE operation.operation_id=?
        ORDER BY request.request_sequence`).all(operationId) as ActiveRow[]
      if (rows.length === 0 && operation.operation.state === 'streaming') {
        const awaiting = db.prepare(`SELECT request.operation_id AS operationId,
          request.answer_root_id AS answerRootId, request.request_sequence AS requestSequence,
          request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS terminalJson, terminal.artifact_hash AS terminalHash,
          history.artifact_json AS artifactJson, history.artifact_hash AS artifactHash
          FROM generation_request_v2 AS request
          JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
          JOIN message_v2 AS answer ON answer.message_id=operation.target_answer_id
          JOIN generation_native_artifact_v2 AS terminal
            ON terminal.operation_id=request.operation_id
            AND terminal.request_sequence=request.request_sequence
            AND terminal.answer_root_id=request.answer_root_id
            AND terminal.artifact_kind='deepseek_stable_terminal_result_v1'
          JOIN generation_native_artifact_v2 AS history
            ON history.operation_id=request.operation_id
            AND history.request_sequence=request.request_sequence
            AND history.answer_root_id=request.answer_root_id
            AND history.artifact_kind='deepseek_stable_ordered_native_messages_v2'
          WHERE request.operation_id=?
            AND request.request_sequence=(SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?)
          `).get(
          operationId, operationId,
        ) as Readonly<Record<string, unknown>> | undefined
        if (awaiting && hasPersistedDeepSeekAwaitingToolStateV2({
          ...awaiting,
          terminalJson: loadRecoveryArtifactJson(db, awaiting, 'terminalJson', 'terminalHash',
            'deepseek_stable_terminal_result_v1', 1),
          artifactJson: loadRecoveryArtifactJson(db, awaiting, 'artifactJson', 'artifactHash',
            'deepseek_stable_ordered_native_messages_v2', 2),
        })) return
        const openRouterAwaiting = db.prepare(`SELECT request.operation_id AS operationId,
          request.answer_root_id AS answerRootId, request.request_sequence AS requestSequence,
          request.state AS requestState,
          answer.status AS answerStatus, terminal.artifact_json AS terminalJson,
          terminal.artifact_hash AS terminalHash, history.artifact_json AS artifactJson,
          history.artifact_hash AS artifactHash
          FROM generation_request_v2 AS request
          JOIN message_v2 AS answer ON answer.message_id=request.answer_root_id
          JOIN generation_native_artifact_v2 AS terminal ON terminal.operation_id=request.operation_id
            AND terminal.request_sequence=request.request_sequence AND terminal.answer_root_id=request.answer_root_id
            AND terminal.artifact_kind='openrouter_chat_terminal_result_v1' AND terminal.completion_scope='request_terminal'
          JOIN generation_native_artifact_v2 AS history ON history.operation_id=request.operation_id
            AND history.request_sequence=request.request_sequence AND history.answer_root_id=request.answer_root_id
            AND history.artifact_kind='openrouter_chat_ordered_native_messages_v1' AND history.completion_scope='request_terminal'
          WHERE request.operation_id=? AND request.request_sequence=(
            SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?
          )`).get(
          operationId, operationId,
        ) as Readonly<Record<string, unknown>> | undefined
        if (openRouterAwaiting && hasPersistedOpenRouterAwaitingToolStateV2({
          ...openRouterAwaiting,
          terminalJson: loadRecoveryArtifactJson(db, openRouterAwaiting, 'terminalJson', 'terminalHash',
            'openrouter_chat_terminal_result_v1', 1),
          artifactJson: loadRecoveryArtifactJson(db, openRouterAwaiting, 'artifactJson', 'artifactHash',
            'openrouter_chat_ordered_native_messages_v1', 1),
        })) return
        const anthropicAwaiting = db.prepare(`SELECT request.operation_id AS operationId,
          request.answer_root_id AS answerRootId, request.request_sequence AS requestSequence,
          request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS artifactJson, terminal.artifact_hash AS artifactHash
          FROM generation_request_v2 AS request
          JOIN message_v2 AS answer ON answer.message_id=request.answer_root_id
          JOIN generation_native_artifact_v2 AS terminal ON terminal.operation_id=request.operation_id
            AND terminal.request_sequence=request.request_sequence AND terminal.answer_root_id=request.answer_root_id
            AND terminal.artifact_kind='anthropic_messages_native_history_v1' AND terminal.completion_scope='request_terminal'
          WHERE request.operation_id=? AND request.request_sequence=(
            SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?
          )`).get(operationId, operationId) as Readonly<Record<string, unknown>> | undefined
        if (anthropicAwaiting && hasPersistedAnthropicAwaitingToolStateV2({
          ...anthropicAwaiting,
          artifactJson: loadRecoveryArtifactJson(db, anthropicAwaiting, 'artifactJson', 'artifactHash',
            'anthropic_messages_native_history_v1', 1),
        })) return
        const openAIResponsesAwaiting = db.prepare(`SELECT request.operation_id AS operationId,
          request.answer_root_id AS answerRootId, request.request_sequence AS requestSequence,
          request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS terminalJson, terminal.artifact_hash AS terminalHash,
          history.artifact_json AS historyJson, history.artifact_hash AS historyHash
          FROM generation_request_v2 AS request
          JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
          JOIN message_v2 AS answer ON answer.message_id=operation.target_answer_id
          JOIN generation_native_artifact_v2 AS terminal ON terminal.operation_id=request.operation_id
            AND terminal.request_sequence=request.request_sequence AND terminal.answer_root_id=request.answer_root_id
            AND terminal.artifact_kind='openai_responses_terminal_v1' AND terminal.completion_scope='request_terminal'
          JOIN generation_native_artifact_v2 AS history ON history.operation_id=request.operation_id
            AND history.request_sequence=request.request_sequence AND history.answer_root_id=request.answer_root_id
            AND history.artifact_kind='openai_responses_ordered_native_items_v2' AND history.completion_scope='request_terminal'
          WHERE request.operation_id=? AND request.request_sequence=(
            SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?
          )`).get(
          operationId, operationId,
        ) as Readonly<Record<string, unknown>> | undefined
        if (openAIResponsesAwaiting && hasPersistedOpenAIResponsesAwaitingToolStateV2({
          ...openAIResponsesAwaiting,
          terminalJson: loadRecoveryArtifactJson(db, openAIResponsesAwaiting, 'terminalJson', 'terminalHash',
            'openai_responses_terminal_v1', 1),
          historyJson: loadRecoveryArtifactJson(db, openAIResponsesAwaiting, 'historyJson', 'historyHash',
            'openai_responses_ordered_native_items_v2', 2),
        })) return
        try {
          if (geminiHistoryRepo.readAwaitingToolRecoveryFact(operationId) !== null) return
        } catch (error) {
          if (error instanceof GeminiGenerateContentNativeHistoryV2RepoError &&
              error.code === 'GENERATION_V2_GEMINI_HISTORY_STATE_INVALID') invalid()
          throw error
        }
        try {
          if (lmStudioHistoryRepo.readAwaitingToolRecoveryFact(operationId) !== null) return
        } catch (error) {
          if (error instanceof LmStudioOpenResponsesNativeHistoryV2RepoError &&
              error.code === 'GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID') invalid()
          throw error
        }
        invalid()
      }
      if (rows.length !== 1) invalid()
      const row = rows[0]
      if (row.operationId !== operationId || row.operationState !== operation.operation.state ||
          row.answerStatus !== 'streaming' || !Number.isSafeInteger(row.requestSequence) ||
          (row.requestSequence as number) < 1 || !Number.isSafeInteger(row.openAttemptCount)) invalid()
      const requestState = row.requestState
      const openAttemptCount = row.openAttemptCount as number
      const coherentPrepared = operation.operation.state === 'committed' && requestState === 'prepared' &&
        openAttemptCount === 0
      const coherentContinuationPrepared = operation.operation.state === 'streaming' &&
        requestState === 'prepared' && openAttemptCount === 0
      const coherentStreaming = operation.operation.state === 'streaming' && requestState === 'streaming' &&
        openAttemptCount === 1
      if (!coherentPrepared && !coherentContinuationPrepared && !coherentStreaming) invalid()
      const request = (() => {
        try { return requestRepo.loadExistingForOperation(context, operation, row.requestSequence as number) }
        catch (error) {
          if (error instanceof GenerationRequestV2RepoError &&
              (error.code === 'GENERATION_V2_REQUEST_STATE_INVALID' || error.code === 'GENERATION_V2_REQUEST_NOT_FOUND')) invalid()
          throw error
        }
      })()
      const recoveryAtMs = Math.max(atMs,
        persistedRecoveryTime(db, operationId, operation.operation.targetAnswerId.value))
      if (coherentStreaming) {
        const attempt = db.prepare(`SELECT attempt FROM generation_attempt_v2
          WHERE operation_id=? AND request_sequence=? AND state='open'`).get(
          operationId, row.requestSequence,
        ) as { attempt: unknown } | undefined
        if (!attempt || !Number.isSafeInteger(attempt.attempt) || (attempt.attempt as number) < 1) invalid()
        const transition = executionRepo.terminalizeAttempt(context, {
          key: { operationId, requestSequence: row.requestSequence, attempt: attempt.attempt },
          outcome: { kind: 'process_interrupted', phase: 'mid_stream' },
        }, recoveryAtMs)
        if (transition.kind === 'conflict') {
          throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
        }
      }
      requestRepo.terminalize(context, request, 'failed', recoveryAtMs)
      graphRepo.terminalizeAssistantMessage(
        context, operation.operation.targetAnswerId.value, 'failed', null, recoveryAtMs,
      )
      executionRepo.terminalizeOperation(context, operation, {
        state: 'failed', errorCode: ERROR_CODE, errorMessage: ERROR_MESSAGE,
      }, recoveryAtMs)
      recovered.push(operationId)
      })
      } catch (error) {
        // Preserve incoherent rows and their branch locks. Only a classified
        // local-state failure is isolated; database/I/O failures remain fatal.
        // A corrupt artifact of an operation that can still be read ends that
        // operation alone as failed, keeping its rows (R2-06).
        if (!(error instanceof GenerationOrphanRecoveryV2Error)) throw error
        if (error.code === 'GENERATION_V2_ORPHAN_RECOVERY_ARTIFACT_CORRUPT' &&
            failOperationWithCorruptArtifact(db, executionRepo, graphRepo, operationId, atMs)) {
          failed.push(operationId)
          continue
        }
        unrecovered.push(operationId)
      }
    }
  return Object.freeze({ recovered: recovered.length, operationIds: Object.freeze(recovered),
    unrecoveredOperationIds: Object.freeze(unrecovered), failedOperationIds: Object.freeze(failed) })
}
