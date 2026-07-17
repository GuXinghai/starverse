import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeDeepSeekToolContinuationCommandV2,
  type DeepSeekToolContinuationCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/toolContinuationCommandV2'
import { compileDeepSeekPreparedRequestV2 } from './deepSeekInitialPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadDeepSeekSnapshotToolRegistryAuthorityV2 } from './deepSeekToolRegistryAuthorityV2'

export class DeepSeekToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'DeepSeekToolContinuationCoordinatorV2Error'
  }
}

export function createDeepSeekToolContinuationCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new DeepSeekNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function replayPersisted(command: DeepSeekToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    const requestSequence = command.priorRequestSequence + 1
    const persisted = input.db.prepare(`SELECT 1 AS value FROM generation_request_v2
      WHERE operation_id=? AND request_sequence=?`).get(
      command.operationId.value, requestSequence,
    ) as { value: unknown } | undefined
    if (!persisted) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || !['streaming', 'completed', 'failed', 'cancelled'].includes(execution.operation.state) ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          command.expectedHeadMessageId.value !== command.answerRootId.value) {
        throw new DeepSeekToolContinuationCoordinatorV2Error(
          'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
        )
      }
      const toolRegistry = loadDeepSeekSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) {
        throw new DeepSeekToolContinuationCoordinatorV2Error(
          'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
        )
      }
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, requestSequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length ||
          history.toolOutputRecords.some((record, index) => {
            const output = command.toolOutputs[index]
            return record.toolCallId !== output.toolCallId || record.content !== output.content ||
              (record.sideEffectPolicy === 'confirmation_required_each_execution') !==
                output.userConfirmedExternalSideEffect
          })) {
        throw new DeepSeekToolContinuationCoordinatorV2Error(
          'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
        )
      }
      const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution, history, toolRegistry })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) {
        throw new DeepSeekToolContinuationCoordinatorV2Error(
          'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
        )
      }
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request,
      })
    })
  }

  return Object.freeze({
    submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
      const command = decodeDeepSeekToolContinuationCommandV2(raw)
      const persistedReplay = replayPersisted(command)
      if (persistedReplay) return persistedReplay
      const status = await input.credentialService.getStatus('deepseek')
      if (!status.configured) {
        throw new DeepSeekToolContinuationCoordinatorV2Error(
          'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_CREDENTIAL_INVALID',
        )
      }
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
        if (!execution ||
            execution.operation.branchId.value !== command.branchId.value ||
            execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
            execution.snapshot.providerBinding.providerId.value !== 'deepseek' ||
            execution.snapshot.providerBinding.operation !== 'text' ||
            execution.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) {
          throw new DeepSeekToolContinuationCoordinatorV2Error(
            'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
          )
        }
        const toolRegistry = loadDeepSeekSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
        if (!toolRegistry) {
          throw new DeepSeekToolContinuationCoordinatorV2Error(
            'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
          )
        }
        if (execution.operation.state !== 'streaming') {
          throw new DeepSeekToolContinuationCoordinatorV2Error(
            'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
          )
        }
        const at = nowMs()
        const history = historyRepo.prepareToolContinuationHistory(
          context, execution, command, toolRegistry, at,
        )
        const preparedRequest = compileDeepSeekPreparedRequestV2({
          context, execution, history, toolRegistry,
        })
        const existing = input.db.prepare(`SELECT 1 AS value FROM generation_request_v2
          WHERE operation_id=? AND request_sequence=?`).get(
          command.operationId.value, history.requestSequence,
        ) as { value: unknown } | undefined
        const request = existing
          ? requestRepo.replayPrepared(context, execution, preparedRequest)
          : requestRepo.createContinuationPrepared(
              context, execution, preparedRequest, command.requestFingerprint,
            )
        if (request.continuationCommandFingerprint !== command.requestFingerprint) {
          throw new DeepSeekToolContinuationCoordinatorV2Error(
            'GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_STATE_INVALID',
          )
        }
        historyRepo.persistToolContinuationOutputs(context, history, request, at, !existing)
        return issueGenerationTextCommandResultV2({
          kind: existing ? 'idempotent_replay' : 'created',
          execution,
          projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
          preparedRequest,
          request,
        })
      })
    },
  })
}
