import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import {
  ConversationGraphV2Repo,
  type InitialSendReplayProjectionV2,
} from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
  type GenerationExecutionOperationBundleV2,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeDeepSeekPlainTextInitialSendCommandV2,
  type DeepSeekPlainTextInitialSendCommandV2,
} from '../../src/next/generation-v2/providers/deepseek/plainTextInitialSendCommandV2'
import { readVerifiedDeepSeekStableEndpointProfileV2 } from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { createDeepSeekStableModelEvidenceV2Service } from './deepSeekStableModelEvidenceV2Service'
import { withVerifiedDeepSeekStableGenerationAuthoritiesV2 } from './deepSeekStableGenerationAuthorityV2Service'
import { commitVerifiedDeepSeekPlainTextInitialSnapshotV2 } from './deepSeekPlainTextSnapshotCommitV2'

export type DeepSeekPlainTextInitialSendResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: GenerationExecutionOperationBundleV2
  projection: InitialSendReplayProjectionV2
}>

export function createDeepSeekPlainTextInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
  createGraphId?: (kind: 'question' | 'answer') => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createGraphId = input.createGraphId ?? ((kind: 'question' | 'answer') => `${kind}:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const modelEvidenceService = createDeepSeekStableModelEvidenceV2Service({
    db: input.db, credentialService: input.credentialService, nowMs,
  })
  const endpointProfile = readVerifiedDeepSeekStableEndpointProfileV2()

  function replay(command: DeepSeekPlainTextInitialSendCommandV2): DeepSeekPlainTextInitialSendResultV2 | null {
    const existing = executionRepo.findOperation(command.operationId.value)
    if (!existing) return null
    if (existing.operation.actionKind !== 'initial_send' ||
        existing.operation.commandFingerprint !== command.requestFingerprint) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return Object.freeze({
      kind: 'idempotent_replay' as const,
      execution: existing,
      projection: graphRepo.getInitialSendReplayProjection(command.operationId.value),
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
                return Object.freeze({
                  kind: 'idempotent_replay' as const,
                  execution: raced,
                  projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                    context, command.operationId.value,
                  ),
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
                (commandFacts) => withVerifiedDeepSeekStableGenerationAuthoritiesV2({
                  context, modelEvidence, commandFacts, operation: 'text',
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
                    })
                    graphRepo.commitInitialTurnProjection(context, pending)
                    return Object.freeze({
                      kind: 'created' as const,
                      execution: persisted.bundle,
                      projection: graphRepo.getInitialSendReplayProjectionInTransaction(
                        context, command.operationId.value,
                      ),
                    })
                  },
                }),
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
