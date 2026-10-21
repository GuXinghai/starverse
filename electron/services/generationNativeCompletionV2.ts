import type BetterSqlite3 from 'better-sqlite3'
import { createHash } from 'node:crypto'
import {
  ImmutablePreparedBodyV2,
} from '../../src/core/generation-v2/compiler/stableSerialize'
import {
  issuePreparedProviderRequestV2,
  type PreparedProviderRequestWireEncodingProofV2,
  type PreparedProviderRequestV2,
} from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { createSemanticConsumptionLedgerV2 } from '../../src/core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { GENERATION_NATIVE_COMPLETION_RECEIPT_MAX_BYTES_V1,
  generationRequestBodyMaxBytesForContractV1 } from '../../src/core/generation-v2/capacity/generationCapacityV1'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import {
  GenerationNativeCompletionReceiptV2Repo,
  type GenerationNativeCompletionReceiptCursorV2,
  type GenerationNativeCompletionReceiptKeyV2,
  type GenerationNativeCompletionReceiptV2,
  type GenerationNativeCompletionPendingSummaryV2,
  type NewGenerationNativeCompletionReceiptV2,
} from '../../infra/db/repo/generationNativeCompletionReceiptV2Repo'
import { GenerationRequestV2Repo, type GenerationRequestRepositoryFactV2 } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import {
  issueGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from './generationTextCommandResultV2'
import type { ActiveWorkSourceV2 } from './appShutdownCoordinatorV2'

const MAX_NODE_DEPTH = 128

export type GenerationNativeCompletionCommandV2 = Readonly<{
  execution: GenerationExecutionOperationBundleV2
  preparedRequest: PreparedProviderRequestV2
  request: GenerationRequestRepositoryFactV2
}>

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function fail(): never {
  throw new GenerationNativeCompletionMaterializationPendingV2Error()
}

export class GenerationNativeCompletionMaterializationPendingV2Error extends Error {
  readonly code: 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING' | 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_PERSIST_FAILED'
  readonly receiptPersisted: boolean
  readonly causeCode: string

  constructor(input: Readonly<{ receiptPersisted: boolean; cause?: unknown }> = { receiptPersisted: true }) {
    super('Provider completed; local generation materialization is pending.')
    this.name = 'GenerationNativeCompletionMaterializationPendingV2Error'
    this.receiptPersisted = input.receiptPersisted
    this.code = input.receiptPersisted
      ? 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_PENDING'
      : 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_PERSIST_FAILED'
    this.causeCode = safeMaterializationErrorCode(input.cause)
    if (input.cause !== undefined) Object.defineProperty(this, 'cause', { value: input.cause, configurable: true })
  }
}

export function isGenerationNativeCompletionMaterializationPendingV2Error(
  value: unknown,
): value is GenerationNativeCompletionMaterializationPendingV2Error {
  return value instanceof GenerationNativeCompletionMaterializationPendingV2Error
}

function encodeNativeNode(value: unknown, active: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_NODE_DEPTH) fail()
  if (value === null) return ['null']
  if (typeof value === 'string') return ['string', value]
  if (typeof value === 'boolean') return ['boolean', value]
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail()
    return ['number', Object.is(value, -0) ? 0 : value]
  }
  if (!value || typeof value !== 'object') fail()
  if (active.has(value)) fail()
  active.add(value)
  try {
    if (value instanceof Uint8Array && Object.prototype.toString.call(value) === '[object Uint8Array]') {
      return ['bytes', Buffer.from(value).toString('base64')]
    }
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail()
      const items: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail()
        items.push(encodeNativeNode(descriptor.value, active, depth + 1))
      }
      return ['array', items]
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail()
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Object.keys(descriptors).sort()
    const entries = keys.map((key) => {
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !('value' in descriptor)) fail()
      return [key, encodeNativeNode(descriptor.value, active, depth + 1)]
    })
    return ['object', entries]
  } finally {
    active.delete(value)
  }
}

function encodeNativeResult(value: unknown): string {
  try {
    const json = JSON.stringify(encodeNativeNode(value, new WeakSet(), 0))
    if (typeof json !== 'string') fail()
    return json
  } catch {
    return fail()
  }
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return fail()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) return fail()
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]))
}

function decodeNativeNode(value: unknown, depth: number): unknown {
  if (depth > MAX_NODE_DEPTH || !Array.isArray(value) || value.length < 1 || typeof value[0] !== 'string') return fail()
  const tag = value[0]
  if (tag === 'null' && value.length === 1) return null
  if (tag === 'string' && value.length === 2 && typeof value[1] === 'string') return value[1]
  if (tag === 'boolean' && value.length === 2 && typeof value[1] === 'boolean') return value[1]
  if (tag === 'number' && value.length === 2 && typeof value[1] === 'number' && Number.isFinite(value[1])) return value[1]
  if (tag === 'bytes' && value.length === 2 && typeof value[1] === 'string' &&
      value[1].length <= Math.ceil(GENERATION_NATIVE_COMPLETION_RECEIPT_MAX_BYTES_V1 / 3) * 4) {
    const bytes = Buffer.from(value[1], 'base64')
    if (bytes.toString('base64') !== value[1]) return fail()
    return new Uint8Array(bytes)
  }
  if (tag === 'array' && value.length === 2 && Array.isArray(value[1])) {
    const result = value[1].map((item) => decodeNativeNode(item, depth + 1))
    return Object.freeze(result)
  }
  if (tag === 'object' && value.length === 2 && Array.isArray(value[1])) {
    const result: Record<string, unknown> = {}
    let previousKey: string | null = null
    for (const entryValue of value[1]) {
      if (!Array.isArray(entryValue) || entryValue.length !== 2 || typeof entryValue[0] !== 'string' ||
          (previousKey !== null && entryValue[0] <= previousKey)) return fail()
      previousKey = entryValue[0]
      Object.defineProperty(result, entryValue[0], {
        value: decodeNativeNode(entryValue[1], depth + 1), enumerable: true, configurable: false, writable: false,
      })
    }
    return Object.freeze(result)
  }
  return fail()
}

function assertReceiptCapacity(receipt: GenerationNativeCompletionReceiptV2): void {
  if (typeof receipt.nativeResultJson !== 'string' || typeof receipt.preparedRequestJson !== 'string' ||
      Buffer.byteLength(receipt.nativeResultJson, 'utf8') + Buffer.byteLength(receipt.preparedRequestJson, 'utf8') >
        GENERATION_NATIVE_COMPLETION_RECEIPT_MAX_BYTES_V1) fail()
}

export function decodeGenerationNativeCompletionResultV2(receipt: GenerationNativeCompletionReceiptV2): unknown {
  assertReceiptCapacity(receipt)
  if (sha256(receipt.nativeResultJson) !== receipt.nativeResultSha256) return fail()
  let value: unknown
  try { value = JSON.parse(receipt.nativeResultJson) } catch { return fail() }
  return decodeNativeNode(value, 0)
}

function serializePreparedRequest(prepared: PreparedProviderRequestV2): string {
  const body = prepared.body.copyUtf8Text()
  const bodyBytes = prepared.body.copyBytes()
  try {
    if (bodyBytes.byteLength !== prepared.bodyByteLength || sha256(Buffer.from(bodyBytes).toString('utf8')) !== prepared.bodySha256) fail()
  } finally { bodyBytes.fill(0) }
  const payload = Object.freeze({
    version: 1,
    operationId: prepared.operationId,
    answerRootId: prepared.answerRootId,
    requestSequence: prepared.requestSequence,
    plannedAttempt: prepared.plannedAttempt,
    providerId: prepared.providerId,
    endpointProfileId: prepared.endpointProfileId,
    credentialScopeId: prepared.credentialScopeId,
    contractId: prepared.contractId,
    modelId: prepared.modelId,
    effectiveEndpointId: prepared.effectiveEndpointId,
    endpoint: prepared.endpoint,
    method: prepared.method,
    headersPlan: prepared.headersPlan,
    bodyJson: body,
    bodySha256: prepared.bodySha256,
    bodyByteLength: prepared.bodyByteLength,
    ledgerJson: prepared.ledger.canonicalJson,
    capabilityRevision: prepared.capabilityRevision,
    encoderRevision: prepared.encoderRevision,
    snapshotHash: prepared.snapshotHash,
    ...(prepared.wireEncodingProof === undefined ? {} : { wireEncodingProof: prepared.wireEncodingProof }),
  })
  const json = JSON.stringify(payload)
  if (typeof json !== 'string') fail()
  return json
}

export function restorePreparedProviderRequestFromGenerationNativeCompletionV2(
  receipt: GenerationNativeCompletionReceiptV2,
): PreparedProviderRequestV2 {
  assertReceiptCapacity(receipt)
  if (sha256(receipt.preparedRequestJson) !== receipt.preparedRequestSha256) return fail()
  let payload: unknown
  try { payload = JSON.parse(receipt.preparedRequestJson) } catch { return fail() }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail()
  const payloadKeys = Object.keys(payload as Record<string, unknown>)
  const baseKeys = [
    'version', 'operationId', 'answerRootId', 'requestSequence', 'plannedAttempt', 'providerId',
    'endpointProfileId', 'credentialScopeId', 'contractId', 'modelId', 'effectiveEndpointId', 'endpoint',
    'method', 'headersPlan', 'bodyJson', 'bodySha256', 'bodyByteLength', 'ledgerJson', 'capabilityRevision',
    'encoderRevision', 'snapshotHash',
  ]
  if (payloadKeys.length !== baseKeys.length &&
      (payloadKeys.length !== baseKeys.length + 1 || !payloadKeys.includes('wireEncodingProof'))) return fail()
  if (baseKeys.some((key) => !payloadKeys.includes(key))) return fail()
  const item = record(payload, payloadKeys)
  if (item.version !== 1 || item.method !== 'POST' || typeof item.bodyJson !== 'string' || typeof item.ledgerJson !== 'string' ||
      typeof item.bodySha256 !== 'string' || !Number.isSafeInteger(item.bodyByteLength) ||
      typeof item.contractId !== 'string' || item.contractId !== receipt.contractId ||
      item.operationId !== receipt.operationId || item.answerRootId !== receipt.answerRootId ||
      item.requestSequence !== receipt.requestSequence || item.plannedAttempt !== 1 ||
      item.providerId !== receipt.providerId) return fail()
  const maxBodyBytes = generationRequestBodyMaxBytesForContractV1(item.contractId)
  if ((item.bodyByteLength as number) > maxBodyBytes) return fail()
  let bodyValue: unknown
  let ledgerValue: unknown
  try {
    bodyValue = JSON.parse(item.bodyJson)
    ledgerValue = JSON.parse(item.ledgerJson)
  } catch { return fail() }
  const body = ImmutablePreparedBodyV2.fromNativeRequestWithMaxBytes(bodyValue, maxBodyBytes)
  if (body.byteLength !== item.bodyByteLength || body.sha256 !== item.bodySha256 || body.copyUtf8Text() !== item.bodyJson) return fail()
  const ledger = createSemanticConsumptionLedgerV2(ledgerValue)
  if (ledger.canonicalJson !== item.ledgerJson) return fail()
  const wireEncodingProof = item.wireEncodingProof === undefined
    ? undefined
    // The issuer owns the proof codec and verifies all bounds and body/ledger
    // bindings before it brands the restored request.
    : item.wireEncodingProof as PreparedProviderRequestWireEncodingProofV2
  const prepared = issuePreparedProviderRequestV2({
    operationId: item.operationId as string,
    answerRootId: item.answerRootId as string,
    requestSequence: item.requestSequence as number,
    providerId: item.providerId as string,
    endpointProfileId: item.endpointProfileId as string,
    credentialScopeId: item.credentialScopeId as string,
    contractId: item.contractId as string,
    modelId: item.modelId as string,
    effectiveEndpointId: item.effectiveEndpointId as string,
    endpoint: item.endpoint as string,
    headersPlan: item.headersPlan as PreparedProviderRequestV2['headersPlan'],
    body,
    ledger,
    capabilityRevision: item.capabilityRevision as string,
    encoderRevision: item.encoderRevision as string,
    snapshotHash: item.snapshotHash as string,
    ...(wireEncodingProof === undefined ? {} : { wireEncodingProof }),
  })
  if (prepared.bodySha256 !== item.bodySha256 || prepared.bodyByteLength !== item.bodyByteLength) return fail()
  return prepared
}

function receiptPayload(
  command: GenerationNativeCompletionCommandV2,
  nativeResult: unknown,
  receivedAtMs: number,
): NewGenerationNativeCompletionReceiptV2 {
  const prepared = command.preparedRequest
  if (!prepared.body.verifyIntegrity() || !Number.isSafeInteger(receivedAtMs) || receivedAtMs < 0) return fail()
  const nativeResultJson = encodeNativeResult(nativeResult)
  const preparedRequestJson = serializePreparedRequest(prepared)
  const totalBytes = Buffer.byteLength(nativeResultJson, 'utf8') + Buffer.byteLength(preparedRequestJson, 'utf8')
  if (totalBytes > GENERATION_NATIVE_COMPLETION_RECEIPT_MAX_BYTES_V1) return fail()
  return Object.freeze({
    operationId: prepared.operationId,
    requestSequence: prepared.requestSequence,
    attempt: prepared.plannedAttempt,
    providerId: prepared.providerId,
    contractId: prepared.contractId,
    answerRootId: prepared.answerRootId,
    nativeResultJson,
    nativeResultSha256: sha256(nativeResultJson),
    preparedRequestJson,
    preparedRequestSha256: sha256(preparedRequestJson),
    receivedAtMs,
  })
}

function sameReceiptPayloadExceptTimestamp(
  left: GenerationNativeCompletionReceiptV2,
  right: NewGenerationNativeCompletionReceiptV2,
): boolean {
  return left.operationId === right.operationId && left.requestSequence === right.requestSequence &&
    left.attempt === right.attempt && left.providerId === right.providerId && left.contractId === right.contractId &&
    left.answerRootId === right.answerRootId && left.nativeResultJson === right.nativeResultJson &&
    left.nativeResultSha256 === right.nativeResultSha256 && left.preparedRequestJson === right.preparedRequestJson &&
    left.preparedRequestSha256 === right.preparedRequestSha256
}

function insertReceiptWithRetry(
  repo: GenerationNativeCompletionReceiptV2Repo,
  value: NewGenerationNativeCompletionReceiptV2,
): GenerationNativeCompletionReceiptV2 {
  try {
    const existing = repo.get(value)
    if (sameReceiptPayloadExceptTimestamp(existing, value)) return existing
    throw new Error('GENERATION_V2_NATIVE_COMPLETION_RECEIPT_CONFLICT')
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error &&
        error.code === 'GENERATION_V2_NATIVE_COMPLETION_RECEIPT_NOT_FOUND')) {
      throw new GenerationNativeCompletionMaterializationPendingV2Error({ receiptPersisted: false, cause: error })
    }
  }
  try {
    return repo.insertPending(value)
  } catch (firstError) {
    try {
      return repo.insertPending(value)
    } catch (retryError) {
      throw new GenerationNativeCompletionMaterializationPendingV2Error({
        receiptPersisted: false,
        cause: retryError ?? firstError,
      })
    }
  }
}

export function persistGenerationNativeCompletionReceiptV2(
  db: BetterSqlite3.Database,
  command: GenerationNativeCompletionCommandV2,
  nativeResult: unknown,
  receivedAtMs: number,
): GenerationNativeCompletionReceiptV2 {
  // Provider protocol and frozen-snapshot semantics must be proven before local
  // failures are classified as recoverable materialization work.
  validateNativeCompletionBeforeReceiptV2(db, command, nativeResult)
  return insertReceiptWithRetry(new GenerationNativeCompletionReceiptV2Repo(db),
    receiptPayload(command, nativeResult, receivedAtMs))
}

export function preserveGenerationNativeCompletionPendingFailureV2(
  db: BetterSqlite3.Database,
  command: GenerationNativeCompletionCommandV2,
  error: unknown,
): GenerationNativeCompletionMaterializationPendingV2Error {
  const key = {
    operationId: command.preparedRequest.operationId,
    requestSequence: command.preparedRequest.requestSequence,
    attempt: command.preparedRequest.plannedAttempt,
  }
  const pending = new GenerationNativeCompletionMaterializationPendingV2Error({ receiptPersisted: true, cause: error })
  try {
    new GenerationNativeCompletionReceiptV2Repo(db).recordMaterializationError(
      key,
      safeMaterializationErrorCode(error),
      'Provider completed; a local checkpoint or native result materialization failed.',
    )
  } catch { /* The receipt remains the recovery authority. */ }
  schedulePendingReceiptRecoveryV2(db, Date.now)
  return pending
}

export function restoreGenerationTextCommandFromNativeCompletionV2(
  db: BetterSqlite3.Database,
  receipt: GenerationNativeCompletionReceiptV2,
): GenerationTextCommandResultV2 {
  const preparedRequest = restorePreparedProviderRequestFromGenerationNativeCompletionV2(receipt)
  return runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
    const executionRepo = new GenerationExecutionV2Repo(db)
    const execution = executionRepo.findOperationInTransaction(context, receipt.operationId)
    if (!execution || execution.operation.targetAnswerId.value !== receipt.answerRootId ||
        execution.snapshot.providerBinding.providerId.value !== receipt.providerId ||
        execution.snapshot.providerBinding.protocolContractId.value !== receipt.contractId ||
        execution.snapshot.snapshotHash.value !== preparedRequest.snapshotHash) return fail()
    const request = new GenerationRequestV2Repo(db).replayPrepared(context, execution, preparedRequest)
    const projection = new ConversationGraphV2Repo(db).getGenerationReplayProjectionInTransaction(context, receipt.operationId)
    return issueGenerationTextCommandResultV2({
      kind: 'created', execution, projection, preparedRequest, request,
    })
  })
}

export function isProviderCompletionAlreadyPersistedV2(
  db: BetterSqlite3.Database,
  receipt: GenerationNativeCompletionReceiptV2,
): boolean {
  const row = db.prepare(`SELECT request.state AS requestState,attempt.state AS attemptState,
      attempt.outcome_json AS outcomeJson,operation.state AS operationState
    FROM generation_request_v2 AS request
    JOIN generation_attempt_v2 AS attempt ON attempt.operation_id=request.operation_id
      AND attempt.request_sequence=request.request_sequence AND attempt.attempt=?
    JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
    WHERE request.operation_id=? AND request.request_sequence=?`).get(
    receipt.attempt, receipt.operationId, receipt.requestSequence,
  ) as { requestState?: unknown; attemptState?: unknown; outcomeJson?: unknown; operationState?: unknown } | undefined
  if (!row || row.requestState !== 'completed' || row.attemptState !== 'terminal' ||
      (row.operationState !== 'streaming' && row.operationState !== 'completed') || typeof row.outcomeJson !== 'string') return false
  let outcome: unknown
  try { outcome = JSON.parse(row.outcomeJson) } catch { return false }
  return Boolean(outcome && typeof outcome === 'object' && !Array.isArray(outcome) &&
    (outcome as { kind?: unknown }).kind === 'provider_completed')
}

type Materializer = (
  receipt: GenerationNativeCompletionReceiptV2,
  command: GenerationTextCommandResultV2,
  nativeResult: unknown,
) => void

type CompletionValidator = (command: GenerationTextCommandResultV2, nativeResult: unknown) => void
type CompletionHandler = Readonly<{ materialize: Materializer; validate: CompletionValidator }>

const materializersByDb = new WeakMap<BetterSqlite3.Database, Map<string, CompletionHandler>>()
const RECOVERY_RETRY_DELAYS_MS = Object.freeze([100, 500, 2_000])

type RecoverySchedulerV2 = {
  timer: ReturnType<typeof setTimeout> | null
  inFlight: Promise<void> | null
  retryCounts: Map<string, number>
  quiesced: boolean
  sealed: boolean
  nowMs: () => number
}

const recoverySchedulersByDb = new WeakMap<BetterSqlite3.Database, RecoverySchedulerV2>()

function receiptCursorId(key: GenerationNativeCompletionReceiptKeyV2): string {
  return `${key.operationId}\u0000${key.requestSequence}\u0000${key.attempt}`
}

function schedulerFor(db: BetterSqlite3.Database): RecoverySchedulerV2 {
  let scheduler = recoverySchedulersByDb.get(db)
  if (!scheduler) {
    scheduler = { timer: null, inFlight: null, retryCounts: new Map(), quiesced: false, sealed: false, nowMs: Date.now }
    recoverySchedulersByDb.set(db, scheduler)
  }
  return scheduler
}

function forEachPendingSummary(
  repo: GenerationNativeCompletionReceiptV2Repo,
  visit: (summary: GenerationNativeCompletionPendingSummaryV2) => void,
): void {
  let cursor: GenerationNativeCompletionReceiptCursorV2 | null = null
  while (true) {
    const page = repo.listPendingSummaryPage(128, cursor)
    if (page.length === 0) return
    for (const summary of page) visit(summary)
    const last = page[page.length - 1]!
    cursor = Object.freeze({ receivedAtMs: last.receivedAtMs, operationId: last.operationId,
      requestSequence: last.requestSequence, attempt: last.attempt })
  }
}

function schedulePendingReceiptRecoveryV2(db: BetterSqlite3.Database, nowMs: () => number): void {
  const scheduler = schedulerFor(db)
  if (scheduler.quiesced || scheduler.sealed || scheduler.timer || scheduler.inFlight) return
  const repo = new GenerationNativeCompletionReceiptV2Repo(db)
  const materializers = materializersByDb.get(db)
  let hasEligible = false
  let nextTry = RECOVERY_RETRY_DELAYS_MS.length
  try {
    forEachPendingSummary(repo, (summary) => {
      if (!materializers?.has(summary.contractId)) return
      const count = scheduler.retryCounts.get(receiptCursorId(summary)) ?? 0
      if (count >= RECOVERY_RETRY_DELAYS_MS.length) return
      hasEligible = true
      if (count < nextTry) nextTry = count
    })
  } catch { return }
  if (!hasEligible) return
  scheduler.nowMs = nowMs
  const timer = setTimeout(() => {
    scheduler.timer = null
    if (scheduler.quiesced || scheduler.sealed) return
    const selected: GenerationNativeCompletionReceiptKeyV2[] = []
    try {
      forEachPendingSummary(repo, (summary) => {
        if (!materializers?.has(summary.contractId)) return
        const id = receiptCursorId(summary)
        const count = scheduler.retryCounts.get(id) ?? 0
        if (count >= RECOVERY_RETRY_DELAYS_MS.length) return
        scheduler.retryCounts.set(id, count + 1)
        selected.push(summary)
      })
    } catch { return }
    if (selected.length === 0) return
    let scheduleAgain = false
    scheduler.inFlight = Promise.resolve().then(() => {
      recoverPendingReceiptsV2(db, scheduler.nowMs, selected, false)
    }).then(() => {
      const pendingIds = new Set<string>()
      forEachPendingSummary(repo, (summary) => pendingIds.add(receiptCursorId(summary)))
      for (const id of scheduler.retryCounts.keys()) if (!pendingIds.has(id)) scheduler.retryCounts.delete(id)
      scheduleAgain = true
    }).catch(() => {
      // A transient database error leaves the durable receipt untouched. Retries remain bounded.
      scheduleAgain = true
    }).finally(() => {
      scheduler.inFlight = null
      if (scheduleAgain) schedulePendingReceiptRecoveryV2(db, scheduler.nowMs)
    })
  }, RECOVERY_RETRY_DELAYS_MS[nextTry]!)
  timer.unref?.()
  scheduler.timer = timer
}

/** Pending receipts are local recovery work, never an active provider request. */
export function createGenerationNativeCompletionRecoveryWorkSourceV2(
  db: BetterSqlite3.Database,
): ActiveWorkSourceV2 {
  const scheduler = schedulerFor(db)
  return Object.freeze({
    name: 'generation-native-completion-recovery',
    activeCount: () => (scheduler.timer ? 1 : 0) + (scheduler.inFlight ? 1 : 0),
    quiesce: async () => {
      scheduler.quiesced = true
      if (scheduler.timer) clearTimeout(scheduler.timer)
      scheduler.timer = null
      await scheduler.inFlight
    },
    seal: () => {
      scheduler.sealed = true
      if (scheduler.timer) clearTimeout(scheduler.timer)
      scheduler.timer = null
    },
  })
}

export function registerGenerationNativeCompletionMaterializerV2(
  db: BetterSqlite3.Database,
  contractId: string,
  materializer: Materializer,
  validate: CompletionValidator,
): void {
  if (typeof contractId !== 'string' || contractId.length === 0 || typeof materializer !== 'function' ||
      typeof validate !== 'function') return fail()
  let materializers = materializersByDb.get(db)
  if (!materializers) {
    materializers = new Map()
    materializersByDb.set(db, materializers)
  }
  materializers.set(contractId, Object.freeze({ materialize: materializer, validate }))
}

function validateNativeCompletionBeforeReceiptV2(
  db: BetterSqlite3.Database,
  command: GenerationNativeCompletionCommandV2,
  nativeResult: unknown,
): void {
  const handler = materializersByDb.get(db)?.get(command.preparedRequest.contractId)
  if (!handler) throw new Error('GENERATION_V2_NATIVE_COMPLETION_VALIDATOR_UNAVAILABLE')
  handler.validate(command as GenerationTextCommandResultV2, nativeResult)
}

function safeMaterializationErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' &&
      /^[A-Z0-9_:-]{1,256}$/u.test(error.code)) return error.code
  return 'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_FAILED'
}

function recordPendingFailure(
  repo: GenerationNativeCompletionReceiptV2Repo,
  receipt: GenerationNativeCompletionReceiptKeyV2,
  error: unknown,
): void {
  try {
    repo.recordMaterializationError(receipt, safeMaterializationErrorCode(error),
      'Provider completed; local native history or graph materialization is pending.')
  } catch { /* Keep the immutable receipt as the recovery authority. */ }
}

export function materializeNewGenerationNativeCompletionV2<T>(input: Readonly<{
  db: BetterSqlite3.Database
  command: GenerationNativeCompletionCommandV2
  nativeResult: unknown
  nowMs: () => number
  materialize: () => T
}>): T {
  const repo = new GenerationNativeCompletionReceiptV2Repo(input.db)
  validateNativeCompletionBeforeReceiptV2(input.db, input.command, input.nativeResult)
  let receipt: GenerationNativeCompletionReceiptV2
  try {
    receipt = insertReceiptWithRetry(repo, receiptPayload(input.command, input.nativeResult, input.nowMs()))
  } catch (error) {
    if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
    throw new GenerationNativeCompletionMaterializationPendingV2Error({ receiptPersisted: false, cause: error })
  }
  try {
    const result = input.materialize()
    repo.markMaterialized(receipt, input.nowMs())
    return result
  } catch (error) {
    recordPendingFailure(repo, receipt, error)
    schedulePendingReceiptRecoveryV2(input.db, input.nowMs)
    throw new GenerationNativeCompletionMaterializationPendingV2Error({ receiptPersisted: true, cause: error })
  }
}

export function hasPendingGenerationNativeCompletionForOperationV2(
  db: BetterSqlite3.Database,
  operationId: string,
): boolean {
  return new GenerationNativeCompletionReceiptV2Repo(db).hasPendingForOperation(operationId)
}

export function recoverPendingGenerationNativeCompletionsV2(
  db: BetterSqlite3.Database,
  nowMs: () => number = Date.now,
  scheduleFollowup = true,
): Readonly<{ recovered: number; pending: number; unavailable: number }> {
  return recoverPendingReceiptsV2(db, nowMs, null, scheduleFollowup)
}

function recoverPendingReceiptsV2(
  db: BetterSqlite3.Database,
  nowMs: () => number,
  selected: readonly GenerationNativeCompletionReceiptKeyV2[] | null,
  scheduleFollowup: boolean,
): Readonly<{ recovered: number; pending: number; unavailable: number }> {
  const repo = new GenerationNativeCompletionReceiptV2Repo(db)
  const materializers = materializersByDb.get(db)
  const selectedIds = selected === null ? null : new Set(selected.map(receiptCursorId))
  let recovered = 0
  let pending = 0
  let unavailable = 0
  let cursor: GenerationNativeCompletionReceiptCursorV2 | null = null
  while (true) {
   const summaries = repo.listPendingSummaryPage(128, cursor)
   if (summaries.length === 0) break
   for (const summary of summaries) {
    if (selectedIds !== null && !selectedIds.has(receiptCursorId(summary))) continue
    const receipt = repo.get(summary)
    if (receipt.materializationState !== 'pending') continue
    try {
      if (isProviderCompletionAlreadyPersistedV2(db, receipt)) {
        repo.markMaterialized(receipt, Math.max(nowMs(), receipt.receivedAtMs))
        recovered += 1
        continue
      }
      const handler = materializers?.get(receipt.contractId)
      if (!handler) {
        unavailable += 1
        recordPendingFailure(repo, receipt, null)
        continue
      }
      const command = restoreGenerationTextCommandFromNativeCompletionV2(db, receipt)
      const nativeResult = decodeGenerationNativeCompletionResultV2(receipt)
      handler.validate(command, nativeResult)
      handler.materialize(receipt, command, nativeResult)
      repo.markMaterialized(receipt, Math.max(nowMs(), receipt.receivedAtMs))
      recovered += 1
    } catch (error) {
      pending += 1
      recordPendingFailure(repo, receipt, error)
    }
   }
   const last = summaries[summaries.length - 1]!
   cursor = Object.freeze({ receivedAtMs: last.receivedAtMs, operationId: last.operationId,
     requestSequence: last.requestSequence, attempt: last.attempt })
  }
  if (scheduleFollowup) schedulePendingReceiptRecoveryV2(db, nowMs)
  return Object.freeze({ recovered, pending, unavailable })
}
