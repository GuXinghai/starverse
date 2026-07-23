import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { AnthropicNativeHistoryV2Repo } from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { decodeAnthropicToolContinuationCommandV2, type AnthropicToolContinuationCommandV2 } from '../../src/next/generation-v2/providers/anthropic/toolContinuationCommandV2'
import { compileAnthropicMessagesPreparedRequestV2 } from './anthropicMessagesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export class AnthropicToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_STATE_INVALID' | 'GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_CREDENTIAL_INVALID') {
    super(code); this.name = 'AnthropicToolContinuationCoordinatorV2Error'
  }
}
function invalid(): never { throw new AnthropicToolContinuationCoordinatorV2Error('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_STATE_INVALID') }

export function createAnthropicToolContinuationCoordinatorV2(input: Readonly<{ db: BetterSqlite3.Database; credentialService: Epoch2RuntimeCredentialService; nowMs?: () => number; attachmentBlobStore?: Epoch2AttachmentBlobStoreV2 }>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new AnthropicNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  function replay(command: AnthropicToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    const sequence = command.priorRequestSequence + 1
    if (!executionRepo.findOperation(command.operationId.value) || !input.db.prepare('SELECT 1 FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?').get(command.operationId.value, sequence)) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.state !== 'streaming' || execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value || command.expectedHeadMessageId.value !== command.answerRootId.value ||
          execution.snapshot.providerBinding.providerId.value !== 'anthropic') invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) invalid()
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, sequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length || history.toolOutputRecords.some((record, index) => {
        const output = command.toolOutputs[index]
        return record.toolUseId !== output.toolUseId || record.content !== output.content || record.isError !== output.isError ||
          (record.sideEffectPolicy === 'none'
            ? output.userConfirmedExternalSideEffect || record.confirmationState !== 'not_required' || record.confirmedAtMs !== null
            : !output.userConfirmedExternalSideEffect || record.confirmationState !== 'user_confirmed' || record.confirmedAtMs === null)
      })) invalid()
      const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest, request })
    })
  }
  return Object.freeze({ submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
    const command = decodeAnthropicToolContinuationCommandV2(raw)
    const prior = replay(command); if (prior) return prior
    const status = await input.credentialService.getStatus('anthropic')
    if (!status.configured) throw new AnthropicToolContinuationCoordinatorV2Error('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_CREDENTIAL_INVALID')
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.state !== 'streaming' || execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value || execution.snapshot.providerBinding.providerId.value !== 'anthropic' ||
          execution.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) invalid()
      const at = nowMs()
      const history = historyRepo.prepareToolContinuationHistory(context, execution, command, toolRegistry, at)
      const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      const existing = input.db.prepare('SELECT 1 FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?').get(command.operationId.value, history.requestSequence)
      const request = existing ? requestRepo.replayPrepared(context, execution, preparedRequest) : requestRepo.createContinuationPrepared(context, execution, preparedRequest, command.requestFingerprint)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      historyRepo.persistToolContinuationOutputs(context, history, request, at, !existing)
      return issueGenerationTextCommandResultV2({ kind: existing ? 'idempotent_replay' : 'created', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest, request })
    })
  } })
}
