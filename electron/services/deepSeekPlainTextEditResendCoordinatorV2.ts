import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeDeepSeekPlainTextEditResendCommandV2,
  type DeepSeekPlainTextEditResendCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextEditResendCommandV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import { createDeepSeekStableModelEvidenceV2Service } from './deepSeekStableModelEvidenceV2Service'
import { withVerifiedDeepSeekStableGenerationAuthoritiesV2 } from './deepSeekStableGenerationAuthorityV2Service'
import { compileDeepSeekPreparedRequestV2 } from './deepSeekInitialPreparedRequestCompilerV2'
import {
  issueDeepSeekPlainTextCommandResultV2,
  type DeepSeekPlainTextCommandResultV2,
} from './deepSeekPlainTextCommandResultV2'
import { commitVerifiedDeepSeekPlainTextEditResendSnapshotV2 } from './deepSeekPlainTextSnapshotCommitV2'

export function createDeepSeekPlainTextEditResendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createQuestionId?: () => string
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createQuestionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new DeepSeekNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const modelEvidenceService = createDeepSeekStableModelEvidenceV2Service({
    db: input.db, credentialService: input.credentialService, nowMs,
  })
  const endpointProfile = readVerifiedDeepSeekStableEndpointProfileV2()

  function replay(command: DeepSeekPlainTextEditResendCommandV2): DeepSeekPlainTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'edit_resend' ||
        observed.operation.commandFingerprint !== command.requestFingerprint) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== 'edit_resend' ||
          execution.operation.commandFingerprint !== command.requestFingerprint) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution, history })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      return issueDeepSeekPlainTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request,
      })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{
      command: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      signal?: AbortSignal
    }>): Promise<DeepSeekPlainTextCommandResultV2> => {
      const command = decodeDeepSeekPlainTextEditResendCommandV2(request.command)
      const existing = replay(command)
      if (existing) return existing
      try {
        return await modelEvidenceService.withRefreshedExactModelEvidence({
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          endpointProfile,
          modelId: command.modelId,
          signal: request.signal,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(
            input.db,
            (context) => {
              const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
              if (raced) {
                if (raced.operation.actionKind !== 'edit_resend' ||
                    raced.operation.commandFingerprint !== command.requestFingerprint) {
                  throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
                }
                const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                const preparedRequest = compileDeepSeekPreparedRequestV2({ context, execution: raced, history })
                const persistedRequest = requestRepo.replayPrepared(context, raced, preparedRequest)
                return issueDeepSeekPlainTextCommandResultV2({
                  kind: 'idempotent_replay', execution: raced,
                  projection: graphRepo.getGenerationReplayProjectionInTransaction(
                    context, command.operationId.value,
                  ),
                  preparedRequest, request: persistedRequest,
                })
              }
              const createdAtMs = nowMs()
              const pending = graphRepo.beginEditedTurn(context, {
                operationId: command.operationId.value,
                mode: command.mode,
                branchId: command.branchId.value,
                sourceQuestionId: command.sourceQuestionId.value,
                sourceAnswerRootId: command.sourceAnswerRootId.value,
                expectedHeadMessageId: command.expectedHeadMessageId.value,
                questionId: createQuestionId(),
                answerRootId: createAnswerId(),
                userBody: command.userBody,
                createdAtMs,
              })
              return withSynchronousGenerationCommandFactsAuthorityV2(
                context, configRepo, attachmentRepo, pending.conversationId.value, [], undefined,
                (commandFacts) => withVerifiedDeepSeekStableGenerationAuthoritiesV2({
                  context, modelEvidence, commandFacts, operation: 'text',
                  use: (authorities) => {
                    const persisted = commitVerifiedDeepSeekPlainTextEditResendSnapshotV2({
                      context, executionRepo, capabilityRepo, pending, command, commandFacts,
                      binding: authorities.binding, capability: authorities.capability,
                    })
                    graphRepo.commitEditedTurnProjection(context, pending)
                    const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                    const preparedRequest = compileDeepSeekPreparedRequestV2({
                      context, execution: persisted.bundle, history,
                    })
                    const persistedRequest = requestRepo.createPrepared(
                      context, persisted.bundle, preparedRequest,
                    )
                    return issueDeepSeekPlainTextCommandResultV2({
                      kind: 'created', execution: persisted.bundle,
                      projection: graphRepo.getGenerationReplayProjectionInTransaction(
                        context, command.operationId.value,
                      ),
                      preparedRequest, request: persistedRequest,
                    })
                  },
                }),
              )
            },
          ),
        })
      } catch (error) {
        const winner = replay(command)
        if (winner) return winner
        throw error
      }
    },
  })
}
