import BetterSqlite3 from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import { createOpenAIResponsesPlainTextInitialSendCoordinatorV2 } from './openAIResponsesPlainTextInitialSendCoordinatorV2'
import { createOpenAIResponsesInitialStreamRunnerV2 } from './openAIResponsesInitialStreamRunnerV2'
import { createOpenAIResponsesPlainTextRetryCoordinatorV2 } from './openAIResponsesPlainTextRetryCoordinatorV2'
import { createOpenAIResponsesPlainTextRegenerateCoordinatorV2 } from './openAIResponsesPlainTextRegenerateCoordinatorV2'

const scope = 'credential-scope-v2:'.concat('d'.repeat(64)) as never

function modelResponse(): Response {
  const value = new Response(JSON.stringify({
    object: 'list', data: [{ id: 'gpt-5.6-sol', object: 'model', created: 1, owned_by: 'openai' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: 200, url: 'https://api.openai.com/v1/models', headers: value.headers, body: value.body,
  }) as unknown as Response
}

function credentialService() {
  return {
    getStatus: async () => ({
      providerKey: 'openai_responses', configured: true, revision: 1, credentialScopeId: scope,
    }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const state = { active: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'openai_responses', credential: 'sk-test', revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!state.active) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally {
        state.active = false
        mocks.leases.delete(lease)
      }
    },
  } as never
}

function sse(type: string, sequenceNumber: number, value: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequenceNumber, ...value })}\n\n`
}

function completedStream(text = 'hello from OpenAI'): Response {
  const output = [{
    id: 'msg_1', type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
  }]
  const body = [
    sse('response.output_text.delta', 1, {
      item_id: 'msg_1', output_index: 0, content_index: 0, delta: text,
    }),
    sse('response.output_item.done', 2, { output_index: 0, item: output[0] }),
    sse('response.completed', 3, { response: {
      id: 'resp_1', object: 'response', created_at: 1, completed_at: 2,
      status: 'completed', model: 'gpt-5.6-sol', output,
      usage: {
        input_tokens: 3, output_tokens: 4, total_tokens: 7,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 },
      }, error: null, incomplete_details: null,
    } }),
  ].join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function unterminatedPartialStream(text = 'partial'): Response {
  return new Response(sse('response.output_text.delta', 1, {
    item_id: 'msg_1', output_index: 0, content_index: 0, delta: text,
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function incompleteTerminalOnlyStream(text = 'terminal partial'): Response {
  const output = [{
    id: 'msg_incomplete', type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text, annotations: [] }],
  }]
  return new Response(sse('response.incomplete', 1, { response: {
    id: 'resp_incomplete', object: 'response', created_at: 1, completed_at: null,
    status: 'incomplete', model: 'gpt-5.6-sol', output, usage: null, error: null,
    incomplete_details: { reason: 'max_output_tokens' },
  } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1',
      title: 'Conversation', branchName: 'Main', createdAtMs: 2,
    })
  })
  return db
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
    userBody: 'hello', modelId: 'gpt-5.6-sol', commandAttachments: [], ...overrides,
  }
}

function coordinator(db: BetterSqlite3.Database) {
  let next = 0
  return createOpenAIResponsesPlainTextInitialSendCoordinatorV2({
    db, credentialService: credentialService(), nowMs: () => 100,
    createGraphId: (kind) => `${kind}:${++next}`,
  })
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'))
})
afterEach(() => vi.restoreAllMocks())

describe('OpenAI Responses plain-text initial-send coordinator V2', () => {
  it('atomically commits the current answer projection and exact persisted request bytes', async () => {
    const db = database()
    try {
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2,
        generation: { maxOutputTokens: 2048 },
        reasoning: { mode: 'enabled', effort: 'max', summary: 'auto' },
        providerExtension: {
          kind: 'openai_responses', verbosity: 'high', maxToolCalls: 4,
          parallelToolCalls: false, serviceTier: 'priority',
        },
      })
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const result = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(result.kind).toBe('created')
      expect(result.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(result.projection.visibleCandidates.map((candidate) => candidate.value)).toEqual(['answer:2'])
      expect(JSON.parse(result.preparedRequest.body.copyUtf8Text())).toEqual({
        model: 'gpt-5.6-sol',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }],
        stream: true, store: false, include: ['reasoning.encrypted_content'],
        reasoning: { effort: 'max', summary: 'auto' }, max_output_tokens: 2048,
        text: { verbosity: 'high' }, max_tool_calls: 4,
        parallel_tool_calls: false, service_tier: 'priority',
      })
      expect(result.preparedRequest.bodySha256).toBe(result.request.preparedBodySha256)
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM assistant_generation_snapshot_v2) AS snapshots,
        (SELECT count(*) FROM generation_request_v2) AS requests`).get())
        .toEqual({ operations: 1, snapshots: 1, requests: 1 })
    } finally { db.close() }
  })

  it('replays one operation without rereading credentials or creating a sibling', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const service = coordinator(db)
      const first = await service.submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const replay = await service.submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value)
        .toBe(first.execution.operation.resultAnswerRootId.value)
      expect(replay.preparedRequest.bodySha256).toBe(first.preparedRequest.bodySha256)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM generation_request_v2) AS requests`).get())
        .toEqual({ operations: 1, messages: 2, requests: 1 })
    } finally { db.close() }
  })

  it('leaves no graph or generation records when preflight evidence fails', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(new Response('denied', {
        status: 401, headers: { 'content-type': 'text/plain' },
      }))
      await expect(coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow()
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM generation_request_v2) AS requests,
        (SELECT count(*) FROM branch_choice_v2) AS choices`).get())
        .toEqual({ operations: 0, messages: 0, requests: 0, choices: 0 })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: null })
    } finally { db.close() }
  })

  it('streams exact prepared bytes, persists native terminal history and keeps the new answer current', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(completedStream())
      const created = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const rawStore = { tryPersistPreparedV2: vi.fn(() => { throw new Error('debug database unavailable') }) }
      const terminal = await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), rawGenerationRequestStore: rawStore as never,
        fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(created)
      expect(terminal).toMatchObject({ state: 'completed', answerRootId: 'answer:2' })
      expect(rawStore.tryPersistPreparedV2).toHaveBeenCalledTimes(1)
      const transport = mocks.fetch.mock.calls[1]
      expect(transport?.[0]).toBe('https://api.openai.com/v1/responses')
      expect(Buffer.from((transport?.[1] as RequestInit).body as Uint8Array).toString('utf8'))
        .toBe(created.preparedRequest.body.copyUtf8Text())
      expect(db.prepare("SELECT body_text AS body FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body: 'hello from OpenAI' })
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'completed' })
      expect(db.prepare(`SELECT artifact_kind AS artifactKind, completion_scope AS completionScope
        FROM generation_native_artifact_v2 ORDER BY artifact_kind`).all()).toEqual([
        { artifactKind: 'openai_responses_ordered_native_items_v2', completionScope: 'operation_terminal' },
        { artifactKind: 'openai_responses_terminal_v1', completionScope: 'operation_terminal' },
      ])
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:2' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:2' })
    } finally { db.close() }
  })

  it('retains partial content and the committed branch after an unterminated stream', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(unterminatedPartialStream())
      const created = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const terminal = await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(created)
      expect(terminal.state).toBe('failed')
      expect(db.prepare("SELECT body_text AS body FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body: 'partial' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'failed' })
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:2' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:2' })
    } finally { db.close() }
  })

  it('reconstructs complete stateless native input from the persisted parent artifact', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(completedStream('first answer'))
        .mockResolvedValueOnce(modelResponse())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(first)
      const secondService = createOpenAIResponsesPlainTextInitialSendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createGraphId: (kind) => kind === 'question' ? 'question:next' : 'answer:next',
      })
      const second = await secondService.submit({
        command: command({
          operationId: 'operation:next', expectedHeadMessageId: 'answer:2', userBody: 'follow up',
        }),
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(JSON.parse(second.preparedRequest.body.copyUtf8Text()).input).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
        {
          id: 'msg_1', type: 'message', role: 'assistant',
          content: [{ type: 'output_text', text: 'first answer', annotations: [] }],
        },
        { role: 'user', content: [{ type: 'input_text', text: 'follow up' }] },
      ])
      expect(second.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:next' }, headMessageId: { value: 'answer:next' },
      })
    } finally { db.close() }
  })

  it('persists terminal-only incomplete output as visible failed-answer content', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(incompleteTerminalOnlyStream())
      const created = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const terminal = await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(created)
      expect(terminal).toMatchObject({
        state: 'failed', errorCode: 'GENERATION_V2_OPENAI_RUNNER_PROVIDER_INCOMPLETE',
      })
      expect(db.prepare("SELECT body_text AS body FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body: 'terminal partial' })
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:2' })
    } finally { db.close() }
  })

  it('terminalizes an already-cancelled command without restoring the previous branch state', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const created = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const controller = new AbortController()
      controller.abort()
      const terminal = await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(created, controller.signal)
      expect(terminal).toMatchObject({ state: 'cancelled', errorCode: 'user_cancelled' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'cancelled' })
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:2' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:2' })
    } finally { db.close() }
  })

  it('retries only the chosen answer from its exact snapshot with as-new and replace semantics', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(completedStream('original'))
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(initial)
      const originalSnapshot = JSON.parse(initial.execution.snapshot.canonicalJson)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { maxOutputTokens: 32 },
      })
      const asNewService = createOpenAIResponsesPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createAnswerId: () => 'answer:retry-new',
      })
      const asNewCommand = {
        actionKind: 'retry_as_new', operationId: 'operation:retry-new', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2',
      }
      const asNew = await asNewService.submit(asNewCommand)
      expect(asNew.projection.visibleCandidates.map((candidate) => candidate.value))
        .toEqual(['answer:2', 'answer:retry-new'])
      expect(asNew.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:retry-new' }, headMessageId: { value: 'answer:retry-new' },
      })
      expect(JSON.parse(asNew.preparedRequest.body.copyUtf8Text())).not.toHaveProperty('max_output_tokens')
      const copiedSnapshot = JSON.parse(asNew.execution.snapshot.canonicalJson)
      for (const snapshot of [originalSnapshot, copiedSnapshot]) {
        delete snapshot.answerRootId
        delete snapshot.operationId
        delete snapshot.snapshotHash
      }
      expect(copiedSnapshot).toEqual(originalSnapshot)
      await expect(asNewService.submit(asNewCommand)).resolves.toMatchObject({ kind: 'idempotent_replay' })

      const beforeStale = db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()
      await expect(createOpenAIResponsesPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 121,
        createAnswerId: () => 'answer:must-not-exist',
      }).submit({ ...asNewCommand, operationId: 'operation:stale' }))
        .rejects.toThrow('STALE_CHOSEN_ANSWER')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()).toEqual(beforeStale)

      mocks.fetch.mockResolvedValueOnce(completedStream('retried'))
      await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 130,
      }).run(asNew)
      const replace = await createOpenAIResponsesPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 140,
        createAnswerId: () => 'answer:replacement',
      }).submit({
        actionKind: 'retry_replace', operationId: 'operation:replace', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:retry-new',
        expectedHeadMessageId: 'answer:retry-new',
      })
      expect(replace.projection.visibleCandidates.map((candidate) => candidate.value))
        .toEqual(['answer:2', 'answer:replacement'])
      expect(db.prepare(`SELECT answer_root_id AS answerRootId FROM branch_answer_hide_v2
        WHERE branch_id='branch:1' AND question_id='question:1'`).all())
        .toEqual([{ answerRootId: 'answer:retry-new' }])
      mocks.fetch.mockResolvedValueOnce(new Response('denied', {
        status: 503, headers: { 'content-type': 'text/plain' },
      }))
      const failed = await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 150,
      }).run(replace)
      expect(failed.state).toBe('failed')
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:replacement' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:replacement' })
    } finally { db.close() }
  })

  it('regenerates from current config and never restores the prior chosen answer after failure', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(completedStream('original'))
        .mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(modelResponse())
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 110,
      }).run(initial)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { maxOutputTokens: 32 },
        providerExtension: { kind: 'openai_responses', verbosity: 'low' },
      })
      const service = createOpenAIResponsesPlainTextRegenerateCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createAnswerId: () => 'answer:regenerated',
      })
      const regenerateCommand = {
        operationId: 'operation:regenerate', branchId: 'branch:1', questionId: 'question:1',
        expectedHeadMessageId: 'answer:2', modelId: 'gpt-5.6-sol', commandAttachments: [],
      }
      const regenerated = await service.submit({
        command: regenerateCommand, expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(JSON.parse(regenerated.preparedRequest.body.copyUtf8Text())).toMatchObject({
        max_output_tokens: 32, text: { verbosity: 'low' },
      })
      expect(regenerated.projection.visibleCandidates.map((candidate) => candidate.value))
        .toEqual(['answer:2', 'answer:regenerated'])
      expect(regenerated.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:regenerated' }, headMessageId: { value: 'answer:regenerated' },
      })
      await expect(service.submit({
        command: regenerateCommand, expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })).resolves.toMatchObject({ kind: 'idempotent_replay' })
      const beforeStale = db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()
      await expect(service.submit({
        command: { ...regenerateCommand, operationId: 'operation:regenerate-stale' },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()).toEqual(beforeStale)
      mocks.fetch.mockResolvedValueOnce(new Response('denied', {
        status: 503, headers: { 'content-type': 'text/plain' },
      }))
      await expect(createOpenAIResponsesInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => 130,
      }).run(regenerated)).resolves.toMatchObject({ state: 'failed' })
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:regenerated' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:regenerated' })
    } finally { db.close() }
  })
})
