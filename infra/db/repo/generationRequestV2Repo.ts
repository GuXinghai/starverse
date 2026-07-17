import type BetterSqlite3 from 'better-sqlite3'
import {
  isPreparedProviderRequestV2,
  type PreparedProviderRequestV2,
} from '../../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { createSemanticConsumptionLedgerV2 } from '../../../src/next/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from './generationExecutionV2Repo'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

type GenerationRequestStateInternalV2 = 'prepared' | 'streaming' | 'completed' | 'failed' | 'cancelled'

export type GenerationRequestRepositoryFactV2 = Readonly<{
  trust: 'generation_request_repository_fact_v2'
  operationId: string
  requestSequence: number
  answerRootId: string
  snapshotHash: string
  providerId: string
  endpointProfileId: string
  credentialScopeId: string
  contractId: string
  modelId: string
  effectiveEndpointId: string
  capabilityRevision: string
  compilerLedgerJson: string
  compilerLedgerHash: string
  preparedBodySha256: string
  preparedBodyByteLength: number
  createdAtMs: number
}>

export class GenerationRequestV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_REQUEST_AUTHORITY_INVALID'
    | 'GENERATION_V2_REQUEST_INPUT_INVALID'
    | 'GENERATION_V2_REQUEST_STATE_INVALID'
    | 'GENERATION_V2_REQUEST_NOT_FOUND'
    | 'GENERATION_V2_REQUEST_IDEMPOTENCY_CONFLICT'
    | 'GENERATION_V2_REQUEST_SEQUENCE_INVALID'
    | 'GENERATION_V2_REQUEST_TERMINAL_CONFLICT') {
    super(code)
    this.name = 'GenerationRequestV2RepoError'
  }
}

type RequestRow = Readonly<Record<string, unknown>>
const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
  }
  return value as number
}

function decodeRow(row: RequestRow): GenerationRequestRepositoryFactV2 {
  const stringKeys = [
    'operation_id', 'answer_root_id', 'snapshot_hash', 'provider_id', 'endpoint_profile_id',
    'credential_scope_id', 'contract_id', 'model_id', 'effective_endpoint_id', 'capability_revision',
    'compiler_ledger_json', 'compiler_ledger_hash', 'prepared_body_sha256', 'state',
  ] as const
  if (stringKeys.some((key) => typeof row[key] !== 'string') ||
      !Number.isSafeInteger(row.request_sequence) || (row.request_sequence as number) < 1 ||
      !Number.isSafeInteger(row.prepared_body_byte_length) || (row.prepared_body_byte_length as number) < 2 ||
      !['prepared', 'streaming', 'completed', 'failed', 'cancelled'].includes(row.state as string) ||
      !/^[0-9a-f]{64}$/u.test(row.snapshot_hash as string) ||
      !/^[0-9a-f]{64}$/u.test(row.compiler_ledger_hash as string) ||
      !/^[0-9a-f]{64}$/u.test(row.prepared_body_sha256 as string)) {
    throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
  }
  let ledger
  try { ledger = createSemanticConsumptionLedgerV2(JSON.parse(row.compiler_ledger_json as string)) } catch {
    throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
  }
  if (ledger.canonicalJson !== row.compiler_ledger_json || ledger.sha256 !== row.compiler_ledger_hash) {
    throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
  }
  const createdAtMs = safeTime(row.created_at_ms)
  const updatedAtMs = safeTime(row.updated_at_ms)
  const terminalAtMs = row.terminal_at_ms === null ? null : safeTime(row.terminal_at_ms)
  if (updatedAtMs < createdAtMs ||
      ((row.state === 'prepared' || row.state === 'streaming') !== (terminalAtMs === null))) {
    throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
  }
  const fact = Object.freeze({
    trust: 'generation_request_repository_fact_v2' as const,
    operationId: row.operation_id as string,
    requestSequence: row.request_sequence as number,
    answerRootId: row.answer_root_id as string,
    snapshotHash: row.snapshot_hash as string,
    providerId: row.provider_id as string,
    endpointProfileId: row.endpoint_profile_id as string,
    credentialScopeId: row.credential_scope_id as string,
    contractId: row.contract_id as string,
    modelId: row.model_id as string,
    effectiveEndpointId: row.effective_endpoint_id as string,
    capabilityRevision: row.capability_revision as string,
    compilerLedgerJson: row.compiler_ledger_json as string,
    compilerLedgerHash: row.compiler_ledger_hash as string,
    preparedBodySha256: row.prepared_body_sha256 as string,
    preparedBodyByteLength: row.prepared_body_byte_length as number,
    createdAtMs,
  })
  facts.add(fact)
  return fact
}

function exactPrepared(fact: GenerationRequestRepositoryFactV2, prepared: PreparedProviderRequestV2): boolean {
  return fact.operationId === prepared.operationId && fact.requestSequence === prepared.requestSequence &&
    fact.answerRootId === prepared.answerRootId && fact.snapshotHash === prepared.snapshotHash &&
    fact.providerId === prepared.providerId && fact.endpointProfileId === prepared.endpointProfileId &&
    fact.credentialScopeId === prepared.credentialScopeId && fact.contractId === prepared.contractId &&
    fact.modelId === prepared.modelId && fact.effectiveEndpointId === prepared.effectiveEndpointId &&
    fact.capabilityRevision === prepared.capabilityRevision &&
    fact.compilerLedgerJson === prepared.ledger.canonicalJson &&
    fact.compilerLedgerHash === prepared.ledger.sha256 &&
    fact.preparedBodySha256 === prepared.bodySha256 &&
    fact.preparedBodyByteLength === prepared.bodyByteLength
}

export function isGenerationRequestRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is GenerationRequestRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export function isGenerationRequestRepositoryFactV2(
  value: unknown,
): value is GenerationRequestRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value))
}

export class GenerationRequestV2Repo {
  readonly #db: BetterSqlite3.Database
  readonly #nowMs: () => number

  constructor(db: BetterSqlite3.Database, nowMs: () => number = Date.now) {
    this.#db = db
    this.#nowMs = nowMs
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
  }

  createPrepared(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    prepared: PreparedProviderRequestV2,
  ): GenerationRequestRepositoryFactV2 {
    this.#assertAuthorities(context, execution, prepared)
    if (execution.operation.state !== 'committed') {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
    const existing = this.#find(context, prepared.operationId, prepared.requestSequence)
    if (existing) {
      if (!exactPrepared(existing, prepared)) {
        throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_IDEMPOTENCY_CONFLICT')
      }
      return existing
    }
    const next = this.#db.prepare(`SELECT COALESCE(MAX(request_sequence), 0) + 1 AS value
      FROM generation_request_v2 WHERE operation_id=?`).get(prepared.operationId) as { value: unknown }
    if (next.value !== prepared.requestSequence) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_SEQUENCE_INVALID')
    }
    const createdAtMs = this.#nowMs()
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.createdAtMs) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_INPUT_INVALID')
    }
    this.#db.prepare(`INSERT INTO generation_request_v2 (
      operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
      endpoint_profile_id, credential_scope_id, contract_id, model_id, effective_endpoint_id,
      capability_revision, compiler_ledger_json, compiler_ledger_hash, prepared_body_sha256,
      prepared_body_byte_length, state, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)`).run(
      prepared.operationId, prepared.requestSequence, prepared.answerRootId, prepared.snapshotHash,
      prepared.providerId, prepared.endpointProfileId, prepared.credentialScopeId, prepared.contractId,
      prepared.modelId, prepared.effectiveEndpointId, prepared.capabilityRevision,
      prepared.ledger.canonicalJson, prepared.ledger.sha256, prepared.bodySha256,
      prepared.bodyByteLength, createdAtMs, createdAtMs,
    )
    return this.#read(context, prepared.operationId, prepared.requestSequence)
  }

  replayPrepared(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    prepared: PreparedProviderRequestV2,
  ): GenerationRequestRepositoryFactV2 {
    this.#assertAuthorities(context, execution, prepared)
    const existing = this.#find(context, prepared.operationId, prepared.requestSequence)
    if (!existing) throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_NOT_FOUND')
    if (!exactPrepared(existing, prepared)) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_IDEMPOTENCY_CONFLICT')
    }
    return existing
  }

  loadExistingForOperation(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    requestSequence: number,
  ): GenerationRequestRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !Number.isSafeInteger(requestSequence) || requestSequence < 1) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_AUTHORITY_INVALID')
    }
    const existing = this.#find(context, execution.operation.operationId.value, requestSequence)
    if (!existing) throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_NOT_FOUND')
    const binding = execution.snapshot.providerBinding
    if (existing.answerRootId !== execution.operation.resultAnswerRootId.value ||
        existing.snapshotHash !== execution.snapshot.snapshotHash.value ||
        existing.providerId !== binding.providerId.value ||
        existing.endpointProfileId !== binding.endpointProfileId.value ||
        existing.credentialScopeId !== binding.credentialScopeId.value ||
        existing.contractId !== binding.protocolContractId.value ||
        existing.modelId !== binding.modelId.value ||
        existing.capabilityRevision !== execution.capability.revision.value) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
    return existing
  }

  markStreaming(
    context: GenerationV2AuthorityTransactionContextV2,
    fact: GenerationRequestRepositoryFactV2,
    atMs: number = this.#nowMs(),
  ): GenerationRequestRepositoryFactV2 {
    this.#assertFact(context, fact)
    const at = safeTime(atMs)
    const row = this.#mutableState(fact)
    if (row.state !== 'prepared' || at < row.updatedAtMs) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
    const result = this.#db.prepare(`UPDATE generation_request_v2 SET state='streaming', updated_at_ms=?
      WHERE operation_id=? AND request_sequence=? AND state='prepared' AND updated_at_ms=?`).run(
      at, fact.operationId, fact.requestSequence, row.updatedAtMs,
    )
    if (result.changes !== 1) throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    return this.#read(context, fact.operationId, fact.requestSequence)
  }

  terminalize(
    context: GenerationV2AuthorityTransactionContextV2,
    fact: GenerationRequestRepositoryFactV2,
    state: 'completed' | 'failed' | 'cancelled',
    atMs: number = this.#nowMs(),
  ): GenerationRequestRepositoryFactV2 {
    this.#assertFact(context, fact)
    const at = safeTime(atMs)
    const row = this.#mutableState(fact)
    if (row.state === state) return this.#read(context, fact.operationId, fact.requestSequence)
    if (row.state === 'completed' || row.state === 'failed' || row.state === 'cancelled') {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_TERMINAL_CONFLICT')
    }
    if ((row.state !== 'prepared' && row.state !== 'streaming') || at < row.updatedAtMs) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
    const result = this.#db.prepare(`UPDATE generation_request_v2
      SET state=?, updated_at_ms=?, terminal_at_ms=?
      WHERE operation_id=? AND request_sequence=? AND state=? AND updated_at_ms=?`).run(
      state, at, at, fact.operationId, fact.requestSequence, row.state, row.updatedAtMs,
    )
    if (result.changes !== 1) throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    return this.#read(context, fact.operationId, fact.requestSequence)
  }

  #assertAuthorities(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    prepared: PreparedProviderRequestV2,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isPreparedProviderRequestV2(prepared)) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_AUTHORITY_INVALID')
    }
    const { operation, snapshot, capability } = execution
    const binding = snapshot.providerBinding
    if (prepared.operationId !== operation.operationId.value ||
        prepared.answerRootId !== operation.resultAnswerRootId.value ||
        prepared.snapshotHash !== snapshot.snapshotHash.value ||
        prepared.providerId !== binding.providerId.value ||
        prepared.endpointProfileId !== binding.endpointProfileId.value ||
        prepared.credentialScopeId !== binding.credentialScopeId.value ||
        prepared.contractId !== binding.protocolContractId.value ||
        prepared.modelId !== binding.modelId.value ||
        prepared.capabilityRevision !== capability.revision.value) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_INPUT_INVALID')
    }
    const bounded512 = [prepared.providerId, prepared.endpointProfileId, prepared.credentialScopeId,
      prepared.contractId, prepared.capabilityRevision]
    if (bounded512.some((value) => value.length > 512) || prepared.modelId.length > 4_096 ||
        prepared.effectiveEndpointId.length > 4_096 || prepared.bodyByteLength > 20 * 1_024 * 1_024 ||
        (binding.endpointBinding.kind === 'provider_managed_set' &&
          !binding.endpointBinding.descriptors.some((descriptor) =>
            descriptor.endpointId.value === prepared.effectiveEndpointId))) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_INPUT_INVALID')
    }
  }

  #assertFact(
    context: GenerationV2AuthorityTransactionContextV2,
    fact: GenerationRequestRepositoryFactV2,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationRequestRepositoryFactForContextV2(fact, context)) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_AUTHORITY_INVALID')
    }
  }

  #mutableState(fact: GenerationRequestRepositoryFactV2): Readonly<{
    state: GenerationRequestStateInternalV2
    updatedAtMs: number
  }> {
    const row = this.#db.prepare(`SELECT state, updated_at_ms AS updatedAtMs
      FROM generation_request_v2 WHERE operation_id=? AND request_sequence=?`).get(
      fact.operationId, fact.requestSequence,
    ) as { state: unknown; updatedAtMs: unknown } | undefined
    if (!row || !['prepared', 'streaming', 'completed', 'failed', 'cancelled'].includes(row.state as string)) {
      throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_STATE_INVALID')
    }
    return Object.freeze({ state: row.state as GenerationRequestStateInternalV2, updatedAtMs: safeTime(row.updatedAtMs) })
  }

  #find(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    requestSequence: number,
  ): GenerationRequestRepositoryFactV2 | null {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const row = this.#db.prepare(`SELECT * FROM generation_request_v2
      WHERE operation_id=? AND request_sequence=?`).get(operationId, requestSequence) as RequestRow | undefined
    return row ? this.#track(context, decodeRow(row)) : null
  }

  #read(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    requestSequence: number,
  ): GenerationRequestRepositoryFactV2 {
    const fact = this.#find(context, operationId, requestSequence)
    if (!fact) throw new GenerationRequestV2RepoError('GENERATION_V2_REQUEST_NOT_FOUND')
    return fact
  }

  #track(
    context: GenerationV2AuthorityTransactionContextV2,
    fact: GenerationRequestRepositoryFactV2,
  ): GenerationRequestRepositoryFactV2 {
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => {
        factContexts.delete(fact)
      },
      rolledBack: () => {
        facts.delete(fact)
        factContexts.delete(fact)
      },
    })
    return fact
  }
}
