import { randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenRouterImageBindingRepo } from '../../infra/db/repo/openRouterImageBindingRepo'
import { OpenRouterImageEndpointRepo } from '../../infra/db/repo/openRouterImageEndpointRepo'
import { OpenRouterImageSettingsRepo } from '../../infra/db/repo/openRouterImageSettingsRepo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { createActiveCatalogModelAuthorityV2Service } from './activeCatalogModelAuthorityV2Service'
import { createOpenRouterImageDescriptorAuthorityV2Service } from './openRouterImageDescriptorAuthorityV2Service'
import { commitOpenRouterImageInitialSnapshotV2 } from './openRouterImageInitialSnapshotCommitV2'
import { compileOpenRouterImagePreparedRequestV2 } from './openRouterImagePreparedRequestCompilerV2'
import { decodeOpenRouterImageInitialSendCommandV2, type OpenRouterImageInitialSendCommandV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageInitialSendCommandV2'
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { resolveOpenRouterImageSelectionInputV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageDescriptorSelectionV2'
import { decideOpenRouterImageSelectionV2 } from '../../src/next/generation-v2/providers/openrouter-images/selectionDecisionV2'
import { issueOpenRouterImageProviderBindingV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageProviderBindingV2'
import { composeOpenRouterImageRuntimeCapabilityV2 } from '../../src/next/generation-v2/providers/openrouter-images/imageRuntimeCapabilityV2'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'

export class OpenRouterImageInitialSendCoordinatorV2Error extends Error {
  constructor(readonly code:
    | 'OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED'
    | 'OPENROUTER_IMAGE_PROVIDER_SELECTION_STALE'
    | 'OPENROUTER_IMAGE_REQUEST_UNSUPPORTED'
    | 'BOUND_ENDPOINT_CAPABILITY_MISMATCH'
    | 'BOUND_ENDPOINT_DESCRIPTOR_MISSING'
    | 'BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH'
    | 'BOUND_ENDPOINT_DESCRIPTOR_HARD_EXPIRED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_SELECTION_INVARIANT') {
    super(code)
    this.name = 'OpenRouterImageInitialSendCoordinatorV2Error'
  }
}

export type OpenRouterImageInitialSendResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: ReturnType<GenerationExecutionV2Repo['findOperation']> extends infer T ? Exclude<T, null> : never
  projection: ReturnType<ConversationGraphV2Repo['getInitialSendReplayProjectionInTransaction']>
  request: ReturnType<GenerationRequestV2Repo['loadExistingForOperation']>
  preparedRequest?: ReturnType<typeof compileOpenRouterImagePreparedRequestV2>
}>

function selectionFailure(code: OpenRouterImageInitialSendCoordinatorV2Error['code']): never {
  throw new OpenRouterImageInitialSendCoordinatorV2Error(code)
}

function selectedDescriptor(
  descriptor: Awaited<ReturnType<ReturnType<typeof createOpenRouterImageDescriptorAuthorityV2Service>['resolve']>>,
  providerTag: string,
  providerSlug: string,
) {
  const selected = descriptor.descriptorSet.descriptors.find((candidate) =>
    candidate.providerTag.value === providerTag && candidate.providerSlug.value === providerSlug)
  if (!selected) selectionFailure('GENERATION_V2_OPENROUTER_IMAGE_SELECTION_INVARIANT')
  return selected
}

export function createOpenRouterImageInitialSendCoordinatorV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
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
  const bindingRepo = new OpenRouterImageBindingRepo(input.db, nowMs)
  const endpointRepo = new OpenRouterImageEndpointRepo(input.db, nowMs)
  const settingsRepo = new OpenRouterImageSettingsRepo(input.db, nowMs)
  const modelEvidenceService = createActiveCatalogModelAuthorityV2Service(input)
  const endpointProfile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const descriptorAuthority = createOpenRouterImageDescriptorAuthorityV2Service({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs,
  })

  function replay(command: OpenRouterImageInitialSendCommandV2): OpenRouterImageInitialSendResultV2 | null {
    const observed = executionRepo.findOperation(command.operationId.value)
    if (!observed) return null
    if (observed.operation.actionKind !== 'initial_send' ||
        observed.operation.commandFingerprint !== command.requestFingerprint ||
        observed.snapshot.providerBinding.providerId.value !== 'openrouter' ||
        observed.snapshot.providerBinding.operation !== 'image_generate') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    }
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.operationId.value)
      if (!execution) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      return Object.freeze({
        kind: 'idempotent_replay' as const,
        execution,
        projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
        request: requestRepo.loadExistingForOperation(context, execution, 1),
      })
    })
  }

  return Object.freeze({
    submit: async (request: Readonly<{
      command: unknown
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      signal?: AbortSignal
    }>): Promise<OpenRouterImageInitialSendResultV2> => {
      const command = decodeOpenRouterImageInitialSendCommandV2(request.command)
      const existing = replay(command)
      if (existing) return existing
      const freshness = settingsRepo.readOrRestore().settings.pair
      const descriptor = await descriptorAuthority.resolve({
        modelId: command.modelId.value,
        credentialRevision: request.expectedCredentialRevision,
        credentialScopeId: request.expectedCredentialScopeId,
        settings: freshness,
        signal: request.signal,
      })
      try {
        return await modelEvidenceService.withExactActiveModel({
          providerKey: 'openrouter', endpointProfile,
          expectedCredentialRevision: request.expectedCredentialRevision,
          expectedCredentialScopeId: request.expectedCredentialScopeId,
          modelId: command.modelId,
          consume: (modelEvidence) => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
          modelEvidence.assertCurrent()
          const raced = executionRepo.findOperationInTransaction(context, command.operationId.value)
          if (raced) {
            if (raced.operation.actionKind !== 'initial_send' ||
                raced.operation.commandFingerprint !== command.requestFingerprint ||
                raced.snapshot.providerBinding.providerId.value !== 'openrouter' ||
                raced.snapshot.providerBinding.operation !== 'image_generate') {
              throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
            }
            return Object.freeze({
              kind: 'idempotent_replay' as const,
              execution: raced,
              projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
              request: requestRepo.loadExistingForOperation(context, raced, 1),
            })
          }
          const currentDescriptor = endpointRepo.getCurrentDescriptorSet(
            descriptor.credentialScopeId, descriptor.modelId,
          )
          if (!currentDescriptor || currentDescriptor.rowGeneration !== descriptor.rowGeneration ||
              currentDescriptor.endpointSetRevision.value !== descriptor.endpointSetRevision.value) {
            selectionFailure('BOUND_ENDPOINT_DESCRIPTOR_PROVENANCE_MISMATCH')
          }
          const pending = graphRepo.beginInitialTurn(context, {
            operationId: command.operationId.value,
            branchId: command.branchId.value,
            expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null,
            questionId: createGraphId('question'),
            answerRootId: createGraphId('answer'),
            userBody: command.prompt,
            createdAtMs: nowMs(),
          })
          return withSynchronousGenerationCommandFactsAuthorityV2(
            context, configRepo, attachmentRepo, pending.conversationId.value,
            projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined,
            (commandFacts) => {
              const existingBinding = bindingRepo.getBinding({
                credentialScopeId: descriptor.credentialScopeId,
                modelId: descriptor.modelId,
              })
              const decision = decideOpenRouterImageSelectionV2({
                descriptorCache: descriptor,
                freshness: { kind: 'use_cached', ageMs: 0, settings: freshness },
                projection: resolveOpenRouterImageSelectionInputV2(commandFacts.semanticIntent),
                binding: existingBinding === null ? null : {
                  trust: 'repository_decoded_unverified',
                  bindingGeneration: existingBinding.bindingGeneration,
                  sourceDescriptorRowGeneration: existingBinding.sourceDescriptorRowGeneration,
                  sourceEndpointSetRevision: existingBinding.sourceEndpointSetRevision,
                  record: existingBinding.record,
                },
                requestedProviderTag: command.requestedProviderTag,
              })
              if (decision.kind === 'selection_required' || decision.kind === 'stale_user_selection' ||
                  decision.kind === 'unsupported' || decision.kind === 'bound_capability_mismatch' ||
                  decision.kind === 'stale_binding') selectionFailure(decision.code)
              if (decision.kind === 'refresh_required') selectionFailure('GENERATION_V2_OPENROUTER_IMAGE_SELECTION_INVARIANT')
              const binding = decision.kind === 'reuse_binding'
                ? existingBinding!
                : bindingRepo.compareAndSetBindingInAuthorityTransaction(context, {
                  record: projectDecodedProviderBindingRecordV2(issueOpenRouterImageProviderBindingV2({
                    credentialScopeId: descriptor.credentialScopeId.value,
                    modelId: descriptor.modelId.value,
                    descriptor: selectedDescriptor(
                      descriptor, decision.candidate.providerTag, decision.candidate.providerSlug,
                    ),
                    selectedBy: decision.selectedBy,
                    selectedAt: new Date(nowMs()).toISOString(),
                  })),
                  expectedBindingGeneration: decision.expectedBindingGeneration,
                  expectedDescriptorRowGeneration: decision.expectedDescriptorRowGeneration,
                })
              const capability = composeOpenRouterImageRuntimeCapabilityV2({
                binding: binding.record,
                descriptor: selectedDescriptor(
                  descriptor, decision.candidate.providerTag, decision.candidate.providerSlug,
                ),
                resolvedAt: new Date(nowMs()).toISOString(),
                credentialRevision: request.expectedCredentialRevision,
              })
              const persisted = commitOpenRouterImageInitialSnapshotV2({
                context, executionRepo, capabilityRepo, pending, command, commandFacts, binding, capability,
              })
              graphRepo.commitInitialTurnProjection(context, pending)
              const preparedRequest = compileOpenRouterImagePreparedRequestV2({
                context, execution: persisted.bundle, prompt: command.prompt, descriptorSet: descriptor.descriptorSet,
              })
              return Object.freeze({
                kind: 'created' as const,
                execution: persisted.bundle,
                projection: graphRepo.getInitialSendReplayProjectionInTransaction(context, command.operationId.value),
                preparedRequest,
                request: requestRepo.createPrepared(context, persisted.bundle, preparedRequest),
              })
            },
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
