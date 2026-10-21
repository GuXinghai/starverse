import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { ConversationReadV2Repo } from '../../infra/db/repo/conversationReadV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GeminiInteractionsImageTerminalArtifactV2Repo } from '../../infra/db/repo/geminiInteractionsImageTerminalArtifactV2Repo'
import { GenerationNativeCompletionReceiptV2Repo } from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { loadNativeArtifactJsonV2 } from '../../infra/db/repo/nativeArtifactStorageV2'
import { sha256HexBytes as sha256PreparedBytesV2 } from '../../src/shared/crypto/sha256Hex'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'
import { seedMaterializedCapabilityRulesForTestV1 } from '../../infra/db/test-support/materializedCapabilityRuleTestSupport'
import type { CanonicalFactValueV1, CanonicalSemanticPathV1 } from '../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'
import type { CapabilityRuleCoreRuleV1, CapabilityRuleOwnershipSnapshotV1 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV1'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

import { createGeminiInteractionsImageInitialSendCoordinatorV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'
import { createGeminiInteractionsImageActionCoordinatorV2 } from './geminiInteractionsImageActionCoordinatorV2'
import { createGeminiInteractionsImageStreamRunnerV2 } from './geminiInteractionsImageStreamRunnerV2'
import { createGenerationNativeCompletionRecoveryWorkSourceV2, recoverPendingGenerationNativeCompletionsV2 } from './generationNativeCompletionV2'
import { UserCapabilityRulesV2Service } from './userCapabilityRulesV2Service'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/core/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { createReviewedRequestRulePacksV2 } from '../../scripts/rules/reviewedRequestRulePacksV2'
import { PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 } from '../../src/shared/provider/providerFailureV2'

const scope = `credential-scope-v2:${'a'.repeat(64)}` as never
type CapabilityRuleClaim = Readonly<{
  ruleId: string
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
}>

function exactRule(modelId: string, claim: CapabilityRuleClaim): CapabilityRuleCoreRuleV1 {
  return { ruleId: claim.ruleId, label: null, description: null, priority: 0, configured: 'on',
    providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta',
    selector: { kind: 'exact', nativeModelIds: [modelId] }, assertion: { path: claim.path, value: claim.value },
    evidence: null }
}

function imageSnapshot(modelId: string, claims: readonly CapabilityRuleClaim[]): CapabilityRuleOwnershipSnapshotV1 {
  return { schemaVersion: 1, ownership: 'cloud', ownerId: 'test:cloud', packs: [{
    schemaVersion: 1, packId: `pack.test.${modelId}`, displayName: 'Gemini image test', description: null,
    priority: 0, mode: 'no_control', target: 'enabled', rules: claims.map((claim) => exactRule(modelId, claim)),
  }] }
}

function imageClaims(modelId: string, input: Readonly<{ resolutions: readonly string[]; search?: boolean }>): readonly CapabilityRuleClaim[] {
  const claims: CapabilityRuleClaim[] = [
    { ruleId: `${modelId}.image.support`, path: 'image.generation.support', value: { kind: 'support', value: 'supported' } },
    { ruleId: `${modelId}.image.ratios`, path: 'image.generation.aspectRatios',
      value: { kind: 'aspect_ratio_set', values: [{ width: 1, height: 1 }], completeness: 'complete' } },
    { ruleId: `${modelId}.image.resolutions`, path: 'image.generation.resolutionPresets.nativeValues',
      value: { kind: 'native_string_set', values: input.resolutions, completeness: 'complete' } },
    { ruleId: `${modelId}.image.defaultResolution`, path: 'image.generation.resolutionPreset.providerDefault',
      value: { kind: 'native_string', value: input.resolutions[0]! } },
  ]
  if (input.search) claims.push(
    { ruleId: `${modelId}.search.web`, path: 'search.web.support', value: { kind: 'support', value: 'supported' } },
    { ruleId: `${modelId}.search.image`, path: 'search.image.support', value: { kind: 'support', value: 'supported' } },
  )
  return claims
}

function database(
  modelId = 'gemini-3.1-flash-image',
  claims: readonly CapabilityRuleClaim[] = imageClaims(modelId, { resolutions: ['1K'] }),
) {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:1', conversationId: 'conversation:1',
      branchId: 'branch:1', title: 'Conversation', branchName: 'Main', createdAtMs: 2 })
  })
  const configs = new GenerationConfigV2Repo(db)
  const current = configs.getScope('conversation', 'conversation:1')
  configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
    schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
    image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K', format: 'jpeg', stream: true },
    tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
  })
  const catalog = new ModelCatalogV2Repo(db, () => 10)
  const catalogScope = Object.freeze({ providerKey: 'google_ai_studio', credentialScopeId: scope,
    endpointProfileId: 'gemini-developer-api-v1beta', operationContractId: 'gemini-models-v1beta', category: '' })
  const observation = Object.freeze({ schemaVersion: 2 as const, providerKey: 'google_ai_studio' as const,
    endpointId: 'google-ai-studio-official', nativeModelId: modelId, observedAtMs: 10,
    rawProviderRecord: Object.freeze({ name: `models/${modelId}`,
      supportedGenerationMethods: Object.freeze(['generateContent']), thinking: true }),
    facts: Object.freeze({
      textChat: Object.freeze({ providerPath: 'supportedGenerationMethods', ownProperty: true,
        presence: 'present' as const, value: true, rawValue: true }),
      reasoning: Object.freeze({ providerPath: 'thinking', ownProperty: true,
        presence: 'present' as const, value: true, rawValue: true }),
      tools: Object.freeze({ providerPath: 'tools', ownProperty: false, presence: 'missing' as const }),
      structuredOutputs: Object.freeze({ providerPath: 'structuredOutputs', ownProperty: false, presence: 'missing' as const }),
      vision: Object.freeze({ providerPath: 'vision', ownProperty: false, presence: 'missing' as const }),
    }),
    provenance: Object.freeze({ sourceKind: 'provider_api' as const, sourceLabel: 'gemini_models_api',
      observedAtMs: 10, parserVersion: 2 as const }),
  })
  catalog.beginSync(catalogScope, 'attempt:image')
  catalog.commitSync({ scope: catalogScope, attemptId: 'attempt:image', responseDigest: 'a'.repeat(64),
    observedAtMs: 10, applyMode: 'automatic', items: [{ providerKey: 'google_ai_studio',
      nativeModelId: modelId, modelId,
      modelKey: `google_ai_studio::${modelId}`, displayName: 'Gemini Image', raw: { schemaVersion: 1,
        buckets: [{ source: 'models', fetchedAtMs: 10, baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          payload: { observation } }] } }] })
  seedMaterializedCapabilityRulesForTestV1(db, {
    ownershipSnapshots: [imageSnapshot(modelId, claims)],
    subjectCandidates: [{ subject: { providerAuthorityId: 'google-ai-studio',
      endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: modelId }, proof: {
      kind: 'provider_native_catalog', providerKey: 'google_ai_studio', scopeId: 'scope:test:gemini',
      credentialScopeId: scope, credentialRevision: 1, endpointProfileId: 'gemini-developer-api-v1beta',
      operationContractId: 'gemini-models-v1beta', catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64),
    } }],
  })
  return db
}
function credentialService() {
  return {
    getStatus: async () => ({ configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => consume({
      credential: 'test-key', assertCurrent: () => undefined,
    } as never),
    withCredentialScopeBindingAuthority: async ({ consume }: { consume: (authority: never) => Promise<unknown> }) =>
      consume({ assertCurrent: () => undefined } as never),
  } as never
}
function streamResponse(omitInteractionIds = false): Response {
  const interaction = { id: 'interaction:1', model: 'gemini-3.1-flash-image', status: 'completed',
    usage: { total_input_tokens: 1, total_output_tokens: 2 } }
  const createdInteraction = { ...(omitInteractionIds ? {} : { id: interaction.id }),
    model: interaction.model, status: 'in_progress' }
  const completedInteraction = omitInteractionIds
    ? { model: interaction.model, status: interaction.status, usage: interaction.usage }
    : interaction
  const events = [
    { event_type: 'interaction.created', interaction: createdInteraction },
    { event_type: 'step.start', index: 1, step: { type: 'thought' } },
    { event_type: 'step.delta', index: 1,
      delta: { type: 'thought_summary', text: 'I will draw one apple.' } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'interaction.completed', interaction: completedInteraction },
  ]
  const body = `${events.map((event) => `event: ${event.event_type}\ndata: ${JSON.stringify(event)}`).join('\n\n')}\n\nevent: done\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function streamResponseWithCapturedPartialCreated(): Response {
  const capturedCreatedFrame = { event_type: 'interaction.created',
    interaction: { object: 'interaction', model: 'gemini-3.1-flash-lite-image' } }
  // The created frame is captured evidence; all following frames are synthetic fixture data.
  const syntheticSuffix = [
    { event_type: 'step.start', index: 1, step: { type: 'thought' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'thought_summary', text: 'Synthetic thought.' } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'interaction.completed', interaction: { status: 'completed' } },
    '[DONE]',
  ]
  const frames = [capturedCreatedFrame, ...syntheticSuffix].map((event) => {
    const eventType = typeof event === 'string' ? 'done' : event.event_type
    return `event: ${eventType}\ndata: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`
  }).join('')
  return new Response(frames, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function streamResponseWithSearch(): Response {
  const interaction = { id: 'interaction:search', model: 'gemini-3.1-flash-image', status: 'completed',
    usage: { total_input_tokens: 3, total_output_tokens: 4 } }
  const events = [
    { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
    { event_type: 'step.start', index: 0, step: { type: 'google_search_call', id: 'search-1' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'google_search_call', arguments: { queries: ['red apple'] } } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'step.start', index: 1, step: { type: 'google_search_result', call_id: 'search-1' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'google_search_result', is_error: false,
      result: [{ search_suggestions: '<div>Apple result</div>' }] } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'step.start', index: 2, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 2, delta: { type: 'text', text: 'Found it.', annotations: [
      { type: 'url_citation', url: 'https://example.test/apple', title: 'Apple', start_index: 0, end_index: 5 },
    ] } },
    { event_type: 'step.delta', index: 2, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
    { event_type: 'step.stop', index: 2 },
    { event_type: 'interaction.completed', interaction },
  ]
  const body = `${events.map((event) => `event: ${event.event_type}\ndata: ${JSON.stringify(event)}`).join('\n\n')}\n\nevent: done\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function streamResponseWithUnknownServerTool(): Response {
  const body = [
    'event: interaction.created\ndata: {"event_type":"interaction.created","interaction":{"id":"interaction:unknown","model":"gemini-3.1-flash-image","status":"in_progress"}}',
    'event: step.start\ndata: {"event_type":"step.start","index":0,"step":{"type":"code_execution_call","id":"code-1"}}',
  ].join('\n\n') + '\n\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function streamResponseWithProviderError(): Response {
  const body = [
    'event: interaction.created\ndata: {"event_type":"interaction.created","interaction":{"id":"interaction:error","model":"gemini-3.1-flash-image","status":"in_progress"}}',
    'event: error\ndata: {"event_type":"error","error":{"code":"INVALID_ARGUMENT","status":"INVALID_ARGUMENT","message":"The prompt is invalid.","request_id":"req-error-1","details":{"field":"input"}}}',
  ].join('\n\n') + '\n\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('Gemini Interactions image generation V2', () => {
  it('uses applied V2 rules for required thinking and the actual image compiler ledger', async () => {
    const modelId = 'gemini-3.1-flash-image'
    const db = database(modelId)
    try {
      const subjects = buildAuthoritativeModelSubjectSetV1([{ subject: { providerAuthorityId: 'google-ai-studio',
        endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: modelId }, proof: { kind: 'provider_native_catalog',
        providerKey: 'google_ai_studio', scopeId: 'scope:test:gemini', credentialScopeId: scope, credentialRevision: 1,
        endpointProfileId: 'gemini-developer-api-v1beta', operationContractId: 'gemini-models-v1beta',
        catalogCategory: '', activeSnapshotDigest: 'a'.repeat(64) } }])
      const service = new UserCapabilityRulesV2Service(db, { readCurrent: async () => subjects })
      let draft = service.openDraft({ sessionId: 'interactions:v2-rules' })
      for (const transfer of createReviewedRequestRulePacksV2()) draft = service.importPack({ sessionId: draft.sessionId,
        expectedDraftRevision: draft.draftRevision, transfer })
      await service.saveDraft({ sessionId: draft.sessionId, expectedDraftRevision: draft.draftRevision })
      const configs = new GenerationConfigV2Repo(db)
      configs.compareAndSetScope('conversation', 'conversation:1', configs.getScope('conversation', 'conversation:1').configRevision.value,
        { schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
          image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K', format: 'jpeg', stream: true },
          tools: { mode: 'disabled' }, providerExtension: { kind: 'gemini_interactions', thinkingLevel: 'high' } })
      let ids = 0
      const result = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(),
        createGraphId: kind => `${kind}:v2-${++ids}` }).submit({ command: { operationId: 'operation:v2-interactions',
          branchId: 'branch:1', expectedHeadMessageId: null, prompt: 'Draw a blue square.', modelId, commandAttachments: [] },
          expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(result.preparedRequest).toBeDefined()
      const prepared = result.preparedRequest!
      expect(JSON.parse(prepared.body.copyUtf8Text())).toMatchObject({
        response_format: { type: 'image', image_size: '1K', aspect_ratio: '1:1', mime_type: 'image/jpeg' },
        generation_config: { thinking_level: 'high' },
      })
      expect(prepared.ledger.entries).toContainEqual(expect.objectContaining({ path: 'providerExtension.thinkingLevel',
        nativeField: 'generation_config.thinking_level', disposition: 'encoded' }))
      expect(prepared.ledger.entries).toContainEqual(expect.objectContaining({ path: 'image.resolution',
        nativeField: 'response_format.image_size', disposition: 'encoded' }))
      const stored = JSON.parse((db.prepare('SELECT canonical_json FROM assistant_generation_snapshot_v2').get() as { canonical_json: string }).canonical_json)
      expect(stored.requestPlan.schemaVersion).toBe(2)
      expect(stored.requestPlan.requestedIntent.reasoning.mode).toBe('disabled')
      expect(stored.semanticIntent.reasoning.mode).toBe('enabled')
      expect(prepared.wireEncodingProof).toBeDefined()
    } finally { db.close() }
  })
  it('round-trips native image bytes through a durable receipt and recovers blob/native writes without another fetch', async () => {
    let db = database()
    let ids = 0
    let clock = 100
    let fetchCount = 0
    const persistedBytes: Uint8Array[] = []
    const attachmentBlobStore = { persist: (bytes: Uint8Array) => { persistedBytes.push(Uint8Array.from(bytes)) } } as never
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => clock++, createGraphId: (kind) => `${kind}:${++ids}` })
        .submit({ command: { operationId: 'operation:image-receipt', branchId: 'branch:1',
          expectedHeadMessageId: null, prompt: 'draw an apple', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
          expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      const makeRunner = (target: BetterSqlite3.Database) => createGeminiInteractionsImageStreamRunnerV2({ db: target,
        credentialService: credentialService(), attachmentBlobStore, nowMs: () => clock++,
        fetchImpl: async () => { fetchCount += 1; return streamResponse(true) } })
      const saveSpy = vi.spyOn(GeminiInteractionsImageTerminalArtifactV2Repo.prototype, 'insertRequestTerminal')
        .mockImplementationOnce(() => { throw new Error('injected Gemini image native artifact failure') })
      await expect(makeRunner(db).run(initial)).rejects.toMatchObject({
        code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING', receiptPersisted: true,
      })
      saveSpy.mockRestore()
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(1)
      expect(persistedBytes).toEqual([new Uint8Array(Buffer.from('image'))])

      await createGenerationNativeCompletionRecoveryWorkSourceV2(db).quiesce()
      const image = db.serialize()
      db.close()
      db = new BetterSqlite3(image)
      makeRunner(db)
      expect(recoverPendingGenerationNativeCompletionsV2(db, () => clock++)).toEqual({
        recovered: 1, pending: 0, unavailable: 0,
      })
      expect(fetchCount).toBe(1)
      expect(new GenerationNativeCompletionReceiptV2Repo(db).listPending()).toHaveLength(0)
      expect(persistedBytes).toEqual([new Uint8Array(Buffer.from('image')), new Uint8Array(Buffer.from('image'))])
      expect(db.prepare("SELECT state FROM generation_request_v2 WHERE operation_id='operation:image-receipt'").get())
        .toEqual({ state: 'completed' })
      expect(db.prepare("SELECT count(*) AS count FROM generation_image_output_v2 WHERE operation_id='operation:image-receipt'").get())
        .toEqual({ count: 1 })
      const artifactRow = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
        request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
        artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
        WHERE operation_id='operation:image-receipt'`).get() as {
          operationId: string; answerRootId: string; requestSequence: number; artifactKind: string
          codecVersion: number; artifactJson: string; artifactHash: string
        }
      const artifactJson = db.transaction(() => loadNativeArtifactJsonV2(db, {
        operationId: artifactRow.operationId, answerRootId: artifactRow.answerRootId,
        requestSequence: artifactRow.requestSequence, artifactKind: artifactRow.artifactKind,
      }, artifactRow.artifactJson, { artifactCodecVersion: artifactRow.codecVersion, artifactHash: artifactRow.artifactHash }))()
      expect(JSON.parse(artifactJson).interactionId).toBeNull()
    } finally { if (db.open) db.close() }
  })

  it('keeps an unknown exact image model unresolved instead of inheriting a family capability', async () => {
    const db = database('gemini-3.1-flash-image-future', [])
    try {
      const coordinator = createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 100,
        createGraphId: (kind) => `${kind}:unknown` })
      const result = await coordinator.submit({ command: { operationId: 'operation:unknown-image', branchId: 'branch:1',
        expectedHeadMessageId: null, prompt: 'draw', modelId: 'gemini-3.1-flash-image-future', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(result.kind).toBe('created')
      expect(result.execution.capability.fields.find((field) => field.path === 'image.mode')?.state)
        .toBe('unknown')
    } finally { db.close() }
  })

  it('rejects a model whose exact capability marks image generation unsupported before preparing a request', async () => {
    const modelId = 'gemini-3.1-flash-image-preview'
    const db = database(modelId, [{ ruleId: `${modelId}.image.support`, path: 'image.generation.support',
      value: { kind: 'support', value: 'unsupported' } }])
    try {
      const coordinator = createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 100, createGraphId: (kind) => `${kind}:unsupported` })
      await expect(coordinator.submit({ command: { operationId: 'operation:unsupported-image', branchId: 'branch:1',
        expectedHeadMessageId: null, prompt: 'draw', modelId, commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })).rejects.toThrow(/^GENERATION_V2_/)
    } finally { db.close() }
  })

  it('omits a resolution outside the target model domain while retaining the requested setting', async () => {
    const db = database('gemini-3.1-flash-lite-image')
    try {
      const configs = new GenerationConfigV2Repo(db)
      const current = configs.getScope('conversation', 'conversation:1')
      configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
        image: { mode: 'generate', aspectRatio: '1:1', resolution: '4K', format: 'jpeg', stream: true },
        tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      })
      const coordinator = createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 100, createGraphId: (kind) => `${kind}:resolution` })
      const result = await coordinator.submit({ command: { operationId: 'operation:bad-resolution', branchId: 'branch:1',
        expectedHeadMessageId: null, prompt: 'draw', modelId: 'gemini-3.1-flash-lite-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(result.execution.snapshot.semanticIntent.image).not.toHaveProperty('resolution')
      expect(configs.getScope('conversation', 'conversation:1').semanticLayer.image).toMatchObject({ resolution: '4K' })
      expect(result.preparedRequest?.ledger.entries.some(entry => entry.path === 'compatibility.settings.image.resolution')).toBe(true)
    } finally { db.close() }
  })

  it('rejects image search when the exact model has no evidenced search capability', async () => {
    const db = database('gemini-3-pro-image')
    try {
      const configs = new GenerationConfigV2Repo(db)
      const current = configs.getScope('conversation', 'conversation:1')
      configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'provider_search', types: ['image'] },
        image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K', format: 'jpeg', stream: true },
        tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      })
      const coordinator = createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 100, createGraphId: (kind) => `${kind}:search` })
      const result = await coordinator.submit({ command: { operationId: 'operation:unsupported-search', branchId: 'branch:1',
        expectedHeadMessageId: null, prompt: 'draw', modelId: 'gemini-3-pro-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(result.kind).toBe('created')
      expect(result.execution.capability.fields.find((field) => field.path === 'web.mode')?.state)
        .toBe('unknown')
    } finally { db.close() }
  })

  it('keeps omitted image domain fields omitted on the wire', async () => {
    const db = database(); let ids = 0
    try {
      const configs = new GenerationConfigV2Repo(db)
      const current = configs.getScope('conversation', 'conversation:1')
      configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
        image: { mode: 'generate', format: 'jpeg', stream: true },
        tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      })
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db,
        credentialService: credentialService(), nowMs: () => 100,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:omitted-image-domain', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(JSON.parse(initial.preparedRequest!.body.copyUtf8Text()).response_format).toEqual({
        type: 'image', mime_type: 'image/jpeg',
      })
    } finally { db.close() }
  })

  it('commits chosen/head before streaming and keeps a failed retry-as-new current', async () => {
    const modelId = 'gemini-3.1-flash-lite-image'
    const db = database(modelId); let ids = 0; let clock = 100
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId, commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(initial.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(JSON.parse(initial.preparedRequest!.body.copyUtf8Text())).toEqual({
        input: 'draw', model: modelId,
        response_format: { aspect_ratio: '1:1', image_size: '1K', mime_type: 'image/jpeg', type: 'image' },
        store: false, stream: true,
      })
      const fetchImpl = vi.fn(async () => streamResponseWithCapturedPartialCreated())
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl, nowMs: () => clock++ }).run(initial)
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get()).toEqual({ status: 'completed' })
      expect(db.prepare('SELECT count(*) AS count FROM generation_image_output_v2').get()).toEqual({ count: 1 })
      const readBack = new ConversationReadV2Repo(db).readBranch('branch:1')
      expect(readBack.turns[0]?.answers.find((answer) => answer.answerRootId === 'answer:2')?.images).toMatchObject([
        { mime: 'image/jpeg' },
      ])
      expect(db.prepare("SELECT artifact_kind AS kind FROM generation_native_artifact_v2 WHERE answer_root_id='answer:2'").get())
        .toEqual({ kind: 'gemini_interactions_image_terminal_v2' })
      const artifactRow = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
        request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
        artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
        WHERE answer_root_id='answer:2'`).get() as {
          operationId: string; answerRootId: string; requestSequence: number; artifactKind: string
          codecVersion: number; artifactJson: string; artifactHash: string
        }
      const rawArtifactJson = db.transaction(() => loadNativeArtifactJsonV2(db, {
        operationId: artifactRow.operationId, answerRootId: artifactRow.answerRootId,
        requestSequence: artifactRow.requestSequence, artifactKind: artifactRow.artifactKind,
      }, artifactRow.artifactJson, { artifactCodecVersion: artifactRow.codecVersion, artifactHash: artifactRow.artifactHash }))()
      expect(JSON.parse(rawArtifactJson).interactionId).toBeNull()
      expect(new AnswerReasoningProjectionV2Repo(db).list('answer:2')).toEqual([
        { type: 'thought_summary', summary: 'Synthetic thought.' },
      ])

      const actions = createGeminiInteractionsImageActionCoordinatorV2({ db, credentialService: credentialService(),
        nowMs: () => clock++, createAnswerId: () => 'answer:retry' })
      const retry = await actions.retry({ actionKind: 'retry_as_new', operationId: 'operation:retry',
        clientActionId: 'operation:retry', sourceBranchId: 'branch:1',
        questionId: 'question:1', sourceAnswerId: 'answer:2', expectedHeadMessageId: 'answer:2' })
      const retryBranchId = retry.projection.branchProjection.branchId.value
      expect(retryBranchId).not.toBe('branch:1')
      expect(retry.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:retry' }, headMessageId: { value: 'answer:retry' },
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never,
        fetchImpl: async () => new Response('denied', { status: 503 }), nowMs: () => clock++ }).run(retry)
      expect(db.prepare('SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id=?').get(retryBranchId))
        .toEqual({ chosen: 'answer:retry' })
      expect(db.prepare('SELECT head_message_id AS head FROM branch_v2 WHERE branch_id=?').get(retryBranchId))
        .toEqual({ head: 'answer:retry' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:2' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:retry'").get()).toEqual({ status: 'failed' })
    } finally { db.close() }
  })

  it('regenerates from the source question attachments, ignoring composer attachments, and retry keeps its frozen snapshot', async () => {
    const db = database(); let ids = 0; let clock = 100
    const urlAttachment = (name: string) => { const url = `https://example.com/${name}.png`
      const urlDigest = sha256PreparedBytesV2(new TextEncoder().encode(url))
      db.prepare(`INSERT INTO url_attachment_reference_v2 (reference_id, reference_revision, original_url, url_digest, media_kind,
        declared_media_type, captured_at_ms, provenance, created_at_ms) VALUES (?, ?, ?, ?, 'image', NULL, 1, 'user_supplied', 1)`)
        .run(`url:${name}`, `revision:${name}`, url, urlDigest)
      return { kind: 'url_reference', referenceId: `url:${name}`, referenceRevision: `revision:${name}`, originalUrl: url,
        urlDigest, mediaKind: 'image', capturedAtMs: 1,
        provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' } }
    // Gemini image cannot carry attachments, so the frozen source is empty; an included composer attachment would throw if it leaked in.
    const attachmentRows = () => db.prepare('SELECT * FROM message_v2').all()
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null, prompt: 'draw',
          modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      const sourceAttachments = initial.execution.snapshot.semanticIntent.attachments
      expect(sourceAttachments).toEqual([])
      const sourceAnswerId = initial.projection.branchProjection.chosenAnswerRootId!.value
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl: async () => streamResponse(), nowMs: () => clock++ }).run(initial)
      const before = attachmentRows()
      let head = sourceAnswerId; let n = 0
      const actions = createGeminiInteractionsImageActionCoordinatorV2({ db, credentialService: credentialService(),
        nowMs: () => clock++, createAnswerId: () => `answer:regen:${++n}` })
      const regenerate = async (commandAttachments: readonly unknown[]) => {
        const result = await actions.regenerate({ operationId: `operation:regen:${n + 1}`, clientActionId: `operation:regen:${n + 1}`,
          sourceBranchId: result0Branch(), questionId: 'question:1', sourceAnswerId, expectedHeadMessageId: head,
          modelId: 'gemini-3.1-flash-image', commandAttachments })
        return result
      }
      const result0Branch = () => 'branch:1'
      const foreign = await regenerate([urlAttachment('composer-foreign')])
      expect(foreign.execution.snapshot.semanticIntent.attachments).toEqual(sourceAttachments)
      head = sourceAnswerId
      const empty = await regenerate([])
      expect(empty.execution.snapshot.semanticIntent.attachments).toEqual(sourceAttachments)
      expect(attachmentRows().slice(0, before.length)).toEqual(before)
      expect(new GenerationExecutionV2Repo(db).getSnapshotByAnswerRootId(sourceAnswerId)?.semanticIntent.attachments)
        .toEqual(sourceAttachments)
      const retry = await actions.retry({ actionKind: 'retry_as_new', operationId: 'operation:retry-frozen',
        clientActionId: 'operation:retry-frozen', sourceBranchId: 'branch:1', questionId: 'question:1', sourceAnswerId,
        expectedHeadMessageId: sourceAnswerId })
      expect(retry.execution.snapshot.semanticIntent.attachments).toEqual(sourceAttachments)
    } finally { db.close() }
  })

  it('persists Google Search evidence and citations with the generated image', async () => {
    const db = database('gemini-3.1-flash-image', imageClaims('gemini-3.1-flash-image', { resolutions: ['1K'], search: true })); let ids = 0; let clock = 100
    try {
      const configs = new GenerationConfigV2Repo(db)
      const current = configs.getScope('conversation', 'conversation:1')
      configs.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
        web: { mode: 'provider_search', types: ['image'] },
        image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K', format: 'jpeg', stream: true },
        tools: { mode: 'disabled' }, providerExtension: { kind: 'none' },
      })
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:search', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw an apple', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(JSON.parse(initial.preparedRequest!.body.copyUtf8Text()).tools).toEqual([
        { search_types: ['image_search'], type: 'google_search' },
      ])
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl: async () => streamResponseWithSearch(), nowMs: () => clock++ }).run(initial)
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get()).toEqual({ status: 'completed' })
      const artifact = db.prepare(`SELECT operation_id AS operationId, answer_root_id AS answerRootId,
        request_sequence AS requestSequence, artifact_kind AS artifactKind, codec_version AS codecVersion,
        artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
        WHERE answer_root_id='answer:2'`).get() as {
          operationId: string; answerRootId: string; requestSequence: number; artifactKind: string
          codecVersion: number; artifactJson: string; artifactHash: string
        }
      const rawArtifactJson = db.transaction(() => loadNativeArtifactJsonV2(db, {
        operationId: artifact.operationId, answerRootId: artifact.answerRootId,
        requestSequence: artifact.requestSequence, artifactKind: artifact.artifactKind,
      }, artifact.artifactJson, { artifactCodecVersion: artifact.codecVersion, artifactHash: artifact.artifactHash }))()
      expect(JSON.parse(rawArtifactJson)).toMatchObject({
        artifactKind: 'gemini_interactions_image_terminal_v2',
        searchEvidence: { calls: [{ id: 'search-1' }], results: [{ callId: 'search-1', searchSuggestions: '<div>Apple result</div>' }] },
      })
      expect(new AnswerReasoningProjectionV2Repo(db).list('answer:2')).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'google_search_call', id: 'search-1' }),
        expect.objectContaining({ type: 'google_search_result', call_id: 'search-1', search_suggestions: '<div>Apple result</div>' }),
        expect.objectContaining({ type: 'url_citation' }),
      ]))
    } finally { db.close() }
  })

  it('persists the failing shape-validation frame through the runner and sanitizes credentials', async () => {
    const db = database(); let ids = 0; let clock = 100
    const fetchImpl = vi.fn(async () => new Response(
      'event: interaction.created\ndata: ' + JSON.stringify({ event_type: 'interaction.created',
        interaction: { id: 'interaction:invalid-shape', model: 'gemini-3.1-flash-image', status: 'in_progress' } }) + '\n\n' +
      'event: step.delta\ndata: ' + JSON.stringify({ event_type: 'step.delta', index: 'invalid',
        delta: { type: 'image', mime_type: 'image/png', data: 'A'.repeat(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2 + 8192) },
        metadata: { api_key: 'secret-large-frame-credential' } }) + '\n\n',
      { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'DUMMY_GEMINI_REQUEST_ID' } },
    ))
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(),
        nowMs: () => clock++, createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:invalid-shape', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(), fetchImpl,
        attachmentBlobStore: { persist: vi.fn() } as never, nowMs: () => clock++ }).run(initial)
      const row = db.prepare(`SELECT state, error_message AS errorMessage, error_fact_json AS fact
        FROM generation_operation_v2 WHERE operation_id=?`).get('operation:invalid-shape') as {
          state: string; errorMessage: string; fact: string
        }
      const failure = JSON.parse(row.fact)
      expect(row.state).toBe('failed')
      expect(row.errorMessage).toBe('PROVIDER_RESPONSE_DECODE_FAILED')
      expect(row.errorMessage.length).toBeLessThanOrEqual(8192)
      expect(failure).toMatchObject({ origin: 'response_decoder', phase: 'stream_decode',
        httpStatus: 200, starverseDiagnosticCode: 'PROVIDER_RESPONSE_DECODE_FAILED',
        providerError: { requestId: 'DUMMY_GEMINI_REQUEST_ID', rawJson: null,
          rawText: expect.stringContaining('"stage":"frame_decode"') },
      })
      expect(failure.providerError.rawText).toContain('"fieldPath":"index"')
      expect(failure.providerError.rawText).toMatch(/^\{"streamDiagnostic":\{"stage":"frame_decode","fieldPath":"index"/u)
      expect(failure.providerError.rawText.length).toBeLessThanOrEqual(PROVIDER_FAILURE_RAW_LIMIT_BYTES_V2)
      expect(failure.redactions).toContainEqual({ path: 'providerError.rawJson.metadata.api_key', reason: 'credential' })
      expect(failure).not.toHaveProperty('headers')
      expect(failure.rawFrameExcerpt).toContain('step.delta')
      expect(failure.rawFrameExcerpt).toContain('invalid')
      expect(row.fact).not.toContain('secret-large-frame-credential')
      expect(failure.providerError.requestId).toBe('DUMMY_GEMINI_REQUEST_ID')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(db.prepare('SELECT count(*) AS n FROM generation_image_output_v2').get()).toEqual({ n: 0 })
    } finally { db.close() }
  })

  it('persists an unknown server-side tool as a raw decoder failure fact', async () => {
    const db = database(); let ids = 0; let clock = 100
    const projections: Array<Record<string, unknown>> = []
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:unknown-tool', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl: async () => streamResponseWithUnknownServerTool(),
        streamProjectionSink: { publish: (projection) => projections.push(projection as unknown as Record<string, unknown>) },
        nowMs: () => clock++ }).run(initial)
      const operation = db.prepare("SELECT state, error_code AS errorCode, error_fact_json AS errorFactJson FROM generation_operation_v2 WHERE operation_id='operation:unknown-tool'").get() as {
        state: string; errorCode: string; errorFactJson: string
      }
      expect(operation.state).toBe('failed')
      expect(operation.errorCode).toBe('PROVIDER_RESPONSE_DECODE_FAILED')
      expect(JSON.parse(operation.errorFactJson)).toMatchObject({
        origin: 'response_decoder', phase: 'stream_decode',
        providerError: { rawJson: { event_type: 'step.start', step: { type: 'code_execution_call', id: 'code-1' } } },
      })
      expect(projections.find((projection) => projection.type === 'terminal')).toMatchObject({
        state: 'failed', errorFact: { providerError: { rawJson: { event_type: 'step.start' } } },
      })
    } finally { db.close() }
  })

  it('persists Provider HTTP facts instead of discarding a non-2xx body', async () => {
    const db = database(); let ids = 0; let clock = 100
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:http-error', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never,
        fetchImpl: async () => new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT',
          message: 'The prompt is invalid.', request_id: 'req-http-1', details: { field: 'input' } } }), {
          status: 400, statusText: 'Bad Request', headers: { 'content-type': 'application/json', 'retry-after': '2' },
        }), nowMs: () => clock++ }).run(initial)
      const operation = db.prepare("SELECT state, error_code AS errorCode, error_message AS errorMessage, error_fact_json AS errorFactJson FROM generation_operation_v2 WHERE operation_id='operation:http-error'").get() as {
        state: string; errorCode: string; errorMessage: string; errorFactJson: string
      }
      expect(operation.state).toBe('failed')
      expect(operation.errorCode).toBe('PROVIDER_RESPONSE_HTTP_ERROR')
      expect(operation.errorMessage).toContain('The prompt is invalid.')
      expect(JSON.parse(operation.errorFactJson)).toMatchObject({
        origin: 'http_response', phase: 'response_headers', httpStatus: 400,
        providerError: { code: 400, status: 'INVALID_ARGUMENT', message: 'The prompt is invalid.', requestId: 'req-http-1', retryAfterMs: 2000,
          rawJson: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'The prompt is invalid.' } } },
      })
    } finally { db.close() }
  })

  it('keeps Provider SSE error facts and classifies them as provider stream failures', async () => {
    const db = database(); let ids = 0; let clock = 100
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:sse-error', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl: async () => streamResponseWithProviderError(), nowMs: () => clock++ }).run(initial)
      const operation = db.prepare("SELECT state, error_code AS errorCode, error_message AS errorMessage, error_fact_json AS errorFactJson FROM generation_operation_v2 WHERE operation_id='operation:sse-error'").get() as {
        state: string; errorCode: string; errorMessage: string; errorFactJson: string
      }
      expect(operation.state).toBe('failed')
      expect(operation.errorCode).toBe('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED')
      expect(operation.errorMessage).toContain('The prompt is invalid.')
      expect(JSON.parse(operation.errorFactJson)).toMatchObject({
        origin: 'response_stream', phase: 'stream_read',
        providerError: { code: 'INVALID_ARGUMENT', status: 'INVALID_ARGUMENT', message: 'The prompt is invalid.', requestId: 'req-error-1' },
        rawFrameExcerpt: expect.stringContaining('INVALID_ARGUMENT'),
      })
    } finally { db.close() }
  })
})
