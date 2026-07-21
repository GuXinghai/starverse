import { createHash, randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo, type PendingAnswerActionV2, type PendingEditedTurnV2, type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { withSynchronousGenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIChatCompatibleNativeHistoryV2Repo } from '../../infra/db/repo/openAIChatCompatibleNativeHistoryV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
// Approved Generation V2 main-process composition boundary: renderer never receives these domain facts.
// eslint-disable-next-line no-restricted-imports
import { projectGenerationCommandAttachmentsV2 } from '../../src/next/generation-v2/domain/commandAttachmentsV2'
// eslint-disable-next-line no-restricted-imports
import { createOpenAIChatCompatibleProviderBindingV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/verifiedContractV2'
// eslint-disable-next-line no-restricted-imports
import { composeOpenAIChatCompatibleBaselineCapabilityV2 } from '../../src/next/generation-v2/providers/openai-chat-compatible/runtimeCapabilityV2'
// eslint-disable-next-line no-restricted-imports
import {
  decodeOpenAIChatCompatibleEditResendCommandV2, decodeOpenAIChatCompatibleInitialCommandV2,
  decodeOpenAIChatCompatibleRegenerateCommandV2, decodeOpenAIChatCompatibleRetryCommandV2,
  type OpenAIChatCompatibleEditResendCommandV2, type OpenAIChatCompatibleInitialCommandV2,
  type OpenAIChatCompatibleRegenerateCommandV2, type OpenAIChatCompatibleRetryCommandV2,
} from '../../src/next/generation-v2/providers/openai-chat-compatible/plainTextCommandsV2'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import { compileOpenAIChatCompatiblePreparedRequestV2 } from './openAIChatCompatiblePreparedRequestCompilerV2'
import { commitOpenAIChatCompatibleCurrentSnapshotV2, commitOpenAIChatCompatibleRetrySnapshotV2 } from './openAIChatCompatibleSnapshotCommitV2'
import { issueGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { assertOpenAICompatibleTransportPolicyV2 } from './openAICompatibleNetworkV2'

type Current = OpenAIChatCompatibleInitialCommandV2 | OpenAIChatCompatibleRegenerateCommandV2 | OpenAIChatCompatibleEditResendCommandV2
type CredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>
type CredentialFact = Readonly<{ credentialScopeId: CredentialScopeIdV2; credentialRevision: number }>

function unauthenticatedScope(endpointDigest: string): CredentialScopeIdV2 {
  return `credential-scope-v2:${createHash('sha256').update(`openai-chat-compatible:none:${endpointDigest}`, 'utf8').digest('hex')}` as CredentialScopeIdV2
}
function mappedReasoningSources(configuration: ReturnType<OpenAICompatibleV2Repo['getActiveConfiguration']>): readonly ('reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget')[] {
  const permitted = new Set(['reasoning_enabled', 'reasoning_effort', 'reasoning_budget'])
  return Object.freeze(configuration.requestMappings.map((entry) => (entry.payload as { sourceField?: unknown }).sourceField)
    .filter((source): source is 'reasoning_enabled' | 'reasoning_effort' | 'reasoning_budget' => typeof source === 'string' && permitted.has(source)))
}

export function createOpenAIChatCompatibleGenerationV2Coordinator(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: CredentialService
  nowMs?: () => number
  createQuestionId?: () => string
  createAnswerId?: () => string
}>) {
  const nowMs = input.nowMs ?? Date.now
  const createQuestionId = input.createQuestionId ?? (() => `question:${randomUUID()}`)
  const createAnswerId = input.createAnswerId ?? (() => `answer:${randomUUID()}`)
  const graph = new ConversationGraphV2Repo(input.db); const execution = new GenerationExecutionV2Repo(input.db, nowMs)
  const requests = new GenerationRequestV2Repo(input.db, nowMs); const history = new OpenAIChatCompatibleNativeHistoryV2Repo(input.db)
  const providers = new OpenAICompatibleV2Repo(input.db, nowMs); const config = new GenerationConfigV2Repo(input.db, nowMs)
  const attachments = new AttachmentAssetV2Repo(input.db, nowMs); const capabilities = new RuntimeCapabilityV2Repo(input.db)

  async function credentialFact(providerInstanceId: string, endpoint: { auth: unknown; endpointDigest: string }): Promise<CredentialFact> {
    const auth = endpoint.auth as { mode?: unknown; credentialVersionRef?: unknown }
    if (auth.mode === 'none') return Object.freeze({ credentialScopeId: unauthenticatedScope(endpoint.endpointDigest), credentialRevision: 1 })
    if ((auth.mode !== 'bearer' && auth.mode !== 'basic' && auth.mode !== 'custom_headers') || typeof auth.credentialVersionRef !== 'string') {
      throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_INVALID')
    }
    const status = await input.credentialService.getStatus(providerInstanceId, auth.credentialVersionRef)
    if (!status.configured || !status.credentialScopeId || status.revision < 1) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_CREDENTIAL_MISSING')
    return Object.freeze({ credentialScopeId: status.credentialScopeId, credentialRevision: status.revision })
  }

  function compile(context: GenerationV2AuthorityTransactionContextV2, bundle: GenerationExecutionOperationBundleV2) {
    const provenance = bundle.snapshot.providerConfiguration
    if (provenance.kind !== 'openai_chat_compatible') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_PROVENANCE_INVALID')
    const endpoint = providers.getEndpointRevision(provenance.providerInstanceId.value, provenance.endpointRevisionId.value)
    const configuration = providers.getConfigurationForEndpointRevision(provenance.providerInstanceId.value, provenance.endpointRevisionId.value)
    return compileOpenAIChatCompatiblePreparedRequestV2({ context, execution: bundle, endpoint, configuration,
      history: history.loadRequestHistory(context, bundle.operation.operationId.value) })
  }
  function replay(command: { operationId: { value: string }; requestFingerprint: string }, action: string): GenerationTextCommandResultV2 | null {
    const found = execution.findOperation(command.operationId.value); if (!found) return null
    if (found.operation.actionKind !== action || found.operation.commandFingerprint !== command.requestFingerprint ||
        found.snapshot.providerBinding.protocolContractId.value !== 'openai_chat_compatible') throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
    return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const bundle = execution.findOperationInTransaction(context, command.operationId.value)!; const preparedRequest = compile(context, bundle)
      const projection = action === 'initial_send' ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
        : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
      return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: bundle, projection, preparedRequest,
        request: requests.replayPrepared(context, bundle, preparedRequest) })
    })
  }
  function pendingForCurrent(context: GenerationV2AuthorityTransactionContextV2, command: Current, at: number) {
    if (command.kind === 'openai_chat_compatible_initial') return graph.beginInitialTurn(context, { operationId: command.operationId.value,
      branchId: command.branchId.value, expectedHeadMessageId: command.expectedHeadMessageId?.value ?? null, questionId: createQuestionId(),
      answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
    if (command.kind === 'openai_chat_compatible_regenerate') return graph.beginAnswerAction(context, { operationId: command.operationId.value,
      actionKind: 'regenerate_question', branchId: command.branchId.value, questionId: command.questionId.value, targetAnswerRootId: null,
      expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: at })
    return graph.beginEditedTurn(context, { operationId: command.operationId.value, mode: command.mode, branchId: command.branchId.value,
      sourceQuestionId: command.sourceQuestionId.value, sourceAnswerRootId: command.sourceAnswerRootId.value,
      expectedHeadMessageId: command.expectedHeadMessageId.value, questionId: createQuestionId(), answerRootId: createAnswerId(), userBody: command.userBody, createdAtMs: at })
  }
  async function current(command: Current, action: 'initial_send' | 'regenerate_question' | 'edit_resend') {
    const existing = replay(command, action); if (existing) return existing
    const details = providers.get(command.providerInstanceId.value); const endpoint = details.endpointRevisions[0]
    if (!endpoint || details.status !== 'active') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_PROVIDER_UNAVAILABLE')
    assertOpenAICompatibleTransportPolicyV2(endpoint)
    const configuration = providers.getConfigurationForEndpointRevision(details.providerInstanceId, endpoint.endpointRevisionId)
    const credential = await credentialFact(details.providerInstanceId, endpoint)
    try {
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const currentDetails = providers.get(command.providerInstanceId.value); const currentEndpoint = currentDetails.endpointRevisions[0]
        if (!currentEndpoint || currentDetails.status !== 'active' || currentEndpoint.endpointRevisionId !== endpoint.endpointRevisionId ||
            currentEndpoint.endpointDigest !== endpoint.endpointDigest) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_PREFLIGHT_STALE')
        const raced = execution.findOperationInTransaction(context, command.operationId.value)
        if (raced) { if (raced.operation.commandFingerprint !== command.requestFingerprint) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
          const preparedRequest = compile(context, raced); const projection = action === 'initial_send'
            ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
            : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
          return issueGenerationTextCommandResultV2({ kind: 'idempotent_replay', execution: raced, projection, preparedRequest,
            request: requests.replayPrepared(context, raced, preparedRequest) }) }
        const pending = pendingForCurrent(context, command, nowMs())
        return withSynchronousGenerationCommandFactsAuthorityV2(context, config, attachments, pending.conversationId.value,
          projectGenerationCommandAttachmentsV2(command.commandAttachments), undefined, (facts) => {
            const binding = createOpenAIChatCompatibleProviderBindingV2({ provider: details, endpoint, credentialScopeId: credential.credentialScopeId, modelId: command.modelId.value })
            const capability = composeOpenAIChatCompatibleBaselineCapabilityV2({ binding, resolvedAt: new Date(pending.createdAtMs).toISOString(),
              mappedReasoningSourceFields: mappedReasoningSources(configuration) })
            const persisted = commitOpenAIChatCompatibleCurrentSnapshotV2({ context, executionRepo: execution, capabilityRepo: capabilities,
              pending, command, commandFacts: facts, provider: details, endpoint, configuration, credentialScopeId: credential.credentialScopeId,
              credentialRevision: credential.credentialRevision, capability })
            if (command.kind === 'openai_chat_compatible_initial') graph.commitInitialTurnProjection(context, pending as PendingInitialTurnV2)
            else if (command.kind === 'openai_chat_compatible_regenerate') graph.commitAnswerActionProjection(context, pending as PendingAnswerActionV2)
            else graph.commitEditedTurnProjection(context, pending as PendingEditedTurnV2)
            const preparedRequest = compile(context, persisted.bundle); const projection = command.kind === 'openai_chat_compatible_initial'
              ? graph.getInitialSendReplayProjectionInTransaction(context, command.operationId.value)
              : graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value)
            return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle, projection, preparedRequest,
              request: requests.createPrepared(context, persisted.bundle, preparedRequest) })
          })
      })
    } catch (error) { const winner = replay(command, action); if (winner) return winner; throw error }
  }
  async function retry(command: OpenAIChatCompatibleRetryCommandV2) {
    const existing = replay(command, command.actionKind); if (existing) return existing
    const targetRow = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?')
      .get(command.targetAnswerRootId.value) as { operationId?: unknown } | undefined
    if (!targetRow || typeof targetRow.operationId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_TARGET_INVALID')
    const targetBeforeCommit = execution.findOperation(targetRow.operationId)
    const provenance = targetBeforeCommit?.snapshot.providerConfiguration
    if (!targetBeforeCommit || provenance?.kind !== 'openai_chat_compatible') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_TARGET_INVALID')
    const retryEndpoint = providers.getEndpointRevision(provenance.providerInstanceId.value, provenance.endpointRevisionId.value)
    assertOpenAICompatibleTransportPolicyV2(retryEndpoint)
    await credentialFact(provenance.providerInstanceId.value, retryEndpoint)
    try {
      return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        const row = input.db.prepare('SELECT operation_id AS operationId FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?').get(command.targetAnswerRootId.value) as { operationId?: unknown } | undefined
        if (!row || typeof row.operationId !== 'string') throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_TARGET_INVALID')
        const target = execution.findOperationInTransaction(context, row.operationId)
        if (!target || target.operation.questionId.value !== command.questionId.value || target.snapshot.providerBinding.protocolContractId.value !== 'openai_chat_compatible') {
          throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RETRY_TARGET_INVALID')
        }
        const pending = graph.beginAnswerAction(context, { operationId: command.operationId.value, actionKind: command.actionKind,
          branchId: command.branchId.value, questionId: command.questionId.value, targetAnswerRootId: command.targetAnswerRootId.value,
          expectedHeadMessageId: command.expectedHeadMessageId.value, answerRootId: createAnswerId(), createdAtMs: nowMs() })
        const persisted = commitOpenAIChatCompatibleRetrySnapshotV2({ context, executionRepo: execution, pending, command, target })
        graph.commitAnswerActionProjection(context, pending); const preparedRequest = compile(context, persisted.bundle)
        return issueGenerationTextCommandResultV2({ kind: 'created', execution: persisted.bundle,
          projection: graph.getGenerationReplayProjectionInTransaction(context, command.operationId.value), preparedRequest,
          request: requests.createPrepared(context, persisted.bundle, preparedRequest) })
      })
    } catch (error) { const winner = replay(command, command.actionKind); if (winner) return winner; throw error }
  }
  return Object.freeze({
    submitInitial: (raw: unknown) => current(decodeOpenAIChatCompatibleInitialCommandV2(raw), 'initial_send'),
    retry: (raw: unknown) => retry(decodeOpenAIChatCompatibleRetryCommandV2(raw)),
    regenerate: (raw: unknown) => current(decodeOpenAIChatCompatibleRegenerateCommandV2(raw), 'regenerate_question'),
    editResend: (raw: unknown) => current(decodeOpenAIChatCompatibleEditResendCommandV2(raw), 'edit_resend'),
  })
}
