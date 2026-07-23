import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { AnthropicMessagesFileDescriptorV2Repo } from '../../infra/db/repo/anthropicMessagesFileDescriptorV2Repo'
import { AnthropicNativeHistoryV2Repo } from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  decodeAnthropicPlainTextInitialSendCommandV2,
  type AnthropicPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/anthropic/plainTextInitialSendCommandV2'
import { readVerifiedAnthropicEndpointProfileV2 } from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { withVerifiedAnthropicGenerationAuthoritiesV2 } from './anthropicGenerationAuthorityV2Service'
import { createAnthropicModelEvidenceV2Service } from './anthropicModelEvidenceV2Service'
import { compileAnthropicMessagesPreparedRequestV2 } from './anthropicMessagesPreparedRequestCompilerV2'
import { preflightAnthropicMessagesAttachmentDescriptorsV2 } from './anthropicMessagesAttachmentPreflightV2'
import { commitVerifiedAnthropicPlainTextInitialSnapshotV2 } from './anthropicPlainTextSnapshotCommitV2'
import {
  issueGenerationTextCommandResultV2,
  isGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from './generationTextCommandResultV2'
import {
  loadGenerationSnapshotToolRegistryAuthorityV2,
  resolveGenerationToolRegistryAuthorityV2,
} from './generationToolRegistryAuthorityV2'

export type AnthropicPlainTextInitialSendResultV2 = GenerationTextCommandResultV2

export function isAnthropicPlainTextInitialSendResultV2(
  value: unknown,
): value is AnthropicPlainTextInitialSendResultV2 {
  return isGenerationTextCommandResultV2(value) &&
    value.execution.operation.actionKind === 'initial_send' &&
    value.preparedRequest.providerId === 'anthropic'
}

export function createAnthropicPlainTextInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  createGraphId?: (kind: 'question' | 'answer') => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createGraphId = input.createGraphId ?? ((kind: 'question' | 'answer') => `${kind}:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new AnthropicNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const descriptorRepo = new AnthropicMessagesFileDescriptorV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const modelEvidenceService = createAnthropicModelEvidenceV2Service({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    nowMs,
  })
  const endpointProfile = readVerifiedAnthropicEndpointProfileV2()

  function replay(command: AnthropicPlainTextInitialSendCommandV2): AnthropicPlainTextInitialSendResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'initial_send' ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'anthropic') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== 'initial_send' ||
          execution.operation.commandFingerprint !== command.requestFingerprint ||
          execution.snapshot.providerBinding.providerId.value !== 'anthropic') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      return issueGenerationTextCommandResultV2({
        kind: 'idempotent_replay',
        execution,
        projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest,
        request: requestRepo.replayPrepared(context, execution, preparedRequest),
      })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{
      command: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      signal?: AbortSignal
    }>): Promise<AnthropicPlainTextInitialSendResultV2> => {
      const command = decodeAnthropicPlainTextInitialSendCommandV2(request.command)
      const existing = replay(command)
      if (existing) return existing
      try {
        const attachmentDescriptors = await preflightAnthropicMessagesAttachmentDescriptorsV2({
          db: input.db, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore, descriptorRepo,
          credentialService: input.credentialService, fetchImpl: input.fetchImpl,
          commandAttachments: command.commandAttachments,
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId, signal: request.signal,
        })
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
                    raced.operation.commandFingerprint !== command.requestFingerprint ||
                    raced.snapshot.providerBinding.providerId.value !== 'anthropic') {
                  throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
                }
                const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
                const preparedRequest = compileAnthropicMessagesPreparedRequestV2({
                  context,
                  execution: raced,
                  history,
                  toolRegistry,
                  attachmentRepo,
                  attachmentBlobStore: input.attachmentBlobStore,
                })
                return issueGenerationTextCommandResultV2({
                  kind: 'idempotent_replay',
                  execution: raced,
                  projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                    context,
                    command.operationId.value,
                  ),
                  preparedRequest,
                  request: requestRepo.replayPrepared(context, raced, preparedRequest),
                })
              }
              const pending = graphRepo.beginInitialTurn(context, {
                operationId: command.operationId.value,
                branchId: command.branchId.value,
                expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null,
                questionId: createGraphId('question'),
                answerRootId: createGraphId('answer'),
                userBody: command.userBody,
                createdAtMs: nowMs(),
              })
              return withSynchronousGenerationCommandFactsAuthorityV2(
                context,
                configRepo,
                attachmentRepo,
                pending.conversationId.value,
                command.commandAttachments,
                undefined,
                (commandFacts) => {
                  const toolRegistry = resolveGenerationToolRegistryAuthorityV2(
                    context,
                    toolRegistryRepo,
                    commandFacts,
                  )
                  return withVerifiedAnthropicGenerationAuthoritiesV2({
                    context,
                    modelEvidence,
                    commandFacts,
                    toolRegistry,
                    operation: 'text',
                    use: ({ binding, capability }) => {
                      const persisted = commitVerifiedAnthropicPlainTextInitialSnapshotV2({
                        context,
                        executionRepo,
                        capabilityRepo,
                        pending,
                        command,
                        commandFacts,
                        binding,
                        capability,
                        toolRegistry,
                        attachmentDescriptors,
                      })
                      graphRepo.commitInitialTurnProjection(context, pending)
                      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                      const preparedRequest = compileAnthropicMessagesPreparedRequestV2({
                        context,
                        execution: persisted.bundle,
                        history,
                        toolRegistry,
                        attachmentRepo,
                        attachmentBlobStore: input.attachmentBlobStore,
                      })
                      return issueGenerationTextCommandResultV2({
                        kind: 'created',
                        execution: persisted.bundle,
                        projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                          context,
                          command.operationId.value,
                        ),
                        preparedRequest,
                        request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest),
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
