import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ModelCatalogV2Repo } from '../../infra/db/repo/modelCatalogV2Repo'

vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))

import { createGeminiInteractionsImageInitialSendCoordinatorV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'
import { createGeminiInteractionsImageActionCoordinatorV2 } from './geminiInteractionsImageActionCoordinatorV2'
import { createGeminiInteractionsImageStreamRunnerV2 } from './geminiInteractionsImageStreamRunnerV2'

const scope = `credential-scope-v2:${'a'.repeat(64)}` as never
function database() {
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
    endpointId: 'google-ai-studio-official', nativeModelId: 'gemini-3.1-flash-image', observedAtMs: 10,
    rawProviderRecord: Object.freeze({ name: 'models/gemini-3.1-flash-image',
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
    observedAtMs: 10, applyMode: 'automatic', items: [{ nativeModelId: 'gemini-3.1-flash-image',
      modelId: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image', raw: { schemaVersion: 1,
        buckets: [{ source: 'models', fetchedAtMs: 10, baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          payload: { observation } }] } }] })
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
function streamResponse(): Response {
  const interaction = { id: 'interaction:1', model: 'gemini-3.1-flash-image', status: 'completed',
    usage: { total_input_tokens: 1, total_output_tokens: 2 } }
  const events = [
    { event_type: 'interaction.created', interaction: { id: interaction.id, model: interaction.model, status: 'in_progress' } },
    { event_type: 'step.start', index: 1, step: { type: 'thought' } },
    { event_type: 'step.delta', index: 1,
      delta: { type: 'thought_summary', text: 'I will draw one apple.' } },
    { event_type: 'step.stop', index: 1 },
    { event_type: 'step.start', index: 0, step: { type: 'model_output' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'image', data: 'aW1hZ2U=', mime_type: 'image/jpeg' } },
    { event_type: 'step.stop', index: 0 },
    { event_type: 'interaction.completed', interaction },
  ]
  const body = `${events.map((event) => `event: ${event.event_type}\ndata: ${JSON.stringify(event)}`).join('\n\n')}\n\nevent: done\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
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
  it('commits chosen/head before streaming and keeps a failed retry-as-new current', async () => {
    const db = database(); let ids = 0; let clock = 100
    try {
      const initial = await createGeminiInteractionsImageInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => clock++,
        createGraphId: (kind) => `${kind}:${++ids}` }).submit({
        command: { operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
          prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(initial.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(JSON.parse(initial.preparedRequest!.body.copyUtf8Text())).toEqual({
        input: 'draw', model: 'gemini-3.1-flash-image',
        response_format: { aspect_ratio: '1:1', image_size: '1K', mime_type: 'image/jpeg', type: 'image' },
        store: false, stream: true,
      })
      const fetchImpl = vi.fn(async () => streamResponse())
      await createGeminiInteractionsImageStreamRunnerV2({ db, credentialService: credentialService(),
        attachmentBlobStore: { persist: vi.fn() } as never, fetchImpl, nowMs: () => clock++ }).run(initial)
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get()).toEqual({ status: 'completed' })
      expect(db.prepare('SELECT count(*) AS count FROM generation_image_output_v2').get()).toEqual({ count: 1 })
      expect(db.prepare("SELECT artifact_kind AS kind FROM generation_native_artifact_v2 WHERE answer_root_id='answer:2'").get())
        .toEqual({ kind: 'gemini_interactions_image_terminal_v2' })
      expect(new AnswerReasoningProjectionV2Repo(db).list('answer:2')).toEqual([
        { type: 'thought_summary', summary: 'I will draw one apple.' },
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

  it('persists Google Search evidence and citations with the generated image', async () => {
    const db = database(); let ids = 0; let clock = 100
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
      const artifact = db.prepare("SELECT artifact_json AS artifactJson FROM generation_native_artifact_v2 WHERE answer_root_id='answer:2'").get() as { artifactJson: string }
      expect(JSON.parse(artifact.artifactJson)).toMatchObject({
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
