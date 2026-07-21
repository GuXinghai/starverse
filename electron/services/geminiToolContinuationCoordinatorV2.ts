import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GeminiGenerateContentNativeHistoryV2Repo } from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  decodeGeminiToolContinuationCommandV2,
  type GeminiToolContinuationCommandV2,
} from '../../src/next/generation-v2/providers/gemini/toolContinuationCommandV2'
import { compileGeminiGenerateContentPreparedRequestV2 } from './geminiGenerateContentPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export class GeminiToolContinuationCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_TOOL_CONTINUATION_STATE_INVALID'
    | 'GENERATION_V2_GEMINI_TOOL_CONTINUATION_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'GeminiToolContinuationCoordinatorV2Error'
  }
}
function invalid(): never {
  throw new GeminiToolContinuationCoordinatorV2Error('GENERATION_V2_GEMINI_TOOL_CONTINUATION_STATE_INVALID')
}

export function createGeminiToolContinuationCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new GeminiGenerateContentNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function replay(command: GeminiToolContinuationCommandV2): GenerationTextCommandResultV2 | null {
    const requestSequence = command.priorRequestSequence + 1
    if (!executionRepo.findOperation(command.operationId.value) || !input.db.prepare(
      'SELECT 1 FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?',
    ).get(command.operationId.value, requestSequence)) return null
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || !['streaming', 'completed', 'failed', 'cancelled'].includes(execution.operation.state) ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          command.expectedHeadMessageId.value !== command.answerRootId.value ||
          execution.snapshot.providerBinding.providerId.value !== 'google_ai_studio') invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) invalid()
      const history = historyRepo.loadPersistedRequestHistory(context, command.operationId.value, requestSequence)
      if (history.toolOutputRecords.length !== command.toolOutputs.length ||
          history.toolOutputRecords.some((record, index) => {
            const output = command.toolOutputs[index]
            return record.outputIndex !== index || record.functionName !== output.functionName ||
              stableSerializeProviderRequestV2(record.response) !== stableSerializeProviderRequestV2(output.response) ||
              (record.sideEffectPolicy === 'confirmation_required_each_execution') !== output.userConfirmedExternalSideEffect
          })) invalid()
      const preparedRequest = compileGeminiGenerateContentPreparedRequestV2({ context, execution, history, toolRegistry })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      if (request.continuationCommandFingerprint !== command.requestFingerprint) invalid()
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request })
    })
  }

  return Object.freeze({ submit: async (raw: unknown): Promise<GenerationTextCommandResultV2> => {
    const command = decodeGeminiToolContinuationCommandV2(raw)
    const persisted = replay(command)
    if (persisted) return persisted
    const credential = await input.credentialService.getStatus('google_ai_studio')
    if (!credential.configured || !credential.credentialScopeId) {
      throw new GeminiToolContinuationCoordinatorV2Error('GENERATION_V2_GEMINI_TOOL_CONTINUATION_CREDENTIAL_INVALID')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.state !== 'streaming' ||
          execution.operation.branchId.value !== command.branchId.value ||
          execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
          execution.snapshot.providerBinding.providerId.value !== 'google_ai_studio' ||
          execution.snapshot.providerBinding.protocolContractId.value !== 'gemini-generate-content-v1beta' ||
          execution.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) invalid()
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      if (!toolRegistry) invalid()
      const at = nowMs()
      const history = historyRepo.prepareToolContinuationHistory(context, execution, command, toolRegistry, at)
      const preparedRequest = compileGeminiGenerateContentPreparedRequestV2({ context, execution, history, toolRegistry })
      const existing = input.db.prepare('SELECT 1 FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?')
        .get(command.operationId.value, history.requestSequence)
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
