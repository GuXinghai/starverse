import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { decodeOpenAIResponsesPlainTextInitialSendCommandV2, type OpenAIResponsesPlainTextInitialSendCommandV2 } from '../../src/next/generation-v2/providers/openai-responses/plainTextInitialSendCommandV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createOpenAIResponsesModelEvidenceV2Service } from './openAIResponsesModelEvidenceV2Service'
import { withVerifiedOpenAIResponsesGenerationAuthoritiesV2 } from './openAIResponsesGenerationAuthorityV2Service'
import { commitVerifiedOpenAIResponsesPlainTextInitialSnapshotV2 } from './openAIResponsesPlainTextSnapshotCommitV2'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'

export type OpenAIResponsesPlainTextInitialSendResultV2 = GenerationTextCommandResultV2

export function isOpenAIResponsesPlainTextInitialSendResultV2(value: unknown): value is OpenAIResponsesPlainTextInitialSendResultV2 {
  return isGenerationTextCommandResultV2(value) && value.execution.operation.actionKind === 'initial_send' &&
    value.preparedRequest.providerId === 'openai_responses'
}

export function createOpenAIResponsesPlainTextInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createGraphId?: (kind: 'question' | 'answer') => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createGraphId = input.createGraphId ?? ((kind: 'question' | 'answer') => `${kind}:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new OpenAIResponsesNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const modelEvidenceService = createOpenAIResponsesModelEvidenceV2Service({
    db: input.db, credentialService: input.credentialService, nowMs,
  })
  const endpointProfile = readVerifiedOpenAIResponsesEndpointProfileV2()

  function replay(command: OpenAIResponsesPlainTextInitialSendCommandV2): OpenAIResponsesPlainTextInitialSendResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'initial_send' || observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'openai_responses') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.commandFingerprint !== command.requestFingerprint) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history })
      const request = requestRepo.replayPrepared(context, execution, preparedRequest)
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
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
    }>): Promise<OpenAIResponsesPlainTextInitialSendResultV2> => {
      const command = decodeOpenAIResponsesPlainTextInitialSendCommandV2(request.command)
      const existing = replay(command)
      if (existing) return existing
      try {
        return await modelEvidenceService.withRefreshedExactModelEvidence({
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          endpointProfile, modelId: command.modelId, signal: request.signal,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
            const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
            if (raced) {
              if (raced.operation.commandFingerprint !== command.requestFingerprint ||
                  raced.snapshot.providerBinding.providerId.value !== 'openai_responses') {
                throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
              }
              const history = historyRepo.loadRequestHistory(context, command.operationId.value)
              const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution: raced, history })
              return issueGenerationTextCommandResultV2({
                kind: 'idempotent_replay', execution: raced,
                projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
                preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest),
              })
            }
            const pending = graphRepo.beginInitialTurn(context, {
              operationId: command.operationId.value, branchId: command.branchId.value,
              expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null,
              questionId: createGraphId('question'), answerRootId: createGraphId('answer'),
              userBody: command.userBody, createdAtMs: nowMs(),
            })
            return withSynchronousGenerationCommandFactsAuthorityV2(
              context, configRepo, attachmentRepo, pending.conversationId.value, [], undefined,
              (commandFacts) => withVerifiedOpenAIResponsesGenerationAuthoritiesV2({
                context, modelEvidence, commandFacts, operation: 'text',
                use: ({ binding, capability }) => {
                  const persisted = commitVerifiedOpenAIResponsesPlainTextInitialSnapshotV2({
                    context, executionRepo, capabilityRepo, pending, command, commandFacts, binding, capability,
                  })
                  graphRepo.commitInitialTurnProjection(context, pending)
                  const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                  const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
                    context, execution: persisted.bundle, history,
                  })
                  return issueGenerationTextCommandResultV2({
                    kind: 'created', execution: persisted.bundle,
                    projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
                    preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest),
                  })
                },
              }),
            )
          }),
        })
      } catch (error) {
        const winner = replay(command)
        if (winner) return winner
        throw error
      }
    },
  })
}
