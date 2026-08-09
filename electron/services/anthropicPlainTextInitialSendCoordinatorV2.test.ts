import BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { createAnthropicPlainTextInitialSendCoordinatorV2 } from './anthropicPlainTextInitialSendCoordinatorV2'
import { createAnthropicGenerationV2Runtime } from './anthropicGenerationV2Runtime'

const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never

function credentialService() {
  return {
    getStatus: async () => ({
      providerKey: 'anthropic', configured: true, revision: 1, credentialScopeId: scope,
    }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const active = { value: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease',
        usage: 'provider_transport_only',
        providerKey: 'anthropic',
        credential: 'sk-ant-test',
        revision: 1,
        credentialScopeId: scope,
        assertCurrent: () => { if (!active.value) throw new Error('stale credential') },
      })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally {
        active.value = false
        mocks.leases.delete(lease)
      }
    },
  } as never
}

function streamResponse(text = 'answer'): Response {
  const frame = (type: string, value: Record<string, unknown> = { type }) =>
    `event: ${type}\ndata: ${JSON.stringify({ ...value, type })}\n\n`
  const body = frame('message_start', {
    message: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [],
      stop_reason: null, stop_sequence: null,
      usage: {
        cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null,
        inference_geo: null, input_tokens: 2, output_tokens: 0, output_tokens_details: null,
        server_tool_use: null, service_tier: 'standard',
      },
    },
  }) + frame('content_block_start', {
    index: 0, content_block: { type: 'text', text: '', citations: null },
  }) + frame('content_block_delta', {
    index: 0, delta: { type: 'text_delta', text },
  }) + frame('content_block_stop', { index: 0 }) + frame('message_delta', {
    delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 },
  }) + frame('message_stop')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, {
      projectId: 'project:1',
      conversationId: 'conversation:1',
      branchId: 'branch:1',
      title: 'Conversation',
      branchName: 'Main',
      createdAtMs: 2,
    })
  })
  const config = new GenerationConfigV2Repo(db, () => 3)
  const current = config.getScope('conversation', 'conversation:1')
  config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
    schemaVersion: 2,
    generation: { maxOutputTokens: 2_048 },
    reasoning: { mode: 'disabled' },
    providerExtension: {
      kind: 'anthropic_messages',
      thinkingDisplay: 'summarized',
      thinkingMode: 'model_recommended',
    },
  })
  return db
}

function modelResponse(): Response {
  const url = 'https://api.anthropic.com/v1/models/claude-sonnet-4-5'
  const response = new Response(JSON.stringify({
    id: 'claude-sonnet-4-5',
    type: 'model',
    display_name: 'Claude Sonnet 4.5',
    created_at: '2025-09-29T00:00:00Z',
    max_input_tokens: 1_000_000,
    max_tokens: 64_000,
    capabilities: {
      batch: { supported: true },
      citations: { supported: true },
      code_execution: { supported: true },
      context_management: {
        clear_thinking_20251015: { supported: true },
        clear_tool_uses_20250919: { supported: true },
        compact_20260112: { supported: false },
        supported: true,
      },
      effort: {
        high: { supported: false }, low: { supported: false }, max: { supported: false },
        medium: { supported: false }, supported: false, xhigh: { supported: false },
      },
      image_input: { supported: true },
      pdf_input: { supported: true },
      structured_outputs: { supported: true },
      thinking: {
        supported: true,
        types: { adaptive: { supported: false }, enabled: { supported: true } },
      },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({ status: 200, url, headers: response.headers, body: response.body }) as unknown as Response
}

function command() {
  return {
    operationId: 'operation:anthropic:1',
    branchId: 'branch:1',
    expectedHeadMessageId: null,
    userBody: 'hello',
    modelId: 'claude-sonnet-4-5',
    commandAttachments: [],
  }
}

beforeEach(() => mocks.fetch.mockReset())

describe('Anthropic plain-text initial-send coordinator V2', () => {
  it('atomically selects the new answer and prepares exact Messages bytes from the persisted snapshot', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      let next = 0
      const coordinator = createAnthropicPlainTextInitialSendCoordinatorV2({
        db,
        credentialService: credentialService(),
        nowMs: () => 100,
        createGraphId: (kind) => `${kind}:${++next}`,
      })
      const created = await coordinator.submit({
        command: command(),
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })
      expect(created).toMatchObject({
        kind: 'created',
        preparedRequest: {
          providerId: 'anthropic',
          endpoint: 'https://api.anthropic.com/v1/messages',
          contractId: 'anthropic-messages-2023-06-01',
          modelId: 'claude-sonnet-4-5',
        },
        projection: {
          branchProjection: {
            chosenAnswerRootId: { value: 'answer:2' },
            headMessageId: { value: 'answer:2' },
          },
        },
      })
      expect(JSON.parse(created.preparedRequest.body.copyUtf8Text())).toEqual({
        max_tokens: 2_048,
        messages: [{ role: 'user', content: 'hello' }],
        model: 'claude-sonnet-4-5',
        stream: true,
        thinking: { type: 'disabled' },
      })
      expect(created.preparedRequest.headersPlan.credential).toEqual({
        kind: 'anthropic_x_api_key',
        headerName: 'x-api-key',
        apiVersion: { headerName: 'anthropic-version', value: '2023-06-01' },
      })
      expect(db.prepare('SELECT state FROM generation_operation_v2 WHERE operation_id=?')
        .get('operation:anthropic:1')).toEqual({ state: 'committed' })

      const replay = await coordinator.submit({
        command: command(),
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.preparedRequest.bodySha256).toBe(created.preparedRequest.bodySha256)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('returns the committed chosen/head projection before its dormant runtime streams to terminal', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(streamResponse())
      const projections: unknown[] = []
      const runtime = createAnthropicGenerationV2Runtime({
        db,
        credentialService: credentialService(),
        nowMs: () => 100,
        streamProjectionSink: { publish: (projection) => projections.push(projection) },
      })
      const created = await runtime.submitInitial(command())
      expect(created).toMatchObject({
        kind: 'created',
        projection: { branchProjection: { chosenAnswerRootId: { value: expect.any(String) } } },
      })
      await vi.waitFor(() => expect(projections).toContainEqual(expect.objectContaining({
        type: 'terminal',
        state: 'completed',
        answerRootId: created.preparedRequest.answerRootId,
      })))
      expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?')
        .get(created.preparedRequest.answerRootId)).toEqual({ status: 'completed' })
      expect(db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(created.preparedRequest.answerRootId)).toEqual({ body: 'answer' })
      const replay = await runtime.submitInitial(command())
      expect(replay.kind).toBe('idempotent_replay')
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
    } finally { db.close() }
  })

  it('atomically rejects maxOutputTokens above the exact live model limit', async () => {
    const db = database()
    try {
      const config = new GenerationConfigV2Repo(db, () => 4)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2,
        generation: { maxOutputTokens: 64_001 },
        reasoning: { mode: 'disabled' },
        providerExtension: {
          kind: 'anthropic_messages',
          thinkingDisplay: 'summarized',
          thinkingMode: 'model_recommended',
        },
      })
      const before = {
        messages: db.prepare('SELECT count(*) AS count FROM message_v2').get(),
        operations: db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get(),
        snapshots: db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get(),
        requests: db.prepare('SELECT count(*) AS count FROM generation_request_v2').get(),
        choices: db.prepare('SELECT count(*) AS count FROM branch_choice_v2').get(),
        head: db.prepare('SELECT head_message_id FROM branch_v2 WHERE branch_id=?').get('branch:1'),
      }
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const coordinator = createAnthropicPlainTextInitialSendCoordinatorV2({
        db,
        credentialService: credentialService(),
        nowMs: () => 100,
      })
      await expect(coordinator.submit({
        command: command(),
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_ANTHROPIC_INTENT_UNSUPPORTED')
      expect({
        messages: db.prepare('SELECT count(*) AS count FROM message_v2').get(),
        operations: db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get(),
        snapshots: db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get(),
        requests: db.prepare('SELECT count(*) AS count FROM generation_request_v2').get(),
        choices: db.prepare('SELECT count(*) AS count FROM branch_choice_v2').get(),
        head: db.prepare('SELECT head_message_id FROM branch_v2 WHERE branch_id=?').get('branch:1'),
      }).toEqual(before)
      expect(db.prepare('SELECT count(*) AS count FROM anthropic_model_evidence_sets').get())
        .toEqual({ count: 1 })
    } finally { db.close() }
  })
})
