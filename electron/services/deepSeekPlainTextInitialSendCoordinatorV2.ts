import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import {
  ConversationGraphV2Repo,
} from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import {
  GenerationRequestV2Repo,
} from '../../infra/db/repo/generationRequestV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeDeepSeekPlainTextInitialSendCommandV2,
  type DeepSeekPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextInitialSendCommandV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { createDeepSeekStableModelEvidenceV2Service } from './deepSeekStableModelEvidenceV2Service'
import { withVerifiedDeepSeekStableGenerationAuthoritiesV2 } from './deepSeekStableGenerationAuthorityV2Service'
import {
  loadGenerationSnapshotToolRegistryAuthorityV2,
  resolveGenerationToolRegistryAuthorityV2,
} from './generationToolRegistryAuthorityV2'
import { commitVerifiedDeepSeekPlainTextInitialSnapshotV2 } from './deepSeekPlainTextSnapshotCommitV2'
import { compileDeepSeekInitialPreparedRequestV2 } from './deepSeekInitialPreparedRequestCompilerV2'
import {
  issueGenerationTextCommandResultV2,
  isGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from './generationTextCommandResultV2'

export type DeepSeekPlainTextInitialSendResultV2 = GenerationTextCommandResultV2

function issueInitialSendResultV2(
  value: Omit<DeepSeekPlainTextInitialSendResultV2, never>,
): DeepSeekPlainTextInitialSendResultV2 {
  return issueGenerationTextCommandResultV2(value)
}

export function isDeepSeekPlainTextInitialSendResultV2(
  value: unknown,
): value is DeepSeekPlainTextInitialSendResultV2 {
  return isGenerationTextCommandResultV2(value) && value.execution.operation.actionKind === 'initial_send'
}

export function createDeepSeekPlainTextInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
  createGraphId?: (kind: 'question' | 'answer') => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createGraphId = input.createGraphId ?? ((kind: 'question' | 'answer') => `${kind}:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new DeepSeekNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const modelEvidenceService = createDeepSeekStableModelEvidenceV2Service({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs,
  })
  const endpointProfile = readVerifiedDeepSeekStableEndpointProfileV2()

  function replay(command: DeepSeekPlainTextInitialSendCommandV2): DeepSeekPlainTextInitialSendResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'initial_send' ||
        observed.operation.commandFingerprint !== command.requestFingerprint) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== 'initial_send' ||
          execution.operation.commandFingerprint !== command.requestFingerprint) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadInitialSendHistory(context, command.operationId.value)
      const preparedRequest = compileDeepSeekInitialPreparedRequestV2({
        context, execution, history,
        toolRegistry: loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution),
      })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      return issueInitialSendResultV2({
        kind: 'idempotent_replay' as const,
        execution,
        projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest,
        request,
      })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{
      command: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      signal?: AbortSignal
    }>): Promise<DeepSeekPlainTextInitialSendResultV2> => {
      const command = decodeDeepSeekPlainTextInitialSendCommandV2(request.command)
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
                if (raced.operation.actionKind !== 'initial_send' ||
                    raced.operation.commandFingerprint !== command.requestFingerprint) {
                  throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
                }
                const history = historyRepo.loadInitialSendHistory(context, command.operationId.value)
                const preparedRequest = compileDeepSeekInitialPreparedRequestV2({
                  context, execution: raced, history,
                  toolRegistry: loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced),
                })
                const persistedRequest = requestRepo.replayPrepared(context, raced, preparedRequest)
                return issueInitialSendResultV2({
                  kind: 'idempotent_replay' as const,
                  execution: raced,
                  projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                    context, command.operationId.value,
                  ),
                  preparedRequest,
                  request: persistedRequest,
                })
              }
              const createdAtMs = nowMs()
              const pending = graphRepo.beginInitialTurn(context, {
                operationId: command.operationId.value,
                branchId: command.branchId.value,
                expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null,
                questionId: createGraphId('question'),
                answerRootId: createGraphId('answer'),
                userBody: command.userBody,
                createdAtMs,
              })
              return withSynchronousGenerationCommandFactsAuthorityV2(
                context, configRepo, attachmentRepo, pending.conversationId.value, [], undefined,
                (commandFacts) => {
                  const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, commandFacts)
                  return withVerifiedDeepSeekStableGenerationAuthoritiesV2({
                  context, modelEvidence, commandFacts, operation: 'text',
                  toolRegistry,
                  use: (authorities) => {
                    const persisted = commitVerifiedDeepSeekPlainTextInitialSnapshotV2({
                      context,
                      executionRepo,
                      capabilityRepo,
                      pending,
                      command,
                      commandFacts,
                      binding: authorities.binding,
                      capability: authorities.capability,
                      toolRegistry,
                    })
                    graphRepo.commitInitialTurnProjection(context, pending)
                    const history = historyRepo.loadInitialSendHistory(context, command.operationId.value)
                    const preparedRequest = compileDeepSeekInitialPreparedRequestV2({
                      context, execution: persisted.bundle, history, toolRegistry,
                    })
                    const persistedRequest = requestRepo.createPrepared(
                      context, persisted.bundle, preparedRequest,
                    )
                    return issueInitialSendResultV2({
                      kind: 'created' as const,
                      execution: persisted.bundle,
                      projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                        context, command.operationId.value,
                      ),
                      preparedRequest,
                      request: persistedRequest,
                    })
                  },
                  })
                },
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
