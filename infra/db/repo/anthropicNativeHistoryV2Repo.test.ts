import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'

const transportMocks = vi.hoisted(() => ({ leases: new WeakSet<object>() }))
vi.mock('electron', () => ({ session: { defaultSession: { fetch: vi.fn() } } }))
vi.mock('../../../electron/credentials/epoch2RuntimeCredentialService', () => ({
  isEpoch2RuntimeCredentialLease: (value: unknown) =>
    Boolean(value && typeof value === 'object' && transportMocks.leases.has(value)),
}))
import {
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { createSemanticConsumptionLedgerV2 } from '../../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import { issuePreparedProviderRequestV2 } from '../../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { readReviewedAnthropicMessagesDefinitionV2 } from '../../../src/next/generation-v2/contracts/providerContractRegistryV2'
import {
  createAnthropicNativeHistoryArtifactV1,
  serializeAnthropicNativeHistoryArtifactV1,
  type AnthropicNativeHistoryArtifactV1,
} from '../../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { GenerationExecutionV2Repo } from './generationExecutionV2Repo'
import { GenerationRequestV2Repo } from './generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import {
  AnthropicNativeHistoryV2Repo,
  isAnthropicCompletedAnswerArtifactRepositoryFactForContextV2,
  isAnthropicRequestHistoryRepositoryFactForContextV2,
} from './anthropicNativeHistoryV2Repo'
import { compileAnthropicMessagesPreparedRequestV2 } from '../../../electron/services/anthropicMessagesPreparedRequestCompilerV2'
import { issueGenerationTextCommandResultV2 } from '../../../electron/services/generationTextCommandResultV2'
import { createAnthropicMessagesStreamRunnerV2 } from '../../../electron/services/anthropicMessagesStreamRunnerV2'

const root = path.resolve(process.cwd())
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const ledger = createSemanticConsumptionLedgerV2([{
  kind: 'consumed', path: 'generation.temperature', disposition: 'encoded',
  nativeField: 'temperature', encodingKind: 'identity', evidence: 'anthropic test compiler',
}])

function binding() {
  const definition = readReviewedAnthropicMessagesDefinitionV2()
  return {
    credentialScopeId: 'credential-scope:anthropic',
    providerId: 'anthropic',
    endpointProfileId: 'profile:anthropic',
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: 'endpoint-set:1',
      descriptors: [{ endpointId: 'endpoint:anthropic', descriptorRevision: 'descriptor:1' }],
    },
    protocolContractId: 'anthropic-messages-2023-06-01',
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value,
    modelId: 'claude-sonnet-4-5',
    operation: 'text',
  }
}

const capability = decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
  schemaVersion: 2,
  resolvedAt: '2026-07-18T00:00:00.000Z',
  binding: binding(),
  evidence: [{
    evidenceId: 'test.anthropic.messages', kind: 'official_documentation', effect: 'supports',
    sourceRef: 'https://docs.anthropic.com/en/api/messages', verifiedAt: '2026-07-18T00:00:00.000Z',
    contentDigest: HASH_A,
  }],
  fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((field) => {
    const enumDomains: Partial<Record<string, readonly (string | number | boolean)[]>> = {
      'reasoning.mode': ['disabled', 'enabled'],
      'web.mode': ['disabled'],
      'image.mode': ['disabled'],
      'tools.mode': ['disabled'],
      'providerExtension.kind': ['anthropic_messages'],
      'providerExtension.thinkingDisplay': ['provider_default', 'summarized', 'omitted'],
      'providerExtension.thinkingMode': ['model_recommended', 'manual', 'adaptive'],
    }
    const domain = field === 'generation.maxOutputTokens'
      ? { kind: 'range' as const, min: 1, max: 1_000_000, integer: true }
      : enumDomains[field]
        ? { kind: 'enum' as const, values: enumDomains[field]! }
        : undefined
    return domain
      ? { path: field, state: 'supported' as const, domain, constraints: [], evidenceIds: ['test.anthropic.messages'] }
      : { path: field, state: 'missing' as const, constraints: [], evidenceIds: [] }
  }),
  tools: [],
  continuation: {
    kind: 'client_managed_native_replay', artifactKind: 'anthropic_messages_native_history_v1',
    supportsBranchReplay: true, supportsRestartReplay: true, evidenceIds: ['test.anthropic.messages'],
  },
}))

function snapshotJson() {
  return decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId: 'answer:1',
    operationId: 'operation:1',
    semanticIntent: {
      schemaVersion: 2,
      generation: { maxOutputTokens: 2048 }, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' },
      attachments: [],
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended',
      },
    },
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
      { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:1' },
      { ownerKind: 'conversation', ownerId: 'conversation:1', revision: 'config:conversation:1' },
    ],
    providerBinding: binding(),
    capabilityBinding: {
      capabilityRevision: capability.revision.value,
      evidenceDigest: capability.evidenceDigest.value,
      semanticFieldsDigest: capability.semanticFieldsDigest.value,
      snapshotHash: capability.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority: { kind: 'none' },
  })).canonicalJson
}

function artifact(toolUse = false, text = 'answer'): AnthropicNativeHistoryArtifactV1 {
  return createAnthropicNativeHistoryArtifactV1({
    providerKey: 'anthropic', sourceApi: 'anthropic_messages', snapshotKey: 'assistant',
    role: 'assistant', status: 'final',
    content: toolUse
      ? [{ type: 'tool_use', id: 'toolu_1', name: 'weather', input: { city: text }, caller: { type: 'direct' } }]
      : [{ type: 'text', text, citations: null }],
    model: 'claude-sonnet-4-5', stopReason: toolUse ? 'tool_use' : 'end_turn', stopSequence: null,
    usage: {
      cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null,
      inference_geo: null, input_tokens: 3, output_tokens: 2, output_tokens_details: null,
      server_tool_use: null, service_tier: 'standard',
    },
  })
}

function createDb(filename = ':memory:', terminalRequest = true) {
  const db = new BetterSqlite3(filename)
  applyGenerationV2SchemaForTest(db, root)
  db.prepare(`INSERT INTO runtime_capability_snapshot_v2 VALUES (?, ?, 2, ?, ?, ?, 1)`).run(
    capability.snapshotHash.value, capability.revision.value, capability.canonicalJson,
    capability.evidenceDigest.value, capability.semanticFieldsDigest.value,
  )
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  db.prepare(`INSERT INTO branch_v2 VALUES ('branch:1', 'conversation:1', NULL, NULL, 12, 12, NULL, NULL)`).run()
  db.prepare(`INSERT INTO message_v2 (message_id, conversation_id, introduced_in_branch_id, role, status,
    parent_message_id, question_id, answer_root_id, ordinal, created_at_ms, updated_at_ms)
    VALUES ('question:1', 'conversation:1', 'branch:1', 'user', 'completed', NULL, NULL, NULL, 1, 10, 10),
      ('answer:1', 'conversation:1', 'branch:1', 'assistant', 'streaming', 'question:1', 'question:1', 'answer:1', 2, 11, 11)`).run()
  db.prepare(`UPDATE message_body_v2 SET body_text='question' WHERE message_id='question:1'`).run()
  db.prepare(`UPDATE branch_v2 SET head_message_id='answer:1' WHERE branch_id='branch:1'`).run()
  db.prepare(`INSERT INTO branch_choice_v2 VALUES ('branch:1', 'conversation:1', 'question:1', 'answer:1', 12)`).run()
  const executionRepo = new GenerationExecutionV2Repo(db)
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
    executionRepo.insertOperationAndSnapshot(context, {
      operationId: 'operation:1', actionKind: 'initial_send', branchId: 'branch:1',
      conversationId: 'conversation:1', questionId: 'question:1', sourceAnswerId: null,
      targetAnswerId: 'answer:1', snapshot: snapshotJson(), commandFingerprint: HASH_A, createdAtMs: 20,
    }))
  const storedSnapshot = db.prepare(`SELECT snapshot_hash AS hash FROM assistant_generation_snapshot_v2
    WHERE operation_id='operation:1'`).get() as { hash: string }
  if (!terminalRequest) return db
  db.prepare(`INSERT INTO generation_request_v2 (operation_id, request_sequence, answer_root_id,
    snapshot_hash, provider_id, endpoint_profile_id, credential_scope_id, contract_id, model_id,
    effective_endpoint_id, capability_revision, compiler_ledger_json, compiler_ledger_hash,
    prepared_body_sha256, prepared_body_byte_length, state, created_at_ms, updated_at_ms)
    VALUES ('operation:1', 1, 'answer:1', ?, 'anthropic', 'profile:anthropic',
      'credential-scope:anthropic', 'anthropic-messages-2023-06-01', 'claude-sonnet-4-5',
      'endpoint:anthropic', ?, ?, ?, ?, 2, 'prepared', 21, 21)`).run(
    storedSnapshot.hash, capability.revision.value, ledger.canonicalJson, ledger.sha256, HASH_B,
  )
  db.prepare(`INSERT INTO generation_attempt_v2
    VALUES ('operation:1', 1, 1, 'open', NULL, NULL, 22, NULL)`).run()
  db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=23
    WHERE operation_id='operation:1'`).run()
  db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=24
    WHERE operation_id='operation:1'`).run()
  db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json='{"kind":"provider_completed"}',
    terminal_fingerprint=?, terminal_at_ms=29 WHERE operation_id='operation:1'`).run(HASH_A)
  db.prepare(`UPDATE generation_request_v2 SET state='completed', updated_at_ms=30, terminal_at_ms=30
    WHERE operation_id='operation:1'`).run()
  return db
}

function setProjection(db: BetterSqlite3.Database, state: 'completed' | 'active') {
  if (state === 'completed') {
    db.prepare(`UPDATE generation_operation_v2 SET state='completed', updated_at_ms=31, terminal_at_ms=31
      WHERE operation_id='operation:1'`).run()
    db.prepare(`UPDATE message_v2 SET status='completed', updated_at_ms=31 WHERE message_id='answer:1'`).run()
  } else {
    db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=31
      WHERE operation_id='operation:1'`).run()
  }
}

function withAuthorities(db: BetterSqlite3.Database, action: (
  repo: AnthropicNativeHistoryV2Repo,
  context: Parameters<GenerationExecutionV2Repo['findOperationInTransaction']>[0],
  execution: NonNullable<ReturnType<GenerationExecutionV2Repo['findOperationInTransaction']>>,
  request: ReturnType<GenerationRequestV2Repo['loadExistingForOperation']>,
) => void): void {
  runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, 'operation:1')!
    const request = new GenerationRequestV2Repo(db).loadExistingForOperation(context, execution, 1)
    action(new AnthropicNativeHistoryV2Repo(db), context, execution, request)
  })
}

function allowCorruptionForTest(db: BetterSqlite3.Database) {
  for (const trigger of [
    'trg_generation_operation_v2_state_transition',
    'trg_generation_operation_v2_terminal_once',
    'trg_generation_request_v2_state_transition',
    'trg_generation_request_v2_terminal_once',
    'trg_message_v2_status_transition',
    'trg_generation_native_artifact_v2_immutable',
  ]) db.exec(`DROP TRIGGER ${trigger}`)
}

function createRunnerCommand(db: BetterSqlite3.Database) {
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, 'operation:1')!
    const history = new AnthropicNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1')
    const preparedRequest = compileAnthropicMessagesPreparedRequestV2({ context, execution, history })
    const request = new GenerationRequestV2Repo(db, () => 21).createPrepared(
      context, execution, preparedRequest,
    )
    return issueGenerationTextCommandResultV2({
      kind: 'created', execution, projection: {} as never, preparedRequest, request,
    })
  })
}

function runnerCredentialService(scope: string) {
  return {
    getStatus: async () => ({ providerKey: 'anthropic', configured: true, revision: 1, credentialScopeId: scope }),
    withCredential: async ({ consume }: { consume: (lease: never) => Promise<unknown> }) => {
      const lease = Object.freeze({
        trust: 'epoch2_runtime_credential_lease', usage: 'provider_transport_only',
        providerKey: 'anthropic', credential: 'sk-ant-test', revision: 1, credentialScopeId: scope,
        assertCurrent: () => undefined,
      })
      transportMocks.leases.add(lease)
      try { return await consume(lease as never) } finally { transportMocks.leases.delete(lease) }
    },
  } as never
}

describe('Anthropic native history V2 repository', () => {
  it('sends the same persisted body, exact Anthropic headers, and atomically keeps the new answer terminal', async () => {
    const db = createDb(':memory:', false)
    try {
      const command = createRunnerCommand(db)
      let sentBody: Uint8Array | null = null
      let sentHeaders: HeadersInit | undefined
      let rawBody: unknown
      const wire = [
        ['message_start', { message: {
          id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [],
          stop_reason: null, stop_sequence: null,
          usage: {
            cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null,
            inference_geo: null, input_tokens: 3, output_tokens: 1, output_tokens_details: null,
            server_tool_use: null, service_tier: 'standard',
          },
        } }],
        ['content_block_start', { index: 0, content_block: { type: 'text', text: '', citations: null } }],
        ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'hello' } }],
        ['content_block_stop', { index: 0 }],
        ['message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }],
        ['message_stop', {}],
      ].map(([type, value]) => `event: ${type}\ndata: ${JSON.stringify({ ...(value as object), type })}\n\n`).join('')
      const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
        sentBody = new Uint8Array(init.body as Buffer)
        sentHeaders = init.headers
        return new Response(wire, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      })
      const scope = command.preparedRequest.credentialScopeId
      const result = await createAnthropicMessagesStreamRunnerV2({
        db, credentialService: runnerCredentialService(scope), fetchImpl,
        nowMs: (() => { let now = 40; return () => now++ })(),
        rawGenerationRequestStore: { tryPersistPreparedV2: (_metadata: unknown, body: unknown) => { rawBody = body } } as never,
      }).run(command)
      expect(result.state).toBe('completed')
      expect(rawBody).toBe(command.preparedRequest.body)
      expect(Buffer.from(sentBody!)).toEqual(Buffer.from(command.preparedRequest.body.copyBytes()))
      expect(sentHeaders).toMatchObject({
        'content-type': 'application/json', accept: 'text/event-stream',
        'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01',
      })
      expect(db.prepare(`SELECT status FROM message_v2 WHERE message_id='answer:1'`).get())
        .toEqual({ status: 'completed' })
      expect(db.prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2`).get())
        .toEqual({ chosen: 'answer:1' })
      expect(db.prepare(`SELECT head_message_id AS head FROM branch_v2`).get()).toEqual({ head: 'answer:1' })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_native_artifact_v2`).get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('keeps the committed answer chosen/head when transport fails and Raw Debug also fails', async () => {
    const db = createDb(':memory:', false)
    try {
      const command = createRunnerCommand(db)
      const result = await createAnthropicMessagesStreamRunnerV2({
        db,
        credentialService: runnerCredentialService(command.preparedRequest.credentialScopeId),
        fetchImpl: async () => new Response('provider error', { status: 500 }),
        nowMs: (() => { let now = 40; return () => now++ })(),
        rawGenerationRequestStore: { tryPersistPreparedV2: () => { throw new Error('debug db unavailable') } } as never,
      }).run(command)
      expect(result.state).toBe('failed')
      expect(db.prepare(`SELECT status FROM message_v2 WHERE message_id='answer:1'`).get())
        .toEqual({ status: 'failed' })
      expect(db.prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice_v2`).get())
        .toEqual({ chosen: 'answer:1' })
      expect(db.prepare(`SELECT head_message_id AS head FROM branch_v2`).get()).toEqual({ head: 'answer:1' })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_native_artifact_v2`).get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('fails closed when a tool_use terminal arrives for a snapshot with tools disabled', async () => {
    const db = createDb(':memory:', false)
    try {
      const command = createRunnerCommand(db)
      const frames = [
        ['message_start', { message: {
          id: 'msg_tool', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [],
          stop_reason: null, stop_sequence: null,
          usage: {
            cache_creation: null, cache_creation_input_tokens: null, cache_read_input_tokens: null,
            inference_geo: null, input_tokens: 3, output_tokens: 1, output_tokens_details: null,
            server_tool_use: null, service_tier: 'standard',
          },
        } }],
        ['content_block_start', {
          index: 0, content_block: {
            type: 'tool_use', id: 'toolu_unexpected', name: 'unexpected', input: {}, caller: { type: 'direct' },
          },
        }],
        ['content_block_stop', { index: 0 }],
        ['message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 2 } }],
        ['message_stop', {}],
      ].map(([type, value]) => `event: ${type}\ndata: ${JSON.stringify({ ...(value as object), type })}\n\n`).join('')
      const result = await createAnthropicMessagesStreamRunnerV2({
        db,
        credentialService: runnerCredentialService(command.preparedRequest.credentialScopeId),
        fetchImpl: async () => new Response(frames, {
          status: 200, headers: { 'content-type': 'text/event-stream' },
        }),
        nowMs: (() => { let now = 40; return () => now++ })(),
      }).run(command)
      expect(result).toMatchObject({
        state: 'failed', errorCode: 'GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID',
      })
      expect(db.prepare(`SELECT status FROM message_v2 WHERE message_id='answer:1'`).get())
        .toEqual({ status: 'failed' })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_native_artifact_v2`).get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects an invalid timeout before opening any request attempt', () => {
    const db = createDb(':memory:', false)
    try {
      const command = createRunnerCommand(db)
      expect(() => createAnthropicMessagesStreamRunnerV2({
        db,
        credentialService: runnerCredentialService(command.preparedRequest.credentialScopeId),
        fetchImpl: async () => new Response(),
        timeoutMs: 0,
      })).toThrow('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
      expect(db.prepare(`SELECT state FROM generation_operation_v2 WHERE operation_id='operation:1'`).get())
        .toEqual({ state: 'committed' })
      expect(db.prepare(`SELECT state FROM generation_request_v2 WHERE operation_id='operation:1'`).get())
        .toEqual({ state: 'prepared' })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_attempt_v2`).get()).toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('cancels the provider body when strict SSE parsing fails', async () => {
    const db = createDb(':memory:', false)
    try {
      const command = createRunnerCommand(db)
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('event: message_start\ndata: {bad}\n\n')) },
        cancel() { cancelled = true },
      })
      const result = await createAnthropicMessagesStreamRunnerV2({
        db,
        credentialService: runnerCredentialService(command.preparedRequest.credentialScopeId),
        fetchImpl: async () => new Response(body, {
          status: 200, headers: { 'content-type': 'text/event-stream' },
        }),
        nowMs: (() => { let now = 40; return () => now++ })(),
      }).run(command)
      expect(result.state).toBe('failed')
      expect(cancelled).toBe(true)
      expect(db.prepare(`SELECT status FROM message_v2 WHERE message_id='answer:1'`).get())
        .toEqual({ status: 'failed' })
    } finally { db.close() }
  })

  it('feeds the branded history into the Anthropic prepared-request compiler', () => {
    const db = createDb()
    try {
      const prepared = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, 'operation:1')!
        const history = new AnthropicNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1')
        return compileAnthropicMessagesPreparedRequestV2({ context, execution, history })
      })
      expect(prepared.endpoint).toBe('https://api.anthropic.com/v1/messages')
      expect(prepared.headersPlan.credential).toEqual({
        kind: 'anthropic_x_api_key', headerName: 'x-api-key',
        apiVersion: { headerName: 'anthropic-version', value: '2023-06-01' },
      })
      expect(JSON.parse(prepared.body.copyUtf8Text())).toEqual({
        model: 'claude-sonnet-4-5', messages: [{ role: 'user', content: 'question' }],
        max_tokens: 2048, stream: true,
      })
    } finally { db.close() }
  })

  it('loads initial request messages as a transaction-branded history fact', () => {
    const db = createDb()
    try {
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const value = new AnthropicNativeHistoryV2Repo(db).loadRequestHistory(context, 'operation:1')
        expect(isAnthropicRequestHistoryRepositoryFactForContextV2(value, context)).toBe(true)
        return value
      })
      expect(fact.system).toBeNull()
      expect(fact.messages).toEqual([{ role: 'user', content: 'question' }])
      expect(fact.requestSequence).toBe(1)
    } finally { db.close() }
  })

  it('inserts and reads in one authority transaction, and returns a transaction-branded fact', () => {
    const db = createDb()
    try {
      setProjection(db, 'completed')
      withAuthorities(db, (repo, context, execution, request) => {
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(), 32)
        const fact = repo.loadCompletedAnswerArtifact(context, 'answer:1')
        expect(isAnthropicCompletedAnswerArtifactRepositoryFactForContextV2(fact, context)).toBe(true)
        expect(fact.artifact.assistantMessage.content).toEqual([{ type: 'text', text: 'answer', citations: null }])
      })
      expect(db.prepare(`SELECT completion_scope AS scope FROM generation_native_artifact_v2`).get())
        .toEqual({ scope: 'request_terminal' })
    } finally { db.close() }
  })

  it('survives database reopen and decodes a verified artifact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'starverse-anthropic-repo-'))
    const filename = path.join(dir, 'history.sqlite')
    try {
      let db = createDb(filename)
      setProjection(db, 'completed')
      withAuthorities(db, (repo, context, execution, request) =>
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(), 32))
      db.close()
      db = new BetterSqlite3(filename)
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1'))
      expect(fact.artifact.artifactKind).toBe('anthropic_messages_native_history_v1')
      db.close()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('is idempotent for the same artifact and rejects a conflicting value', () => {
    const db = createDb()
    try {
      setProjection(db, 'completed')
      withAuthorities(db, (repo, context, execution, request) => {
        const first = artifact()
        repo.insertRequestTerminalArtifact(context, execution, request, first, 32)
        repo.insertRequestTerminalArtifact(context, execution, request, first, 32)
        expect(() => repo.insertRequestTerminalArtifact(context, execution, request, artifact(false, 'other'), 32))
          .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT')
      })
      expect(db.prepare('SELECT count(*) AS count FROM generation_native_artifact_v2').get()).toEqual({ count: 1 })
    } finally { db.close() }
  })

  it('rolls back the artifact with its authority transaction and leaves no orphan', () => {
    const db = createDb()
    try {
      setProjection(db, 'completed')
      expect(() => withAuthorities(db, (repo, context, execution, request) => {
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(), 32)
        throw new Error('rollback')
      })).toThrow('rollback')
      expect(db.prepare('SELECT count(*) AS count FROM generation_native_artifact_v2').get()).toEqual({ count: 0 })
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('accepts awaiting-tool streaming only with allowActive and a tool-use artifact', () => {
    const db = createDb()
    try {
      setProjection(db, 'active')
      withAuthorities(db, (repo, context, execution, request) =>
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(true), 32))
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1')))
        .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1', { allowActive: true }))
      expect(fact.artifact.stopReason).toBe('tool_use')
    } finally { db.close() }
  })

  it('allows the persisted Anthropic tool-use artifact to authorize continuation request sequence N+1', () => {
    const db = createDb()
    try {
      setProjection(db, 'active')
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const execution = new GenerationExecutionV2Repo(db).findOperationInTransaction(context, 'operation:1')!
        const requestRepo = new GenerationRequestV2Repo(db, () => 33)
        const request = requestRepo.loadExistingForOperation(context, execution, 1)
        const historyRepo = new AnthropicNativeHistoryV2Repo(db)
        historyRepo.insertRequestTerminalArtifact(context, execution, request, artifact(true), 32)
        const history = historyRepo.loadRequestHistory(context, 'operation:1')
        const initial = compileAnthropicMessagesPreparedRequestV2({ context, execution, history })
        const continuation = issuePreparedProviderRequestV2({
          operationId: initial.operationId,
          answerRootId: initial.answerRootId,
          requestSequence: 2,
          providerId: initial.providerId,
          endpointProfileId: initial.endpointProfileId,
          credentialScopeId: initial.credentialScopeId,
          contractId: initial.contractId,
          modelId: initial.modelId,
          effectiveEndpointId: initial.effectiveEndpointId,
          endpoint: initial.endpoint,
          headersPlan: initial.headersPlan,
          body: initial.body,
          ledger: initial.ledger,
          capabilityRevision: initial.capabilityRevision,
          encoderRevision: initial.encoderRevision,
          snapshotHash: initial.snapshotHash,
        })
        expect(requestRepo.createContinuationPrepared(context, execution, continuation, HASH_A).requestSequence).toBe(2)
      })
    } finally { db.close() }
  })

  it('replays a persisted native tool_result with its is_error bit intact', () => {
    const db = createDb()
    try {
      setProjection(db, 'active')
      withAuthorities(db, (repo, context, execution, request) =>
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(true), 32))
      const snapshot = db.prepare(`SELECT snapshot_hash AS hash FROM assistant_generation_snapshot_v2
        WHERE operation_id='operation:1'`).get() as { hash: string }
      db.prepare(`INSERT INTO generation_request_v2 (operation_id, request_sequence, answer_root_id,
        snapshot_hash, provider_id, endpoint_profile_id, credential_scope_id, contract_id, model_id,
        effective_endpoint_id, capability_revision, compiler_ledger_json, compiler_ledger_hash,
        prepared_body_sha256, prepared_body_byte_length, continuation_command_fingerprint, state, created_at_ms, updated_at_ms)
        VALUES ('operation:1', 2, 'answer:1', ?, 'anthropic', 'profile:anthropic',
          'credential-scope:anthropic', 'anthropic-messages-2023-06-01', 'claude-sonnet-4-5',
          'endpoint:anthropic', ?, ?, ?, ?, 2, ?, 'prepared', 33, 33)`).run(
        snapshot.hash, capability.revision.value, ledger.canonicalJson, ledger.sha256, HASH_B, HASH_A,
      )
      db.prepare(`INSERT INTO generation_tool_output_v2 (
        operation_id, request_sequence, answer_root_id, output_index, tool_call_id, tool_id,
        content, is_error, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms
      ) VALUES ('operation:1', 2, 'answer:1', 0, 'toolu_1', 'tool:weather',
        'weather service unavailable', 1, 'none', 'not_required', NULL, 34)`).run()
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadPersistedRequestHistory(context, 'operation:1', 2))
      expect(fact.toolOutputRecords).toMatchObject([{ toolUseId: 'toolu_1', isError: true }])
      expect(fact.messages.at(-1)).toEqual({
        role: 'user',
        content: [{
          type: 'tool_result', tool_use_id: 'toolu_1', content: 'weather service unavailable', is_error: true,
        }],
      })
    } finally { db.close() }
  })

  it.each([
    ['failed operation', "UPDATE generation_operation_v2 SET state='failed', error_code='x', error_message='x', updated_at_ms=40, terminal_at_ms=40 WHERE operation_id='operation:1'"],
    ['cancelled message', "UPDATE message_v2 SET status='cancelled', updated_at_ms=40 WHERE message_id='answer:1'"],
    ['unfinished request', "UPDATE generation_request_v2 SET state='streaming', terminal_at_ms=NULL, updated_at_ms=40 WHERE operation_id='operation:1'"],
  ])('rejects %s state', (_name, mutation) => {
    const db = createDb()
    try {
      setProjection(db, 'completed')
      withAuthorities(db, (repo, context, execution, request) =>
        repo.insertRequestTerminalArtifact(context, execution, request, artifact(), 32))
      allowCorruptionForTest(db)
      db.prepare(mutation).run()
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1', { allowActive: true })))
        .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    } finally { db.close() }
  })

  it('distinguishes missing artifacts from envelope and persisted-hash tampering', () => {
    const db = createDb()
    try {
      setProjection(db, 'completed')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1')))
        .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_NOT_FOUND')
      const value = artifact()
      withAuthorities(db, (repo, context, execution, request) =>
        repo.insertRequestTerminalArtifact(context, execution, request, value, 32))
      const canonical = JSON.parse(serializeAnthropicNativeHistoryArtifactV1(value)) as Record<string, unknown>
      canonical.providerKey = 'deepseek'
      allowCorruptionForTest(db)
      db.prepare(`UPDATE generation_native_artifact_v2 SET artifact_json=?`).run(JSON.stringify(canonical))
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1')))
        .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
      db.prepare(`UPDATE generation_native_artifact_v2 SET artifact_json=?, artifact_hash=?`).run(
        serializeAnthropicNativeHistoryArtifactV1(value), HASH_A,
      )
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new AnthropicNativeHistoryV2Repo(db).loadCompletedAnswerArtifact(context, 'answer:1')))
        .toThrow('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    } finally { db.close() }
  })
})
