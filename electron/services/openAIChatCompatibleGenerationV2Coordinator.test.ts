import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { OpenAICompatibleV2Repo } from '../../infra/db/repo/openAICompatibleV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('electron', () => ({ safeStorage: {}, session: { defaultSession: { fetch: mocks.fetch } } }))

import { createOpenAIChatCompatibleGenerationV2Coordinator } from './openAIChatCompatibleGenerationV2Coordinator'
import { createOpenAIChatCompatibleGenerationV2Runtime } from './openAIChatCompatibleGenerationV2Runtime'

const requestProfile = { schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const, unsupportedFieldPolicy: 'error_before_fetch' as const,
  defaults: {}, extraBody: { enabled: true, maxDepth: 8, maxKeys: 128, maxBytes: 32768 } }
const reasoningMapping = { schemaVersion: 1 as const, mode: 'custom_only' as const, rules: [], replay: { format: 'disabled' as const, scope: 'never' as const } }
const reasoningMappingWithNativeReplay = { schemaVersion: 1 as const, mode: 'custom_only' as const,
  rules: [{ stream: { path: 'choices.*.delta.reasoning_content', mode: 'append' as const }, final: { path: 'choices.*.message.reasoning_content', mode: 'snapshot' as const }, semantic: 'text' as const }],
  replay: { format: 'assistant_field' as const, field: 'reasoning_content', scope: 'all_assistant_messages' as const } }
const inlinePolicy = { schemaVersion: 1 as const, canonicalThinkTags: true, customTags: [] }
const responseProfile = { schemaVersion: 1 as const, choicePolicy: 'preserve_all' as const, unknownFieldPolicy: 'bounded_diagnostics' as const,
  reasoningMapping: { mappingId: 'ocp_reasoning_mapping_12345678', version: 1 }, inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1 } }
function configuration(input: Readonly<{ nativeReasoningReplay?: boolean }> = {}) { const selectedReasoningMapping = input.nativeReasoningReplay ? reasoningMappingWithNativeReplay : reasoningMapping; return {
  requestProfile: { id: 'ocp_request_profile_12345678', version: 1, config: requestProfile },
  requestMappings: [{ id: 'ocp_request_mapping_12345678', version: 1, config: {
    schemaVersion: 1 as const, mappingId: 'ocp_request_mapping_12345678', requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
    sourceField: 'reasoning_enabled' as const, targetPath: ['reasoning', 'enabled'], valueKind: 'boolean' as const,
    valueMapping: { true: true, false: false }, omission: 'required' as const,
  } }],
  reasoningMapping: { id: 'ocp_reasoning_mapping_12345678', version: 1, config: selectedReasoningMapping },
  inlinePolicy: { id: 'ocp_inline_policy_12345678', version: 1, config: inlinePolicy },
  responseProfile: { id: 'ocp_response_profile_12345678', version: 1, config: responseProfile },
} }
function database(input: Readonly<{ nativeReasoningReplay?: boolean }> = {}) {
  const db = new BetterSqlite3(':memory:'); applyGenerationV2SchemaForTest(db, process.cwd())
  const graph = new ConversationGraphV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    graph.createProject(context, { projectId: 'project:1', name: 'Project', createdAtMs: 1 })
    graph.createConversationAndDefaultBranch(context, { projectId: 'project:1', conversationId: 'conversation:1', branchId: 'branch:1', title: 'Conversation', branchName: 'Main', createdAtMs: 2 })
  })
  new OpenAICompatibleV2Repo(db, () => 10).create({ providerInstanceId: 'ocp_provider_12345678', displayName: 'Compatible', endpointRevisionId: 'ocp_endpoint_12345678',
    baseUrl: 'https://example.test', securityPolicy: 'compatibility_first', auth: { mode: 'none' }, ordinaryHeaders: [{ name: 'X-Tenant', value: 'public', classification: 'public_non_secret' }],
    query: [{ name: 'tenant', value: 'alpha', classification: 'public_non_secret' }], configuration: configuration(input) })
  return db
}

describe('OpenAI-compatible V2 coordinator', () => {
  const databases: BetterSqlite3.Database[] = []
  afterEach(() => { while (databases.length) databases.pop()!.close() })

  it('commits and immediately selects an exact prepared initial request without legacy runtime state', async () => {
    const db = database(); databases.push(db); let id = 0
    const coordinator = createOpenAIChatCompatibleGenerationV2Coordinator({ db, nowMs: () => 100,
      credentialService: { getStatus: async () => ({ configured: false, revision: 0 }) } as never,
      createQuestionId: () => `question:${++id}`, createAnswerId: () => `answer:${++id}` })
    const result = await coordinator.submitInitial({ operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'ocp_provider_12345678', modelId: 'model-x', userBody: 'hello', commandAttachments: [], extraBody: { vendor_flag: true } })
    expect(result).toMatchObject({ kind: 'created', projection: { branchProjection: { chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' } } } })
    expect(result.execution.snapshot.providerConfiguration).toMatchObject({ kind: 'openai_chat_compatible', extraBody: { vendor_flag: true } })
    expect(result.preparedRequest.endpoint).toBe('https://example.test/v1/chat/completions?tenant=alpha')
    expect(result.preparedRequest.headersPlan.ordinaryHeaders).toEqual([{ name: 'X-Tenant', value: 'public' }])
    expect(JSON.parse(result.preparedRequest.body.copyUtf8Text())).toMatchObject({ model: 'model-x', stream: true,
      messages: [{ role: 'user', content: 'hello' }], reasoning: { enabled: false }, vendor_flag: true })
  })

  it('retries the target answer from its exact persisted snapshot after terminal streaming', async () => {
    const db = database(); databases.push(db); let id = 0; const sink: unknown[] = []
    const credential = { getStatus: async () => ({ configured: false, revision: 0 }) } as never
    const stream = [
      `data: ${JSON.stringify({ id: 'chatcmpl-1', model: 'model-x', choices: [{ index: 0, delta: { role: 'assistant', content: 'first' }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ id: 'chatcmpl-1', model: 'model-x', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`,
      'data: [DONE]', '',
    ].join('\n\n')
    const runtime = createOpenAIChatCompatibleGenerationV2Runtime({ db, credentialService: credential, nowMs: () => 100,
      fetchImpl: vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
      streamProjectionSink: { publish: (event) => sink.push(event) }, createQuestionId: () => `question:${++id}`, createAnswerId: () => `answer:${++id}` })
    const initial = await runtime.submitInitial({ operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'ocp_provider_12345678', modelId: 'model-x', userBody: 'hello', commandAttachments: [], extraBody: { vendor_flag: true } })
    await vi.waitFor(() => expect(sink).toContainEqual(expect.objectContaining({ type: 'terminal', state: 'completed', answerRootId: 'answer:2' })))
    const coordinator = createOpenAIChatCompatibleGenerationV2Coordinator({ db, credentialService: credential, nowMs: () => 200,
      createQuestionId: () => `question:${++id}`, createAnswerId: () => `answer:${++id}` })
    const retry = await coordinator.retry({ actionKind: 'retry_as_new', operationId: 'operation:2', branchId: 'branch:1', questionId: 'question:1',
      targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2' })
    expect(retry).toMatchObject({ kind: 'created', projection: { branchProjection: { chosenAnswerRootId: { value: 'answer:3' }, headMessageId: { value: 'answer:3' } } } })
    expect(retry.execution.snapshot.providerConfiguration).toMatchObject({ extraBody: { vendor_flag: true } })
    expect(JSON.parse(retry.preparedRequest.body.copyUtf8Text())).toMatchObject({ vendor_flag: true,
      messages: [{ role: 'user', content: 'hello' }] })
  })

  it('terminalizes the documented non-stream JSON response form without changing chosen/head', async () => {
    const db = database(); databases.push(db); let id = 0; const sink: unknown[] = []
    const runtime = createOpenAIChatCompatibleGenerationV2Runtime({ db, credentialService: { getStatus: async () => ({ configured: false, revision: 0 }) } as never,
      nowMs: () => 100, createQuestionId: () => `question:${++id}`, createAnswerId: () => `answer:${++id}`,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'chatcmpl-json', model: 'model-x', choices: [{
        index: 0, message: { role: 'assistant', content: 'json answer' }, finish_reason: 'stop',
      }] }), { status: 200, headers: { 'content-type': 'application/json' } })), streamProjectionSink: { publish: (event) => sink.push(event) } })
    const created = await runtime.submitInitial({ operationId: 'operation:json', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'ocp_provider_12345678', modelId: 'model-x', userBody: 'hello', commandAttachments: [], extraBody: null })
    await vi.waitFor(() => expect(sink).toContainEqual(expect.objectContaining({ type: 'terminal', state: 'completed', answerRootId: created.preparedRequest.answerRootId })))
    expect(db.prepare('SELECT status FROM message_v2 WHERE message_id=?').get(created.preparedRequest.answerRootId)).toEqual({ status: 'completed' })
    expect(db.prepare('SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id=?').get('branch:1')).toEqual({ chosen: created.preparedRequest.answerRootId })
  })

  it('replays persisted native reasoning through the pinned mapping instead of renderer text', async () => {
    const db = database({ nativeReasoningReplay: true }); databases.push(db); let id = 0; const sink: unknown[] = []
    const firstStream = [
      `data: ${JSON.stringify({ id: 'chatcmpl-reasoning-1', model: 'model-x', choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'native reasoning', content: 'first' }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ id: 'chatcmpl-reasoning-1', model: 'model-x', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`,
      'data: [DONE]', '',
    ].join('\n\n')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(firstStream, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'chatcmpl-reasoning-2', model: 'model-x', choices: [{ index: 0, message: { role: 'assistant', content: 'second' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const runtime = createOpenAIChatCompatibleGenerationV2Runtime({ db, credentialService: { getStatus: async () => ({ configured: false, revision: 0 }) } as never,
      nowMs: () => 100, fetchImpl, streamProjectionSink: { publish: (event) => sink.push(event) },
      createQuestionId: () => `question:${++id}`, createAnswerId: () => `answer:${++id}` })
    const first = await runtime.submitInitial({ operationId: 'operation:reasoning-1', branchId: 'branch:1', expectedHeadMessageId: null,
      providerInstanceId: 'ocp_provider_12345678', modelId: 'model-x', userBody: 'first question', commandAttachments: [], extraBody: null })
    await vi.waitFor(() => expect(sink).toContainEqual(expect.objectContaining({ type: 'terminal', state: 'completed', answerRootId: first.preparedRequest.answerRootId })))
    const second = await runtime.submitInitial({ operationId: 'operation:reasoning-2', branchId: 'branch:1', expectedHeadMessageId: first.preparedRequest.answerRootId,
      providerInstanceId: 'ocp_provider_12345678', modelId: 'model-x', userBody: 'second question', commandAttachments: [], extraBody: null })
    expect(JSON.parse(second.preparedRequest.body.copyUtf8Text()).messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first', reasoning_content: 'native reasoning' },
      { role: 'user', content: 'second question' },
    ])
  })
})
