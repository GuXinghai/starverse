import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
const anthropicCompiler = vi.hoisted(() => ({ compile: vi.fn() }))
const runtimeCredentialMocks = vi.hoisted(() => ({ leases: new WeakSet<object>() }))
vi.mock('./anthropicMessagesPreparedRequestCompilerV2', () => ({
  compileAnthropicMessagesPreparedRequestV2: anthropicCompiler.compile,
}))
vi.mock('../credentials/epoch2RuntimeCredentialService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../credentials/epoch2RuntimeCredentialService')>()
  return { ...actual, isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && runtimeCredentialMocks.leases.has(value)) }
})
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ProviderCatalogAuthorityRegistryV2 } from '../../src/core/model-catalog/providerCatalogAuthorityRegistryV2'
import { ImmutablePreparedBodyV2 } from '../../src/core/generation-v2/compiler/stableSerialize'
import { createSemanticConsumptionLedgerV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { issuePreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { createAnthropicMessagesNonSecretHeaderPlanV2, readAnthropicDeveloperApiContractV2,
  resolveAnthropicDeveloperApiEndpointV2 } from '../../src/core/generation-v2/contracts/anthropicDeveloperApiContractV2'
import { createAnthropicPlainTextInitialSendCoordinatorV2 } from './anthropicPlainTextInitialSendCoordinatorV2'
import { createAnthropicPlainTextRegenerateCoordinatorV2 } from './anthropicPlainTextRegenerateCoordinatorV2'
import { createAnthropicPlainTextEditResendCoordinatorV2 } from './anthropicPlainTextEditResendCoordinatorV2'
import { recoverGenerationOrphansV2 } from './generationOrphanRecoveryV2'
import { createAnthropicMessagesStreamRunnerV2 } from './anthropicMessagesStreamRunnerV2'
import { AnthropicNativeHistoryV2Repo } from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { GenerationNativeCompletionReceiptV2Repo } from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { recoverPendingGenerationNativeCompletionsV2 } from './generationNativeCompletionV2'
import { loadNativeArtifactJsonV2 } from '../../infra/db/repo/nativeArtifactStorageV2'
import { UserCapabilityRulesV2Service } from './userCapabilityRulesV2Service'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { createReviewedRequestRulePacksV2 } from '../../scripts/rules/reviewedRequestRulePacksV2'

const modelId = 'claude-opus-4-6'
const credentialScopeId = `credential-scope-v2:${'a'.repeat(64)}` as never

function database() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  return db
}

function seedConversation(db: BetterSqlite3.Database, maxOutputTokens?: number): void {
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:anthropic', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:anthropic', conversationId: 'conversation:anthropic',
      branchId: 'branch:anthropic', title: 'Conversation', branchName: 'Main', createdAtMs: 2 })
  })
  const config = new GenerationConfigV2Repo(db, () => 10)
  const current = config.getScope('conversation', 'conversation:anthropic')
  config.compareAndSetScope('conversation', 'conversation:anthropic', current.configRevision.value, {
    schemaVersion: 2, ...(maxOutputTokens === undefined ? {} : { generation: { maxOutputTokens } }),
    providerExtension: { kind: 'anthropic_messages', thinkingMode: 'model_recommended', thinkingDisplay: 'provider_default' },
  })
}

function seedActiveModel(db: BetterSqlite3.Database): void {
  const registry = ProviderCatalogAuthorityRegistryV2.get('anthropic_messages')
  if (!registry) throw new Error('Anthropic provider catalog authority is unavailable')
  const scope = Object.freeze({ providerKey: 'anthropic_messages', credentialScopeId,
    endpointProfileId: registry.endpointProfileId, operationContractId: registry.modelsContractId, category: '' })
  const observation = Object.freeze({ schemaVersion: 2 as const, providerKey: 'anthropic_messages' as const,
    endpointId: 'anthropic-models-official', nativeModelId: modelId, observedAtMs: 10,
    rawProviderRecord: Object.freeze({ id: modelId, display_name: 'Claude Opus', max_input_tokens: 200_000, max_output_tokens: 8_192 }),
    facts: Object.freeze({}),
    provenance: Object.freeze({ sourceKind: 'provider_api' as const, sourceLabel: 'anthropic_models_api', observedAtMs: 10, parserVersion: 2 as const }) })
  const repo = new ModelCatalogV2Repo(db, () => 10)
  repo.beginSync(scope, 'attempt:anthropic-model')
  repo.commitSync({ scope, attemptId: 'attempt:anthropic-model', responseDigest: '1'.repeat(64), observedAtMs: 10,
    applyMode: 'automatic', items: [{ providerKey: 'anthropic_messages', nativeModelId: modelId, modelId,
      modelKey: `anthropic_messages::${modelId}`, displayName: 'Claude Opus',
      raw: { schemaVersion: 1, buckets: [{ source: 'models', fetchedAtMs: 10, baseUrl: 'https://api.anthropic.com/v1',
        payload: { observation } }] } }] })
}

function insertManagedFile(db: BetterSqlite3.Database, input: Readonly<{
  assetId: string
  assetRevisionId: string
  filename: string
  contents: string
}>): string {
  const assets = new AttachmentAssetV2Repo(db, () => 10)
  const blob = assets.recordBlobFromBytes(new TextEncoder().encode(input.contents), 'text/plain')
  assets.createAsset({ assetId: input.assetId, assetKind: 'file', filename: input.filename, sourceKind: 'user_import' })
  const revision = assets.appendSourceRevision({ assetId: input.assetId, assetRevisionId: input.assetRevisionId, blob })
  return revision.blob.sha256.value
}

describe('Anthropic plain-text regenerate coordinator V2', () => {
  const databases: BetterSqlite3.Database[] = []
  afterEach(() => { while (databases.length) databases.pop()!.close(); anthropicCompiler.compile.mockReset() })

  it('resolves V2 thinking and preserves actual function tools through the Messages compiler ledger', async () => {
    const actual = await vi.importActual<typeof import('./anthropicMessagesPreparedRequestCompilerV2')>('./anthropicMessagesPreparedRequestCompilerV2')
    anthropicCompiler.compile.mockImplementation(actual.compileAnthropicMessagesPreparedRequestV2)
    const db = database(); databases.push(db); seedConversation(db, 4096); seedActiveModel(db)
    const subjects = buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'anthropic',
      endpointProfileId: 'anthropic-developer-api-2023-06-01', nativeModelId: modelId }, proof: { kind: 'provider_native_catalog',
      providerKey: 'anthropic_messages', scopeId: 'scope:anthropic', credentialScopeId, credentialRevision: 1,
      endpointProfileId: 'anthropic-developer-api-2023-06-01', operationContractId: 'anthropic-models-2023-06-01',
      catalogCategory: '', activeSnapshotDigest: '1'.repeat(64) } }])
    const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects })
    let draft = service.openDraft({ sessionId: 'anthropic:v2-rules' })
    for (const transfer of createReviewedRequestRulePacksV2()) draft = service.importPack({ sessionId: draft.sessionId,
      expectedDraftRevision: draft.draftRevision, transfer })
    await service.saveDraft({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision })
    new ToolRegistryV2Repo(db).installAndSelect({ schemaVersion: 2, definitions: [{ toolId: 'tool:weather', kind: 'function',
      function: { name: 'weather', parameters: { type: 'object' } }, sideEffectPolicy: 'none' }] }, null)
    const configs = new GenerationConfigV2Repo(db)
    configs.compareAndSetScope('conversation', 'conversation:anthropic', configs.getScope('conversation', 'conversation:anthropic').configRevision.value,
      { schemaVersion: 2, generation: { maxOutputTokens: 4096 }, reasoning: { mode: 'enabled', effort: 'medium' },
        providerExtension: { kind: 'anthropic_messages', thinkingMode: 'model_recommended', thinkingDisplay: 'summarized' },
        tools: { mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' } })
    const credentialService = { withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never) } as never
    const result = await createAnthropicPlainTextInitialSendCoordinatorV2({ db, credentialService }).submit({
      expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-v2-rules', branchId: 'branch:anthropic', expectedHeadMessageId: null,
        userBody: 'Describe weather.', modelId, commandAttachments: [] } })
    const body = JSON.parse(result.preparedRequest.body.copyUtf8Text())
    expect(result.execution.snapshot.requestPlan?.schemaVersion).toBe(2)
    expect(body).toMatchObject({ max_tokens: 4096, thinking: { type: 'adaptive', display: 'summarized' },
      tools: [{ name: 'weather', input_schema: { type: 'object' } }], tool_choice: { type: 'auto' } })
    expect(result.preparedRequest.ledger.entries).toContainEqual(expect.objectContaining({ path: 'providerExtension.thinkingDisplay', nativeField: 'thinking.display', disposition: 'encoded' }))
    expect(result.preparedRequest.wireEncodingProof).toBeDefined()
  })

  it('replays a provider-complete tool-use SSE receipt after native save failure without another fetch', async () => {
    let db = database()
    databases.push(db)
    seedConversation(db)
    seedActiveModel(db)
    const tools = new ToolRegistryV2Repo(db)
    tools.installAndSelect({ schemaVersion: 2, definitions: [{
      toolId: 'tool:weather', kind: 'function',
      function: { name: 'weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
      sideEffectPolicy: 'none',
    }] }, null)
    const configs = new GenerationConfigV2Repo(db, () => 20)
    const current = configs.getScope('conversation', 'conversation:anthropic')
    configs.compareAndSetScope('conversation', 'conversation:anthropic', current.configRevision.value, {
      schemaVersion: 2,
      generation: { maxOutputTokens: 4096 },
      providerExtension: { kind: 'anthropic_messages', thinkingMode: 'disabled', thinkingDisplay: 'provider_default' },
      tools: { mode: 'enabled', allowedToolIds: ['tool:weather'],
        toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' },
    } as never)
    let fetchCount = 0
    const credentialService = {
      withCredentialScopeBindingAuthority: async ({ expectedRevision, expectedCredentialScopeId, consume }: any) =>
        consume(Object.freeze({ providerKey: 'anthropic', credentialRevision: expectedRevision,
          credentialScopeId: expectedCredentialScopeId, assertCurrent: () => undefined })),
      getStatus: async () => ({ configured: true, revision: 1, credentialScopeId }),
      withCredential: async ({ consume }: any) => {
        const lease = Object.freeze({ providerKey: 'anthropic', credential: 'test-only', revision: 1,
          credentialScopeId, assertCurrent: () => undefined })
        runtimeCredentialMocks.leases.add(lease)
        try { return await consume(lease) } finally { runtimeCredentialMocks.leases.delete(lease) }
      },
    } as never
    const makePrepared = ({ execution, history }: any) => {
      const endpoint = resolveAnthropicDeveloperApiEndpointV2(readAnthropicDeveloperApiContractV2(), {
        surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
      })
      return issuePreparedProviderRequestV2({
        operationId: execution.operation.operationId.value,
        answerRootId: execution.operation.targetAnswerId.value,
        requestSequence: history.requestSequence,
        providerId: 'anthropic',
        endpointProfileId: execution.snapshot.providerBinding.endpointProfileId.value,
        credentialScopeId: execution.snapshot.providerBinding.credentialScopeId.value,
        contractId: 'anthropic-messages-2023-06-01',
        modelId,
        effectiveEndpointId: execution.snapshot.providerBinding.endpointBinding.descriptors[0]!.endpointId.value,
        endpoint: endpoint.url,
        headersPlan: createAnthropicMessagesNonSecretHeaderPlanV2(),
        body: ImmutablePreparedBodyV2.fromNativeRequest({ model: modelId, messages: history.messages,
          tools: [{ name: 'weather', input_schema: { type: 'object', properties: { city: { type: 'string' } } } }] }),
        ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'modelId', disposition: 'encoded',
          nativeField: 'model', encodingKind: 'identity', evidence: 'Anthropic receipt test compiler' }]),
        capabilityRevision: execution.capability.revision.value,
        encoderRevision: execution.capability.encoderRevision,
        snapshotHash: execution.snapshot.snapshotHash.value,
      })
    }
    anthropicCompiler.compile.mockImplementation(makePrepared)
    const initial = await createAnthropicPlainTextInitialSendCoordinatorV2({ db, credentialService, nowMs: () => 100,
      createGraphId: kind => `${kind}:receipt-test` }).submit({ expectedCredentialRevision: 1,
      expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-receipt', branchId: 'branch:anthropic',
        expectedHeadMessageId: null, userBody: 'check weather', modelId, commandAttachments: [] },
    })
    const frames = [
      ['message_start', { type: 'message_start', message: { id: 'msg:tool', type: 'message', role: 'assistant',
        model: modelId, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', id: 'toolu:weather', name: 'weather', input: {}, caller: { type: 'direct' } } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"city":"Tokyo"}' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null },
        usage: { output_tokens: 1 } }],
      ['message_stop', { type: 'message_stop' }],
    ] as const
    const sse = frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
    const makeRunner = (target: BetterSqlite3.Database) => createAnthropicMessagesStreamRunnerV2({ db: target,
      credentialService, nowMs: () => 200, fetchImpl: async () => {
        fetchCount += 1
        return new Response(sse, { headers: { 'content-type': 'text/event-stream' } })
      } })
    const saveSpy = vi.spyOn(AnthropicNativeHistoryV2Repo.prototype, 'insertRequestTerminalArtifact')
      .mockImplementationOnce(() => { throw new Error('injected Anthropic native save failure') })
    await expect(makeRunner(db).run(initial)).rejects.toMatchObject({
      code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
    })
    expect(saveSpy).toHaveBeenCalledTimes(1)
    saveSpy.mockRestore()
    expect(fetchCount).toBe(1)
    expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
    const image = db.serialize()
    db.close()
    db = new BetterSqlite3(image)
    databases[databases.length - 1] = db
    makeRunner(db)
    const recoveryResult = recoverPendingGenerationNativeCompletionsV2(db, () => 300)
    expect(recoveryResult).toEqual({ recovered: 1, pending: 0, unavailable: 0 })
    expect(fetchCount).toBe(1)
    expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(0)
    expect(db.prepare('SELECT state FROM generation_request_v2 WHERE operation_id=?').get('operation:anthropic-receipt'))
      .toEqual({ state: 'completed' })
    const nativeRow = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
      request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
      artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
      WHERE operation_id=?`).get('operation:anthropic-receipt') as {
        operationId: string; answerRootId: string; requestSequence: number; artifactKind: string
        codecVersion: number; artifactJson: string; artifactHash: string
      }
    const nativeJson = db.transaction(() => loadNativeArtifactJsonV2(db, {
      operationId: nativeRow.operationId, answerRootId: nativeRow.answerRootId,
      requestSequence: nativeRow.requestSequence, artifactKind: nativeRow.artifactKind,
    }, nativeRow.artifactJson, { artifactCodecVersion: nativeRow.codecVersion, artifactHash: nativeRow.artifactHash }))()
    expect(JSON.parse(nativeJson)).toMatchObject({ stopReason: 'tool_use' })
  })

  it('projects the frozen excluded source file into command facts and ignores a different composer file at the compiler boundary', async () => {
    // This test stubs only final request compilation (attachment coverage itself is covered in anthropicAttachmentEncodingCoverageV2.test.ts)
    // so it can exercise the coordinator's real source lookup, command projection, and persisted semantic snapshot.
    anthropicCompiler.compile.mockImplementation(({ execution, history }: any) => {
      const binding = execution.snapshot.providerBinding
      const endpoint = resolveAnthropicDeveloperApiEndpointV2(readAnthropicDeveloperApiContractV2(), {
        surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
      })
      return issuePreparedProviderRequestV2({
        operationId: execution.operation.operationId.value,
        answerRootId: execution.operation.targetAnswerId.value,
        requestSequence: history.requestSequence,
        providerId: binding.providerId.value,
        endpointProfileId: binding.endpointProfileId.value,
        credentialScopeId: binding.credentialScopeId.value,
        contractId: binding.protocolContractId.value,
        modelId: binding.modelId.value,
        effectiveEndpointId: binding.endpointBinding.descriptors[0].endpointId.value,
        endpoint: endpoint.url,
        headersPlan: createAnthropicMessagesNonSecretHeaderPlanV2(),
        body: ImmutablePreparedBodyV2.fromNativeRequest({ model: binding.modelId.value, messages: history.messages }),
        ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'modelId', disposition: 'encoded',
          nativeField: 'model', encodingKind: 'identity', evidence: 'test compiler boundary' }]),
        capabilityRevision: execution.capability.revision.value,
        encoderRevision: execution.capability.encoderRevision,
        snapshotHash: execution.snapshot.snapshotHash.value,
      })
    })
    const db = database(); databases.push(db); seedConversation(db); seedActiveModel(db)
    const credentialService = {
      withCredentialScopeBindingAuthority: async ({ expectedRevision, expectedCredentialScopeId, consume }: any) =>
        consume(Object.freeze({ providerKey: 'anthropic', credentialRevision: expectedRevision,
          credentialScopeId: expectedCredentialScopeId, assertCurrent: () => undefined })),
    } as never
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error('unexpected provider fetch') })
    const sourceDigest = insertManagedFile(db, { assetId: 'asset:source', assetRevisionId: 'revision:source',
      filename: 'source.txt', contents: 'frozen source bytes' })
    const composerDigest = insertManagedFile(db, { assetId: 'asset:composer', assetRevisionId: 'revision:composer',
      filename: 'composer.txt', contents: 'foreign composer bytes' })
    const sourceAttachment = { kind: 'managed_file', assetId: 'asset:source', assetRevisionId: 'revision:source',
      assetSha256: sourceDigest, include: false, sendAs: 'inline_text', conversion: 'none' }
    let now = 100
    const initial = createAnthropicPlainTextInitialSendCoordinatorV2({ db, credentialService, fetchImpl, nowMs: () => ++now,
      createGraphId: (kind) => `${kind}:source` })
    const source = await initial.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-source', branchId: 'branch:anthropic', expectedHeadMessageId: null,
        userBody: 'frozen source question', modelId,
        commandAttachments: [sourceAttachment] } })

    const sourceAttachments = source.execution.snapshot.semanticIntent.attachments
    expect(sourceAttachments).toHaveLength(1)
    expect(sourceAttachments[0]).toMatchObject({ kind: 'managed_file', assetId: { value: 'asset:source' },
      assetRevisionId: { value: 'revision:source' }, assetSha256: { value: sourceDigest }, include: false })
    now = 200
    expect(recoverGenerationOrphansV2(db, now)).toMatchObject({ recovered: 1, operationIds: ['operation:anthropic-source'], unrecoveredOperationIds: [] })

    const regenerate = createAnthropicPlainTextRegenerateCoordinatorV2({ db, credentialService, fetchImpl, nowMs: () => ++now,
      createAnswerId: () => 'answer:anthropic-regenerated' })
    const result = await regenerate.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-regenerate', clientActionId: 'operation:anthropic-regenerate',
        sourceBranchId: 'branch:anthropic', questionId: source.execution.operation.questionId.value,
        sourceAnswerId: source.preparedRequest.answerRootId, expectedHeadMessageId: source.preparedRequest.answerRootId,
        modelId, commandAttachments: [{ kind: 'managed_file', assetId: 'asset:composer', assetRevisionId: 'revision:composer',
          assetSha256: composerDigest, include: true, sendAs: 'provider_file', conversion: 'none' }] } })

    const attachments = result.execution.snapshot.semanticIntent.attachments
    expect(attachments).toHaveLength(1)
    const attachment = attachments[0]
    if (!attachment || attachment.kind !== 'managed_file') throw new Error('Expected the frozen managed file attachment')
    expect(attachment).toMatchObject({ assetId: { value: 'asset:source' },
      assetRevisionId: { value: 'revision:source' }, assetSha256: { value: sourceDigest }, include: false })
    expect(attachments.some((candidate) => candidate.kind === 'managed_file' && candidate.assetId.value === 'asset:composer')).toBe(false)
    const body = JSON.parse(result.preparedRequest.body.copyUtf8Text())
    expect(JSON.stringify(body)).toContain('frozen source question')
    expect(JSON.stringify(body)).not.toContain('foreign composer bytes')

    const editResend = createAnthropicPlainTextEditResendCoordinatorV2({ db, credentialService, fetchImpl, nowMs: () => ++now,
      createQuestionId: () => 'question:anthropic-edited', createAnswerId: () => 'answer:anthropic-edited' })
    const edited = await editResend.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-edit-resend', clientActionId: 'operation:anthropic-edit-resend',
        sourceBranchId: 'branch:anthropic', sourceQuestionId: source.execution.operation.questionId.value,
        sourceAnswerRootId: source.preparedRequest.answerRootId, expectedHeadMessageId: source.preparedRequest.answerRootId,
        userBody: 'edited source question', modelId,
        commandAttachments: [sourceAttachment] } })
    expect(edited.execution.snapshot.semanticIntent.attachments).toHaveLength(1)
    expect(edited.execution.snapshot.semanticIntent.attachments[0]).toMatchObject({ kind: 'managed_file',
      assetId: { value: 'asset:source' }, assetRevisionId: { value: 'revision:source' }, include: false })
    expect(JSON.parse(edited.preparedRequest.body.copyUtf8Text()).messages).toMatchObject([{ role: 'user', content: 'edited source question' }])
    expect(anthropicCompiler.compile).toHaveBeenCalledTimes(3)
    for (const [input] of anthropicCompiler.compile.mock.calls) {
      const attachments = input.execution.snapshot.semanticIntent.attachments
      expect(attachments).toMatchObject([{ kind: 'managed_file', assetId: { value: 'asset:source' },
        assetRevisionId: { value: 'revision:source' }, include: false }])
      expect(attachments.some((candidate: any) => candidate.assetId?.value === 'asset:composer')).toBe(false)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('regenerates an empty source through the real Anthropic compiler', async () => {
    const actualCompiler = await vi.importActual<typeof import('./anthropicMessagesPreparedRequestCompilerV2')>(
      './anthropicMessagesPreparedRequestCompilerV2',
    )
    anthropicCompiler.compile.mockImplementation(actualCompiler.compileAnthropicMessagesPreparedRequestV2)
    const db = database(); databases.push(db); seedConversation(db, 1024); seedActiveModel(db)
    const credentialService = {
      withCredentialScopeBindingAuthority: async ({ expectedRevision, expectedCredentialScopeId, consume }: any) =>
        consume(Object.freeze({ providerKey: 'anthropic', credentialRevision: expectedRevision,
          credentialScopeId: expectedCredentialScopeId, assertCurrent: () => undefined })),
    } as never
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error('unexpected provider fetch') })
    let now = 100
    const initial = createAnthropicPlainTextInitialSendCoordinatorV2({ db, credentialService, fetchImpl,
      nowMs: () => ++now, createGraphId: (kind) => `${kind}:empty-source` })
    const source = await initial.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-empty-source', branchId: 'branch:anthropic', expectedHeadMessageId: null,
        userBody: 'empty source question', modelId, commandAttachments: [] } })
    expect(source.execution.snapshot.semanticIntent.attachments).toEqual([])
    now = 200
    expect(recoverGenerationOrphansV2(db, now)).toMatchObject({ recovered: 1,
      operationIds: ['operation:anthropic-empty-source'], unrecoveredOperationIds: [] })

    const regenerate = createAnthropicPlainTextRegenerateCoordinatorV2({ db, credentialService, fetchImpl,
      nowMs: () => ++now, createAnswerId: () => 'answer:anthropic-empty-regenerated' })
    const result = await regenerate.submit({ expectedCredentialRevision: 1, expectedCredentialScopeId: credentialScopeId,
      command: { operationId: 'operation:anthropic-empty-regenerate', clientActionId: 'operation:anthropic-empty-regenerate',
        sourceBranchId: 'branch:anthropic', questionId: source.execution.operation.questionId.value,
        sourceAnswerId: source.preparedRequest.answerRootId, expectedHeadMessageId: source.preparedRequest.answerRootId,
        modelId, commandAttachments: [] } })
    expect(result.execution.snapshot.semanticIntent.attachments).toEqual([])
    expect(JSON.parse(result.preparedRequest.body.copyUtf8Text()).messages).toMatchObject([
      { role: 'user', content: 'empty source question' },
    ])
    expect(result.preparedRequest.endpoint).toBe('https://api.anthropic.com/v1/messages')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
