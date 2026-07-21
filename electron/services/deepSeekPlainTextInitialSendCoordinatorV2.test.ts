import BetterSqlite3 from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationConfigV2Repo } from '../../infra/db/repo/generationConfigV2Repo'
import {
  GenerationRequestV2Repo,
  isGenerationRequestRepositoryFactV2,
} from '../../infra/db/repo/generationRequestV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  leases: new WeakSet<object>(),
  scopes: new WeakSet<object>(),
}))

vi.mock('electron', () => ({ session: { defaultSession: { fetch: mocks.fetch } } }))
vi.mock('../credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.leases.has(value)),
  isEpoch2CredentialScopeBindingAuthority: (value: unknown) =>
    Boolean(value && typeof value === 'object' && mocks.scopes.has(value)),
}))

import { createDeepSeekPlainTextInitialSendCoordinatorV2 } from './deepSeekPlainTextInitialSendCoordinatorV2'
import { createDeepSeekInitialStreamRunnerV2 } from './deepSeekInitialStreamRunnerV2'
import { recoverGenerationOrphansV2 } from './generationOrphanRecoveryV2'
import { createDeepSeekPlainTextRetryCoordinatorV2 } from './deepSeekPlainTextRetryCoordinatorV2'
import { createDeepSeekPlainTextRegenerateCoordinatorV2 } from './deepSeekPlainTextRegenerateCoordinatorV2'
import { createDeepSeekPlainTextEditResendCoordinatorV2 } from './deepSeekPlainTextEditResendCoordinatorV2'
import { createDeepSeekToolContinuationCoordinatorV2 } from './deepSeekToolContinuationCoordinatorV2'
import { createDeepSeekGenerationV2Runtime } from './deepSeekGenerationV2Runtime'
import {
  completeDeepSeekNativeRequestV2,
  serializeDeepSeekNativeHistoryArtifactV2,
} from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'

const scope = 'credential-scope-v2:'.concat('a'.repeat(64)) as never

function response(modelId = 'deepseek-v4-pro'): Response {
  const value = new Response(JSON.stringify({
    object: 'list', data: [{ id: modelId, object: 'model', owned_by: 'deepseek' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  return Object.freeze({
    status: 200, url: 'https://api.deepseek.com/models', headers: value.headers, body: value.body,
  }) as unknown as Response
}

function credentialService(fail = false) {
  return {
    getStatus: async () => ({
      providerKey: 'deepseek', configured: true, revision: 1, credentialScopeId: scope,
    }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      if (fail) throw new Error('credential unavailable')
      const state = { active: true }
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'deepseek', credential: 'sk-test', revision: 1,
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

function streamResponse(content = 'hello'): Response {
  const usage = { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
  const base = { id: 'response:1', object: 'chat.completion.chunk', created: 1,
    model: 'deepseek-v4-pro', system_fingerprint: 'fp:1' }
  const body = [
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop', logprobs: null }] })}`,
    `data: ${JSON.stringify({ ...base, choices: [], usage })}`,
    'data: [DONE]',
    '',
  ].join('\n\n')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

function toolCallStreamResponse(): Response {
  const base = { id: 'response:tool', object: 'chat.completion.chunk', created: 1,
    model: 'deepseek-v4-pro', system_fingerprint: 'fp:1' }
  const body = [
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {
      role: 'assistant', content: null,
      tool_calls: [{ index: 0, id: 'call:weather', type: 'function', function: {
        name: 'weather', arguments: '{"city":"Shanghai"}',
      } }],
    }, finish_reason: 'tool_calls', logprobs: null }] })}`,
    `data: ${JSON.stringify({ ...base, choices: [], usage: {
      prompt_tokens: 2, completion_tokens: 1, total_tokens: 3,
    } })}`,
    'data: [DONE]',
    '',
  ].join('\n\n')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

function database(filename = ':memory:'): BetterSqlite3.Database {
  const db = new BetterSqlite3(filename)
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
    userBody: 'hello', modelId: 'deepseek-v4-pro', commandAttachments: [], ...overrides,
  }
}

function coordinator(db: BetterSqlite3.Database, failCredential = false) {
  let next = 0
  return createDeepSeekPlainTextInitialSendCoordinatorV2({
    db, credentialService: credentialService(failCredential), nowMs: () => 100,
    createGraphId: (kind) => `${kind}:${++next}`,
  })
}

function completeFirstRequest(db: BetterSqlite3.Database, answerRootId: string): void {
  const artifact = completeDeepSeekNativeRequestV2({
    priorArtifact: null,
    clientEntries: [{ kind: 'client', message: { role: 'user', content: 'hello' } }],
    assistantMessage: { role: 'assistant', content: 'first' },
    generatedWithThinking: 'disabled',
  })
  db.prepare(`INSERT INTO generation_attempt_v2
    VALUES ('operation:1', 1, 1, 'open', NULL, NULL, 101, NULL)`).run()
  db.prepare("UPDATE generation_request_v2 SET state='streaming', updated_at_ms=102 WHERE operation_id='operation:1'").run()
  db.prepare("UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=103 WHERE operation_id='operation:1'").run()
  db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
    terminal_fingerprint=?, terminal_at_ms=104 WHERE operation_id='operation:1'`)
    .run('{"kind":"provider_completed"}', 'a'.repeat(64))
  db.prepare("UPDATE generation_request_v2 SET state='completed', updated_at_ms=105, terminal_at_ms=105 WHERE operation_id='operation:1'").run()
  db.prepare("UPDATE generation_operation_v2 SET state='completed', updated_at_ms=106, terminal_at_ms=106 WHERE operation_id='operation:1'").run()
  db.prepare("UPDATE message_v2 SET status='completed', updated_at_ms=106 WHERE message_id=?").run(answerRootId)
  db.prepare(`INSERT INTO generation_native_artifact_v2
    VALUES (?, 1, 'operation:1', ?, ?, ?, ?, 106, 'request_terminal')`).run(
    answerRootId, artifact.artifactKind, artifact.artifactCodecVersion,
    serializeDeepSeekNativeHistoryArtifactV2(artifact), artifact.artifactHash,
  )
}

beforeEach(() => {
  mocks.fetch.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'))
})
afterEach(() => vi.restoreAllMocks())

describe('DeepSeek plain-text initial-send coordinator V2', () => {
  it('compiles exact first-request bytes and exhaustive ledger only from transaction repository facts', async () => {
    const db = database()
    try {
      const config = new GenerationConfigV2Repo(db)
      const currentConfig = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope(
        'conversation', 'conversation:1', currentConfig.configRevision.value, {
        schemaVersion: 2,
        generation: { temperature: 0.7, topP: 0.8 },
      })
      mocks.fetch.mockResolvedValueOnce(response())
      const result = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const prepared = result.preparedRequest
      expect(prepared).toMatchObject({
        operationId: 'operation:1', requestSequence: 1, plannedAttempt: 1,
        providerId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1',
        contractId: 'deepseek-stable-chat-v1', modelId: 'deepseek-v4-pro',
        endpoint: 'https://api.deepseek.com/chat/completions', method: 'POST',
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toEqual({
        messages: [{ role: 'user', content: 'hello' }],
        model: 'deepseek-v4-pro',
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.7,
        thinking: { type: 'disabled' },
        top_p: 0.8,
      })
      expect(prepared.bodySha256).toBe(prepared.body.sha256)
      expect(isGenerationRequestRepositoryFactV2(result.request)).toBe(true)
      expect(result.request).toMatchObject({
        operationId: 'operation:1', answerRootId: 'answer:2', requestSequence: 1,
        preparedBodySha256: prepared.bodySha256,
        preparedBodyByteLength: prepared.bodyByteLength,
        compilerLedgerHash: prepared.ledger.sha256,
      })
      expect(db.prepare('SELECT count(*) AS count FROM generation_request_v2').get()).toEqual({ count: 1 })
      expect(prepared.ledger.entries).toEqual([
        expect.objectContaining({ path: 'generation.temperature', disposition: 'encoded', nativeField: 'temperature' }),
        expect.objectContaining({ path: 'generation.topP', disposition: 'encoded', nativeField: 'top_p' }),
        expect.objectContaining({ path: 'image.mode', disposition: 'accepted_no_wire', nativeField: null }),
        expect.objectContaining({ path: 'providerExtension.kind', disposition: 'accepted_no_wire', nativeField: null }),
        expect.objectContaining({ path: 'reasoning.mode', disposition: 'encoded', nativeField: 'thinking.type' }),
        expect.objectContaining({ path: 'tools.mode', disposition: 'accepted_no_wire', nativeField: null }),
        expect.objectContaining({ path: 'web.mode', disposition: 'accepted_no_wire', nativeField: null }),
      ])
    } finally { db.close() }
  })

  it('commits once and immediately returns chosen/head/candidate projection', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const result = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(result.kind).toBe('created')
      expect(result.execution.operation).toMatchObject({
        operationId: { value: 'operation:1' }, resultAnswerRootId: { value: 'answer:2' },
      })
      expect(result.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:2' }, headMessageId: { value: 'answer:2' },
      })
      expect(result.projection.visibleCandidates.map((value) => value.value)).toEqual(['answer:2'])
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })

  it('starts a created V2 command exactly once and returns the committed projection before terminal streaming', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(streamResponse('runtime answer'))
      const projections: unknown[] = []
      const runtime = createDeepSeekGenerationV2Runtime({
        db,
        credentialService: credentialService(),
        nowMs: () => 100,
        streamProjectionSink: { publish: (projection) => projections.push(projection) },
      })
      const created = await runtime.submitInitial(command())
      expect(created).toMatchObject({ kind: 'created', projection: {
        branchProjection: { headMessageId: { value: expect.any(String) } },
      } })
      await vi.waitFor(() => expect(projections).toContainEqual(expect.objectContaining({
        type: 'terminal', state: 'completed', answerRootId: created.preparedRequest.answerRootId,
      })))
      const replay = await runtime.submitInitial(command())
      expect(replay).toMatchObject({ kind: 'idempotent_replay' })
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
      expect(runtime.abort(created.preparedRequest.operationId)).toBe(false)
    } finally { db.close() }
  })

  it('binds one exact tool registry revision into snapshot, capability and prepared bytes', async () => {
    const db = database()
    try {
      const registry = new ToolRegistryV2Repo(db, () => 50).installAndSelect({
        schemaVersion: 2,
        definitions: [{
          toolId: 'tool:weather', kind: 'function', sideEffectPolicy: 'none',
          function: {
            name: 'weather', description: 'Lookup weather',
            parameters: { type: 'object', required: ['city'], properties: { city: { type: 'string' } } },
          },
        }],
      }, null)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2,
        tools: {
          mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'omitted' },
          sideEffectConfirmation: 'required_each_retry',
        },
      })
      mocks.fetch.mockResolvedValueOnce(response())
      const result = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(result.execution.snapshot.toolAuthority).toMatchObject({
        kind: 'registry',
        toolRegistryRevision: { value: registry.revision },
        toolDefinitionsDigest: { value: registry.definitionsDigest },
      })
      expect(result.execution.capability.tools).toEqual([
        expect.objectContaining({ toolId: 'tool:weather', kind: 'function', state: 'supported' }),
      ])
      expect(JSON.parse(result.preparedRequest.body.copyUtf8Text())).toMatchObject({
        tools: [{
          type: 'function',
          function: {
            name: 'weather', description: 'Lookup weather',
            parameters: { type: 'object', required: ['city'], properties: { city: { type: 'string' } } },
          },
        }],
      })
      expect(JSON.parse(result.preparedRequest.body.copyUtf8Text())).not.toHaveProperty('tool_choice')
      expect(result.preparedRequest.ledger.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'tools.allowedToolIds', disposition: 'encoded', nativeField: 'tools' }),
        expect.objectContaining({ path: 'tools.toolChoice', disposition: 'accepted_no_wire' }),
      ]))
    } finally { db.close() }
  })

  it('keeps the answer current across an exact native tool continuation and terminal response', async () => {
    const db = database()
    try {
      new ToolRegistryV2Repo(db, () => 50).installAndSelect({
        schemaVersion: 2,
        definitions: [{
          toolId: 'tool:weather', kind: 'function',
          sideEffectPolicy: 'confirmation_required_each_execution',
          function: { name: 'weather', parameters: { type: 'object' } },
        }],
      }, null)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2,
        tools: {
          mode: 'enabled', allowedToolIds: ['tool:weather'], toolChoice: { mode: 'omitted' },
          sideEffectConfirmation: 'required_each_retry',
        },
      })
      mocks.fetch.mockResolvedValueOnce(response())
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      mocks.fetch.mockResolvedValueOnce(toolCallStreamResponse())
      let toolClock = 400
      const runner = createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), fetchImpl: mocks.fetch, nowMs: () => toolClock++,
      })
      await expect(runner.run(initial)).resolves.toMatchObject({ state: 'awaiting_tool' })
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'streaming' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'streaming' })
      expect(recoverGenerationOrphansV2(db, toolClock++)).toEqual({ recovered: 0, operationIds: [] })

      const continuationCoordinator = createDeepSeekToolContinuationCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => toolClock++,
      })
      const continuationCommand = {
        operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:2',
        expectedHeadMessageId: 'answer:2', priorRequestSequence: 1,
        toolOutputs: [{
          toolCallId: 'call:weather', content: '{"temperature":25}',
          userConfirmedExternalSideEffect: true,
        }],
      }
      await expect(continuationCoordinator.submit({
        ...continuationCommand,
        toolOutputs: continuationCommand.toolOutputs.map((output) => ({
          ...output, userConfirmedExternalSideEffect: false,
        })),
      })).rejects.toThrow('GENERATION_V2_DEEPSEEK_HISTORY_STATE_INVALID')
      expect(db.prepare("SELECT count(*) AS count FROM generation_request_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ count: 1 })
      const continuation = await continuationCoordinator.submit(continuationCommand)
      expect(continuation.preparedRequest.requestSequence).toBe(2)
      expect(JSON.parse(continuation.preparedRequest.body.copyUtf8Text()).messages).toEqual([
        { role: 'user', content: 'hello' },
        {
          role: 'assistant', content: null,
          tool_calls: [{
            id: 'call:weather', type: 'function',
            function: { name: 'weather', arguments: '{"city":"Shanghai"}' },
          }],
        },
        { role: 'tool', content: '{"temperature":25}', tool_call_id: 'call:weather' },
      ])
      const restartedContinuationCoordinator = createDeepSeekToolContinuationCoordinatorV2({
        db,
        credentialService: {
          getStatus: async () => { throw new Error('credential must not be read on active replay') },
        } as never,
        nowMs: () => toolClock++,
      })
      await expect(restartedContinuationCoordinator.submit(continuationCommand))
        .resolves.toMatchObject({ kind: 'idempotent_replay' })
      expect(db.prepare('SELECT count(*) AS count FROM generation_tool_output_v2').get()).toEqual({ count: 1 })
      expect(db.prepare(`SELECT side_effect_policy AS policy, confirmation_state AS confirmation
        FROM generation_tool_output_v2`).get()).toEqual({
        policy: 'confirmation_required_each_execution', confirmation: 'user_confirmed',
      })

      mocks.fetch.mockResolvedValueOnce(streamResponse('final answer'))
      await expect(runner.run(continuation)).resolves.toMatchObject({ state: 'completed' })
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'completed' })
      expect(db.prepare("SELECT body_text AS body FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body: 'final answer' })
      expect(db.prepare("SELECT head_message_id AS head FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head: 'answer:2' })
      expect(db.prepare("SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen: 'answer:2' })
      expect(db.prepare("SELECT count(*) AS count FROM generation_request_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ count: 2 })
      const terminalReplay = createDeepSeekToolContinuationCoordinatorV2({
        db,
        credentialService: {
          getStatus: async () => { throw new Error('credential must not be read on terminal replay') },
        } as never,
        nowMs: () => toolClock++,
      })
      await expect(terminalReplay.submit(continuationCommand)).resolves.toMatchObject({
        kind: 'idempotent_replay', preparedRequest: { requestSequence: 2 },
      })
    } finally { db.close() }
  })

  it('replays through a fresh coordinator without credential or network access', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value)
        .toBe(first.execution.operation.resultAnswerRootId.value)
      expect(replay.preparedRequest.bodySha256).toBe(first.preparedRequest.bodySha256)
      expect(replay.preparedRequest.body.copyUtf8Text()).toBe(first.preparedRequest.body.copyUtf8Text())
      expect(replay.request.preparedBodySha256).toBe(first.request.preparedBodySha256)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 2 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_request_v2').get()).toEqual({ count: 1 })
      expect(() => db.prepare("UPDATE message_body_v2 SET body_text='tampered' WHERE message_id='question:1'").run())
        .toThrow('GENERATION_V2_OPERATION_QUESTION_BODY_IMMUTABLE')
    } finally { db.close() }
  })

  it('replays after database reopen even when config and credential have changed', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'starverse-initial-send-'))
    const filename = path.join(directory, 'starverse.db')
    let db = database(filename)
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.7 },
      })
      db.close()
      db = new BetterSqlite3(filename)
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value)
        .toBe(first.execution.operation.resultAnswerRootId.value)
      expect(replay.preparedRequest.bodySha256).toBe(first.preparedRequest.bodySha256)
      expect(replay.request.compilerLedgerHash).toBe(first.request.compilerLedgerHash)
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally {
      if (db.open) db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns the transaction winner when two callers initially observe the operation as missing', async () => {
    const db = database()
    try {
      let releaseFirst!: (value: Response) => void
      const firstResponse = new Promise<Response>((resolve) => { releaseFirst = resolve })
      mocks.fetch.mockReturnValueOnce(firstResponse).mockResolvedValueOnce(response())
      const firstPromise = coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
      const winner = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      releaseFirst(response())
      const raced = await firstPromise
      expect(winner.kind).toBe('created')
      expect(raced.kind).toBe('idempotent_replay')
      expect(raced.execution.operation.resultAnswerRootId.value)
        .toBe(winner.execution.operation.resultAnswerRootId.value)
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_request_v2').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 2 })
    } finally { db.close() }
  })

  it('rolls back graph, operation, snapshot and choice when request persistence fails', async () => {
    const db = database()
    try {
      db.exec(`CREATE TEMP TRIGGER fail_prepared_request
        BEFORE INSERT ON generation_request_v2
        BEGIN SELECT RAISE(ABORT, 'forced request persistence failure'); END`)
      mocks.fetch.mockResolvedValueOnce(response())
      await expect(coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow('forced request persistence failure')
      expect(db.prepare('SELECT count(*) AS count FROM message_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get()).toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM generation_request_v2').get()).toEqual({ count: 0 })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: null })
    } finally { db.close() }
  })

  it('replays without moving a branch that has advanced to a later turn', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(response())
      const service = coordinator(db)
      const first = await service.submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const firstAnswer = first.execution.operation.resultAnswerRootId.value
      completeFirstRequest(db, firstAnswer)
      const later = await service.submit({
        command: command({
          operationId: 'operation:2', expectedHeadMessageId: firstAnswer, userBody: 'later',
        }),
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })
      const laterHead = later.execution.operation.resultAnswerRootId.value
      const replay = await coordinator(db, true).submit({
        command: command(), expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.projection.branchProjection.chosenAnswerRootId?.value).toBe(firstAnswer)
      expect(replay.projection.branchProjection.headMessageId?.value).toBe(laterHead)
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: laterHead })
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
    } finally { db.close() }
  })

  it.each([
    ['body', { userBody: 'changed' }],
    ['head', { expectedHeadMessageId: 'answer:other' }],
    ['branch', { branchId: 'branch:other' }],
    ['model', { modelId: 'deepseek-chat' }],
  ])('rejects the same operation id with different %s', async (_name, override) => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await expect(coordinator(db, true).submit({
        command: command(override), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
    } finally { db.close() }
  })

  it('sends the exact prepared bytes once and persists completed native history without moving chosen/head', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(streamResponse('answer'))
      const committed = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const capture = vi.fn()
      const projections: unknown[] = []
      const terminal = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
        rawGenerationRequestStore: { tryPersistPreparedV2: capture } as never,
        streamProjectionSink: { publish: (projection) => projections.push(projection) },
      }).run(committed)
      expect(terminal).toEqual({
        operationId: 'operation:1', answerRootId: 'answer:2', state: 'completed',
        errorCode: null, errorMessage: null,
      })
      const transport = mocks.fetch.mock.calls[1]
      expect(transport[0]).toBe('https://api.deepseek.com/chat/completions')
      expect(Buffer.from((transport[1] as RequestInit).body as Buffer).toString('utf8'))
        .toBe(committed.preparedRequest.body.copyUtf8Text())
      expect((transport[1] as RequestInit).headers).toMatchObject({
        authorization: 'Bearer sk-test', accept: 'text/event-stream', 'content-type': 'application/json',
      })
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation:1' }),
        committed.preparedRequest.body)
      expect(projections).toEqual([
        { type: 'assistant_body', operationId: 'operation:1', answerRootId: 'answer:2', content: 'answer' },
        { type: 'terminal', operationId: 'operation:1', answerRootId: 'answer:2', state: 'completed', errorCode: null, errorMessage: null },
      ])
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'completed' })
      expect(db.prepare("SELECT state FROM generation_request_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'completed' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'completed' })
      expect(db.prepare("SELECT body_text FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body_text: 'answer' })
      expect(db.prepare("SELECT count(*) AS count FROM generation_native_artifact_v2 WHERE answer_root_id='answer:2'").get())
        .toEqual({ count: 2 })
      const terminalArtifact = db.prepare(`SELECT artifact_json AS artifactJson
        FROM generation_native_artifact_v2
        WHERE answer_root_id='answer:2' AND artifact_kind='deepseek_stable_terminal_result_v1'`).get() as
        { artifactJson: string }
      expect(JSON.parse(terminalArtifact.artifactJson)).toMatchObject({
        assistantMessage: { role: 'assistant', content: 'answer' },
        finishReason: 'stop', usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        responseMetadata: { id: 'response:1', model: 'deepseek-v4-pro', systemFingerprint: 'fp:1' },
      })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:2' })
    } finally { db.close() }
  })

  it('keeps Raw Debug capture non-fatal and sends the same prepared bytes', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(streamResponse('answer'))
      const committed = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const capture = vi.fn(() => { throw new Error('debug database unavailable') })
      const terminal = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
        rawGenerationRequestStore: { tryPersistPreparedV2: capture } as never,
      }).run(committed)
      expect(terminal.state).toBe('completed')
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'operation:1' }),
        committed.preparedRequest.body)
      expect(Buffer.from((mocks.fetch.mock.calls[1][1] as RequestInit).body as Buffer).toString('utf8'))
        .toBe(committed.preparedRequest.body.copyUtf8Text())
    } finally { db.close() }
  })

  it.each([
    ['credential failure', true, null],
    ['HTTP failure', false, new Response('denied', { status: 401, headers: { 'content-type': 'text/plain' } })],
  ])('terminalizes a pre-stream %s without retry or branch rollback', async (_name, failCredential, providerResponse) => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      if (providerResponse) mocks.fetch.mockResolvedValueOnce(providerResponse)
      const committed = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const terminal = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(failCredential), nowMs: () => 110,
      }).run(committed)
      expect(terminal.state).toBe('failed')
      expect(mocks.fetch).toHaveBeenCalledTimes(failCredential ? 1 : 2)
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'failed' })
      expect(db.prepare("SELECT state FROM generation_request_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'failed' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'failed' })
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:2' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:2' })
    } finally { db.close() }
  })

  it('keeps partial content and the committed branch when the provider stream fails', async () => {
    const db = database()
    try {
      const partial = streamResponse('partial')
      const reader = partial.body!.getReader()
      const first = await reader.read()
      await reader.cancel()
      let delivered = false
      const broken = new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!delivered) {
            delivered = true
            controller.enqueue(first.value!)
          } else controller.error(new Error('connection lost'))
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
      mocks.fetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(broken)
      const committed = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const terminal = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      }).run(committed)
      expect(terminal.state).toBe('failed')
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'failed' })
      expect(db.prepare("SELECT body_text FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body_text: 'partial' })
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:2' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:2' })
    } finally { db.close() }
  })

  it('rejects a duplicate runner without a second send and lets the first attempt end cancelled', async () => {
    const db = database()
    try {
      let transportStarted!: () => void
      const started = new Promise<void>((resolve) => { transportStarted = resolve })
      const never = new Promise<Response>(() => undefined)
      mocks.fetch.mockResolvedValueOnce(response()).mockImplementationOnce(() => {
        transportStarted()
        return never
      })
      const committed = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const controller = new AbortController()
      const runner = createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      })
      const active = runner.run(committed, controller.signal)
      await started
      await expect(runner.run(committed)).rejects.toThrow('GENERATION_V2_DEEPSEEK_RUNNER_ALREADY_STARTED')
      controller.abort()
      await expect(active).resolves.toMatchObject({ state: 'cancelled', errorCode: 'user_cancelled' })
      expect(mocks.fetch).toHaveBeenCalledTimes(2)
      expect(db.prepare("SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'cancelled' })
    } finally { db.close() }
  })

  it('recovers a committed prepared request as interrupted without network or branch rollback', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(recoverGenerationOrphansV2(db, 120)).toEqual({
        recovered: 1, operationIds: ['operation:1'],
      })
      expect(recoverGenerationOrphansV2(db, 121)).toEqual({ recovered: 0, operationIds: [] })
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(db.prepare("SELECT state, error_code AS errorCode FROM generation_operation_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'failed', errorCode: 'stream_interrupted' })
      expect(db.prepare("SELECT state FROM generation_request_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'failed' })
      expect(db.prepare("SELECT status FROM message_v2 WHERE message_id='answer:2'").get())
        .toEqual({ status: 'failed' })
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:2' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:2' })
    } finally { db.close() }
  })

  it('recovers an open streaming attempt atomically and preserves partial content', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
      await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      const executionRepo = new GenerationExecutionV2Repo(db, () => 110)
      const requestRepo = new GenerationRequestV2Repo(db, () => 110)
      const graphRepo = new ConversationGraphV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const execution = executionRepo.findOperationInTransaction(context, 'operation:1')!
        const request = requestRepo.loadExistingForOperation(context, execution, 1)
        executionRepo.openAttempt(context, {
          operationId: 'operation:1', requestSequence: 1, attempt: 1,
        }, 110)
        requestRepo.markStreaming(context, request, 110)
        executionRepo.markOperationStreaming(context, execution, 110)
        graphRepo.compareAndSetStreamingAssistantBody(context, 'answer:2', '', 'partial', 110)
      })
      expect(recoverGenerationOrphansV2(db, 120)).toMatchObject({ recovered: 1 })
      expect(db.prepare("SELECT state FROM generation_attempt_v2 WHERE operation_id='operation:1'").get())
        .toEqual({ state: 'terminal' })
      expect(db.prepare("SELECT outcome_json AS outcomeJson FROM generation_attempt_v2 WHERE operation_id='operation:1'").get())
        .toMatchObject({ outcomeJson: expect.stringContaining('process_interrupted') })
      expect(db.prepare("SELECT body_text FROM message_body_v2 WHERE message_id='answer:2'").get())
        .toEqual({ body_text: 'partial' })
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:2' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:2' })
    } finally { db.close() }
  })

  it('retries the chosen answer from its exact snapshot and implements as-new/replace branch semantics', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
        .mockResolvedValueOnce(streamResponse('first'))
        .mockResolvedValueOnce(streamResponse('sibling'))
        .mockResolvedValueOnce(new Response('denied', { status: 401, headers: { 'content-type': 'text/plain' } }))
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      }).run(initial)
      const originalSnapshot = JSON.parse(initial.execution.snapshot.canonicalJson)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.9 },
      })
      const asNewCoordinator = createDeepSeekPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createAnswerId: () => 'answer:retry-new',
      })
      const asNew = await asNewCoordinator.submit({
        actionKind: 'retry_as_new', operationId: 'operation:retry-new', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2',
      })
      expect(asNew.kind).toBe('created')
      const replay = await asNewCoordinator.submit({
        actionKind: 'retry_as_new', operationId: 'operation:retry-new', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2',
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value).toBe('answer:retry-new')
      expect(asNew.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:retry-new' }, headMessageId: { value: 'answer:retry-new' },
      })
      expect(asNew.projection.visibleCandidates.map((candidate) => candidate.value))
        .toEqual(['answer:2', 'answer:retry-new'])
      expect(JSON.parse(asNew.preparedRequest.body.copyUtf8Text())).toEqual({
        messages: [{ role: 'user', content: 'hello' }], model: 'deepseek-v4-pro', stream: true,
        stream_options: { include_usage: true }, thinking: { type: 'disabled' },
      })
      const copiedSnapshot = JSON.parse(asNew.execution.snapshot.canonicalJson)
      for (const snapshot of [originalSnapshot, copiedSnapshot]) {
        delete snapshot.answerRootId
        delete snapshot.operationId
        delete snapshot.snapshotHash
      }
      expect(copiedSnapshot).toEqual(originalSnapshot)

      const countsBeforeStale = db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()
      await expect(createDeepSeekPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 121,
        createAnswerId: () => 'answer:must-not-exist',
      }).submit({
        actionKind: 'retry_as_new', operationId: 'operation:stale', branchId: 'branch:1',
        questionId: 'question:1', targetAnswerRootId: 'answer:2', expectedHeadMessageId: 'answer:2',
      })).rejects.toThrow('STALE_CHOSEN_ANSWER')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()).toEqual(countsBeforeStale)

      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 130,
      }).run(asNew)
      const replace = await createDeepSeekPlainTextRetryCoordinatorV2({
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
      const failed = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 150,
      }).run(replace)
      expect(failed.state).toBe('failed')
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:replacement' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:replacement' })
    } finally { db.close() }
  })

  it('regenerates the question from current model/config and never restores the old chosen answer', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
        .mockResolvedValueOnce(streamResponse('first'))
        .mockResolvedValueOnce(response('deepseek-chat'))
        .mockResolvedValueOnce(response('deepseek-chat'))
        .mockResolvedValueOnce(new Response('denied', { status: 503, headers: { 'content-type': 'text/plain' } }))
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      }).run(initial)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.9, topP: 0.7 },
      })
      const regenerateService = createDeepSeekPlainTextRegenerateCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createAnswerId: () => 'answer:regenerated',
      })
      const regenerateCommand = {
        operationId: 'operation:regenerate', branchId: 'branch:1', questionId: 'question:1',
        expectedHeadMessageId: 'answer:2', modelId: 'deepseek-chat', commandAttachments: [],
      }
      const regenerated = await regenerateService.submit({
        command: regenerateCommand,
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })
      expect(regenerated.execution.operation).toMatchObject({
        actionKind: 'regenerate_question', targetAnswerRootId: null,
        resultAnswerRootId: { value: 'answer:regenerated' },
      })
      expect(JSON.parse(regenerated.preparedRequest.body.copyUtf8Text())).toEqual({
        messages: [{ role: 'user', content: 'hello' }], model: 'deepseek-chat', stream: true,
        stream_options: { include_usage: true }, temperature: 0.9,
        thinking: { type: 'disabled' }, top_p: 0.7,
      })
      expect(regenerated.projection.visibleCandidates.map((candidate) => candidate.value))
        .toEqual(['answer:2', 'answer:regenerated'])
      expect(regenerated.projection.branchProjection).toMatchObject({
        chosenAnswerRootId: { value: 'answer:regenerated' },
        headMessageId: { value: 'answer:regenerated' },
      })
      expect(regenerated.execution.snapshot.providerBinding.modelId.value).toBe('deepseek-chat')
      expect(regenerated.execution.snapshot.semanticIntent.generation).toMatchObject({ temperature: 0.9, topP: 0.7 })
      const replay = await regenerateService.submit({
        command: regenerateCommand,
        expectedCredentialRevision: 999,
        expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value).toBe('answer:regenerated')
      expect(replay.preparedRequest.bodySha256).toBe(regenerated.preparedRequest.bodySha256)
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM generation_request_v2) AS requests`).get())
        .toEqual({ operations: 2, messages: 3, requests: 2 })
      await expect(regenerateService.submit({
        command: { ...regenerateCommand, operationId: 'operation:regenerate-stale' },
        expectedCredentialRevision: 1,
        expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM generation_request_v2) AS requests`).get())
        .toEqual({ operations: 2, messages: 3, requests: 2 })
      const failed = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 130,
      }).run(regenerated)
      expect(failed.state).toBe('failed')
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ chosen_answer_root_id: 'answer:regenerated' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:regenerated' })
    } finally { db.close() }
  })

  it('edit-resends from current config with fork/replace question semantics and no terminal rollback', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
        .mockResolvedValueOnce(streamResponse('first'))
        .mockResolvedValueOnce(response('deepseek-chat'))
        .mockResolvedValueOnce(streamResponse('edited answer'))
        .mockResolvedValueOnce(response('deepseek-chat'))
        .mockResolvedValueOnce(response('deepseek-chat'))
        .mockResolvedValueOnce(new Response('denied', { status: 503, headers: { 'content-type': 'text/plain' } }))
      const initial = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      }).run(initial)
      const config = new GenerationConfigV2Repo(db)
      const current = config.getScope('conversation', 'conversation:1')
      config.compareAndSetScope('conversation', 'conversation:1', current.configRevision.value, {
        schemaVersion: 2, generation: { temperature: 0.4 },
      })
      const forkCommand = {
        operationId: 'operation:edit-fork', mode: 'fork', branchId: 'branch:1',
        sourceQuestionId: 'question:1', sourceAnswerRootId: 'answer:2',
        expectedHeadMessageId: 'answer:2', userBody: 'edited question',
        modelId: 'deepseek-chat', commandAttachments: [],
      }
      const forkService = createDeepSeekPlainTextEditResendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createQuestionId: () => 'question:edit-fork', createAnswerId: () => 'answer:edit-fork',
      })
      const fork = await forkService.submit({
        command: forkCommand, expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(fork.execution.operation).toMatchObject({
        actionKind: 'edit_resend', questionId: { value: 'question:edit-fork' },
        resultAnswerRootId: { value: 'answer:edit-fork' }, targetAnswerRootId: null,
      })
      expect(JSON.parse(fork.preparedRequest.body.copyUtf8Text())).toEqual({
        messages: [{ role: 'user', content: 'edited question' }], model: 'deepseek-chat', stream: true,
        stream_options: { include_usage: true }, temperature: 0.4, thinking: { type: 'disabled' },
      })
      expect(fork.projection.visibleQuestionCandidates.map((candidate) => candidate.value))
        .toEqual(['question:1', 'question:edit-fork'])
      expect(fork.projection.branchProjection).toMatchObject({
        questionId: { value: 'question:edit-fork' },
        chosenAnswerRootId: { value: 'answer:edit-fork' }, headMessageId: { value: 'answer:edit-fork' },
      })
      const replay = await forkService.submit({
        command: forkCommand, expectedCredentialRevision: 999, expectedCredentialScopeId: scope,
      })
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.execution.operation.resultAnswerRootId.value).toBe('answer:edit-fork')
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 130,
      }).run(fork)
      const countsBeforeStale = db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM branch_question_hide_v2) AS hiddenQuestions`).get()
      await expect(createDeepSeekPlainTextEditResendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 140,
        createQuestionId: () => 'question:must-not-exist', createAnswerId: () => 'answer:must-not-exist',
      }).submit({
        command: { ...forkCommand, operationId: 'operation:edit-stale' },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })).rejects.toThrow('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages,
        (SELECT count(*) FROM branch_question_hide_v2) AS hiddenQuestions`).get())
        .toEqual(countsBeforeStale)
      const replace = await createDeepSeekPlainTextEditResendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 150,
        createQuestionId: () => 'question:edit-replace', createAnswerId: () => 'answer:edit-replace',
      }).submit({
        command: {
          ...forkCommand, operationId: 'operation:edit-replace', mode: 'replace',
          sourceQuestionId: 'question:edit-fork', sourceAnswerRootId: 'answer:edit-fork',
          expectedHeadMessageId: 'answer:edit-fork', userBody: 'edited again',
        },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(replace.projection.visibleQuestionCandidates.map((candidate) => candidate.value))
        .toEqual(['question:1', 'question:edit-replace'])
      expect(db.prepare(`SELECT question_id AS questionId FROM branch_question_hide_v2
        WHERE branch_id='branch:1'`).all()).toEqual([{ questionId: 'question:edit-fork' }])
      const failed = await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 160,
      }).run(replace)
      expect(failed.state).toBe('failed')
      expect(db.prepare("SELECT chosen_answer_root_id FROM branch_choice_v2 WHERE branch_id='branch:1' AND question_id='question:edit-replace'").get())
        .toEqual({ chosen_answer_root_id: 'answer:edit-replace' })
      expect(db.prepare("SELECT head_message_id FROM branch_v2 WHERE branch_id='branch:1'").get())
        .toEqual({ head_message_id: 'answer:edit-replace' })
      db.prepare("UPDATE branch_v2 SET head_message_id='answer:edit-fork' WHERE branch_id='branch:1'").run()
      const countsBeforeHiddenAction = db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()
      await expect(createDeepSeekPlainTextRetryCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 170,
        createAnswerId: () => 'answer:hidden-action-must-not-exist',
      }).submit({
        actionKind: 'retry_as_new', operationId: 'operation:hidden-question', branchId: 'branch:1',
        questionId: 'question:edit-fork', targetAnswerRootId: 'answer:edit-fork',
        expectedHeadMessageId: 'answer:edit-fork',
      })).rejects.toThrow('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      expect(db.prepare(`SELECT
        (SELECT count(*) FROM generation_operation_v2) AS operations,
        (SELECT count(*) FROM message_v2) AS messages`).get()).toEqual(countsBeforeHiddenAction)
    } finally { db.close() }
  })

  it('edit-resend reconstructs the exact native prefix before the edited question', async () => {
    const db = database()
    try {
      mocks.fetch.mockResolvedValueOnce(response())
        .mockResolvedValueOnce(streamResponse('first answer'))
        .mockResolvedValueOnce(response())
        .mockResolvedValueOnce(streamResponse('second answer'))
        .mockResolvedValueOnce(response())
      const first = await coordinator(db).submit({
        command: command(), expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 110,
      }).run(first)
      const second = await createDeepSeekPlainTextInitialSendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 120,
        createGraphId: (kind) => kind === 'question' ? 'question:2' : 'answer:3',
      }).submit({
        command: command({
          operationId: 'operation:2', expectedHeadMessageId: 'answer:2', userBody: 'second question',
        }),
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      await createDeepSeekInitialStreamRunnerV2({
        db, credentialService: credentialService(), nowMs: () => 130,
      }).run(second)
      const edited = await createDeepSeekPlainTextEditResendCoordinatorV2({
        db, credentialService: credentialService(), nowMs: () => 140,
        createQuestionId: () => 'question:2-edited', createAnswerId: () => 'answer:2-edited',
      }).submit({
        command: {
          operationId: 'operation:2-edited', mode: 'fork', branchId: 'branch:1',
          sourceQuestionId: 'question:2', sourceAnswerRootId: 'answer:3',
          expectedHeadMessageId: 'answer:3', userBody: 'edited second question',
          modelId: 'deepseek-v4-pro', commandAttachments: [],
        },
        expectedCredentialRevision: 1, expectedCredentialScopeId: scope,
      })
      expect(JSON.parse(edited.preparedRequest.body.copyUtf8Text()).messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'edited second question' },
      ])
      expect(db.prepare("SELECT parent_message_id FROM message_v2 WHERE message_id='question:2-edited'").get())
        .toEqual({ parent_message_id: 'answer:2' })
    } finally { db.close() }
  })
})
