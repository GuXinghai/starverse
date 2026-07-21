import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo, isPendingAnswerActionForContextV2, isPendingEditedTurnForContextV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import {
  decodeGeminiInteractionsImageEditResendCommandV2,
  decodeGeminiInteractionsImageRegenerateCommandV2,
  decodeGeminiInteractionsImageRetryCommandV2,
  type GeminiInteractionsImageEditResendCommandV2,
  type GeminiInteractionsImageRegenerateCommandV2,
  type GeminiInteractionsImageRetryCommandV2,
} from '../../src/next/generation-v2/providers/gemini/interactionsImageCommandsV2'
import { withVerifiedGeminiInteractionsImageGenerationAuthoritiesV2 } from './geminiInteractionsImageGenerationAuthorityV2Service'
import { compileGeminiInteractionsImagePreparedRequestV2 } from './geminiInteractionsImagePreparedRequestCompilerV2'
import { commitGeminiInteractionsImageCurrentSnapshotV2, commitGeminiInteractionsImageRetrySnapshotV2 } from './geminiInteractionsImageSnapshotCommitV2'
import { promptForQuestion, type GeminiInteractionsImageCommandResultV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'

type CurrentCommand = GeminiInteractionsImageRegenerateCommandV2 | GeminiInteractionsImageEditResendCommandV2

export function createGeminiInteractionsImageActionCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createQuestionId?: () => string
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const questionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const answerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)

  function replay(operationId: string, fingerprint: string): GeminiInteractionsImageCommandResultV2 | null {
    const observed = executionRepo.findOperation(operationId)
    if (!observed) return null
    if (observed.operation.commandFingerprint !== fingerprint ||
        observed.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta' ||
        observed.snapshot.providerBinding.operation !== 'image_generate') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, operationId)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context, execution,
        prompt: promptForQuestion(input.db, execution.operation.questionId.value) })
      return Object.freeze({ kind: 'idempotent_replay' as const, execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, operationId), preparedRequest,
        request: requestRepo.replayPrepared(context, execution, preparedRequest) })
    })
  }

  async function retry(raw: unknown): Promise<GeminiInteractionsImageCommandResultV2> {
    const command = decodeGeminiInteractionsImageRetryCommandV2(raw)
    const existing = replay(command.operationId.value, command.requestFingerprint)
    if (existing) return existing
    const credential = await input.credentialService.getStatus('google_ai_studio')
    if (!credential.configured || !credential.credentialScopeId) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_CREDENTIAL_INVALID')
    const targetRow = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
      .get(command.targetAnswerRootId.value) as { operationId?: unknown } | undefined
    if (!targetRow || typeof targetRow.operationId !== 'string') throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_RETRY_TARGET_INVALID')
    const targetPreflight = executionRepo.findOperation(targetRow.operationId)
    if (!targetPreflight || targetPreflight.snapshot.providerBinding.protocolContractId.value !== 'gemini-interactions-v1beta' ||
        targetPreflight.snapshot.providerBinding.operation !== 'image_generate' ||
        targetPreflight.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) {
      throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_RETRY_TARGET_INVALID')
    }
    try {
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const target = executionRepo.findOperationInTransaction(context, targetRow.operationId as string)
        if (!target || target.operation.resultAnswerRootId.value !== command.targetAnswerRootId.value ||
            target.operation.questionId.value !== command.questionId.value ||
            target.snapshot.providerBinding.credentialScopeId.value !== credential.credentialScopeId) {
          throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_RETRY_TARGET_INVALID')
        }
        const pending = graphRepo.beginAnswerAction(context, { operationId: command.operationId.value,
          actionKind: command.actionKind, branchId: command.branchId.value, questionId: command.questionId.value,
          targetAnswerRootId: command.targetAnswerRootId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
          answerRootId: answerId(), createdAtMs: nowMs() })
        const persisted = commitGeminiInteractionsImageRetrySnapshotV2({ context, executionRepo, pending, command, target })
        graphRepo.commitAnswerActionProjection(context, pending)
        const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context, execution: persisted.bundle,
          prompt: promptForQuestion(input.db, command.questionId.value) })
        return Object.freeze({ kind: 'created' as const, execution: persisted.bundle,
          projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
          request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
      })
    } catch (error) {
      const winner = replay(command.operationId.value, command.requestFingerprint)
      if (winner) return winner
      throw error
    }
  }

  async function current(command: CurrentCommand): Promise<GeminiInteractionsImageCommandResultV2> {
    const existing = replay(command.operationId.value, command.requestFingerprint)
    if (existing) return existing
    const credential = await input.credentialService.getStatus('google_ai_studio')
    if (!credential.configured || !credential.credentialScopeId) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_CREDENTIAL_INVALID')
    try {
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const pending = command.kind === 'gemini_interactions_image_regenerate'
          ? graphRepo.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: 'regenerate_question',
            branchId: command.branchId.value, questionId: command.questionId.value, targetAnswerRootId: null,
            expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: answerId(), createdAtMs: nowMs() })
          : graphRepo.beginEditedTurn(context, { operationId: command.operationId.value, mode: command.mode,
            branchId: command.branchId.value, sourceQuestionId: command.sourceQuestionId.value,
            sourceAnswerRootId: command.sourceAnswerRootId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
            questionId: questionId(), answerRootId: answerId(), userBody: command.prompt, createdAtMs: nowMs() })
        const prompt = command.kind === 'gemini_interactions_image_regenerate'
          ? promptForQuestion(input.db, command.questionId.value) : command.prompt
        const attachments = command.kind === 'gemini_interactions_image_regenerate'
          ? [] : projectGenerationCommandAttachmentsV2(command.commandAttachments)
        return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo,
          pending.conversationId.value, attachments, undefined, (commandFacts) =>
            withVerifiedGeminiInteractionsImageGenerationAuthoritiesV2({ context,
              credentialScopeId: credential.credentialScopeId!, credentialRevision: credential.revision, commandFacts,
              use: ({ binding, capability }) => {
                const persisted = commitGeminiInteractionsImageCurrentSnapshotV2({ context, executionRepo, capabilityRepo,
                  pending, command, commandFacts, binding, capability })
                if (command.kind === 'gemini_interactions_image_regenerate') {
                  if (!isPendingAnswerActionForContextV2(pending, context)) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_GRAPH_INVALID')
                  graphRepo.commitAnswerActionProjection(context, pending)
                } else {
                  if (!isPendingEditedTurnForContextV2(pending, context)) throw new Error('GENERATION_V2_GEMINI_INTERACTIONS_GRAPH_INVALID')
                  graphRepo.commitEditedTurnProjection(context, pending)
                }
                const preparedRequest = compileGeminiInteractionsImagePreparedRequestV2({ context,
                  execution: persisted.bundle, prompt })
                return Object.freeze({ kind: 'created' as const, execution: persisted.bundle,
                  projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value),
                  preparedRequest, request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
              },
            }))
      })
    } catch (error) {
      const winner = replay(command.operationId.value, command.requestFingerprint)
      if (winner) return winner
      throw error
    }
  }

  return Object.freeze({ retry,
    regenerate: (raw: unknown) => current(decodeGeminiInteractionsImageRegenerateCommandV2(raw)),
    editResend: (raw: unknown) => current(decodeGeminiInteractionsImageEditResendCommandV2(raw)) })
}
