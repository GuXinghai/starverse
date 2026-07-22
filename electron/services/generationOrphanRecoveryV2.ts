import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GeminiGenerateContentNativeHistoryV2Repo } from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import {
  decodeOpenRouterNativeHistoryArtifactV1,
  hasCompleteOpenRouterAssistantToolCallsV1,
} from '../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import { decodeOpenRouterChatTerminalArtifactV1 } from '../../src/next/generation-v2/providers/openrouter/terminalArtifactV1'
import {
  decodeDeepSeekNativeHistoryArtifactV2,
  hasPendingDeepSeekAssistantToolCallsV2,
} from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import { decodeDeepSeekStableTerminalArtifactV1 } from '../../src/next/generation-v2/providers/deepseek/terminalArtifactV1'
import {
  decodeAnthropicNativeHistoryArtifactV1,
  hasPendingAnthropicToolUseBlocksV1,
} from '../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import {
  decodeOpenAIResponsesContinuationArtifactV2,
  hasPendingOpenAIResponsesFunctionCallsV2,
} from '../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import { decodeOpenAIResponsesTerminalArtifactV1 } from '../../src/next/generation-v2/providers/openai-responses/terminalArtifactV1'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'

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
      if (rows.length === 0 && operation.operation.state === 'streaming') {
        const awaiting = db.prepare(`SELECT request.request_sequence AS requestSequence,
          request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS terminalJson, terminal.artifact_hash AS terminalHash,
          history.artifact_json AS artifactJson, history.artifact_hash AS artifactHash
          FROM generation_request_v2 AS request
          JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
          JOIN message_v2 AS answer ON answer.message_id=operation.result_answer_root_id
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
        if (awaiting && hasPersistedDeepSeekAwaitingToolStateV2(awaiting)) continue
        const openRouterAwaiting = db.prepare(`SELECT request.state AS requestState,
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
        if (openRouterAwaiting && hasPersistedOpenRouterAwaitingToolStateV2(openRouterAwaiting)) continue
        const anthropicAwaiting = db.prepare(`SELECT request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS artifactJson, terminal.artifact_hash AS artifactHash
          FROM generation_request_v2 AS request
          JOIN message_v2 AS answer ON answer.message_id=request.answer_root_id
          JOIN generation_native_artifact_v2 AS terminal ON terminal.operation_id=request.operation_id
            AND terminal.request_sequence=request.request_sequence AND terminal.answer_root_id=request.answer_root_id
            AND terminal.artifact_kind='anthropic_messages_native_history_v1' AND terminal.completion_scope='request_terminal'
          WHERE request.operation_id=? AND request.request_sequence=(
            SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?
          )`).get(operationId, operationId) as Readonly<Record<string, unknown>> | undefined
        if (anthropicAwaiting && hasPersistedAnthropicAwaitingToolStateV2(anthropicAwaiting)) continue
        const openAIResponsesAwaiting = db.prepare(`SELECT request.request_sequence AS requestSequence,
          request.state AS requestState, answer.status AS answerStatus,
          terminal.artifact_json AS terminalJson, terminal.artifact_hash AS terminalHash,
          history.artifact_json AS historyJson, history.artifact_hash AS historyHash
          FROM generation_request_v2 AS request
          JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
          JOIN message_v2 AS answer ON answer.message_id=operation.result_answer_root_id
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
        if (openAIResponsesAwaiting &&
            hasPersistedOpenAIResponsesAwaitingToolStateV2(openAIResponsesAwaiting)) continue
        if (geminiHistoryRepo.readAwaitingToolRecoveryFact(operationId) !== null) continue
        if (lmStudioHistoryRepo.readAwaitingToolRecoveryFact(operationId) !== null) continue
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
