import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { decodeGeminiInteractionsImageInitialCommandV2, type GeminiInteractionsImageInitialCommandV2 } from '../../src/next/generation-v2/providers/gemini/interactionsImageCommandsV2'
import { withVerifiedGeminiInteractionsImageGenerationAuthoritiesV2 } from './geminiInteractionsImageGenerationAuthorityV2Service'
import { commitGeminiInteractionsImageInitialSnapshotV2 } from './geminiInteractionsImageSnapshotCommitV2'
import { compileGeminiInteractionsImagePreparedRequestV2 } from './geminiInteractionsImagePreparedRequestCompilerV2'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { readVerifiedGeminiDeveloperApiEndpointProfileV2 } from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'

export type GeminiInteractionsImageCommandResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: Exclude<ReturnType<GenerationExecutionV2Repo['findOperation']>, null>
  projection: ReturnType<ConversationGraphV2Repo['getGenerationReplayProjectionInTransaction']> |
    ReturnType<ConversationGraphV2Repo['getInitialSendReplayProjectionInTransaction']>
  request: ReturnType<GenerationRequestV2Repo['loadExistingForOperation']>
  preparedRequest?: ReturnType<typeof compileGeminiInteractionsImagePreparedRequestV2>
}>

export function createGeminiInteractionsImageInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createGraphId?: (kind: 'question' | 'answer') => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createGraphId = input.createGraphId ?? ((kind: 'question' | 'answer') => `${kind}:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const catalogAuthorityService = createActiveCatalogModelAuthorityV2Service(input)
  const endpointProfile = readVerifiedGeminiDeveloperApiEndpointProfileV2()

  function replay(command: GeminiInteractionsImageInitialCommandV2): GeminiInteractionsImageCommandResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'initial_send' || observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const prompt = promptForQuestion(input.db, execution.operation.questionId.value)
      const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context, execution, prompt })
      return Object.freeze({ kind: 'idempotent_replay' as const, execution,
        projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
        request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{ command: unknown; expectedCredentialRevision: number;
      expectedCredentialScopeId: CredentialScopeIdV2 }>): Promise<GeminiInteractionsImageCommandResultV2> => {
      const command = decodeGeminiInteractionsImageInitialCommandV2(request.command)
      const existing = replay(command)
      if (existing) return existing
      try {
        return catalogAuthorityService.withExactActiveModel({
          providerKey: 'google_ai_studio', endpointProfile,
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          modelId: command.modelId,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.commandFingerprint !== command.requestFingerprint) {
              throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            }
            const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context, execution: raced,
              prompt: promptForQuestion(input.db, raced.operation.questionId.value) })
            return Object.freeze({ kind: 'idempotent_replay' as const, execution: raced,
              projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
              request: requestRepo.replayPrepared(context, raced, preparedRequest) })
          }
          const pending = graphRepo.beginInitialTurn(context, { operationId: command.operationId.value,
            branchId: command.branchId.value, expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null,
            questionId: createGraphId('question'), answerRootId: createGraphId('answer'), userBody: command.prompt, createdAtMs: nowMs() })
          return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo,
            pending.conversationId.value, projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined,
            (commandFacts) => withVerifiedGeminiInteractionsImageGenerationAuthoritiesV2({ context,
              modelEvidence, modelId: command.modelId.value,
              commandFacts, use: ({ binding, capability }) => {
                const persisted = commitGeminiInteractionsImageInitialSnapshotV2({ context, executionRepo, capabilityRepo,
                  pending, command, commandFacts, binding, capability })
                graphRepo.commitInitialTurnProjection(context, pending)
                const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context,
                  execution: persisted.bundle, prompt: command.prompt })
                return Object.freeze({ kind: 'created' as const, execution: persisted.bundle,
                  projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
                  preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
              },
            }))
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

export function promptForQuestion(db: BetterSqlite3.Database, questionId: string): string {
  const row = db.prepare(`SELECT body.body_text AS prompt FROM message_v2 AS message
    JOIN message_body_v2 AS body ON body.message_id=message.message_id
    WHERE message.message_id=? AND message.role='user'`).get(questionId) as { prompt?: unknown } | undefined
  if (!row || typeof row.prompt !== 'string' || !row.prompt.trim()) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_PROMPT_INVALID')
  return row.prompt
}
