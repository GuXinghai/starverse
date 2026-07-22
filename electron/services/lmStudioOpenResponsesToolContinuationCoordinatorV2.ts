import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { decodeLmStudioOpenResponsesToolContinuationCommandV2,
  type LmStudioOpenResponsesToolContinuationCommandV2 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/toolContinuationCommandV2'
import { compileLmStudioOpenResponsesPreparedRequestV2 } from './lmStudioOpenResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export class LmStudioOpenResponsesToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID') {
    super(code); this.name = 'LmStudioOpenResponsesToolContinuationCoordinatorV2Error'
  }
}

export function createLmStudioOpenResponsesToolContinuationCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new LmStudioOpenResponsesNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const profileRepo = new LocalEndpointProfileV2Repo(input.db, nowMs)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const invalid = (): never => { throw new LmStudioOpenResponsesToolContinuationCoordinatorV2Error(
    'GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID') }

  function replayPersisted(command: LmStudioOpenResponsesToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    const requestSequence = command.priorRequestSequence + 1
    const persisted = input.db.prepare('SELECT 1 AS value FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?')
      .get(command.operationId.value, requestSequence) as { value: unknown } | undefined
    if (!persisted) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new LmStudioOpenResponsesToolContinuationCoordinatorV2Error('GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID')
      if (!['streaming', 'completed', 'failed', 'cancelled'].includes(execution.operation.state) ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          command.expectedHeadMessageId.value !== command.answerRootId.value) invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) throw new LmStudioOpenResponsesToolContinuationCoordinatorV2Error('GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID')
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, requestSequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length || history.toolOutputRecords.some((record, index) => {
        const output = command.toolOutputs[index]
        return record.toolCallId !== output.toolCallId || record.content !== output.content ||
          (record.sideEffectPolicy === 'confirmation_required_each_execution') !== output.userConfirmedExternalSideEffect
      })) invalid()
      const profile = profileRepo.get(execution.snapshot.providerBinding.endpointProfileId.value)
      const preparedRequest = compileLmStudioOpenResponsesPreparedRequestV2({ context, execution, profile, history, toolRegistry })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request })
    })
  }

  return Object.freeze({ submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
    const command = decodeLmStudioOpenResponsesToolContinuationCommandV2(raw)
    const replay = replayPersisted(command); if (replay) return replay
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new LmStudioOpenResponsesToolContinuationCoordinatorV2Error('GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID')
      if (execution.operation.state !== 'streaming' ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          execution.snapshot.providerBinding.providerId.value !== 'lmstudio' ||
          execution.snapshot.providerBinding.protocolContractId.value !== 'lmstudio-openresponses' ||
          execution.snapshot.providerBinding.operation !== 'text') invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) throw new LmStudioOpenResponsesToolContinuationCoordinatorV2Error('GENERATION_V2_LMSTUDIO_TOOL_CONTINUATION_STATE_INVALID')
      const at = nowMs()
      const history = historyRepo.prepareToolContinuationHistory(context, execution, command, toolRegistry, at)
      const profile = profileRepo.get(execution.snapshot.providerBinding.endpointProfileId.value)
      const preparedRequest = compileLmStudioOpenResponsesPreparedRequestV2({ context, execution, profile, history, toolRegistry })
      const existing = input.db.prepare('SELECT 1 AS value FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?')
        .get(command.operationId.value, history.requestSequence) as { value: unknown } | undefined
      const request = existing ? requestRepo.replayPrepared(context, execution, preparedRequest)
        : requestRepo.createContinuationPrepared(context, execution, preparedRequest, command.requestFingerprint)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      historyRepo.persistToolContinuationOutputs(context, history, request, at, !existing)
      return issueGenerationTextCommandResultV2({ kind: existing ? 'idempotent_replay' : 'created', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request })
    })
  } })
}
