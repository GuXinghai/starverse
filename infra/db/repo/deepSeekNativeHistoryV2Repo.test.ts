import { createHash } from 'node:crypto'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from './generationV2AuthorityTransactionInternal'
import {
  DeepSeekNativeHistoryV2Repo,
  isDeepSeekInitialSendHistoryRepositoryFactForContextV2,
} from './deepSeekNativeHistoryV2Repo'
import {
  completeDeepSeekNativeRequestV2,
  createDeepSeekNativeHistoryArtifactV2,
  serializeDeepSeekNativeHistoryArtifactV2,
  type DeepSeekNativeHistoryArtifactV2,
} from '../../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2 } from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'

const root = path.resolve(process.cwd())
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function providerBinding() {
  return {
    credentialScopeId: 'scope:1',
    providerId: 'deepseek',
    endpointProfileId: 'deepseek-stable-api-v1',
    endpointBinding: {
      kind: 'provider_managed_set',
      endpointSetRevision: 'deepseek-stable-endpoint-set-v1:test',
      descriptors: [{
        endpointId: 'deepseek-stable-api-v1',
        descriptorRevision: 'deepseek-stable-profile-v1:test',
      }],
    },
    protocolContractId: 'deepseek-stable-chat-v1',
    contractRevision: `deepseek-stable-chat-v1:${HASH_A}`,
    contractDefinitionDigest: HASH_A,
    registryRevision: `provider-contract-registry-v1:${HASH_B}`,
    modelId: 'deepseek-v4',
    operation: 'text',
  } as const
}

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  db.prepare(`INSERT INTO runtime_capability_snapshot_v2
    VALUES (?, 'capability:1', 2, ?, ?, ?, 1)`).run(
    HASH_A, stableSerializeProviderRequestV2({ binding: providerBinding() }), HASH_A, HASH_B,
  )
  return db
}

function insertMessage(
  db: BetterSqlite3.Database,
  id: string,
  role: 'user' | 'assistant',
  status: 'streaming' | 'completed',
  parent: string | null,
  questionId: string | null,
  answerRootId: string | null,
  ordinal: number,
  body: string,
) {
  db.prepare(`INSERT INTO message_v2 (message_id, conversation_id, role, status,
    parent_message_id, question_id, answer_root_id, ordinal, created_at_ms, updated_at_ms)
    VALUES (?, 'conversation:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, role, status, parent, questionId, answerRootId, ordinal, ordinal + 10, ordinal + 10)
  db.prepare('UPDATE message_body_v2 SET body_text=? WHERE message_id=?').run(body, id)
}

function insertOperationAndSnapshot(
  db: BetterSqlite3.Database,
  operationId: string,
  questionId: string,
  answerRootId: string,
  createdAtMs: number,
) {
  const snapshot = canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({
    schemaVersion: 2,
    answerRootId,
    operationId,
    semanticIntent: {
      schemaVersion: 2,
      generation: {},
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
    providerBinding: providerBinding(),
    capabilityBinding: {
      capabilityRevision: 'capability:1', evidenceDigest: HASH_A,
      semanticFieldsDigest: HASH_B, snapshotHash: HASH_A,
    },
    attachmentProviderFileBindings: [],
    toolAuthority: { kind: 'none' },
  })
  db.transaction(() => {
    db.prepare(`INSERT INTO generation_operation_v2 (operation_id, action_kind,
      command_fingerprint, branch_id, conversation_id, question_id, target_answer_root_id,
      result_answer_root_id, state, created_at_ms, updated_at_ms)
      VALUES (?, 'initial_send', ?, 'branch:1', 'conversation:1', ?, NULL, ?, 'committed', ?, ?)`)
      .run(operationId, HASH_A, questionId, answerRootId, createdAtMs, createdAtMs)
    db.prepare(`INSERT INTO assistant_generation_snapshot_v2
      VALUES (?, ?, 2, ?, ?, 'capability:1', ?, ?, ?, ?)`)
      .run(answerRootId, operationId, stableSerializeProviderRequestV2(snapshot),
        snapshot.snapshotHash, HASH_A, HASH_A, HASH_B, createdAtMs)
  })()
}

function completeOperation(
  db: BetterSqlite3.Database,
  operationId: string,
  answerRootId: string,
  artifact: DeepSeekNativeHistoryArtifactV2,
  at: number,
) {
  const snapshotHash = (db.prepare(`SELECT snapshot_hash AS snapshotHash
    FROM assistant_generation_snapshot_v2 WHERE answer_root_id=?`).get(answerRootId) as { snapshotHash: string }).snapshotHash
  db.prepare(`INSERT INTO generation_request_v2 (operation_id, request_sequence,
    answer_root_id, snapshot_hash, provider_id, endpoint_profile_id, credential_scope_id,
    contract_id, model_id, effective_endpoint_id, capability_revision,
    compiler_ledger_json, compiler_ledger_hash, prepared_body_sha256,
    prepared_body_byte_length, state, created_at_ms, updated_at_ms)
    VALUES (?, 1, ?, ?, 'deepseek', 'deepseek-stable-api-v1', 'scope:1',
      'deepseek-stable-chat-v1', 'deepseek-v4', 'deepseek-stable-api-v1:chat',
      'capability:1', '[]', ?, ?, 2, 'prepared', ?, ?)`)
    .run(operationId, answerRootId, snapshotHash, HASH_B, HASH_A, at, at)
  db.prepare(`INSERT INTO generation_attempt_v2
    VALUES (?, 1, 1, 'open', NULL, NULL, ?, NULL)`).run(operationId, at + 1)
  db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=?
    WHERE operation_id=?`).run(at + 2, operationId)
  db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=?
    WHERE operation_id=?`).run(at + 3, operationId)
  db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
    terminal_fingerprint=?, terminal_at_ms=? WHERE operation_id=?`)
    .run('{"kind":"provider_completed"}', HASH_A, at + 4, operationId)
  db.prepare(`UPDATE generation_request_v2 SET state='completed', updated_at_ms=?, terminal_at_ms=?
    WHERE operation_id=?`).run(at + 5, at + 5, operationId)
  db.prepare(`UPDATE generation_operation_v2 SET state='completed', updated_at_ms=?, terminal_at_ms=?
    WHERE operation_id=?`).run(at + 6, at + 6, operationId)
  db.prepare("UPDATE message_v2 SET status='completed', updated_at_ms=? WHERE message_id=?")
    .run(at + 6, answerRootId)
  db.prepare(`INSERT INTO generation_native_artifact_v2
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'request_terminal')`)
    .run(answerRootId, operationId, artifact.artifactKind, artifact.artifactCodecVersion,
      serializeDeepSeekNativeHistoryArtifactV2(artifact), artifact.artifactHash, at + 6)
}

function insertContextProjection(db: BetterSqlite3.Database) {
  const rows = [
    { operationId: 'operation:1', createdAtMs: 31, turns: [
      { questionId: 'question:1', answerRootId: null, mode: 'included' },
    ] },
    { operationId: 'operation:2', createdAtMs: 41, turns: [
      { questionId: 'question:1', answerRootId: 'answer:1', mode: 'included' },
      { questionId: 'question:2', answerRootId: null, mode: 'included' },
    ] },
    { operationId: 'operation:3', createdAtMs: 51, turns: [
      { questionId: 'question:1', answerRootId: 'answer:1', mode: 'included' },
      { questionId: 'question:2', answerRootId: 'answer:2', mode: 'included' },
      { questionId: 'question:3', answerRootId: null, mode: 'included' },
    ] },
  ] as const
  for (const row of rows) {
    const includedMessageIds = row.turns.flatMap((turn) => turn.answerRootId === null
      ? [turn.questionId] : [turn.questionId, turn.answerRootId])
    const draft = {
      schemaVersion: 1,
      branchId: 'branch:1',
      operationId: row.operationId,
      providerContractId: 'deepseek-stable-chat-v1',
      codecId: `deepseek-stable-chat-v1:${HASH_A}`,
      turns: row.turns,
      includedMessageIds,
    } as const
    const projectionDigest = createHash('sha256').update(stableSerializeProviderRequestV2(draft), 'utf8').digest('hex')
    const canonicalJson = stableSerializeProviderRequestV2({ ...draft, projectionDigest })
    db.prepare(`INSERT INTO generation_context_projection_v2
      (operation_id,branch_id,conversation_id,canonical_json,projection_digest,created_at_ms)
      VALUES (?,'branch:1','conversation:1',?,?,?)`)
      .run(row.operationId, canonicalJson, projectionDigest, row.createdAtMs)
  }
}

function seedThreeTurns(db: BetterSqlite3.Database, corruptSecondLineage = false) {
  insertMessage(db, 'question:1', 'user', 'completed', null, null, null, 0, 'one')
  insertMessage(db, 'answer:1', 'assistant', 'streaming', 'question:1', 'question:1', 'answer:1', 1, 'first')
  insertMessage(db, 'question:2', 'user', 'completed', 'answer:1', null, null, 2, 'two')
  insertMessage(db, 'answer:2', 'assistant', 'streaming', 'question:2', 'question:2', 'answer:2', 3, 'second')
  insertMessage(db, 'question:3', 'user', 'completed', 'answer:2', null, null, 4, 'three')
  insertMessage(db, 'answer:3', 'assistant', 'streaming', 'question:3', 'question:3', 'answer:3', 5, '')
  db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, NULL, ?, ?, NULL)')
    .run('branch:1', 'conversation:1', 'answer:3', 20, 20)
  for (const [question, answer] of [['question:1', 'answer:1'], ['question:2', 'answer:2'], ['question:3', 'answer:3']]) {
    db.prepare(`INSERT INTO branch_choice_v2 VALUES ('branch:1', 'conversation:1', ?, ?, 20)`)
      .run(question, answer)
  }
  insertOperationAndSnapshot(db, 'operation:1', 'question:1', 'answer:1', 30)
  insertOperationAndSnapshot(db, 'operation:2', 'question:2', 'answer:2', 40)
  insertOperationAndSnapshot(db, 'operation:3', 'question:3', 'answer:3', 50)
  const first = completeDeepSeekNativeRequestV2({
    priorArtifact: null,
    clientEntries: [{ kind: 'client', message: { role: 'user', content: 'one' } }],
    assistantMessage: { role: 'assistant', content: 'first' },
    generatedWithThinking: 'disabled',
  })
  const second = corruptSecondLineage
    ? createDeepSeekNativeHistoryArtifactV2({
        lineageDepth: 2,
        parentArtifactHash: 'f'.repeat(64),
        orderedEntries: [...first.orderedEntries,
          { kind: 'client', message: { role: 'user', content: 'two' } },
          { kind: 'assistant', generatedWithThinking: 'disabled',
            message: { role: 'assistant', content: 'second' } }],
      })
    : completeDeepSeekNativeRequestV2({
        priorArtifact: first,
        clientEntries: [{ kind: 'client', message: { role: 'user', content: 'two' } }],
        assistantMessage: { role: 'assistant', content: 'second' },
        generatedWithThinking: 'disabled',
      })
  completeOperation(db, 'operation:1', 'answer:1', first, 100)
  completeOperation(db, 'operation:2', 'answer:2', second, 200)
  insertContextProjection(db)
  return { first, second }
}

describe('DeepSeek native history V2 repository', () => {
  it('issues a transaction-scoped branch history fact with exact cross-operation lineage', () => {
    const db = createDb()
    try {
      const { second } = seedThreeTurns(db)
      const repo = new DeepSeekNativeHistoryV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        const fact = repo.loadInitialSendHistory(context, 'operation:3')
        expect(isDeepSeekInitialSendHistoryRepositoryFactForContextV2(fact, context)).toBe(true)
        expect(fact.priorAnswerRootId?.value).toBe('answer:2')
        expect(fact.priorArtifact?.artifactHash).toBe(second.artifactHash)
        expect(fact.priorArtifact?.lineageDepth).toBe(2)
        expect(fact.clientEntries).toEqual([
          { kind: 'client', message: { role: 'user', content: 'three' } },
        ])
      })
    } finally { db.close() }
  })

  it('rejects a content-valid artifact whose parent hash does not match branch ancestry', () => {
    const db = createDb()
    try {
      seedThreeTurns(db, true)
      const repo = new DeepSeekNativeHistoryV2Repo(db)
      expect(() => runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.loadInitialSendHistory(context, 'operation:3')))
        .toThrow('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
    } finally { db.close() }
  })

  it('reconstructs immutable history after the branch head advances', () => {
    const db = createDb()
    try {
      seedThreeTurns(db)
      db.prepare("UPDATE branch_v2 SET head_message_id='answer:2', updated_at_ms=300 WHERE branch_id='branch:1'").run()
      const repo = new DeepSeekNativeHistoryV2Repo(db)
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.loadInitialSendHistory(context, 'operation:3'))
      expect(fact.answerRootId.value).toBe('answer:3')
    } finally { db.close() }
  })

  it('reconstructs immutable request history after the visible choice changes', () => {
    const db = createDb()
    try {
      seedThreeTurns(db)
      insertMessage(db, 'answer:3b', 'assistant', 'streaming', 'question:3', 'question:3', 'answer:3b', 6, '')
      db.prepare("UPDATE branch_choice_v2 SET chosen_answer_root_id='answer:3b', updated_at_ms=300 WHERE branch_id='branch:1' AND question_id='question:3'").run()
      const repo = new DeepSeekNativeHistoryV2Repo(db)
      const fact = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) =>
        repo.loadInitialSendHistory(context, 'operation:3'))
      expect(fact.answerRootId.value).toBe('answer:3')
    } finally { db.close() }
  })
})
