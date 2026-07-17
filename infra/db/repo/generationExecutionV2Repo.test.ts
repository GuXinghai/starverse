import path from 'node:path'
import { readFileSync } from 'node:fs'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import {
  canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,
  decodeAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from '../v2/testSchemaV2'
import {
  GenerationExecutionV2Repo,
  isGenerationExecutionAttemptRepositoryFactV2,
  isGenerationExecutionOperationRepositoryFactV2,
} from './generationExecutionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'

const root = path.resolve(process.cwd())
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function providerBinding() {
  return {
    credentialScopeId: 'credential-scope:1',
    providerId: 'deepseek',
    endpointProfileId: 'profile:deepseek',
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: 'endpoint-set:1',
      descriptors: [{ endpointId: 'endpoint:deepseek', descriptorRevision: 'descriptor:1' }],
    },
    protocolContractId: 'deepseek-chat-v1',
    contractRevision: `deepseek-chat-v1:${HASH_A}`,
    contractDefinitionDigest: HASH_A,
    registryRevision: `provider-contract-registry-v1:${HASH_B}`,
    modelId: 'deepseek-chat',
    operation: 'text',
  }
}

function runtimeCapability(binding = providerBinding(), resolvedAt = '2026-07-17T12:00:00.000Z') {
  return decodeRuntimeCapabilitySnapshotV2(canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt,
    binding,
    evidence: [{
      evidenceId: 'test.deepseek.supports',
      kind: 'official_documentation',
      effect: 'supports',
      sourceRef: 'https://api-docs.deepseek.com/api/create-chat-completion',
      verifiedAt: '2026-07-17T00:00:00.000Z',
      contentDigest: HASH_A,
    }],
    fields: RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.map((field) => ({
      path: field, state: 'unavailable', constraints: [], evidenceIds: [],
    })),
    tools: [],
    continuation: { kind: 'none', evidenceIds: ['test.deepseek.supports'] },
  }))
}

const capability = runtimeCapability()

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  db.prepare(`INSERT INTO runtime_capability_snapshot_v2
    VALUES (?, ?, 2, ?, ?, ?, 1)`).run(
    capability.snapshotHash.value, capability.revision.value, capability.canonicalJson,
    capability.evidenceDigest.value, capability.semanticFieldsDigest.value,
  )
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return db
}

function seedGraph(db: BetterSqlite3.Database, suffix = '1', ordinal = 10) {
  const questionId = `question:${suffix}`
  const targetId = `answer:${suffix}:target`
  const resultId = `answer:${suffix}:result`
  const branchId = `branch:${suffix}`
  const insert = db.prepare(`INSERT INTO message_v2 (
    message_id, conversation_id, role, status, parent_message_id, question_id,
    answer_root_id, ordinal, created_at_ms, updated_at_ms
  ) VALUES (?, 'conversation:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
  insert.run(questionId, 'user', 'completed', null, null, null, ordinal, ordinal, ordinal)
  insert.run(targetId, 'assistant', 'completed', questionId, questionId, targetId,
    ordinal + 1, ordinal + 1, ordinal + 1)
  insert.run(resultId, 'assistant', 'streaming', questionId, questionId, resultId,
    ordinal + 2, ordinal + 2, ordinal + 2)
  db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(branchId, 'conversation:1', resultId, null, ordinal + 3, ordinal + 3, null)
  db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
    .run(branchId, 'conversation:1', questionId, resultId, ordinal + 3)
  return { questionId, targetId, resultId, branchId }
}

function snapshotJson(
  operationId: string,
  answerRootId: string,
  capabilityFact = capability,
  binding = providerBinding(),
) {
  const record = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId,
    operationId,
    semanticIntent: {
      schemaVersion: 2,
      generation: { temperature: 0.2 },
      reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' },
      image: { mode: 'disabled' },
      tools: { mode: 'disabled' },
      attachments: [],
      providerExtension: { kind: 'none' },
    },
    resolvedConfigRevisions: [
      { ownerKind: 'global', ownerId: 'global', revision: 'config:global:1' },
      { ownerKind: 'project', ownerId: 'project:1', revision: 'config:project:1' },
      { ownerKind: 'conversation', ownerId: 'conversation:1', revision: 'config:conversation:1' },
    ],
    providerBinding: binding,
    capabilityBinding: {
      capabilityRevision: capabilityFact.revision.value,
      evidenceDigest: capabilityFact.evidenceDigest.value,
      semanticFieldsDigest: capabilityFact.semanticFieldsDigest.value,
      snapshotHash: capabilityFact.snapshotHash.value,
    },
    attachmentProviderFileBindings: [],
    toolAuthority: { kind: 'none' },
  })
  return decodeAssistantAnswerGenerationSnapshotV2(record).canonicalJson
}

function commandInput(graph: ReturnType<typeof seedGraph>, operationId = 'operation:1') {
  return {
    operationId,
    actionKind: 'retry_as_new',
    branchId: graph.branchId,
    conversationId: 'conversation:1',
    questionId: graph.questionId,
    targetAnswerRootId: graph.targetId,
    resultAnswerRootId: graph.resultId,
    snapshot: snapshotJson(operationId, graph.resultId),
    commandFingerprint: HASH_A,
    createdAtMs: 100,
  }
}

function insertRequest(db: BetterSqlite3.Database, operationId: string, answerRootId: string) {
  const snapshot = db.prepare(`SELECT snapshot_hash FROM assistant_generation_snapshot_v2
    WHERE operation_id=?`).get(operationId) as { snapshot_hash: string }
  db.prepare(`INSERT INTO generation_request_v2 (
    operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
    endpoint_profile_id, credential_scope_id, contract_id, model_id,
    effective_endpoint_id, capability_revision, compiler_ledger_json,
    compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length,
    state, created_at_ms, updated_at_ms
  ) VALUES (?, 1, ?, ?, 'deepseek', 'profile:deepseek', 'credential-scope:1',
    'deepseek-chat-v1', 'deepseek-chat', 'endpoint:deepseek', ?,
    '[]', ?, ?, 2, 'prepared', 101, 101)`).run(
    operationId, answerRootId, snapshot.snapshot_hash, capability.revision.value, HASH_A, HASH_B,
  )
}

describe('GenerationExecutionV2Repo strict dormant persistence', () => {
  it('creates and strictly replays an operation/snapshot pair in the shared transaction', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const repo = new GenerationExecutionV2Repo(db)
      const input = commandInput(graph)
      const created = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, input))
      expect(created.kind).toBe('created')
      expect(isGenerationExecutionOperationRepositoryFactV2(created.bundle.operation)).toBe(true)
      expect(created.bundle.snapshot.answerRootId.value).toBe(graph.resultId)
      const replay = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, input))
      expect(replay.kind).toBe('idempotent_replay')
      expect(replay.bundle.operation.resultAnswerRootId.value).toBe(graph.resultId)
      expect(repo.getSnapshotByAnswerRootId(graph.resultId).canonicalJson).toBe(input.snapshot)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, { ...input, actionKind: 'retry_replace' })))
        .toThrow('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES ('answer:1:other', 'conversation:1', 'assistant', 'streaming', ?, ?,
        'answer:1:other', 20, 20, 20)`).run(graph.questionId, graph.questionId)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, commandInput({
          ...graph, resultId: 'answer:1:other',
        }, 'operation:2')))).toThrow('GENERATION_V2_EXECUTION_ACTIVE_CONFLICT')
      expect(db.prepare("SELECT count(*) AS count FROM generation_operation_v2 WHERE operation_id='operation:2'").get())
        .toEqual({ count: 0 })
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('rejects invalid snapshot identity before write and rolls back graph violations', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const repo = new GenerationExecutionV2Repo(db)
      const input = commandInput(graph)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, {
          ...input, snapshot: snapshotJson('operation:other', graph.resultId),
        }))).toThrow('GENERATION_V2_EXECUTION_INPUT_INVALID')
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })

      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, { ...input, questionId: 'question:missing' })))
        .toThrow()
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects an answer snapshot whose provider binding differs from its exact capability record', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const repo = new GenerationExecutionV2Repo(db)
      const mismatched = runtimeCapability({ ...providerBinding(), modelId: 'deepseek-other' })
      db.prepare(`INSERT INTO runtime_capability_snapshot_v2
        VALUES (?, ?, 2, ?, ?, ?, 2)`).run(
        mismatched.snapshotHash.value,
        mismatched.revision.value,
        mismatched.canonicalJson,
        mismatched.evidenceDigest.value,
        mismatched.semanticFieldsDigest.value,
      )
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        expect(() => repo.insertOperationAndSnapshot(context, {
          ...commandInput(graph),
          snapshot: snapshotJson('operation:1', graph.resultId, mismatched, providerBinding()),
        })).toThrow('GENERATION_V2_EXECUTION_STATE_INVALID')
      })
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM assistant_generation_snapshot_v2').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('round-trips a structurally valid provider-owned command fingerprint opaquely', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = 'operation:corrupt'
      const snapshot = snapshotJson(operationId, graph.resultId)
      const decoded = decodeAssistantAnswerGenerationSnapshotV2(JSON.parse(snapshot))
      db.transaction(() => {
        db.prepare(`INSERT INTO generation_operation_v2 (
          operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
          question_id, target_answer_root_id, result_answer_root_id, state,
          created_at_ms, updated_at_ms
        ) VALUES (?, 'retry_as_new', ?, ?, 'conversation:1', ?, ?, ?, 'committed', 100, 100)`)
          .run(operationId, '0'.repeat(64), graph.branchId, graph.questionId, graph.targetId, graph.resultId)
        db.prepare(`INSERT INTO assistant_generation_snapshot_v2
          VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, 100)`).run(
          graph.resultId, operationId, snapshot, decoded.snapshotHash.value,
          capability.revision.value, capability.snapshotHash.value,
          capability.evidenceDigest.value, capability.semanticFieldsDigest.value,
        )
      })()
      expect(new GenerationExecutionV2Repo(db).getOperation(operationId).operation.commandFingerprint)
        .toBe('0'.repeat(64))
    } finally { db.close() }
  })

  it('does not impose DeepSeek semantics on another provider initial-send operation', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = 'operation:openai'
      const binding = {
        ...providerBinding(), providerId: 'openai', endpointProfileId: 'openai-responses-v1',
        protocolContractId: 'openai-responses-v1',
        contractRevision: `openai-responses-v1:${HASH_A}`, modelId: 'gpt-5',
      }
      const otherCapability = runtimeCapability(binding)
      db.prepare(`INSERT INTO runtime_capability_snapshot_v2 VALUES (?, ?, 2, ?, ?, ?, 2)`).run(
        otherCapability.snapshotHash.value, otherCapability.revision.value,
        otherCapability.canonicalJson, otherCapability.evidenceDigest.value,
        otherCapability.semanticFieldsDigest.value,
      )
      const snapshot = snapshotJson(operationId, graph.resultId, otherCapability, binding)
      const result = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        new GenerationExecutionV2Repo(db).insertOperationAndSnapshot(context, {
          operationId, actionKind: 'initial_send', branchId: graph.branchId,
          conversationId: 'conversation:1', questionId: graph.questionId,
          targetAnswerRootId: null, resultAnswerRootId: graph.resultId,
          snapshot, commandFingerprint: '1'.repeat(64), createdAtMs: 100,
        }))
      expect(result.bundle.operation).toMatchObject({
        actionKind: 'initial_send', commandFingerprint: '1'.repeat(64),
      })
      expect(result.bundle.snapshot.providerBinding.providerId.value).toBe('openai')
    } finally { db.close() }
  })

  it('requires the live transaction context from the same owned connection', () => {
    const first = createDb()
    const second = createDb()
    try {
      const graph = seedGraph(first)
      const repo = new GenerationExecutionV2Repo(first)
      expect(() => repo.insertOperationAndSnapshot({
        trust: 'generation_v2_authority_transaction_context',
      } as never, commandInput(graph))).toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(second, (context) =>
        repo.insertOperationAndSnapshot(context, commandInput(graph))))
        .toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
      let escaped: unknown
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(first, (context) => { escaped = context })
      expect(() => repo.insertOperationAndSnapshot(escaped as never, commandInput(graph)))
        .toThrow('GENERATION_V2_AUTHORITY_TRANSACTION_INVALID_CONTEXT')
    } finally {
      first.close()
      second.close()
    }
  })

  it('revokes newly issued repository facts when the owning transaction rolls back', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const repo = new GenerationExecutionV2Repo(db)
      const input = commandInput(graph)
      const escapedOperations: unknown[] = []
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        escapedOperations.push(repo.insertOperationAndSnapshot(context, input).bundle.operation)
        escapedOperations.push(repo.insertOperationAndSnapshot(context, input).bundle.operation)
        expect(() => repo.getOperation(input.operationId))
          .toThrow('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
        throw new Error('abort operation')
      })).toThrow('abort operation')
      expect(escapedOperations).toHaveLength(2)
      expect(escapedOperations.every((fact) =>
        !isGenerationExecutionOperationRepositoryFactV2(fact))).toBe(true)
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })

      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, input))
      insertRequest(db, input.operationId, graph.resultId)
      const escapedAttempts: unknown[] = []
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const key = {
          operationId: input.operationId, requestSequence: 1, attempt: 1,
        }
        escapedAttempts.push(repo.openAttempt(context, key, 200).attempt)
        escapedAttempts.push(repo.openAttempt(context, key, 201).attempt)
        expect(() => repo.getAttempt(key))
          .toThrow('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
        throw new Error('abort attempt')
      })).toThrow('abort attempt')
      expect(escapedAttempts).toHaveLength(2)
      expect(escapedAttempts.every((fact) =>
        !isGenerationExecutionAttemptRepositoryFactV2(fact))).toBe(true)
      expect(db.prepare('SELECT count(*) AS count FROM generation_attempt_v2').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('opens one attempt and persists the terminal reducer winner with exact replay/conflict', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const repo = new GenerationExecutionV2Repo(db, () => 200)
      const input = commandInput(graph)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.insertOperationAndSnapshot(context, input))
      insertRequest(db, input.operationId, graph.resultId)
      const key = { operationId: input.operationId, requestSequence: 1, attempt: 1 }
      const opened = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.openAttempt(context, key, 200))
      expect(opened.kind).toBe('created')
      expect(isGenerationExecutionAttemptRepositoryFactV2(opened.attempt)).toBe(true)
      expect(runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.openAttempt(context, key, 200)).kind).toBe('idempotent_replay')
      expect(runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.openAttempt(context, key, 201)).kind).toBe('idempotent_replay')
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.openAttempt(context, { ...key, attempt: 2 }, 201)))
        .toThrow('GENERATION_V2_EXECUTION_INPUT_INVALID')

      const completed = { kind: 'provider_completed', phase: 'mid_stream' }
      const accepted = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.terminalizeAttempt(context, { key, outcome: completed }, 202))
      expect(accepted.kind).toBe('accepted')
      const freshRepo = new GenerationExecutionV2Repo(db)
      expect(freshRepo.getAttempt(key).state.state).toBe('terminal')
      expect(runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        freshRepo.terminalizeAttempt(context, { key, outcome: completed }, 999)).kind)
        .toBe('idempotent_replay')
      const conflict = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        freshRepo.terminalizeAttempt(context, {
          key, outcome: { kind: 'user_cancelled', phase: 'mid_stream' },
        }, 203))
      expect(conflict.kind).toBe('conflict')
      expect(db.prepare(`SELECT terminal_at_ms FROM generation_attempt_v2
        WHERE operation_id=?`).get(input.operationId)).toEqual({ terminal_at_ms: 202 })
    } finally { db.close() }
  })

  it('keeps prepared request and generic native-artifact insertion closed', () => {
    const source = readFileSync(
      path.resolve('infra/db/repo/generationExecutionV2Repo.ts'), 'utf8',
    ) as string
    expect(source).not.toMatch(/insertPreparedRequest|appendNativeArtifact/u)
    expect(source).not.toMatch(/INSERT INTO generation_request_v2|INSERT INTO generation_native_artifact_v2/u)
  })
})
