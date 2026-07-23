import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GeminiGenerateContentNativeHistoryV2Repo } from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { decodeGeminiPlainTextEditResendCommandV2, type GeminiPlainTextEditResendCommandV2 } from '../../src/next/generation-v2/providers/gemini/plainTextActionCommandsV2'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { createGeminiModelEvidenceV2Service } from './geminiModelEvidenceV2Service'
import { withVerifiedGeminiGenerateContentGenerationAuthoritiesV2 } from './geminiGenerateContentGenerationAuthorityV2Service'
import { compileGeminiGenerateContentPreparedRequestV2 } from './geminiGenerateContentPreparedRequestCompilerV2'
import { commitVerifiedGeminiPlainTextEditResendSnapshotV2 } from './geminiPlainTextSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2, resolveGenerationToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'

export function createGeminiPlainTextEditResendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
  createQuestionId?: () => string
  createAnswerId?: () => string
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createQuestionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const historyRepo = new GeminiGenerateContentNativeHistoryV2Repo(input.db)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)
  const evidenceService = createGeminiModelEvidenceV2Service({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs,
  })
  const endpointProfile = readVerifiedGeminiDeveloperApiEndpointProfileV2()

  function replay(command: GeminiPlainTextEditResendCommandV2): GenerationTextCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'edit_resend' ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.protocolContractId.value !== 'gemini-generate-content-v1beta') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const history = historyRepo.loadRequestHistory(context, command.operationId.value)
      const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
      const preparedRequest = compileGeminiGenerateContentPreparedRequestV2({ context, execution, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
        preparedRequest, request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }

  return Object.freeze({ submit: async (request: Readonly<{ command: unknown; expectedCredentialRevision: number;
    expectedCredentialScopeId: CredentialScopeIdV2; signal?: AbortSignal }>): Promise<GenerationTextCommandResultV2> => {
    const command = decodeGeminiPlainTextEditResendCommandV2(request.command)
    const existing = replay(command)
    if (existing) return existing
    try {
      return await evidenceService.withRefreshedExactModelEvidence({ endpointProfile,
        expectedCredentialRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        modelId: command.modelId, signal: request.signal,
        consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.commandFingerprint !== command.requestFingerprint) {
              throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            }
            const history = historyRepo.loadRequestHistory(context, command.operationId.value)
            const toolRegistry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, raced)
            const preparedRequest = compileGeminiGenerateContentPreparedRequestV2({ context, execution: raced, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore })
            return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced,
              projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
              preparedRequest, request: requestRepo.replayPrepared(context, raced, preparedRequest) })
          }
          const pending = graphRepo.beginEditedTurn(context, { operationId: command.operationId.value, mode: command.mode,
            branchId: command.branchId.value, sourceQuestionId: command.sourceQuestionId.value,
            sourceAnswerRootId: command.sourceAnswerRootId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
            questionId: createQuestionId(), answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: nowMs() })
          return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo,
            pending.conversationId.value, projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined,
            (commandFacts) => {
              const toolRegistry = resolveGenerationToolRegistryAuthorityV2(context, toolRegistryRepo, commandFacts)
              return withVerifiedGeminiGenerateContentGenerationAuthoritiesV2({
                context, modelEvidence, commandFacts, toolRegistry,
                use: ({ binding, capability }) => {
                  const persisted = commitVerifiedGeminiPlainTextEditResendSnapshotV2({ context, executionRepo,
                    capabilityRepo, pending, command, commandFacts, binding, capability, toolRegistry })
                  graphRepo.commitEditedTurnProjection(context, pending)
                  const history = historyRepo.loadRequestHistory(context, command.operationId.value)
                  const preparedRequest = compileGeminiGenerateContentPreparedRequestV2({
                    context, execution: persisted.bundle, history, toolRegistry, attachmentRepo, attachmentBlobStore: input.attachmentBlobStore,
                  })
                  return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
                    projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
                    preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
                },
              })
            },
          )
        }) })
    } catch (error) {
      const winner = replay(command)
      if (winner) return winner
      throw error
    }
  } })
}
