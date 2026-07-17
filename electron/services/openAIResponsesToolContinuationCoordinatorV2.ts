import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeOpenAIResponsesToolContinuationCommandV2,
  type OpenAIResponsesToolContinuationCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/toolContinuationCommandV2'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export class OpenAIResponsesToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_TOOL_CONTINUATION_STATE_INVALID'
    | 'GENERATION_V2_OPENAI_TOOL_CONTINUATION_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesToolContinuationCoordinatorV2Error'
  }
}

export function createOpenAIResponsesToolContinuationCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new OpenAIResponsesNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function invalid(): never {
    throw new OpenAIResponsesToolContinuationCoordinatorV2Error(
      'GENERATION_V2_OPENAI_TOOL_CONTINUATION_STATE_INVALID',
    )
  }

  function replayPersisted(command: OpenAIResponsesToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    const requestSequence = command.priorRequestSequence + 1
    const persisted = input.db.prepare('SELECT 1 AS value FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?')
      .get(command.operationId.value, requestSequence) as { value: unknown } | undefined
    if (!persisted) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || !['streaming', 'completed', 'failed', 'cancelled'].includes(execution.operation.state) ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          command.expectedHeadMessageId.value !== command.answerRootId.value) invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) invalid()
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, requestSequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length || history.toolOutputRecords.some((record, index) => {
        const output = command.toolOutputs[index]
        return record.toolCallId !== output.toolCallId || record.content !== output.content ||
          (record.sideEffectPolicy === 'confirmation_required_each_execution') !== output.userConfirmedExternalSideEffect
      })) invalid()
      const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history, toolRegistry })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request,
      })
    })
  }

  return Object.freeze({
    submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
      const command = decodeOpenAIResponsesToolContinuationCommandV2(raw)
      const replay = replayPersisted(command)
      if (replay) return replay
      const status = await input.credentialService.getStatus('openai_responses')
      if (!status.configured) {
        throw new OpenAIResponsesToolContinuationCoordinatorV2Error(
          'GENERATION_V2_OPENAI_TOOL_CONTINUATION_CREDENTIAL_INVALID',
        )
      }
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
        if (!execution || execution.operation.state !== 'streaming' ||
            execution.operation.branchId.value !== command.branchId.value ||
            execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
            execution.snapshot.providerBinding.providerId.value !== 'openai_responses' ||
            execution.snapshot.providerBinding.operation !== 'text' ||
            execution.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) invalid()
        const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
        if (!toolRegistry) invalid()
        const at = nowMs()
        const history = historyRepo.prepareToolContinuationHistory(context, execution, command, toolRegistry, at)
        const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history, toolRegistry })
        const existing = input.db.prepare('SELECT 1 AS value FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?')
          .get(command.operationId.value, history.requestSequence) as { value: unknown } | undefined
        const request = existing
          ? requestRepo.replayPrepared(context, execution, preparedRequest)
          : requestRepo.createContinuationPrepared(context, execution, preparedRequest, command.requestFingerprint)
        if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
        historyRepo.persistToolContinuationOutputs(context, history, request, at, !existing)
        return issueGenerationTextCommandResultV2({
          kind: existing ? 'idempotent_replay' : 'created', execution,
          projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
          preparedRequest, request,
        })
      })
    },
  })
}
