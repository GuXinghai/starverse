import BetterSqlite3 from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) => Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
}))

import { createAnthropicMessagesStreamRunnerV2 } from './anthropicMessagesStreamRunnerV2'
import { createAnthropicPlainTextInitialSendCoordinatorV2 } from './anthropicPlainTextInitialSendCoordinatorV2'
import { createAnthropicPlainTextRetryCoordinatorV2 } from './anthropicPlainTextRetryCoordinatorV2'
import { createAnthropicPlainTextRegenerateCoordinatorV2 } from './anthropicPlainTextRegenerateCoordinatorV2'
import { createAnthropicPlainTextEditResendCoordinatorV2 } from './anthropicPlainTextEditResendCoordinatorV2'

const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never

function credentialService() {
  return {
    getStatus: async () => ({ providerKey: 'anthropic', configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const active = { value: true }
      const lease = Object.freeze({ trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'anthropic', credential: 'sk-ant-test', revision: 1, credentialScopeId: scope,
        assertCurrent: () => { if (!active.value) throw new Error('stale credential') } })
      mocks.leases.add(lease)
      try { return await consume(lease as never) } finally { active.value = false; mocks.leases.delete(lease) }
    },
  } as never
}

function modelResponse(): Response {
  const response = new Response(JSON.stringify({ id: 'claude-sonnet-4-5', type: 'model', display_name: 'Claude Sonnet 4.5',
    created_at: '2025-09-29T00:00:00Z', max_input_tokens: 1_000_000, max_tokens: 64_000,
    capabilities: { batch: { supported: true }, citations: { supported: true }, code_execution: { supported: true },
      context_management: { clear_thinking_20251015: { supported: true }, clear_tool_uses_20250919: { supported: true }, compact_20260112: { supported: false }, supported: true },
      effort: { high: { supported: false }, low: { supported: false }, max: { supported: false }, medium: { supported: false }, supported: false, xhigh: { supported: false } },
      image_input: { supported: true }, pdf_input: { supported: true }, structured_outputs: { supported: true },
      thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } } } }),
  { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({ status: 200, url: 'https://api.anthropic.com/v1/models/claude-sonnet-4-5', headers: response.headers, body: response.body }) as unknown as Response
}

function streamResponse(): Response {
  const frame = (type: string, value: Record<string, unknown> = {}) => `event: ${type}\ndata: ${JSON.stringify({ ...value, type })}\n\n`
  return new Response(frame('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [], stop_reason: null, stop_sequence: null,
    usage: { cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, inference_geo: null, input_tokens: 2, output_tokens: 0, output_tokens_details: null, server_tool_use: null, service_tier: 'standard' } } }) +
    frame('content_block_start', { index: 0, content_block: { type: 'text', text: '', citations: null } }) +
    frame('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'done' } }) +
    frame('content_block_stop', { index: 0 }) + frame('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }) + frame('message_stop'),
  { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function database(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', title: 'Conversation', branchName: 'Main', createdAtMs: 2 })
  })
  setConfig(db, 2_048)
  return db
}

function setConfig(db: BetterSqlite3.Database, maxOutputTokens: number): void {
  const config = new GenerationConfigV2Repo(db, () => maxOutputTokens)
  const current = config.getScope('conversation', 'conversation:1')
  config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, { schemaVersion: 2,
    generation: { maxOutputTokens }, reasoning: { mode: 'disabled' },
    providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' } })
}

async function completedInitial(db: BetterSqlite3.Database) {
  mocks.fetch.mockResolvedValueOnce(modelResponse()).mockResolvedValueOnce(streamResponse())
  let next = 0
  const created = await createAnthropicPlainTextInitialSendCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => 100,
    createGraphId: (kind) => `${kind}:${++next}` }).submit({ command: { operationId: 'operation:initial', branchId: 'branch:1', expectedHeadMessageId: null,
      userBody: 'hello', modelId: 'claude-sonnet-4-5', commandAttachments: [] }, expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
  await createAnthropicMessagesStreamRunnerV2({ db, credentialService: credentialService(), nowMs: () => 110 }).run(created)
  return created
}

beforeEach(() => mocks.fetch.mockReset())

describe('Anthropic V2 retry, regenerate, and edit-resend', () => {
  it('retry-replace copies the target snapshot exactly, hides the target, selects immediately, and replays idempotently', async () => {
    const db = database()
    try {
      const initial = await completedInitial(db)
      const command = { actionKind: 'retry_replace', operationId: 'operation:retry', branchId: 'branch:1', questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2' }
      const service = createAnthropicPlainTextRetryCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => 120, createAnswerId: () => 'answer:retry' })
      const created = await service.submit(command)
      expect(created.kind).toBe('created')
      expect(created.projection.branchProjection).toMatchObject({ chosenAnswerRootId: { value: 'answer:retry' }, headMessageId: { value: 'answer:retry' } })
      expect(created.projection.visibleCandidates.map((entry) => entry.value)).toEqual(['answer:retry'])
      const copied = JSON.parse(created.execution.snapshot.canonicalJson)
      const target = JSON.parse(initial.execution.snapshot.canonicalJson)
      for (const value of [copied, target]) { delete value.answerRootId; delete value.operationId; delete value.snapshotHash }
      expect(copied).toEqual(target)
      expect((await service.submit(command)).kind).toBe('idempotent_replay')
    } finally { db.close() }
  })

  it('atomically rejects a stale retry target without creating an operation or request', async () => {
    const db = database()
    try {
      await completedInitial(db)
      db.prepare("UPDATE branch_v2 SET head_message_id='question:1' WHERE branch_id='branch:1'").run()
      await expect(createAnthropicPlainTextRetryCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => 120 }).submit({
        actionKind: 'retry_as_new', operationId: 'operation:stale', branchId: 'branch:1', questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2',
      })).rejects.toThrow()
      expect(db.prepare("SELECT count(*) AS count FROM generation_operation_v2 WHERE operation_id='operation:stale'").get()).toEqual({ count: 0 })
      expect(db.prepare("SELECT count(*) AS count FROM generation_request_v2 WHERE operation_id='operation:stale'").get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('regenerate and edit-resend bind commit-time config/model evidence and select their new answers immediately', async () => {
    const db = database()
    try {
      await completedInitial(db)
      setConfig(db, 4_096)
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const regenerated = await createAnthropicPlainTextRegenerateCoordinatorV2({ db, credentialService: credentialService(), nowMs: () => 130,
        createAnswerId: () => 'answer:regenerated' }).submit({ command: { operationId: 'operation:regenerate', branchId: 'branch:1', questionId: 'question:1',
          expectedHeadMessageId: 'answer:2', modelId: 'claude-sonnet-4-5', commandAttachments: [] }, expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(JSON.parse(regenerated.preparedRequest.body.copyUtf8Text()).max_tokens).toBe(4_096)
      expect(regenerated.projection.branchProjection.headMessageId?.value).toBe('answer:regenerated')
    } finally { db.close() }

    const editDb = database()
    try {
      await completedInitial(editDb)
      setConfig(editDb, 4_096)
      mocks.fetch.mockResolvedValueOnce(modelResponse())
      const edited = await createAnthropicPlainTextEditResendCoordinatorV2({ db: editDb, credentialService: credentialService(), nowMs: () => 140,
        createQuestionId: () => 'question:edited', createAnswerId: () => 'answer:edited' }).submit({ command: { operationId: 'operation:edit', mode: 'replace', branchId: 'branch:1',
          sourceQuestionId: 'question:1', sourceAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2', userBody: 'edited', modelId: 'claude-sonnet-4-5', commandAttachments: [] },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope })
      expect(JSON.parse(edited.preparedRequest.body.copyUtf8Text())).toMatchObject({ max_tokens: 4_096, messages: [{ role: 'user', content: 'edited' }] })
      expect(edited.projection.branchProjection.headMessageId?.value).toBe('answer:edited')
      expect(edited.projection.visibleCandidates.map((entry) => entry.value)).toEqual(['answer:edited'])
    } finally { editDb.close() }
  })
})
