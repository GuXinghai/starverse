import type BetterSqlite3 from 'better-sqlite3'
import {
  decodeAssistantAnswerGenerationSnapshotJsonV2,
  type DecodedAssistantAnswerGenerationSnapshotV2,
} from '../../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { lookupReviewedProviderContractDefinitionV2 } from '../../../src/next/generation-v2/contracts/providerContractRegistryV2'
import {
  decodeRuntimeCapabilitySnapshotJsonV2,
  type DecodedRuntimeCapabilitySnapshotV2,
} from '../../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { projectDecodedProviderBindingRecordV2 } from '../../../src/next/generation-v2/domain/providerBindingV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../../src/next/generation-v2/domain/conversationGraphV2'
import {
  GenerationV2Identity,
  type GenerationV2Identity as Identity,
} from '../../../src/next/generation-v2/domain/identityV2'
import {
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
import { decodeProviderFailureV2, type ProviderFailureV2 } from '../../../src/shared/provider/providerFailureV2'
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'

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
  sourceAnswerId: GraphIdentity<'answer_root_id'> | null
  targetAnswerId: GraphIdentity<'answer_root_id'>
  state: GenerationExecutionOperationStateV2
  errorCode: string | null
  errorMessage: string | null
  errorFact: ProviderFailureV2 | null
  createdAtMs: number
  updatedAtMs: number
  terminalAtMs: number | null
}>

export type GenerationExecutionOperationBundleV2 = Readonly<{
  operation: GenerationExecutionOperationRepositoryFactV2
  snapshot: DecodedAssistantAnswerGenerationSnapshotV2
  capability: DecodedRuntimeCapabilitySnapshotV2
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
    | 'GENERATION_V2_EXECUTION_TERMINAL_CONFLICT'
    | 'CONTEXT_PROJECTION_UNSUPPORTED_BY_PROVIDER'
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
  source_answer_id: unknown
  target_answer_id: unknown
  state: unknown
  error_code: unknown
  error_message: unknown
  error_fact_json: unknown
  created_at_ms: unknown
  updated_at_ms: unknown
  terminal_at_ms: unknown
  snapshot_operation_id: unknown
  snapshot_answer_root_id: unknown
  schema_version: unknown
  canonical_json: unknown
  snapshot_hash: unknown
  capability_revision: unknown
  capability_snapshot_hash: unknown
  capability_evidence_digest: unknown
  capability_semantic_fields_digest: unknown
  capability_canonical_json: unknown
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
const operationBundles = new WeakSet<object>()
const operationBundleContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
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

function encodeProviderFailureFact(value: ProviderFailureV2 | null | undefined): string | null {
  if (value === undefined || value === null) return null
  let encoded: string
  try {
    encoded = stableSerializeProviderRequestBoundedV2(value, MAX_JSON_BYTES)
  } catch {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_JSON_BYTES) {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
  }
  return encoded
}

export function decodeProviderFailureFact(value: unknown): ProviderFailureV2 | null {
  if (value === null) return null
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_JSON_BYTES) {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid error fact')
    }
    return decodeProviderFailureV2(parsed)
  } catch {
    throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
  }
}

function decodeOperationRow(row: OperationJoinedRow): GenerationExecutionOperationBundleV2 {
  try {
    if (typeof row.operation_id !== 'string' || !ACTION_KINDS.includes(row.action_kind as GenerationCommandActionV2) ||
        typeof row.command_fingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(row.command_fingerprint) ||
        typeof row.branch_id !== 'string' || typeof row.conversation_id !== 'string' ||
        typeof row.question_id !== 'string' || typeof row.target_answer_id !== 'string' ||
        (row.source_answer_id !== null && typeof row.source_answer_id !== 'string') ||
        !OPERATION_STATES.includes(row.state as GenerationExecutionOperationStateV2) ||
        (row.error_code !== null && typeof row.error_code !== 'string') ||
        (row.error_message !== null && typeof row.error_message !== 'string') ||
        (row.error_fact_json !== null && typeof row.error_fact_json !== 'string') ||
        row.snapshot_operation_id !== row.operation_id || row.snapshot_answer_root_id !== row.target_answer_id ||
        row.schema_version !== 2 || typeof row.canonical_json !== 'string' ||
        typeof row.snapshot_hash !== 'string' || typeof row.capability_revision !== 'string' ||
        typeof row.capability_snapshot_hash !== 'string' ||
        typeof row.capability_evidence_digest !== 'string' ||
        typeof row.capability_semantic_fields_digest !== 'string' ||
        typeof row.capability_canonical_json !== 'string' ||
        row.snapshot_created_at_ms !== row.created_at_ms) {
      throw new Error('invalid row')
    }
    const createdAtMs = stateTime(row.created_at_ms)
    const updatedAtMs = stateTime(row.updated_at_ms)
    const terminalAtMs = row.terminal_at_ms === null ? null : stateTime(row.terminal_at_ms)
    if (updatedAtMs < createdAtMs || (terminalAtMs !== null && terminalAtMs < createdAtMs)) {
      throw new Error('invalid clock')
    }
    const snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(row.canonical_json)
    const capability = decodeRuntimeCapabilitySnapshotJsonV2(row.capability_canonical_json)
    if (snapshot.operationId.value !== row.operation_id || snapshot.answerRootId.value !== row.target_answer_id ||
        snapshot.snapshotHash.value !== row.snapshot_hash ||
        snapshot.capabilityBinding.capabilityRevision.value !== row.capability_revision ||
        snapshot.capabilityBinding.snapshotHash.value !== row.capability_snapshot_hash ||
        snapshot.capabilityBinding.evidenceDigest.value !== row.capability_evidence_digest ||
        snapshot.capabilityBinding.semanticFieldsDigest.value !== row.capability_semantic_fields_digest ||
        capability.snapshotHash.value !== row.capability_snapshot_hash ||
        capability.revision.value !== row.capability_revision ||
        capability.evidenceDigest.value !== row.capability_evidence_digest ||
        capability.semanticFieldsDigest.value !== row.capability_semantic_fields_digest ||
        stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.providerBinding)) !==
          stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(capability.binding))) {
      throw new Error('snapshot mismatch')
    }
    const state = row.state as GenerationExecutionOperationStateV2
    const errorFact = decodeProviderFailureFact(row.error_fact_json)
    if ((state === 'completed' && (row.error_code !== null || row.error_message !== null || errorFact !== null || terminalAtMs === null)) ||
        ((state === 'committed' || state === 'streaming') &&
          (row.error_code !== null || row.error_message !== null || errorFact !== null || terminalAtMs !== null)) ||
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
      sourceAnswerId: row.source_answer_id === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', row.source_answer_id),
      targetAnswerId: ConversationGraphV2Identity.create('answer_root_id', row.target_answer_id),
      state,
      errorCode: row.error_code as string | null,
      errorMessage: row.error_message as string | null,
      errorFact,
      createdAtMs,
      updatedAtMs,
      terminalAtMs,
    })
    operationFacts.add(operation)
    const bundle = Object.freeze({ operation, snapshot, capability })
    operationBundles.add(bundle)
    return bundle
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

export function isGenerationExecutionOperationBundleForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is GenerationExecutionOperationBundleV2 {
  return Boolean(value && typeof value === 'object' && operationBundles.has(value) &&
    operationBundleContexts.get(value) === context)
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

  findOperation(operationId: string): GenerationExecutionOperationBundleV2 | null {
    if (this.#db.inTransaction) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TRANSACTION_CONTEXT_REQUIRED')
    }
    return this.#findOperation(operationId)
  }

  findOperationInTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
  ): GenerationExecutionOperationBundleV2 | null {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.#findOperation(operationId, context)
  }

  markOperationStreaming(
    context: GenerationV2AuthorityTransactionContextV2,
    bundle: GenerationExecutionOperationBundleV2,
    atMs: number = this.#nowMs(),
  ): GenerationExecutionOperationBundleV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(bundle, context) ||
        bundle.operation.state !== 'committed') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
    const at = safeTime(atMs)
    if (at < bundle.operation.updatedAtMs) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const result = this.#db.prepare(`UPDATE generation_operation_v2
      SET state='streaming', updated_at_ms=?
      WHERE operation_id=? AND state='committed' AND updated_at_ms=?`).run(
      at, bundle.operation.operationId.value, bundle.operation.updatedAtMs,
    )
    if (result.changes !== 1) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
    return this.#readOperation(bundle.operation.operationId.value, context)
  }

  terminalizeOperation(
    context: GenerationV2AuthorityTransactionContextV2,
    bundle: GenerationExecutionOperationBundleV2,
    terminal: Readonly<{
      state: 'completed' | 'failed' | 'cancelled'
      errorCode: string | null
      errorMessage: string | null
      errorFact?: ProviderFailureV2 | null
    }>,
    atMs: number = this.#nowMs(),
  ): GenerationExecutionOperationBundleV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const errorFact = terminal.errorFact === undefined || terminal.errorFact === null
      ? null : decodeProviderFailureV2(terminal.errorFact)
    if (errorFact !== null) {
      const request = this.#db.prepare(`SELECT provider_id AS providerId, contract_id AS contractId
        FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?`).get(
        bundle.operation.operationId.value, errorFact.requestSequence,
      ) as Readonly<{ providerId?: unknown; contractId?: unknown }> | undefined
      if (errorFact.provider.namespace !== 'generation_execution' ||
          errorFact.operationId !== bundle.operation.operationId.value ||
          request?.providerId !== errorFact.provider.id || request.contractId !== errorFact.contractId) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
      }
    }
    const errorFactJson = encodeProviderFailureFact(errorFact)
    if (!isGenerationExecutionOperationBundleForContextV2(bundle, context) ||
        ((terminal.state === 'completed') !==
          (terminal.errorCode === null && terminal.errorMessage === null && errorFactJson === null)) ||
        (terminal.state !== 'completed' &&
          (typeof terminal.errorCode !== 'string' || terminal.errorCode.length === 0 ||
           terminal.errorCode.length > 256 || terminal.errorCode.trim() !== terminal.errorCode ||
           typeof terminal.errorMessage !== 'string' || terminal.errorMessage.length === 0 ||
           terminal.errorMessage.length > 8_192 || /\u0000/u.test(terminal.errorMessage)))) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    if (bundle.operation.state === terminal.state) {
      if (bundle.operation.errorCode !== terminal.errorCode ||
          bundle.operation.errorMessage !== terminal.errorMessage ||
          encodeProviderFailureFact(bundle.operation.errorFact) !== errorFactJson) {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TERMINAL_CONFLICT')
      }
      return bundle
    }
    if (bundle.operation.state === 'completed' || bundle.operation.state === 'failed' ||
        bundle.operation.state === 'cancelled') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_TERMINAL_CONFLICT')
    }
    if (terminal.state === 'completed' && bundle.operation.state !== 'streaming') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
    const at = safeTime(atMs)
    if (at < bundle.operation.updatedAtMs) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const result = this.#db.prepare(`UPDATE generation_operation_v2
      SET state=?, error_code=?, error_message=?, error_fact_json=?, updated_at_ms=?, terminal_at_ms=?
      WHERE operation_id=? AND state=? AND updated_at_ms=?`).run(
      terminal.state, terminal.errorCode, terminal.errorMessage, errorFactJson, at, at,
      bundle.operation.operationId.value, bundle.operation.state, bundle.operation.updatedAtMs,
    )
    if (result.changes !== 1) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
    return this.#readOperation(bundle.operation.operationId.value, context)
  }

  #findOperation(
    operationId: string,
    context?: GenerationV2AuthorityTransactionContextV2,
  ): GenerationExecutionOperationBundleV2 | null {
    let existing: GenerationExecutionOperationBundleV2
    try {
      existing = this.#readOperation(operationId, context)
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError &&
          error.code === 'GENERATION_V2_EXECUTION_NOT_FOUND') return null
      throw error
    }
    return existing
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
      operation.source_answer_id, operation.target_answer_id, operation.state,
      operation.error_code, operation.error_message, operation.error_fact_json, operation.created_at_ms,
      operation.updated_at_ms, operation.terminal_at_ms,
      snapshot.operation_id AS snapshot_operation_id,
      snapshot.answer_root_id AS snapshot_answer_root_id,
      snapshot.schema_version, snapshot.canonical_json, snapshot.snapshot_hash,
      snapshot.capability_revision, snapshot.capability_snapshot_hash,
      snapshot.capability_evidence_digest,
      snapshot.capability_semantic_fields_digest,
      capability.canonical_json AS capability_canonical_json,
      snapshot.created_at_ms AS snapshot_created_at_ms
      FROM generation_operation_v2 AS operation
      JOIN assistant_generation_snapshot_v2 AS snapshot
        ON snapshot.operation_id = operation.operation_id
       AND snapshot.answer_root_id = operation.target_answer_id
      JOIN runtime_capability_snapshot_v2 AS capability
        ON capability.capability_snapshot_hash = snapshot.capability_snapshot_hash
       AND capability.capability_revision = snapshot.capability_revision
       AND capability.evidence_digest = snapshot.capability_evidence_digest
       AND capability.semantic_fields_digest = snapshot.capability_semantic_fields_digest
      WHERE operation.operation_id = ?`).get(id.value) as OperationJoinedRow | undefined
    if (!row) throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_NOT_FOUND')
    const bundle = decodeOperationRow(row)
    if (context) operationBundleContexts.set(bundle, context)
    if (context && trackRollback) {
      registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
        preCommit: () => undefined,
        committed: () => {
          operationBundles.delete(bundle)
          operationBundleContexts.delete(bundle)
        },
        rolledBack: () => {
          operationFacts.delete(bundle.operation)
          operationBundles.delete(bundle)
          operationBundleContexts.delete(bundle)
        },
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
      'sourceAnswerId', 'targetAnswerId', 'snapshot', 'commandFingerprint', 'createdAtMs',
    ])
    let operationId: Identity<'operation_id'>
    let branchId: GraphIdentity<'branch_id'>
    let conversationId: GraphIdentity<'conversation_id'>
    let questionId: GraphIdentity<'question_id'>
    let sourceAnswerId: GraphIdentity<'answer_root_id'> | null
    let targetAnswerId: GraphIdentity<'answer_root_id'>
    let snapshot: DecodedAssistantAnswerGenerationSnapshotV2
    try {
      operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
      if (!ACTION_KINDS.includes(input.actionKind as GenerationCommandActionV2)) throw new Error('action')
      branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
      conversationId = ConversationGraphV2Identity.create('conversation_id', requiredString(input.conversationId))
      questionId = ConversationGraphV2Identity.create('question_id', requiredString(input.questionId))
      sourceAnswerId = input.sourceAnswerId === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', requiredString(input.sourceAnswerId))
      targetAnswerId = ConversationGraphV2Identity.create(
        'answer_root_id', requiredString(input.targetAnswerId),
      )
      snapshot = decodeAssistantAnswerGenerationSnapshotJsonV2(requiredString(input.snapshot))
    } catch (error) {
      if (error instanceof GenerationExecutionV2RepoError) throw error
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    const actionKind = input.actionKind as GenerationCommandActionV2
    if ((actionKind !== 'initial_send') !== (sourceAnswerId !== null) ||
        snapshot.operationId.value !== operationId.value ||
        snapshot.answerRootId.value !== targetAnswerId.value) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    this.#assertSnapshotCapability(snapshot)
    const createdAtMs = safeTime(input.createdAtMs)
    const fingerprint = requiredString(input.commandFingerprint)
    if (!/^[0-9a-f]{64}$/u.test(fingerprint)) {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_INPUT_INVALID')
    }
    try {
      const existing = this.#readOperation(operationId.value, context)
      const exact = existing.operation.actionKind === actionKind &&
        existing.operation.commandFingerprint === fingerprint &&
        existing.operation.branchId.value === branchId.value &&
        existing.operation.conversationId.value === conversationId.value &&
        existing.operation.questionId.value === questionId.value &&
        existing.operation.sourceAnswerId?.value === sourceAnswerId?.value &&
        existing.operation.targetAnswerId.value === targetAnswerId.value &&
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
        question_id, source_answer_id, target_answer_id, state,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'committed', ?, ?)`).run(
        operationId.value, actionKind, fingerprint, branchId.value, conversationId.value,
        questionId.value, sourceAnswerId?.value ?? null, targetAnswerId.value,
        createdAtMs, createdAtMs,
      )
      this.#db.prepare(`INSERT INTO assistant_generation_snapshot_v2 (
        answer_root_id, operation_id, schema_version, canonical_json, snapshot_hash,
        capability_revision, capability_snapshot_hash,
        capability_evidence_digest, capability_semantic_fields_digest,
        created_at_ms
      ) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?, ?)`).run(
        targetAnswerId.value, operationId.value, snapshot.canonicalJson,
        snapshot.snapshotHash.value,
        snapshot.capabilityBinding.capabilityRevision.value,
        snapshot.capabilityBinding.snapshotHash.value,
        snapshot.capabilityBinding.evidenceDigest.value,
        snapshot.capabilityBinding.semanticFieldsDigest.value,
        createdAtMs,
      )
      const contextProjection = new GenerationContextProjectionV2Repo(this.#db).captureForOperation(context, {
        operationId: operationId.value, branchId: branchId.value, conversationId: conversationId.value,
        questionId: questionId.value, createdAtMs,
      })
      const contract = lookupReviewedProviderContractDefinitionV2({
        protocolContractId: snapshot.providerBinding.protocolContractId.value,
        contractRevision: snapshot.providerBinding.contractRevision.value,
      })
      if (contextProjection.turns.some((turn) => turn.mode === 'excluded') &&
          contract.contextProjectionPolicy !== 'complete_turn_client_managed_replay') {
        throw new GenerationExecutionV2RepoError('CONTEXT_PROJECTION_UNSUPPORTED_BY_PROVIDER')
      }
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

  #assertSnapshotCapability(snapshot: DecodedAssistantAnswerGenerationSnapshotV2): void {
    const row = this.#db.prepare(`SELECT canonical_json FROM runtime_capability_snapshot_v2
      WHERE capability_snapshot_hash=? AND capability_revision=?
        AND evidence_digest=? AND semantic_fields_digest=?`).get(
      snapshot.capabilityBinding.snapshotHash.value,
      snapshot.capabilityBinding.capabilityRevision.value,
      snapshot.capabilityBinding.evidenceDigest.value,
      snapshot.capabilityBinding.semanticFieldsDigest.value,
    ) as { canonical_json: unknown } | undefined
    if (!row || typeof row.canonical_json !== 'string') {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
    try {
      const capability = decodeRuntimeCapabilitySnapshotJsonV2(row.canonical_json)
      if (capability.snapshotHash.value !== snapshot.capabilityBinding.snapshotHash.value ||
          capability.revision.value !== snapshot.capabilityBinding.capabilityRevision.value ||
          capability.evidenceDigest.value !== snapshot.capabilityBinding.evidenceDigest.value ||
          capability.semanticFieldsDigest.value !== snapshot.capabilityBinding.semanticFieldsDigest.value ||
          stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(capability.binding)) !==
            stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(snapshot.providerBinding))) {
        throw new Error('capability mismatch')
      }
    } catch {
      throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_STATE_INVALID')
    }
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
