import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenRouterImageBindingRepo } from '../../infra/db/repo/openRouterImageBindingRepo'
import { OpenRouterImageEndpointRepo } from '../../infra/db/repo/openRouterImageEndpointRepo'
import { OpenRouterImageSettingsRepo } from '../../infra/db/repo/openRouterImageSettingsRepo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import {
  decodeOpenRouterImageEditResendCommandV2,
  decodeOpenRouterImageRegenerateCommandV2,
  decodeOpenRouterImageRetryCommandV2,
  type OpenRouterImageEditResendCommandV2,
  type OpenRouterImageRegenerateCommandV2,
} from '../../src/next/generation-v2/providers/openrouter-images/imageActionCommandsV2'
import { resolveOpenRouterImageSelectionInputV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageDescriptorSelectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { issueOpenRouterImageProviderBindingV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageProviderBindingV2'
import { composeOpenRouterImageRuntimeCapabilityV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageRuntimeCapabilityV2'
import { decideOpenRouterImageSelectionV2 } from '../../src/next/generation-v2/providers/openrouter-images/selectionDecisionV2'
import { createOpenRouterImageDescriptorAuthorityV2Service } from './openRouterImageDescriptorAuthorityV2Service'
import { isPendingAnswerActionForContextV2, isPendingEditedTurnForContextV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { commitOpenRouterImageCurrentSnapshotV2, commitOpenRouterImageRetrySnapshotV2 } from './openRouterImageInitialSnapshotCommitV2'
import { compileOpenRouterImagePreparedRequestV2 } from './openRouterImagePreparedRequestCompilerV2'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'

type CurrentCommand = OpenRouterImageRegenerateCommandV2 | OpenRouterImageEditResendCommandV2
export type OpenRouterImageActionResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: NonNullable<ReturnType<GenerationExecutionV2Repo['findOperation']>>
  projection: ReturnType<ConversationGraphV2Repo['getGenerationReplayProjectionInTransaction']>
  request: ReturnType<GenerationRequestV2Repo['loadExistingForOperation']>
  preparedRequest?: ReturnType<typeof compileOpenRouterImagePreparedRequestV2>
}>
export function createOpenRouterImageActionCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database; credentialService: Epoch2RuntimeCredentialService; nowMs?: () => number
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  createQuestionId?: () => string; createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const answerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const questionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs); const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db); const configRepo = new GenerationConfigV2Repo(input.db)
  const attachmentRepo = new AttachmentAssetV2Repo(input.db, nowMs); const capabilityRepo = new RuntimeCapabilityV2Repo(input.db)
  const bindingRepo = new OpenRouterImageBindingRepo(input.db, nowMs); const endpointRepo = new OpenRouterImageEndpointRepo(input.db, nowMs)
  const settingsRepo = new OpenRouterImageSettingsRepo(input.db, nowMs)
  const modelEvidenceService = createActiveCatalogModelAuthorityV2Service(input)
  const endpointProfile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const descriptorAuthority = createOpenRouterImageDescriptorAuthorityV2Service({ db: input.db, credentialService: input.credentialService,
    fetchImpl: input.fetchImpl, nowMs })

  function replay(operationId: string, fingerprint: string): OpenRouterImageActionResultV2 | null {
    const observed = executionRepo.findOperation(operationId); if (!observed) return null
    if (observed.operation.commandFingerprint !== fingerprint || observed.snapshot.providerBinding.providerId.value !== 'openrouter' ||
        observed.snapshot.providerBinding.operation !== 'image_generate') throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, operationId)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      return Object.freeze({ kind: 'idempotent_replay' as const, execution,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, operationId),
        request: requestRepo.loadExistingForOperation(context, execution, 1) })
    })
  }
  function promptForQuestion(question: string): string {
    const row = input.db.prepare(`SELECT body.body_text AS prompt FROM message_v2 AS message
      JOIN message_body_v2 AS body ON body.message_id=message.message_id
      WHERE message.message_id=? AND message.role='user'`).get(question) as { prompt?: unknown } | undefined
    if (!row || typeof row.prompt !== 'string') throw new Error('GENERATION_V2_OPENROUTER_IMAGE_PROMPT_INVALID')
    return row.prompt
  }
  function descriptorCandidate(descriptor: Awaited<ReturnType<typeof descriptorAuthority.resolve>>, tag: string, slug: string) {
    const value = descriptor.descriptorSet.descriptors.find((item) => item.providerTag.value === tag && item.providerSlug.value === slug)
    if (!value) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_SELECTION_INVARIANT')
    return value
  }
  function assertDescriptorCurrent(descriptor: Awaited<ReturnType<typeof descriptorAuthority.resolve>>): void {
    const current = endpointRepo.getCurrentDescriptorSet(descriptor.credentialScopeId, descriptor.modelId)
    if (!current || current.rowGeneration !== descriptor.rowGeneration ||
        current.endpointSetRevision.value !== descriptor.endpointSetRevision.value) {
      throw new Error('BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH')
    }
  }
  function currentSelection(context: GenerationV2AuthorityTransactionContextV2, command: CurrentCommand,
    descriptor: Awaited<ReturnType<typeof descriptorAuthority.resolve>>, commandFacts: GenerationCommandFactsAuthorityV2,
    freshness: ReturnType<OpenRouterImageSettingsRepo['readOrRestore']>['settings']['pair'],
    credentialRevision: number) {
    const existing = bindingRepo.getBinding({ credentialScopeId: descriptor.credentialScopeId, modelId: descriptor.modelId })
    const decision = decideOpenRouterImageSelectionV2({ descriptorCache: descriptor,
      freshness: { kind: 'use_cached', ageMs: 0, settings: freshness },
      projection: resolveOpenRouterImageSelectionInputV2(commandFacts.semanticIntent),
      binding: existing === null ? null : { trust: 'repository_decoded_unverified', bindingGeneration: existing.bindingGeneration,
        sourceDescriptorRowGeneration: existing.sourceDescriptorRowGeneration, sourceEndpointSetRevision: existing.sourceEndpointSetRevision, record: existing.record },
      requestedProviderTag: command.requestedProviderTag })
    if (decision.kind !== 'reuse_binding' && decision.kind !== 'binding_commit_required' &&
        decision.kind !== 'binding_revalidation_required') {
      throw new Error('code' in decision ? decision.code : 'GENERATION_V2_OPENROUTER_IMAGE_SELECTION_INVARIANT')
    }
    const candidate = decision.candidate
    const binding = decision.kind === 'reuse_binding' ? existing! : bindingRepo.compareAndSetBindingInAuthorityTransaction(context, {
      record: projectDecodedProviderBindingRecordV2(issueOpenRouterImageProviderBindingV2({ credentialScopeId: descriptor.credentialScopeId.value, modelId: descriptor.modelId.value,
        descriptor: descriptorCandidate(descriptor, candidate.providerTag, candidate.providerSlug), selectedBy: decision.selectedBy,
        selectedAt: new Date(nowMs()).toISOString() })), expectedBindingGeneration: decision.expectedBindingGeneration,
      expectedDescriptorRowGeneration: decision.expectedDescriptorRowGeneration })
    const selected = descriptorCandidate(descriptor, candidate.providerTag, candidate.providerSlug)
    return Object.freeze({ binding, capability: composeOpenRouterImageRuntimeCapabilityV2({ binding: binding.record,
      descriptor: selected, resolvedAt: new Date(nowMs()).toISOString(), credentialRevision }) })
  }

  async function retry(raw: unknown, signal?: AbortSignal): Promise<OpenRouterImageActionResultV2> {
    const command = decodeOpenRouterImageRetryCommandV2(raw); const existing = replay(command.operationId.value, command.requestFingerprint); if (existing) return existing
    const targetObserved = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
      .get(command.sourceAnswerId.value) as { operationId?: unknown } | undefined
    if (!targetObserved || typeof targetObserved.operationId !== 'string') throw new Error('GENERATION_V2_OPENROUTER_IMAGE_RETRY_TARGET_INVALID')
    const targetPreflight = executionRepo.findOperation(targetObserved.operationId)
    if (!targetPreflight || targetPreflight.snapshot.providerBinding.providerId.value !== 'openrouter' ||
        targetPreflight.snapshot.providerBinding.operation !== 'image_generate') throw new Error('GENERATION_V2_OPENROUTER_IMAGE_RETRY_TARGET_INVALID')
    const status = await input.credentialService.getStatus('openrouter'); if (!status.configured || !status.credentialScopeId) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_CREDENTIAL_INVALID')
    if (targetPreflight.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_RETRY_TARGET_INVALID')
    const descriptor = await descriptorAuthority.resolve({ modelId: targetPreflight.snapshot.providerBinding.modelId.value,
      credentialRevision: status.revision, credentialScopeId: status.credentialScopeId,
      settings: settingsRepo.readOrRestore().settings.pair, signal })
    try { return await modelEvidenceService.withExactActiveModel({
      providerKey: 'openrouter', endpointProfile,
      expectedCredentialRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId,
      modelId: targetPreflight.snapshot.providerBinding.modelId,
      consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      modelEvidence.assertCurrent()
      assertDescriptorCurrent(descriptor)
      const target = executionRepo.findOperationInTransaction(context, targetObserved.operationId as string)
      if (!target || target.operation.targetAnswerId.value !== command.sourceAnswerId.value ||
          target.snapshot.providerBinding.credentialScopeId.value !== status.credentialScopeId) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_RETRY_TARGET_INVALID')
      const pending = graphRepo.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: command.actionKind,
        sourceBranchId: command.sourceBranchId.value, questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value,
        expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: answerId(), createdAtMs: nowMs() })
      const persisted = commitOpenRouterImageRetrySnapshotV2({ context, executionRepo, pending, command, target })
      graphRepo.commitAnswerActionProjection(context, pending)
      const preparedRequest = compileOpenRouterImagePreparedRequestV2({ context, execution: persisted.bundle,
        prompt: promptForQuestion(command.questionId.value), descriptorSet: descriptor.descriptorSet })
      return Object.freeze({ kind: 'created' as const, execution: persisted.bundle,
        projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
        request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
      }),
    }) } catch (error) {
      const winner = replay(command.operationId.value, command.requestFingerprint)
      if (winner) return winner
      throw error
    }
  }

  async function current(command: CurrentCommand, signal?: AbortSignal): Promise<OpenRouterImageActionResultV2> {
    const existing = replay(command.operationId.value, command.requestFingerprint); if (existing) return existing
    const status = await input.credentialService.getStatus('openrouter'); if (!status.configured || !status.credentialScopeId) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_CREDENTIAL_INVALID')
    const freshness = settingsRepo.readOrRestore().settings.pair
    const descriptor = await descriptorAuthority.resolve({ modelId: command.modelId.value, credentialRevision: status.revision,
      credentialScopeId: status.credentialScopeId, settings: freshness, signal })
    try { return await modelEvidenceService.withExactActiveModel({
      providerKey: 'openrouter', endpointProfile,
      expectedCredentialRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId,
      modelId: command.modelId,
      consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      modelEvidence.assertCurrent()
      assertDescriptorCurrent(descriptor)
      const sourceAttachments = projectGenerationCommandAttachmentsV2(command.commandAttachments)
      const pending = command.kind === 'openrouter_image_regenerate'
        ? graphRepo.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: 'regenerate_question', sourceBranchId: command.sourceBranchId.value,
          questionId: command.questionId.value, sourceAnswerId: command.sourceAnswerId.value, expectedHeadMessageId: command.expectedHeadMessageId.value,
          answerRootId: answerId(), createdAtMs: nowMs() })
        : graphRepo.beginEditedTurn(context, { operationId: command.operationId.value, sourceBranchId: command.sourceBranchId.value,
          sourceQuestionId: command.sourceQuestionId.value, sourceAnswerRootId: command.sourceAnswerRootId.value,
          expectedHeadMessageId: command.expectedHeadMessageId.value, questionId: questionId(), answerRootId: answerId(),
          userBody: command.prompt, createdAtMs: nowMs() })
      const prompt = command.kind === 'openrouter_image_regenerate' ? promptForQuestion(command.questionId.value) : command.prompt
      return withSynchronousGenerationCommandFactsAuthorityV2(context, configRepo, attachmentRepo, pending.conversationId.value,
        sourceAttachments, undefined, (commandFacts) => {
          const selected = currentSelection(context, command, descriptor, commandFacts, freshness, status.revision)
          const persisted = commitOpenRouterImageCurrentSnapshotV2({ context, executionRepo, capabilityRepo, pending, command,
            commandFacts, binding: selected.binding, capability: selected.capability })
          if (command.kind === 'openrouter_image_regenerate') {
            if (!isPendingAnswerActionForContextV2(pending, context)) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_GRAPH_INVALID')
            graphRepo.commitAnswerActionProjection(context, pending)
          } else {
            if (!isPendingEditedTurnForContextV2(pending, context)) throw new Error('GENERATION_V2_OPENROUTER_IMAGE_GRAPH_INVALID')
            graphRepo.commitEditedTurnProjection(context, pending)
          }
          const preparedRequest = compileOpenRouterImagePreparedRequestV2({ context, execution: persisted.bundle,
            prompt, descriptorSet: descriptor.descriptorSet })
          return Object.freeze({ kind: 'created' as const, execution: persisted.bundle,
            projection: graphRepo.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
            request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest) })
        })
      }),
    }) } catch (error) {
      const winner = replay(command.operationId.value, command.requestFingerprint)
      if (winner) return winner
      throw error
    }
  }
  return Object.freeze({ retry, regenerate: (raw: unknown, signal?: AbortSignal) => current(decodeOpenRouterImageRegenerateCommandV2(raw), signal),
    editResend: (raw: unknown, signal?: AbortSignal) => current(decodeOpenRouterImageEditResendCommandV2(raw), signal) })
}
