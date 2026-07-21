import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { decodeOpenRouterPlainTextRegenerateCommandV2, type OpenRouterPlainTextRegenerateCommandV2 } from '../../src/next/generation-v2/providers/openrouter/plainTextActionCommandsV2'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import { createOpenRouterChatModelEvidenceV2Service } from './openRouterChatModelEvidenceV2Service'
import { withVerifiedOpenRouterChatGenerationAuthoritiesV2 } from './openRouterChatGenerationAuthorityV2Service'
import { loadGenerationSnapshotToolRegistryAuthorityV2, resolveGenerationToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'
import { compileOpenRouterChatPreparedRequestV2 } from './openRouterChatPreparedRequestCompilerV2'
import { commitVerifiedOpenRouterChatRegenerateSnapshotV2 } from './openRouterChatSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'

export function createOpenRouterChatPlainTextRegenerateCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database; credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number; createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now; const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs); const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new OpenRouterNativeHistoryV2Repo(input.db); const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db); const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db); const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const evidenceService = createOpenRouterChatModelEvidenceV2Service({ credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs })
  const endpointProfile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  function replay(command: OpenRouterPlainTextRegenerateCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value); if (!observed) return null
    if (observed.operation.actionKind !== 'regenerate_question' || observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'openrouter') throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
        request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }
  return Object.freeze({ submit: async (request: Readonly<{ command: unknown; expectedCredentialRevision: number;
    expectedCredentialScopeId: CredentialScopeIdV2; signal?: AbortSignal }>): Promise<GenerationTextCommandResultV2> => {
    const command = decodeOpenRouterPlainTextRegenerateCommandV2(request.command); const existing = replay(command); if (existing) return existing
    try {
      return await evidenceService.withExactModelEvidence({ endpointProfile, expectedCredentialRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId, modelId: command.modelId, signal: request.signal,
        consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) { if (raced.operation.commandFingerprint !== command.requestFingerprint) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            const history = historyRepo.loadRequestHistory(context, command.operationId.value)
            const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
            const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution: raced, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
            return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced,
              projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
              request: requestRepo.replayPrepared(context, raced, preparedRequest) }) }
          const pending = graphRepo.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: 'regenerate_question',
            branchId: command.branchId.value, questionId: command.questionId.value, targetAnswerRootId: null,
            expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs() })
          return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo, pending.conversationId.value,
            projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined, (commandFacts) => {
              const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, commandFacts)
              return withVerifiedOpenRouterChatGenerationAuthoritiesV2({ context, modelEvidence, commandFacts, toolRegistry,
                use: ({ binding, capability }) => {
                  const persisted = commitVerifiedOpenRouterChatRegenerateSnapshotV2({ context, executionRepo, capabilityRepo,
                    pending, command, commandFacts, binding, capability, toolRegistry })
                  graphRepo.commitAnswerActionProjection(context, pending)
                  const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                  const preparedRequest = compileOpenRouterChatPreparedRequestV2({ context, execution: persisted.bundle, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
                  return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
                    projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
                    request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
                } }) })
        }) })
    } catch (error) { const winner = replay(command); if (winner) return winner; throw error }
  } })
}
