import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { AnthropicMessagesFileDescriptorV2Repo } from '../../infra/db/repo/anthropicMessagesFileDescriptorV2Repo'
import { AnthropicNativeHistoryV2Repo } from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { decodeAnthropicPlainTextRegenerateCommandV2, type AnthropicPlainTextRegenerateCommandV2 } from '../../src/next/generation-v2/providers/anthropic/plainTextRegenerateCommandV2'
import { readVerifiedAnthropicEndpointProfileV2 } from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { withVerifiedAnthropicGenerationAuthoritiesV2 } from './anthropicGenerationAuthorityV2Service'
import { CapabilityRuleV2Repo } from '../../infra/db/repo/capabilityRuleV2Repo'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { compileAnthropicMessagesPreparedRequestV2 } from './anthropicMessagesPreparedRequestCompilerV2'
import { preflightAnthropicMessagesAttachmentDescriptorsV2 } from './anthropicMessagesAttachmentPreflightV2'
import { commitVerifiedAnthropicPlainTextRegenerateSnapshotV2 } from './anthropicPlainTextSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2, resolveGenerationToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export function createAnthropicPlainTextRegenerateCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
  createAnswerId?: () => string
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new AnthropicNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const descriptorRepo = new AnthropicMessagesFileDescriptorV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const capabilityRuleRepo = new CapabilityRuleV2Repo(input.db)
  const modelEvidenceService = createActiveCatalogModelAuthorityV2Service({ db: input.db, credentialService: input.credentialService })
  const endpointProfile = readVerifiedAnthropicEndpointProfileV2()

  function replay(command: AnthropicPlainTextRegenerateCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'regenerate_question' ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'anthropic') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution || execution.operation.actionKind !== 'regenerate_question' ||
          execution.operation.commandFingerprint !== command.requestFingerprint ||
          execution.snapshot.providerBinding.providerId.value !== 'anthropic') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      }
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{ command: unknown; expectedCredentialRevision: number; expectedCredentialScopeId: CredentialScopeIdV2; signal?: AbortSignal }>): Promise<GenerationTextCommandResultV2> => {
      const command = decodeAnthropicPlainTextRegenerateCommandV2(request.command)
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
        return await modelEvidenceService.withExactActiveModel({ providerKey: 'anthropic_messages',
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          endpointProfile, modelId: command.modelId,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
            const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
            if (raced) {
              if (raced.operation.actionKind !== 'regenerate_question' || raced.operation.commandFingerprint !== command.requestFingerprint || raced.snapshot.providerBinding.providerId.value !== 'anthropic') {
                throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
              }
              const history = historyRepo.loadRequestHistory(context, command.operationId.value)
              const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
              const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution: raced, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
              return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced,
                projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
                request: requestRepo.replayPrepared(context, raced, preparedRequest) })
            }
            const pending = graphRepo.beginAnswerAction(context, {
              operationId: command.operationId.value, actionKind: 'regenerate_question', sourceBranchId: command.sourceBranchId.value,
              questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
              expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs(),
            })
            return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo, pending.conversationId.value, command.commandAttachments, undefined, (commandFacts) => {
              const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, commandFacts)
              return withVerifiedAnthropicGenerationAuthoritiesV2({ context, modelEvidence, commandFacts, toolRegistry, operation: 'text',
                capabilityRules: capabilityRuleRepo.resolveForIdentity({ providerId: modelEvidence.providerId.value,
                  endpointProfileId: modelEvidence.endpointProfileId.value, nativeModelId: modelEvidence.modelId.value }), use: ({ binding, capability }) => {
                const persisted = commitVerifiedAnthropicPlainTextRegenerateSnapshotV2({ context, executionRepo, capabilityRepo, pending, command, commandFacts, binding, capability, toolRegistry, attachmentDescriptors })
                graphRepo.commitAnswerActionProjection(context, pending)
                const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution: persisted.bundle, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
                return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
                  projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
                  request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
              } })
            })
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
