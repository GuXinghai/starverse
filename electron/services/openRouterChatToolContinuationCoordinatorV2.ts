import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeOpenRouterToolContinuationCommandV2,
  type OpenRouterToolContinuationCommandV2,
} from '../../src/next/generation-v2/providers/openrouter/toolContinuationCommandV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { compileOpenRouterChatPreparedRequestV2 } from './openRouterChatPreparedRequestCompilerV2'

export class OpenRouterChatToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_TOOL_CONTINUATION_STATE_INVALID'
    | 'GENERATION_V2_OPENROUTER_TOOL_CONTINUATION_CREDENTIAL_INVALID') {
    super(code); this.name = 'OpenRouterChatToolContinuationCoordinatorV2Error'
  }
}

export function createOpenRouterChatToolContinuationCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new OpenRouterNativeHistoryV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const stateError = () => new OpenRouterChatToolContinuationCoordinatorV2Error(
    'GENERATION_V2_OPENROUTER_TOOL_CONTINUATION_STATE_INVALID',
  )

  function replayPersisted(command: OpenRouterToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    if (!executionRepo.findOperation(command.operationId.value)) return null
    const requestSequence = command.priorRequestSequence + 1
    const exists = input.db.prepare(`SELECT 1 AS value FROM generation_request_v2
      WHERE operation_id=? AND request_sequence=?`).get(command.operationId.value, requestSequence)
    if (!exists) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || !['streaming', 'completed', 'failed', 'cancelled'].includes(execution.operation.state) ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.targetAnswerId.value !== command.answerRootId.value ||
          command.expectedHeadMessageId.value !== command.answerRootId.value) throw stateError()
      const registry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!registry) throw stateError()
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, requestSequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length || history.toolOutputRecords.some((record, index) => {
        const output = command.toolOutputs[index]
        return record.toolCallId !== output.toolCallId || record.content !== output.content ||
          (record.sideEffectPolicy === 'confirmation_required_each_execution') !== output.userConfirmedExternalSideEffect
      })) throw stateError()
      const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution, history, toolRegistry: registry })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) throw stateError()
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request })
    })
  }

  return Object.freeze({
    submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
      const command = decodeOpenRouterToolContinuationCommandV2(raw)
      const replay = replayPersisted(command)
      if (replay) return replay
      const status = await input.credentialService.getStatus('openrouter')
      if (!status.configured || !status.credentialScopeId) {
        throw new OpenRouterChatToolContinuationCoordinatorV2Error(
          'GENERATION_V2_OPENROUTER_TOOL_CONTINUATION_CREDENTIAL_INVALID',
        )
      }
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
        if (!execution || execution.operation.state !== 'streaming' ||
            execution.operation.branchId.value !== command.branchId.value ||
            execution.operation.targetAnswerId.value !== command.answerRootId.value ||
            execution.snapshot.providerBinding.providerId.value !== 'openrouter' ||
            execution.snapshot.providerBinding.operation !== 'text' ||
            execution.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) throw stateError()
        const registry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
        if (!registry) throw stateError()
        const at = nowMs()
        const history = historyRepo.prepareToolContinuationHistory(context, execution, command, registry, at)
        const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution, history, toolRegistry: registry })
        const exists = input.db.prepare(`SELECT 1 AS value FROM generation_request_v2
          WHERE operation_id=? AND request_sequence=?`).get(command.operationId.value, history.requestSequence)
        const request = exists
          ? requestRepo.replayPrepared(context, execution, preparedRequest)
          : requestRepo.createContinuationPrepared(context, execution, preparedRequest, command.requestFingerprint)
        if (request.continuationCommandFingerprint !== command.requestFingerprint) throw stateError()
        historyRepo.persistToolContinuationOutputs(context, history, request, at, !exists)
        return issueGenerationTextCommandResultV2({ kind: exists ? 'idempotent_replay' : 'created', execution,
          projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
          preparedRequest, request })
      })
    },
  })
}
