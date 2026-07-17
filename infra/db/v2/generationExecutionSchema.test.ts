import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest as applyGenerationV2Schema } from './testSchemaV2'

const root = path.resolve(process.cwd())
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2Schema(db, root)
  return db
}

function insertMessage(
  db: BetterSqlite3.Database,
  id: string,
  role: 'assistant' | 'user',
  status: 'completed' | 'streaming',
  parent: string | null,
  question: string | null,
  answerRoot: string | null,
  ordinal: number,
) {
  db.prepare(`INSERT INTO message_v2 (
    message_id, conversation_id, role, status, parent_message_id, question_id,
    answer_root_id, ordinal, created_at_ms, updated_at_ms
  ) VALUES (?, 'conversation:1', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, role, status, parent, question, answerRoot, ordinal, ordinal, ordinal)
}

function seedQuestion(
  db: BetterSqlite3.Database,
  suffix: string,
  branchId: string,
  ordinal: number,
) {
  const questionId = `question:${suffix}`
  const targetId = `answer:${suffix}:target`
  const resultId = `answer:${suffix}:result`
  insertMessage(db, questionId, 'user', 'completed', null, null, null, ordinal)
  insertMessage(db, targetId, 'assistant', 'completed', questionId, questionId, targetId, ordinal + 1)
  insertMessage(db, resultId, 'assistant', 'streaming', questionId, questionId, resultId, ordinal + 2)
  db.prepare('INSERT INTO branch_v2 VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(branchId, 'conversation:1', resultId, null, ordinal + 3, ordinal + 3, null)
  db.prepare('INSERT INTO branch_choice_v2 VALUES (?, ?, ?, ?, ?)')
    .run(branchId, 'conversation:1', questionId, resultId, ordinal + 3)
  return { questionId, targetId, resultId, branchId }
}

function seedGraph(db: BetterSqlite3.Database) {
  db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)').run('project:1', 'Project', 1, 1)
  db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
    .run('conversation:1', 'project:1', 'Conversation', 2, 2)
  return seedQuestion(db, '1', 'branch:1', 10)
}

function insertOperationAndSnapshot(
  db: BetterSqlite3.Database,
  graph: ReturnType<typeof seedQuestion>,
  options: { operationId?: string; fingerprint?: string; action?: string; target?: string | null } = {},
) {
  const operationId = options.operationId ?? `operation:${graph.questionId}`
  const action = options.action ?? 'retry_as_new'
  const target = options.target === undefined ? graph.targetId : options.target
  db.transaction(() => {
    db.prepare(`INSERT INTO generation_operation_v2 (
      operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
      question_id, target_answer_root_id, result_answer_root_id, state,
      created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, 'conversation:1', ?, ?, ?, 'committed', 100, 100)`)
      .run(operationId, action, options.fingerprint ?? HASH_A, graph.branchId,
        graph.questionId, target, graph.resultId)
    db.prepare(`INSERT INTO assistant_generation_snapshot_v2
      VALUES (?, ?, 2, ?, ?, 100)`)
      .run(graph.resultId, operationId, '{"version":2}', HASH_A)
  })()
  return operationId
}

function insertRequest(
  db: BetterSqlite3.Database,
  operationId: string,
  answerRootId: string,
  requestSequence = 1,
) {
  db.prepare(`INSERT INTO generation_request_v2 (
    operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
    endpoint_profile_id, credential_scope_id, contract_id, model_id,
    effective_endpoint_id, capability_revision, compiler_ledger_json,
    compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length,
    state, created_at_ms, updated_at_ms
  ) VALUES (?, ?, ?, ?, 'openai', 'profile:1', 'scope:1', 'openai-responses',
    'gpt-test', 'endpoint:1', 'revision:1', '[]', ?, ?, 2, 'prepared', 101, 101)`)
    .run(operationId, requestSequence, answerRootId, HASH_A, HASH_B, HASH_A)
}

describe('Generation V2 provider-neutral execution schema', () => {
  it('stores immutable epoch identity and only an encrypted scope-key envelope', () => {
    const db = createDb()
    try {
      db.prepare('INSERT INTO app_meta_v2 VALUES (1, 2, ?, ?, ?, 1)')
        .run('io.github.guxinghai.starverse', HASH_A, HASH_B)
      db.prepare(`INSERT INTO epoch_scope_key_envelope_v2
        VALUES (1, ?, 1, 1, ?, 2, 2)`).run('electron_safe_storage', Buffer.from('ciphertext'))
      expect(() => db.prepare(`INSERT OR REPLACE INTO epoch_scope_key_envelope_v2
        VALUES (1, ?, 1, 1, ?, 2, 2)`).run('electron_safe_storage', 'PLAINTEXT'))
        .toThrow(/CHECK constraint failed/u)
      expect(() => db.prepare('UPDATE app_meta_v2 SET data_epoch=3').run())
        .toThrow('GENERATION_V2_APP_META_IMMUTABLE')
      expect(() => db.prepare('DELETE FROM app_meta_v2').run())
        .toThrow('GENERATION_V2_APP_META_IMMUTABLE')
      expect(() => db.prepare('UPDATE epoch_scope_key_envelope_v2 SET key_version=2').run())
        .toThrow('GENERATION_V2_SCOPE_KEY_REWRAP_INVALID')
      db.prepare(`UPDATE epoch_scope_key_envelope_v2
        SET ciphertext=?, envelope_revision=2, updated_at_ms=3`).run(Buffer.from('rewrapped'))
      expect(db.prepare(`SELECT envelope_revision, updated_at_ms
        FROM epoch_scope_key_envelope_v2`).get()).toEqual({ envelope_revision: 2, updated_at_ms: 3 })
      expect(() => db.prepare(`UPDATE epoch_scope_key_envelope_v2
        SET ciphertext=?, envelope_revision=4, updated_at_ms=4`).run(Buffer.from('invalid-rewrap')))
        .toThrow('GENERATION_V2_SCOPE_KEY_REWRAP_INVALID')
      expect(() => db.prepare('DELETE FROM epoch_scope_key_envelope_v2').run())
        .toThrow('GENERATION_V2_SCOPE_KEY_IMMUTABLE')
      expect(db.prepare('SELECT typeof(ciphertext) AS type FROM epoch_scope_key_envelope_v2').get())
        .toEqual({ type: 'blob' })
    } finally { db.close() }
  })

  it('commits operation and immutable snapshot as one deferred relational unit', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      expect(db.prepare(`SELECT operation_id, result_answer_root_id, state
        FROM generation_operation_v2`).get()).toEqual({
        operation_id: operationId, result_answer_root_id: graph.resultId, state: 'committed',
      })
      expect(() => db.prepare(`UPDATE assistant_generation_snapshot_v2
        SET snapshot_hash=? WHERE answer_root_id=?`).run(HASH_B, graph.resultId))
        .toThrow('GENERATION_V2_SNAPSHOT_IMMUTABLE')
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })

  it('rolls back an operation that has no snapshot at commit', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      expect(() => db.transaction(() => {
        db.prepare(`INSERT INTO generation_operation_v2 (
          operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
          question_id, target_answer_root_id, result_answer_root_id, state,
          created_at_ms, updated_at_ms
        ) VALUES ('operation:missing', 'retry_as_new', ?, ?, 'conversation:1', ?, ?, ?,
          'committed', 100, 100)`)
          .run(HASH_A, graph.branchId, graph.questionId, graph.targetId, graph.resultId)
      })()).toThrow(/FOREIGN KEY constraint failed/u)
      expect(db.prepare('SELECT count(*) AS count FROM generation_operation_v2').get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('rejects invalid action targets and a result answer from another question', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      expect(() => db.prepare(`INSERT INTO generation_operation_v2 (
        operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
        question_id, target_answer_root_id, result_answer_root_id, state, error_code,
        created_at_ms, updated_at_ms, terminal_at_ms
      ) VALUES ('operation:terminal-insert', 'retry_as_new', ?, ?, 'conversation:1',
        ?, ?, ?, 'failed', 'injected', 100, 100, 100)`)
        .run(HASH_A, graph.branchId, graph.questionId, graph.targetId, graph.resultId))
        .toThrow('GENERATION_V2_OPERATION_INITIAL_STATE_INVALID')
      expect(() => insertOperationAndSnapshot(db, graph, {
        operationId: 'operation:no-target', target: null,
      })).toThrow(/CHECK constraint failed/u)
      expect(() => insertOperationAndSnapshot(db, graph, {
        operationId: 'operation:unexpected-target', action: 'regenerate_question',
      })).toThrow(/CHECK constraint failed/u)

      const other = seedQuestion(db, '2', 'branch:2', 20)
      expect(() => db.prepare(`INSERT INTO generation_operation_v2 (
        operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
        question_id, target_answer_root_id, result_answer_root_id, state,
        created_at_ms, updated_at_ms
      ) VALUES ('operation:cross-question', 'regenerate_question', ?, ?, 'conversation:1',
        ?, NULL, ?, 'committed', 100, 100)`)
        .run(HASH_A, graph.branchId, graph.questionId, other.resultId))
        .toThrow('GENERATION_V2_OPERATION_RESULT_INVALID')
    } finally { db.close() }
  })

  it('allows shared command fingerprints but only one active operation per branch/question', () => {
    const db = createDb()
    try {
      const first = seedGraph(db)
      insertOperationAndSnapshot(db, first, { operationId: 'operation:1', fingerprint: HASH_A })
      const second = seedQuestion(db, '2', 'branch:2', 20)
      insertOperationAndSnapshot(db, second, { operationId: 'operation:2', fingerprint: HASH_A })
      expect(db.prepare(`SELECT count(*) AS count FROM generation_operation_v2
        WHERE command_fingerprint=?`).get(HASH_A)).toEqual({ count: 2 })

      insertMessage(db, 'answer:1:third', 'assistant', 'streaming', first.questionId,
        first.questionId, 'answer:1:third', 30)
      expect(() => insertOperationAndSnapshot(db, {
        ...first, resultId: 'answer:1:third',
      }, { operationId: 'operation:3' })).toThrow(/UNIQUE constraint failed/u)
      expect(db.prepare("SELECT count(*) AS count FROM generation_operation_v2 WHERE operation_id='operation:3'").get())
        .toEqual({ count: 0 })
    } finally { db.close() }
  })

  it('persists request identity and body digest without storing a raw request body', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId)
      const columns = (db.prepare("PRAGMA table_info('generation_request_v2')").all() as { name: string }[])
        .map(({ name }) => name)
      expect(columns).toContain('prepared_body_sha256')
      expect(columns).toContain('prepared_body_byte_length')
      expect(columns.some((name) => /raw|body_json|request_body/u.test(name))).toBe(false)
      expect(() => db.prepare(`INSERT INTO generation_request_v2 (
        operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
        endpoint_profile_id, credential_scope_id, contract_id, model_id,
        effective_endpoint_id, capability_revision, compiler_ledger_json,
        compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length,
        state, created_at_ms, updated_at_ms
      ) SELECT operation_id, 2, answer_root_id, ?, provider_id, endpoint_profile_id,
        credential_scope_id, contract_id, model_id, effective_endpoint_id,
        capability_revision, compiler_ledger_json, compiler_ledger_hash,
        prepared_body_sha256, prepared_body_byte_length, state, created_at_ms, updated_at_ms
        FROM generation_request_v2 WHERE request_sequence=1`).run(HASH_B))
        .toThrow(/FOREIGN KEY constraint failed/u)
    } finally { db.close() }
  })

  it('enforces request and operation terminal transitions without branch rollback fields', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId)
      db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'open', NULL, NULL, 101, NULL)`).run(operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=102
        WHERE operation_id=?`).run(operationId)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=103
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"failed"}', HASH_A, operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='failed', terminal_at_ms=103,
        updated_at_ms=103 WHERE operation_id=?`).run(operationId)
      expect(() => db.prepare(`UPDATE generation_request_v2 SET terminal_at_ms=104,
        updated_at_ms=104 WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_REQUEST_TERMINAL_CONFLICT')
      expect(() => db.prepare(`UPDATE generation_request_v2 SET state='streaming',
        terminal_at_ms=NULL, updated_at_ms=104 WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_REQUEST_TERMINAL_CONFLICT')

      db.prepare(`UPDATE generation_operation_v2 SET state='failed', error_code='provider_error',
        terminal_at_ms=103, updated_at_ms=103 WHERE operation_id=?`).run(operationId)
      expect(() => db.prepare(`UPDATE generation_operation_v2 SET error_code='other_error',
        terminal_at_ms=104, updated_at_ms=104 WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_OPERATION_TERMINAL_CONFLICT')
      expect(() => db.prepare(`UPDATE generation_operation_v2 SET state='streaming',
        error_code=NULL, terminal_at_ms=NULL, updated_at_ms=104 WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_OPERATION_TERMINAL_CONFLICT')
      const operationColumns = (db.prepare("PRAGMA table_info('generation_operation_v2')").all() as { name: string }[])
        .map(({ name }) => name)
      expect(operationColumns.some((name) => /previous|restore|rollback/u.test(name))).toBe(false)
    } finally { db.close() }
  })

  it('coordinates the single transport attempt before request and operation terminalization', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId, 1)
      expect(() => db.prepare(`INSERT INTO generation_request_v2 (
        operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
        endpoint_profile_id, credential_scope_id, contract_id, model_id,
        effective_endpoint_id, capability_revision, compiler_ledger_json,
        compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length,
        state, created_at_ms, updated_at_ms, terminal_at_ms
      ) SELECT operation_id, 2, answer_root_id, snapshot_hash, provider_id,
        endpoint_profile_id, credential_scope_id, contract_id, model_id,
        effective_endpoint_id, capability_revision, compiler_ledger_json,
        compiler_ledger_hash, prepared_body_sha256, prepared_body_byte_length,
        'completed', created_at_ms, updated_at_ms, updated_at_ms
        FROM generation_request_v2 WHERE request_sequence=1`).run()).toThrow(
        'GENERATION_V2_REQUEST_INITIAL_STATE_INVALID',
      )
      insertRequest(db, operationId, graph.resultId, 2)
      expect(() => db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'terminal', ?, ?, 102, 102)`)
        .run(operationId, '{"kind":"failed"}', HASH_A))
        .toThrow('GENERATION_V2_ATTEMPT_INITIAL_STATE_INVALID')
      db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'open', NULL, NULL, 102, NULL)`).run(operationId)
      expect(() => db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 2, 'open', NULL, NULL, 102, NULL)`).run(operationId))
        .toThrow(/CHECK constraint failed/u)
      expect(() => db.prepare(`UPDATE generation_request_v2 SET state='failed',
        terminal_at_ms=103, updated_at_ms=103
        WHERE operation_id=? AND request_sequence=1`).run(operationId))
        .toThrow('GENERATION_V2_REQUEST_ATTEMPT_OPEN')
      expect(() => db.prepare(`UPDATE generation_operation_v2 SET state='failed',
        error_code='provider_error', terminal_at_ms=103, updated_at_ms=103
        WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_OPERATION_REQUEST_OPEN')

      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=103
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"failed"}', HASH_A, operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='failed', terminal_at_ms=104,
        updated_at_ms=104 WHERE operation_id=? AND request_sequence=1`).run(operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='cancelled', terminal_at_ms=104,
        updated_at_ms=104 WHERE operation_id=? AND request_sequence=2`).run(operationId)
      expect(() => db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 2, 1, 'open', NULL, NULL, 105, NULL)`).run(operationId))
        .toThrow('GENERATION_V2_ATTEMPT_REQUEST_TERMINAL')
      db.prepare(`UPDATE generation_operation_v2 SET state='failed',
        error_code='provider_error', terminal_at_ms=105, updated_at_ms=105
        WHERE operation_id=?`).run(operationId)
      expect(() => insertRequest(db, operationId, graph.resultId, 3))
        .toThrow('GENERATION_V2_REQUEST_OPERATION_TERMINAL')
    } finally { db.close() }
  })

  it('orders the successful request terminal before a successful operation terminal', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId)
      db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'open', NULL, NULL, 102, NULL)`).run(operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=103
        WHERE operation_id=?`).run(operationId)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=104
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"provider_completed"}', HASH_A, operationId)
      expect(() => db.prepare(`UPDATE generation_request_v2 SET state='completed',
        terminal_at_ms=105, updated_at_ms=105 WHERE operation_id=?`).run(operationId))
        .toThrow('GENERATION_V2_REQUEST_OPERATION_NOT_STREAMING')

      db.prepare(`UPDATE generation_operation_v2 SET state='streaming', updated_at_ms=105
        WHERE operation_id=?`).run(operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='completed', terminal_at_ms=106,
        updated_at_ms=106 WHERE operation_id=?`).run(operationId)
      db.prepare(`UPDATE generation_operation_v2 SET state='completed', terminal_at_ms=107,
        updated_at_ms=107 WHERE operation_id=?`).run(operationId)
      db.prepare(`UPDATE generation_request_v2 SET state='completed', terminal_at_ms=106,
        updated_at_ms=106 WHERE operation_id=?`).run(operationId)
      expect(db.prepare(`SELECT o.state AS operation_state, r.state AS request_state
        FROM generation_operation_v2 o JOIN generation_request_v2 r USING (operation_id)`).get())
        .toEqual({ operation_state: 'completed', request_state: 'completed' })
    } finally { db.close() }
  })

  it('terminalizes attempts exactly once and owns immutable native artifacts', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId)
      db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'open', NULL, NULL, 102, NULL)`).run(operationId)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=103
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"failed"}', HASH_A, operationId)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=103
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"failed"}', HASH_A, operationId)
      expect(() => db.prepare(`UPDATE generation_attempt_v2 SET outcome_json=?
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"cancelled"}', operationId))
        .toThrow('GENERATION_V2_ATTEMPT_TERMINAL_CONFLICT')

      db.prepare(`INSERT INTO generation_native_artifact_v2
        VALUES (?, 1, ?, 'deepseek-native-history', 1, ?, ?, 104)`)
        .run(graph.resultId, operationId, '{"messages":[]}', HASH_B)
      expect(() => db.prepare(`UPDATE generation_native_artifact_v2 SET codec_version=2
        WHERE answer_root_id=?`).run(graph.resultId))
        .toThrow('GENERATION_V2_NATIVE_ARTIFACT_IMMUTABLE')
      expect(db.pragma('foreign_key_check')).toEqual([])
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally { db.close() }
  })

  it('rejects direct execution-ledger deletion but preserves top-level graph cascade', () => {
    const db = createDb()
    try {
      const graph = seedGraph(db)
      const operationId = insertOperationAndSnapshot(db, graph)
      insertRequest(db, operationId, graph.resultId)
      db.prepare(`INSERT INTO generation_attempt_v2
        VALUES (?, 1, 1, 'open', NULL, NULL, 102, NULL)`).run(operationId)
      db.prepare(`UPDATE generation_attempt_v2 SET state='terminal', outcome_json=?,
        terminal_fingerprint=?, terminal_at_ms=103
        WHERE operation_id=? AND request_sequence=1 AND attempt=1`)
        .run('{"kind":"failed"}', HASH_A, operationId)
      db.prepare(`INSERT INTO generation_native_artifact_v2
        VALUES (?, 1, ?, 'deepseek-native-history', 1, ?, ?, 104)`)
        .run(graph.resultId, operationId, '{"messages":[]}', HASH_B)

      expect(() => db.prepare('DELETE FROM generation_native_artifact_v2').run())
        .toThrow('GENERATION_V2_NATIVE_ARTIFACT_DELETE_FORBIDDEN')
      expect(() => db.prepare('DELETE FROM generation_attempt_v2').run())
        .toThrow('GENERATION_V2_ATTEMPT_DELETE_FORBIDDEN')
      expect(() => db.prepare('DELETE FROM generation_request_v2').run())
        .toThrow('GENERATION_V2_REQUEST_DELETE_FORBIDDEN')

      db.prepare("DELETE FROM project_v2 WHERE project_id='project:1'").run()
      for (const table of ['generation_native_artifact_v2', 'generation_attempt_v2',
        'generation_request_v2', 'assistant_generation_snapshot_v2', 'generation_operation_v2']) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally { db.close() }
  })
})
