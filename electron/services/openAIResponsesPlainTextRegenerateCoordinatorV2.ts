import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { OpenAIResponsesFileDescriptorV2Repo } from '../../infra/db/repo/openAIResponsesFileDescriptorV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import {
  decodeOpenAIResponsesPlainTextRegenerateCommandV2,
  type OpenAIResponsesPlainTextRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/openai-responses/plainTextRegenerateCommandV2'
import { projectOpenAIResponsesCommandAttachmentsV2 } from '../../src/next/generation-v2/providers/openai-responses/commandAttachmentsV2'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { withVerifiedOpenAIResponsesGenerationAuthoritiesV2 } from './openAIResponsesGenerationAuthorityV2Service'
import { compileOpenAIResponsesPreparedRequestV2 } from './openAIResponsesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { commitVerifiedOpenAIResponsesPlainTextRegenerateSnapshotV2 } from './openAIResponsesPlainTextSnapshotCommitV2'
import { preflightOpenAIResponsesAttachmentDescriptorsV2 } from './openAIResponsesAttachmentPreflightV2'
import {
  loadGenerationSnapshotToolRegistryAuthorityV2,
  resolveGenerationToolRegistryAuthorityV2,
} from './generationToolRegistryAuthorityV2'

export function createOpenAIResponsesPlainTextRegenerateCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
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
  const descriptorRepo = new OpenAIResponsesFileDescriptorV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const modelEvidenceService = createActiveCatalogModelAuthorityV2Service({ db: input.db, credentialService: input.credentialService })
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
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileOpenAIResponsesPreparedRequestV2({ context, execution, history, toolRegistry })
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
        const attachmentDescriptors = await preflightOpenAIResponsesAttachmentDescriptorsV2({
          db: input.db, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore, descriptorRepo,
          credentialService: input.credentialService, fetchImpl: input.fetchImpl,
          commandAttachments: command.commandAttachments,
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId, signal: request.signal,
        })
        return await modelEvidenceService.withExactActiveModel({ providerKey: 'openai_responses',
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          endpointProfile, modelId: command.modelId,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
            const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
            if (raced) {
              if (raced.operation.actionKind !== 'regenerate_question' ||
                  raced.operation.commandFingerprint !== command.requestFingerprint ||
                  raced.snapshot.providerBinding.providerId.value !== 'openai_responses') {
                throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
              }
              const history = historyRepo.loadRequestHistory(context, command.operationId.value)
              const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
              const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
                context, execution: raced, history, toolRegistry,
              })
              return issueGenerationTextCommandResultV2({
                kind: 'idempotent_replay', execution: raced,
                projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
                preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest),
              })
            }
            const pending = graphRepo.beginAnswerAction(context, {
              operationId: command.operationId.value, actionKind: 'regenerate_question',
              sourceBranchId: command.sourceBranchId.value, questionId: command.questionId.value,
              sourceAnswerId: command.sourceAnswerId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
              answerRootId: createAnswerId(), createdAtMs: nowMs(),
            })
            return withSynchronousGenerationCommandFactsAuthorityV2(
              context, configRepo, attachmentRepo, pending.conversationId.value,
              projectOpenAIResponsesCommandAttachmentsV2(command.commandAttachments), undefined,
              (commandFacts) => {
                const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, commandFacts)
                return withVerifiedOpenAIResponsesGenerationAuthoritiesV2({
                context, modelEvidence, commandFacts, toolRegistry, operation: 'text',
                use: ({ binding, capability }) => {
                  const persisted = commitVerifiedOpenAIResponsesPlainTextRegenerateSnapshotV2({
                    context, executionRepo, capabilityRepo, pending, command, commandFacts, binding, capability,
                    toolRegistry, attachmentDescriptors,
                  })
                  graphRepo.commitAnswerActionProjection(context, pending)
                  const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                  const preparedRequest = compileOpenAIResponsesPreparedRequestV2({
                    context, execution: persisted.bundle, history, toolRegistry,
                  })
                  return issueGenerationTextCommandResultV2({
                    kind: 'created', execution: persisted.bundle,
                    projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
                    preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest),
                  })
                },
              })},
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
