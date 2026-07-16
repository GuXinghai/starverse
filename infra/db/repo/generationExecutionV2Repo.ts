import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeAssistantAnswerGenerationSnapshotJsonV2,
  type DecodedAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../../src/next/generation-v2/domain/conversationGraphV2'
import {
  GenerationV2Identity,
  type GenerationV2Identity as Identity,
} from '../../../src/next/generation-v2/domain/identityV2'
import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
  stableSerializeProviderRequestV2,
} from '../../../src/next/generation-v2/compiler/stableSerialize'
import {
  createGenerationRequestAttemptOpenStateV2,
  projectGenerationRequestAttemptStateV2,
  restoreGenerationRequestAttemptStateV2,
  transitionGenerationRequestAttemptTerminalV2,
  type GenerationAttemptKeyV2,
  type GenerationRequestAttemptStateV2,
  type GenerationRequestTerminalTransitionV2,
} from '../../../src/next/generation-v2/runner/generationRequestTerminalV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const MAX_JSON_BYTES = 1024 * 1024
const ACTION_KINDS = Object.freeze([
  'initial_send', 'edit_resend', 'regenerate_question', 'retry_as_new', 'retry_replace',
] as const)
const OPERATION_STATES = Object.freeze([
  'committed', 'streaming', 'completed', 'failed', 'cancelled',
] as const)

export type GenerationCommandActionV2 = typeof ACTION_KINDS[number]
export type GenerationExecutionOperationStateV2 = typeof OPERATION_STATES[number]

export type GenerationExecutionOperationRepositoryFactV2 = Readonly<{
  trust: 'generation_execution_operation_repository_fact'
  operationId: Identity<'operation_id'>
  actionKind: GenerationCommandActionV2
  commandFingerprint: string
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  targetAnswerRootId: GraphIdentity<'answer_root_id'> | null
  resultAnswerRootId: GraphIdentity<'answer_root_id'>
  state: GenerationExecutionOperationStateV2
  errorCode: string | null
  errorMessage: string | null
  createdAtMs: number
  updatedAtMs: number
  terminalAtMs: number | null
}>

export type GenerationExecutionOperationBundleV2 = Readonly<{
  operation: GenerationExecutionOperationRepositoryFactV2
  snapshot: DecodedAssistantAnswerGenerationSnapshotV2
}>

export type GenerationExecutionAttemptRepositoryFactV2 = Readonly<{
  trust: 'generation_execution_attempt_repository_fact'
  state: GenerationRequestAttemptStateV2
  startedAtMs: number
  terminalAtMs: number | null
}>

export class GenerationExecutionV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_EXECUTION_INPUT_INVALID'
    | 'GENERATION_V2_EXECUTION_STATE_INVALID'
    | 'GENERATION_V2_EXECUTION_NOT_FOUND'
    | 'GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT'
    | 'GENERATION_V2_EXECUTION_ACTIVE_CONFLICT'
    | 'GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT'
    | 'GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED') {
    super(code)
    this.name = 'GenerationExecutionV2RepoError'
  }
}

type OperationJoinedRow = {
  operation_id: unknown
  action_kind: unknown
  command_fingerprint: unknown
  branch_id: unknown
  conversation_id: unknown
  question_id: unknown
  target_answer_root_id: unknown
  result_answer_root_id: unknown
  state: unknown
  error_code: unknown
  error_message: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
  terminal_at_ms: unknown
  snapshot_operation_id: unknown
  snapshot_answer_root_id: unknown
  schema_version: unknown
  canonical_json: unknown
  snapshot_hash: unknown
  snapshot_created_at_ms: unknown
}

type AttemptRow = {
  operation_id: unknown
  request_sequence: unknown
  attempt: unknown
  state: unknown
  outcome_json: unknown
  terminal_fingerprint: unknown
  started_at_ms: unknown
  terminal_at_ms: unknown
}

const operationFacts = new WeakSet<object>()
const attemptFacts = new WeakSet<object>()

function closedObject(value: unknown, expected: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...expected].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable ||
        !('value' in descriptor) || descriptor.value === undefined)) {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(expected.map((key) => [key, descriptors[key].value])))
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  return value as number
}

function stateTime(value: unknown): number {
  try { return safeTime(value) } catch {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  return value
}

function canonicalHash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}

function commandProjection(input: Readonly<{
  actionKind: GenerationCommandActionV2
  branchId: string
  conversationId: string
  questionId: string
  targetAnswerRootId: string | null
  resultAnswerRootId: string
  snapshotHash: string
}>) {
  return Object.freeze({
    actionKind: input.actionKind,
    branchId: input.branchId,
    conversationId: input.conversationId,
    questionId: input.questionId,
    targetAnswerRootId: input.targetAnswerRootId,
    resultAnswerRootId: input.resultAnswerRootId,
    snapshotHash: input.snapshotHash,
  })
}

function decodeOperationRow(row: OperationJoinedRow): GenerationExecutionOperationBundleV2 {
  try {
    if (typeof row.operation_id !== 'string' || !ACTION_KINDS.includes(row.action_kind as GenerationCommandActionV2) ||
        typeof row.command_fingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(row.command_fingerprint) ||
        typeof row.branch_id !== 'string' || typeof row.conversation_id !== 'string' ||
        typeof row.question_id !== 'string' || typeof row.result_answer_root_id !== 'string' ||
        (row.target_answer_root_id !== null && typeof row.target_answer_root_id !== 'string') ||
        !OPERATION_STATES.includes(row.state as GenerationExecutionOperationStateV2) ||
        (row.error_code !== null && typeof row.error_code !== 'string') ||
        (row.error_message !== null && typeof row.error_message !== 'string') ||
        row.snapshot_operation_id !== row.operation_id || row.snapshot_answer_root_id !== row.result_answer_root_id ||
        row.schema_version !== 2 || typeof row.canonical_json !== 'string' ||
        typeof row.snapshot_hash !== 'string' || row.snapshot_created_at_ms !== row.created_at_ms) {
      throw new Error('invalid row')
    }
    const createdAtMs = stateTime(row.created_at_ms)
    const updatedAtMs = stateTime(row.updated_at_ms)
    const terminalAtMs = row.terminal_at_ms === null ? null : stateTime(row.terminal_at_ms)
    if (updatedAtMs < createdAtMs || (terminalAtMs !== null && terminalAtMs < createdAtMs)) {
      throw new Error('invalid clock')
    }
    const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(row.canonical_json)
    if (snapshot.operationId.value !== row.operation_id || snapshot.answerRootId.value !== row.result_answer_root_id ||
        snapshot.snapshotHash.value !== row.snapshot_hash) {
      throw new Error('snapshot mismatch')
    }
    const expectedFingerprint = canonicalHash(commandProjection({
      actionKind: row.action_kind as GenerationCommandActionV2,
      branchId: row.branch_id,
      conversationId: row.conversation_id,
      questionId: row.question_id,
      targetAnswerRootId: row.target_answer_root_id as string | null,
      resultAnswerRootId: row.result_answer_root_id,
      snapshotHash: row.snapshot_hash,
    }))
    if (expectedFingerprint !== row.command_fingerprint) throw new Error('fingerprint mismatch')
    const state = row.state as GenerationExecutionOperationStateV2
    if ((state === 'completed' && (row.error_code !== null || row.error_message !== null || terminalAtMs === null)) ||
        ((state === 'committed' || state === 'streaming') &&
          (row.error_code !== null || row.error_message !== null || terminalAtMs !== null)) ||
        ((state === 'failed' || state === 'cancelled') && terminalAtMs === null)) {
      throw new Error('terminal mismatch')
    }
    const operation = Object.freeze({
      trust: 'generation_execution_operation_repository_fact' as const,
      operationId: GenerationV2Identity.create('operation_id', row.operation_id),
      actionKind: row.action_kind as GenerationCommandActionV2,
      commandFingerprint: row.command_fingerprint,
      branchId: ConversationGraphV2Identity.create('branch_id', row.branch_id),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversation_id),
      questionId: ConversationGraphV2Identity.create('question_id', row.question_id),
      targetAnswerRootId: row.target_answer_root_id === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', row.target_answer_root_id),
      resultAnswerRootId: ConversationGraphV2Identity.create('answer_root_id', row.result_answer_root_id),
      state,
      errorCode: row.error_code as string | null,
      errorMessage: row.error_message as string | null,
      createdAtMs,
      updatedAtMs,
      terminalAtMs,
    })
    operationFacts.add(operation)
    return Object.freeze({ operation, snapshot })
  } catch (error) {
    if (error instanceof GenerationExecutionV2RepoError) throw error
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
  }
}

function decodeAttemptKey(value: unknown): GenerationAttemptKeyV2 {
  try {
    const open = createGenerationRequestAttemptOpenStateV2(value)
    if (open.key.attempt !== 1) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    return open.key
  } catch (error) {
    if (error instanceof GenerationExecutionV2RepoError) throw error
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
}

function attemptRowState(row: AttemptRow): GenerationExecutionAttemptRepositoryFactV2 {
  try {
    if (typeof row.operation_id !== 'string' || !Number.isSafeInteger(row.request_sequence) ||
        (row.request_sequence as number) < 1 || row.attempt !== 1 ||
        (row.state !== 'open' && row.state !== 'terminal')) {
      throw new Error('invalid attempt row')
    }
    const startedAtMs = stateTime(row.started_at_ms)
    const terminalAtMs = row.terminal_at_ms === null ? null : stateTime(row.terminal_at_ms)
    let outcome: unknown = null
    if (row.outcome_json !== null) {
      if (typeof row.outcome_json !== 'string' ||
          new TextEncoder().encode(row.outcome_json).byteLength > MAX_JSON_BYTES) throw new Error('invalid outcome')
      outcome = JSON.parse(row.outcome_json)
      if (stableSerializeProviderRequestBoundedV2(outcome, MAX_JSON_BYTES) !== row.outcome_json) {
        throw new Error('noncanonical outcome')
      }
    }
    const state = restoreGenerationRequestAttemptStateV2({
      schemaVersion: 1,
      state: row.state,
      operationId: row.operation_id,
      requestSequence: row.request_sequence,
      attempt: row.attempt,
      outcome,
      fingerprint: row.terminal_fingerprint,
    })
    if ((state.state === 'open' && terminalAtMs !== null) ||
        (state.state === 'terminal' && terminalAtMs === null)) throw new Error('terminal clock mismatch')
    const fact = Object.freeze({
      trust: 'generation_execution_attempt_repository_fact' as const,
      state,
      startedAtMs,
      terminalAtMs,
    })
    attemptFacts.add(fact)
    return fact
  } catch (error) {
    if (error instanceof GenerationExecutionV2RepoError) throw error
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
  }
}

export function isGenerationExecutionOperationRepositoryFactV2(
  value: unknown,
): value is GenerationExecutionOperationRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && operationFacts.has(value))
}

export function isGenerationExecutionAttemptRepositoryFactV2(
  value: unknown,
): value is GenerationExecutionAttemptRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && attemptFacts.has(value))
}

export class GenerationExecutionV2Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
  }

  getOperation(operationId: string): GenerationExecutionOperationBundleV2 {
    if (this.#db.inTransaction) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    return this.#readOperation(operationId)
  }

  #readOperation(
    operationId: string,
    context?: GenerationV2AuthorityTransactionContextV2,
    trackRollback = true,
  ): GenerationExecutionOperationBundleV2 {
    if (this.#db.inTransaction) {
      if (!context) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
      }
      assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    } else if (context) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    let id: Identity<'operation_id'>
    try { id = GenerationV2Identity.create('operation_id', operationId) } catch {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const row = this.#db.prepare(`SELECT
      operation.operation_id, operation.action_kind, operation.command_fingerprint,
      operation.branch_id, operation.conversation_id, operation.question_id,
      operation.target_answer_root_id, operation.result_answer_root_id, operation.state,
      operation.error_code, operation.error_message, operation.created_at_ms,
      operation.updated_at_ms, operation.terminal_at_ms,
      snapshot.operation_id AS snapshot_operation_id,
      snapshot.answer_root_id AS snapshot_answer_root_id,
      snapshot.schema_version, snapshot.canonical_json, snapshot.snapshot_hash,
      snapshot.created_at_ms AS snapshot_created_at_ms
      FROM generation_operation_v2 AS operation
      JOIN assistant_generation_snapshot_v2 AS snapshot
        ON snapshot.operation_id = operation.operation_id
       AND snapshot.answer_root_id = operation.result_answer_root_id
      WHERE operation.operation_id = ?`).get(id.value) as OperationJoinedRow | undefined
    if (!row) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_NOT_FOUND')
    const bundle = decodeOperationRow(row)
    if (context && trackRollback) {
      registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
        preCommit: () => undefined,
        committed: () => undefined,
        rolledBack: () => { operationFacts.delete(bundle.operation) },
      })
    }
    return bundle
  }

  getSnapshotByAnswerRootId(answerRootId: string): DecodedAssistantAnswerGenerationSnapshotV2 {
    if (this.#db.inTransaction) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    let id: GraphIdentity<'answer_root_id'>
    try { id = ConversationGraphV2Identity.create('answer_root_id', answerRootId) } catch {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const row = this.#db.prepare(`SELECT operation_id FROM assistant_generation_snapshot_v2
      WHERE answer_root_id = ?`).get(id.value) as { operation_id: unknown } | undefined
    if (!row || typeof row.operation_id !== 'string') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_NOT_FOUND')
    }
    return this.getOperation(row.operation_id).snapshot
  }

  insertOperationAndSnapshot(
    context: GenerationV2AuthorityTransactionContextV2,
    value: unknown,
  ): Readonly<{ kind: 'created' | 'idempotent_replay'; bundle: GenerationExecutionOperationBundleV2 }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, [
      'operationId', 'actionKind', 'branchId', 'conversationId', 'questionId',
      'targetAnswerRootId', 'resultAnswerRootId', 'snapshot', 'createdAtMs',
    ])
    let operationId: Identity<'operation_id'>
    let branchId: GraphIdentity<'branch_id'>
    let conversationId: GraphIdentity<'conversation_id'>
    let questionId: GraphIdentity<'question_id'>
    let targetAnswerRootId: GraphIdentity<'answer_root_id'> | null
    let resultAnswerRootId: GraphIdentity<'answer_root_id'>
    let snapshot: DecodedAssistantAnswerGenerationSnapshotV2
    try {
      operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
      if (!ACTION_KINDS.includes(input.actionKind as GenerationCommandActionV2)) throw new Error('action')
      branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
      conversationId = ConversationGraphV2Identity.create('conversation_id', requiredString(input.conversationId))
      questionId = ConversationGraphV2Identity.create('question_id', requiredString(input.questionId))
      targetAnswerRootId = input.targetAnswerRootId === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', requiredString(input.targetAnswerRootId))
      resultAnswerRootId = ConversationGraphV2Identity.create(
        'answer_root_id', requiredString(input.resultAnswerRootId),
      )
      snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(requiredString(input.snapshot))
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError) throw error
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const actionKind = input.actionKind as GenerationCommandActionV2
    if ((actionKind === 'retry_as_new' || actionKind === 'retry_replace') !== (targetAnswerRootId !== null) ||
        snapshot.operationId.value !== operationId.value ||
        snapshot.answerRootId.value !== resultAnswerRootId.value) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const createdAtMs = safeTime(input.createdAtMs)
    const fingerprint = canonicalHash(commandProjection({
      actionKind,
      branchId: branchId.value,
      conversationId: conversationId.value,
      questionId: questionId.value,
      targetAnswerRootId: targetAnswerRootId?.value ?? null,
      resultAnswerRootId: resultAnswerRootId.value,
      snapshotHash: snapshot.snapshotHash.value,
    }))
    try {
      const existing = this.#readOperation(operationId.value, context)
      const exact = existing.operation.actionKind === actionKind &&
        existing.operation.commandFingerprint === fingerprint &&
        existing.operation.branchId.value === branchId.value &&
        existing.operation.conversationId.value === conversationId.value &&
        existing.operation.questionId.value === questionId.value &&
        existing.operation.targetAnswerRootId?.value === targetAnswerRootId?.value &&
        existing.operation.resultAnswerRootId.value === resultAnswerRootId.value &&
        existing.snapshot.canonicalJson === snapshot.canonicalJson
      if (!exact) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_IDEMPOTENCY_CONFLICT')
      return Object.freeze({ kind: 'idempotent_replay', bundle: existing })
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError &&
          error.code !== 'GENERATION_V2_EXECUTION_NOT_FOUND') throw error
    }
    try {
      this.#db.prepare(`INSERT INTO generation_operation_v2 (
        operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
        question_id, target_answer_root_id, result_answer_root_id, state,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?)`).run(
        operationId.value, actionKind, fingerprint, branchId.value, conversationId.value,
        questionId.value, targetAnswerRootId?.value ?? null, resultAnswerRootId.value,
        createdAtMs, createdAtMs,
      )
      this.#db.prepare(`INSERT INTO assistant_generation_snapshot_v2 (
        answer_root_id, operation_id, schema_version, canonical_json, snapshot_hash, created_at_ms
      ) VALUES (?, ?, 2, ?, ?, ?)`).run(
        resultAnswerRootId.value, operationId.value, snapshot.canonicalJson,
        snapshot.snapshotHash.value, createdAtMs,
      )
    } catch (error) {
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ACTIVE_CONFLICT')
      }
      throw error
    }
    const bundle = this.#readOperation(operationId.value, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const current = this.#readOperation(operationId.value, context, false)
        if (current.operation.commandFingerprint !== bundle.operation.commandFingerprint ||
            current.snapshot.canonicalJson !== bundle.snapshot.canonicalJson) {
          throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
        }
      },
      committed: () => undefined,
      rolledBack: () => undefined,
    })
    return Object.freeze({ kind: 'created', bundle })
  }

  getAttempt(keyValue: unknown): GenerationExecutionAttemptRepositoryFactV2 {
    if (this.#db.inTransaction) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    return this.#readAttempt(keyValue)
  }

  #readAttempt(
    keyValue: unknown,
    context?: GenerationV2AuthorityTransactionContextV2,
    trackRollback = true,
  ): GenerationExecutionAttemptRepositoryFactV2 {
    if (this.#db.inTransaction) {
      if (!context) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
      }
      assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    } else if (context) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    const key = decodeAttemptKey(keyValue)
    const row = this.#db.prepare(`SELECT operation_id, request_sequence, attempt, state,
      outcome_json, terminal_fingerprint, started_at_ms, terminal_at_ms
      FROM generation_attempt_v2
      WHERE operation_id = ? AND request_sequence = ? AND attempt = ?`)
      .get(key.operationId.value, key.requestSequence, key.attempt) as AttemptRow | undefined
    if (!row) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_NOT_FOUND')
    const fact = attemptRowState(row)
    if (context && trackRollback) {
      registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
        preCommit: () => undefined,
        committed: () => undefined,
        rolledBack: () => { attemptFacts.delete(fact) },
      })
    }
    return fact
  }

  openAttempt(
    context: GenerationV2AuthorityTransactionContextV2,
    keyValue: unknown,
    startedAtMs: number = this.#nowMs(),
  ): Readonly<{ kind: 'created' | 'idempotent_replay'; attempt: GenerationExecutionAttemptRepositoryFactV2 }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    decodeAttemptKey(keyValue)
    const started = safeTime(startedAtMs)
    try {
      const existing = this.#readAttempt(keyValue, context)
      if (existing.state.state !== 'open') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
      }
      return Object.freeze({ kind: 'idempotent_replay', attempt: existing })
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError &&
          error.code !== 'GENERATION_V2_EXECUTION_NOT_FOUND') throw error
    }
    const projection = projectGenerationRequestAttemptStateV2(
      createGenerationRequestAttemptOpenStateV2(keyValue),
    )
    this.#db.prepare(`INSERT INTO generation_attempt_v2 (
      operation_id, request_sequence, attempt, state, outcome_json,
      terminal_fingerprint, started_at_ms, terminal_at_ms
    ) VALUES (?, ?, ?, 'open', NULL, NULL, ?, NULL)`).run(
      projection.operationId, projection.requestSequence, projection.attempt, started,
    )
    const attempt = this.#readAttempt(keyValue, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const current = this.#readAttempt(keyValue, context, false)
        if (current.state.state !== 'open' || current.startedAtMs !== attempt.startedAtMs) {
          throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
        }
      },
      committed: () => undefined,
      rolledBack: () => undefined,
    })
    return Object.freeze({ kind: 'created', attempt })
  }

  terminalizeAttempt(
    context: GenerationV2AuthorityTransactionContextV2,
    signalValue: unknown,
    terminalAtMs: number = this.#nowMs(),
  ): GenerationRequestTerminalTransitionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const signal = closedObject(signalValue, ['key', 'outcome'])
    const key = decodeAttemptKey(signal.key)
    const current = this.#readAttempt(signal.key, context)
    const transition = transitionGenerationRequestAttemptTerminalV2(current.state, signalValue)
    if (transition.kind !== 'accepted') return transition
    const terminal = safeTime(terminalAtMs)
    if (terminal < current.startedAtMs) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const projection = projectGenerationRequestAttemptStateV2(transition.state)
    const outcomeJson = stableSerializeProviderRequestBoundedV2(projection.outcome, MAX_JSON_BYTES)
    const result = this.#db.prepare(`UPDATE generation_attempt_v2 SET
      state = 'terminal', outcome_json = ?, terminal_fingerprint = ?, terminal_at_ms = ?
      WHERE operation_id = ? AND request_sequence = ? AND attempt = ? AND state = 'open'
        AND outcome_json IS NULL AND terminal_fingerprint IS NULL AND terminal_at_ms IS NULL`).run(
      outcomeJson, projection.fingerprint, terminal,
      key.operationId.value, key.requestSequence, key.attempt,
    )
    if (result.changes === 1) return transition
    const winner = this.#readAttempt(signal.key, context)
    return transitionGenerationRequestAttemptTerminalV2(winner.state, signalValue)
  }
}
