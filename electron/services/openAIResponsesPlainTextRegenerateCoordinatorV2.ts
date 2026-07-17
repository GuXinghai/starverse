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
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeOpenAIResponsesPlainTextRegenerateCommandV2,
  type OpenAIResponsesPlainTextRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextRegenerateCommandV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createOpenAIResponsesModelEvidenceV2Service } from './openAIResponsesModelEvidenceV2Service'
import { withVerifiedOpenAIResponsesGenerationAuthoritiesV2 } from './openAIResponsesGenerationAuthorityV2Service'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { commitVerifiedOpenAIResponsesPlainTextRegenerateSnapshotV2 } from './openAIResponsesPlainTextSnapshotCommitV2'

export function createOpenAIResponsesPlainTextRegenerateCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
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

  function replay(command: OpenAIResponsesPlainTextRegenerateCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'regenerate_question' ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'openai_responses') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== 'regenerate_question' ||
          execution.operation.commandFingerprint !== command.requestFingerprint ||
          execution.snapshot.providerBinding.providerId.value !== 'openai_responses') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history })
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request: requestRepo.replayPrepared(context, execution, preparedRequest),
      })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{
      command: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      signal?: AbortSignal
    }>): Promise<GenerationTextCommandResultV2> => {
      const command = decodeOpenAIResponsesPlainTextRegenerateCommandV2(request.command)
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
              if (raced.operation.actionKind !== 'regenerate_question' ||
                  raced.operation.commandFingerprint !== command.requestFingerprint ||
                  raced.snapshot.providerBinding.providerId.value !== 'openai_responses') {
                throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
              }
              const history = historyRepo.loadRequestHistory(context, command.operationId.value)
              const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution: raced, history })
              return issueGenerationTextCommandResultV2({
                kind: 'idempotent_replay', execution: raced,
                projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
                preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest),
              })
            }
            const pending = graphRepo.beginAnswerAction(context, {
              operationId: command.operationId.value, actionKind: 'regenerate_question',
              branchId: command.branchId.value, questionId: command.questionId.value,
              targetAnswerRootId: null, expectedHeadMessageId: command.expectedHeadMessageId.value,
              answerRootId: createAnswerId(), createdAtMs: nowMs(),
            })
            return withSynchronousGenerationCommandFactsAuthorityV2(
              context, configRepo, attachmentRepo, pending.conversationId.value, [], undefined,
              (commandFacts) => withVerifiedOpenAIResponsesGenerationAuthoritiesV2({
                context, modelEvidence, commandFacts, operation: 'text',
                use: ({ binding, capability }) => {
                  const persisted = commitVerifiedOpenAIResponsesPlainTextRegenerateSnapshotV2({
                    context, executionRepo, capabilityRepo, pending, command, commandFacts, binding, capability,
                  })
                  graphRepo.commitAnswerActionProjection(context, pending)
                  const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                  const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
                    context, execution: persisted.bundle, history,
                  })
                  return issueGenerationTextCommandResultV2({
                    kind: 'created', execution: persisted.bundle,
                    projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
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
