import type BetterSqlite3 from 'better-sqlite3'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
// Approved Generation V2 main-process runtime boundary: this registry owns the persisted operation lifecycle.
import type { GenerationOperationBindingV2 } from '../../src/core/generation-v2/domain/generationOperationBindingV2'
import type {
  GenerationOperationRuntimeSnapshotV2,
  GenerationStreamEventV2,
  GenerationStreamPayloadV2,
} from '../../src/core/generation-v2/domain/generationStreamEventV2'
import {
  GENERATION_OPERATION_RUNTIME_START_V2,
  type CoordinatedGenerationStreamProjectionSinkV2,
  type GenerationStreamProjectionV2,
} from './generationStreamProjectionV2'
import { GenerationRecentUsageAuthorityV2 } from './generationRecentUsageAuthorityV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  onGenerationNativeCompletionRecoveryExhaustedV2,
} from './generationNativeCompletionV2'

const AWAITING_TOOL_CANCEL_CODE = 'user_cancelled'
const AWAITING_TOOL_CANCEL_MESSAGE = 'Generation cancelled by user.'

type RuntimeEntry = {
  snapshot: GenerationOperationRuntimeSnapshotV2
  abort: (() => boolean) | null
}

type StartableGenerationResultV2 = Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: GenerationExecutionOperationBundleV2
  preparedRequest?: Readonly<{ operationId: string; requestSequence?: number }> | null
}>

export class GenerationOperationRuntimeRegistryV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_RUNTIME_OPERATION_UNKNOWN'
    | 'GENERATION_V2_RUNTIME_BINDING_CONFLICT'
    | 'GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED'
    | 'GENERATION_V2_RUNTIME_SEQUENCE_INVALID'
    | 'GENERATION_V2_RUNTIME_START_CONFLICT'
    | 'GENERATION_V2_RUNTIME_BRANCH_QUIESCING'
    | 'GENERATION_V2_RUNTIME_BRANCH_ABORT_TIMEOUT'
    | 'GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING'
    | 'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT'
    | 'GENERATION_V2_RUNTIME_PROJECT_QUIESCING'
    | 'GENERATION_V2_RUNTIME_PROJECT_ABORT_TIMEOUT'
    | 'GENERATION_V2_RUNTIME_SHUTDOWN_ABORT_TIMEOUT'
    | 'GENERATION_V2_RUNTIME_SHUTTING_DOWN') {
    super(code)
    this.name = 'GenerationOperationRuntimeRegistryV2Error'
  }
}

function freezeReasoning(value: readonly Readonly<Record<string, unknown>>[]) {
  return Object.freeze(value.map((detail) => Object.freeze({ ...detail })))
}

function bindingOf(bundle: GenerationExecutionOperationBundleV2): GenerationOperationBindingV2 {
  return Object.freeze({
    operationId: bundle.operation.operationId.value,
    conversationId: bundle.operation.conversationId.value,
    branchId: bundle.operation.branchId.value,
    targetAnswerId: bundle.operation.targetAnswerId.value,
    sourceAnswerId: bundle.operation.sourceAnswerId?.value ?? null,
    snapshotHash: bundle.snapshot.snapshotHash.value,
    providerId: bundle.snapshot.providerBinding.providerId.value,
    contractId: bundle.snapshot.providerBinding.protocolContractId.value,
  })
}

function statusOf(state: GenerationExecutionOperationBundleV2['operation']['state']):
GenerationOperationRuntimeSnapshotV2['status'] {
  if (state === 'completed') return 'completed'
  if (state === 'failed') return 'failed'
  if (state === 'cancelled') return 'cancelled'
  return 'generating'
}

function sameBinding(left: GenerationOperationBindingV2, right: GenerationOperationBindingV2): boolean {
  return left.operationId === right.operationId &&
    left.conversationId === right.conversationId &&
    left.branchId === right.branchId &&
    left.targetAnswerId === right.targetAnswerId &&
    left.sourceAnswerId === right.sourceAnswerId &&
    left.snapshotHash === right.snapshotHash &&
    left.providerId === right.providerId &&
    left.contractId === right.contractId
}

export class GenerationOperationRuntimeRegistryV2 {
  readonly #execution: GenerationExecutionV2Repo
  readonly #reasoning: AnswerReasoningProjectionV2Repo
  readonly #entries = new Map<string, RuntimeEntry>()
  readonly #listeners = new Set<(event: GenerationStreamEventV2) => void>()
  readonly #quiescingBranches = new Set<string>()
  readonly #quiescingConversations = new Set<string>()
  readonly #quiescingProjects = new Set<string>()
  #shuttingDown = false
  #sealed = false
  readonly #recentUsage: GenerationRecentUsageAuthorityV2

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.#execution = new GenerationExecutionV2Repo(db, nowMs)
    this.#reasoning = new AnswerReasoningProjectionV2Repo(db, nowMs)
    this.#recentUsage = new GenerationRecentUsageAuthorityV2(db)
    this.#recentUsage.reconcile()
    // A receipt that can never materialise must not keep its operation open (P2b-02).
    onGenerationNativeCompletionRecoveryExhaustedV2(db, (key) => this.#failOperation(key.operationId,
      'GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_EXHAUSTED',
      'Provider completed, but its result could not be stored locally after retries.'))
  }

  readonly projectionSink: CoordinatedGenerationStreamProjectionSinkV2 = Object.freeze({
    publish: (projection: GenerationStreamProjectionV2) => this.publishPersistedProjection(projection),
    [GENERATION_OPERATION_RUNTIME_START_V2]: (
      result: unknown,
      run: (signal: AbortSignal) => Promise<unknown>,
    ) => this.start(result as StartableGenerationResultV2, run),
  })

  subscribe(listener: (event: GenerationStreamEventV2) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  listSnapshots(): readonly GenerationOperationRuntimeSnapshotV2[] {
    const snapshots: GenerationOperationRuntimeSnapshotV2[] = []
    for (const [operationId, entry] of this.#entries) {
      const bundle = this.#execution.findOperation(operationId)
      if (!bundle) continue
      entry.snapshot = this.#hydrate(bundle, entry.snapshot.lastSequence)
      if (entry.snapshot.status !== 'generating') entry.abort = null
      snapshots.push(entry.snapshot)
    }
    return Object.freeze(snapshots)
  }

  getSnapshot(operationId: string): GenerationOperationRuntimeSnapshotV2 | null {
    const bundle = this.#execution.findOperation(operationId)
    if (!bundle) return null
    const existing = this.#entries.get(operationId)
    if (existing && !sameBinding(existing.snapshot.binding, bindingOf(bundle))) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BINDING_CONFLICT')
    }
    const snapshot = this.#hydrate(bundle, existing?.snapshot.lastSequence ?? 0)
    if (existing) {
      existing.snapshot = snapshot
      if (snapshot.status !== 'generating') existing.abort = null
    } else {
      this.#entries.set(operationId, { snapshot, abort: null })
    }
    return snapshot
  }

  register(result: StartableGenerationResultV2): GenerationOperationRuntimeSnapshotV2 {
    if (this.#shuttingDown) throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_SHUTTING_DOWN')
    const binding = bindingOf(result.execution)
    if (this.#quiescingBranches.has(binding.branchId)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BRANCH_QUIESCING')
    }
    if (this.#quiescingConversations.has(binding.conversationId)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING')
    }
    if (this.#quiescingProjects.size > 0) {
      const projectId = this.#projectIdForConversation(binding.conversationId)
      if (projectId && this.#quiescingProjects.has(projectId)) {
        throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECT_QUIESCING')
      }
    }
    const existing = this.#entries.get(binding.operationId)
    if (existing) {
      if (!sameBinding(existing.snapshot.binding, binding)) {
        throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BINDING_CONFLICT')
      }
      this.#recordRecentUsage(result.execution)
      return existing.snapshot
    }
    this.#recordRecentUsage(result.execution)
    const snapshot = this.#hydrate(result.execution, 0)
    this.#entries.set(binding.operationId, { snapshot, abort: null })
    return snapshot
  }

  #recordRecentUsage(bundle: GenerationExecutionOperationBundleV2): void {
    try {
      this.#recentUsage.record(bundle)
    } catch {
      // The immutable Generation operation remains authoritative. A replay or
      // the next startup reconciliation retries the idempotent recent write.
    }
  }

  start(
    result: StartableGenerationResultV2,
    run: (signal: AbortSignal) => Promise<unknown>,
  ): boolean {
    let snapshot: GenerationOperationRuntimeSnapshotV2
    try {
      snapshot = this.register(result)
    } catch (error) {
      // The operation is already committed as streaming; with no runner it would stay orphaned
      // (quiesce can begin between commit and registration), so terminalize it before rejecting.
      if (result.kind === 'created' && !this.#sealed) {
        try { this.#terminalizeUnhandledRunFailure(result, error) } catch { /* startup orphan recovery remains the backstop */ }
      }
      throw error
    }
    if (result.kind !== 'created') return false
    const entry = this.#entries.get(snapshot.binding.operationId)
    if (!entry) throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_OPERATION_UNKNOWN')
    if (entry.abort) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_START_CONFLICT')
    }
    const controller = new AbortController()
    entry.abort = () => {
      if (controller.signal.aborted) return false
      controller.abort('user_cancelled')
      return true
    }
    queueMicrotask(() => {
      void run(controller.signal)
        .catch((error) => {
          if (this.#sealed) return
          try {
            this.#terminalizeUnhandledRunFailure(result, error)
          } catch {
            // Do not leave a rejected promise behind (P4a-18). Startup orphan
            // recovery remains the backstop for the operation itself.
            console.error('[generation-runtime] GENERATION_V2_RUNTIME_TERMINALIZE_FAILED')
          }
        })
        .finally(() => {
          const current = this.#entries.get(snapshot.binding.operationId)
          if (current?.abort) current.abort = null
        })
    })
    return true
  }

  #terminalizeUnhandledRunFailure(result: StartableGenerationResultV2, error: unknown): void {
    const operationId = result.execution.operation.operationId.value
    // A persisted receipt belongs to receipt recovery. Without one, nothing can
    // recover the operation, so it fails here (P4a-01).
    const receiptLost = isGenerationNativeCompletionMaterializationPendingV2Error(error) && !error.receiptPersisted
    if (isGenerationNativeCompletionMaterializationPendingV2Error(error) && !receiptLost) return
    try {
      if (hasPendingGenerationNativeCompletionForOperationV2(this.db, operationId)) return
    } catch { /* The normal unhandled-run fallback remains available if the receipt table is unavailable. */ }
    const rawMessage = error instanceof Error ? error.message : String(error)
    const errorCode = receiptLost ? error.code : 'GENERATION_V2_RUNTIME_RUNNER_FAILED'
    const errorMessage = receiptLost
      ? 'Provider completed, but its result could not be stored locally.'
      : rawMessage.length > 0 && rawMessage.length <= 8_192 && !rawMessage.includes('\u0000')
        ? rawMessage
        : 'Generation runner failed before it could persist a terminal result.'
    this.#failOperation(operationId, errorCode, errorMessage)
  }

  #failOperation(operationId: string, errorCode: string, errorMessage: string): void {
    const current = this.#execution.findOperation(operationId)
    if (!current || ['completed', 'failed', 'cancelled'].includes(current.operation.state)) return
    const at = Math.max(this.nowMs(), current.operation.updatedAtMs)
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(this.db, (context) => {
      const execution = this.#execution.findOperationInTransaction(context, operationId)
      if (!execution || ['completed', 'failed', 'cancelled'].includes(execution.operation.state)) return
      const activeRequest = this.db.prepare(`SELECT request_sequence AS requestSequence,state
        FROM generation_request_v2 WHERE operation_id=? AND state IN ('prepared','streaming')
        ORDER BY request_sequence DESC LIMIT 1`).get(operationId) as
        { requestSequence?: unknown; state?: unknown } | undefined
      if (activeRequest && Number.isSafeInteger(activeRequest.requestSequence) &&
          (activeRequest.state === 'prepared' || activeRequest.state === 'streaming')) {
        const requestRepo = new GenerationRequestV2Repo(this.db, () => at)
        const request = requestRepo.loadExistingForOperation(
          context,
          execution,
          activeRequest.requestSequence as number,
        )
        if (activeRequest.state === 'streaming') {
          const attempt = this.db.prepare(`SELECT attempt FROM generation_attempt_v2
            WHERE operation_id=? AND request_sequence=? AND state='open'
            ORDER BY attempt DESC LIMIT 1`).get(
            operationId,
            activeRequest.requestSequence,
          ) as { attempt?: unknown } | undefined
          if (attempt && Number.isSafeInteger(attempt.attempt)) {
            this.#execution.terminalizeAttempt(context, {
              key: {
                operationId,
                requestSequence: activeRequest.requestSequence as number,
                attempt: attempt.attempt as number,
              },
              outcome: {
                kind: 'provider_failed',
                phase: 'pre_stream',
                failure: {
                  code: errorCode,
                  message: errorMessage,
                },
              },
            }, at)
          }
        }
        requestRepo.terminalize(context, request, 'failed', at)
      }
      new ConversationGraphV2Repo(this.db).terminalizeAssistantMessage(
        context,
        execution.operation.targetAnswerId.value,
        'failed',
        null,
        at,
      )
      this.#execution.terminalizeOperation(context, execution, {
        state: 'failed',
        errorCode,
        errorMessage,
      }, at)
    })
    this.publishPersistedProjection(Object.freeze({
      type: 'terminal',
      operationId,
      answerRootId: current.operation.targetAnswerId.value,
      state: 'failed',
      errorCode,
      errorMessage,
    }))
  }

  /** Operations whose runner is still executing. */
  countActive(): number {
    let count = 0
    for (const entry of this.#entries.values()) if (entry.snapshot.status === 'generating' && entry.abort !== null) count += 1
    return count
  }

  /** App shutdown: reject new operations, abort every active one and wait (bounded) for terminal events. */
  async quiesceForShutdown(timeoutMs = 5_000): Promise<void> {
    this.#shuttingDown = true
    await this.#abortAndDrainScope(() => true, timeoutMs, 'GENERATION_V2_RUNTIME_SHUTDOWN_ABORT_TIMEOUT')
  }

  /** After this, late runner callbacks neither terminalize nor publish through the (soon closed) database. */
  seal(): void {
    this.#shuttingDown = true
    this.#sealed = true
  }

  /**
   * Stop. A running operation is aborted through its runner. One whose stream
   * ended awaiting a tool result has no runner and, with tools disabled, no
   * continuation, so Stop ends it as cancelled (P4b-04).
   */
  abort(operationId: string): boolean {
    const live = this.#entries.get(operationId)?.abort
    if (live) return live()
    return this.#cancelAwaitingTool(operationId)
  }

  /**
   * Ends an operation left awaiting a tool result as cancelled and publishes
   * the terminal. Returns false, changing nothing, unless the operation is
   * streaming with a completed request, no prepared or streaming request, no
   * open attempt, no pending completion receipt, and a streaming answer.
   */
  #cancelAwaitingTool(operationId: string): boolean {
    if (this.#sealed) return false
    let answerRootId: string | null = null
    try {
      if (hasPendingGenerationNativeCompletionForOperationV2(this.db, operationId)) return false
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(this.db, (context) => {
        const execution = this.#execution.findOperationInTransaction(context, operationId)
        if (!execution || execution.operation.state !== 'streaming') return
        const answerId = execution.operation.targetAnswerId.value
        const row = this.db.prepare(`SELECT
          (SELECT count(*) FROM generation_request_v2 WHERE operation_id=? AND state IN ('prepared','streaming')) AS active,
          (SELECT count(*) FROM generation_request_v2 WHERE operation_id=? AND state='completed') AS completed,
          (SELECT count(*) FROM generation_attempt_v2 WHERE operation_id=? AND state='open') AS attempts,
          (SELECT max(updated_at_ms) FROM generation_request_v2 WHERE operation_id=?) AS requestAt,
          (SELECT status FROM message_v2 WHERE message_id=?) AS answerStatus,
          (SELECT updated_at_ms FROM message_v2 WHERE message_id=?) AS answerAt`).get(
          operationId, operationId, operationId, operationId, answerId, answerId,
        ) as { active: unknown; completed: unknown; attempts: unknown; requestAt: unknown;
          answerStatus: unknown; answerAt: unknown }
        if (row.active !== 0 || row.attempts !== 0 || row.completed === 0 || row.answerStatus !== 'streaming') return
        const at = Math.max(this.nowMs(), execution.operation.updatedAtMs,
          Number.isSafeInteger(row.requestAt) ? row.requestAt as number : 0,
          Number.isSafeInteger(row.answerAt) ? row.answerAt as number : 0)
        new ConversationGraphV2Repo(this.db).terminalizeAssistantMessage(context, answerId, 'cancelled', null, at)
        this.#execution.terminalizeOperation(context, execution, {
          state: 'cancelled',
          errorCode: AWAITING_TOOL_CANCEL_CODE,
          errorMessage: AWAITING_TOOL_CANCEL_MESSAGE,
        }, at)
        answerRootId = answerId
      })
    } catch {
      console.error('[generation-runtime] GENERATION_V2_RUNTIME_AWAITING_TOOL_CANCEL_FAILED')
      return false
    }
    if (answerRootId === null) return false
    this.publishPersistedProjection(Object.freeze({
      type: 'terminal',
      operationId,
      answerRootId,
      state: 'cancelled',
      errorCode: AWAITING_TOOL_CANCEL_CODE,
      errorMessage: AWAITING_TOOL_CANCEL_MESSAGE,
    }))
    return true
  }

  /** Cancels every operation in a scope that is left awaiting a tool result, so it cannot block deletion. */
  #cancelAwaitingToolWhere(scopeSql: string, scopeId: string): void {
    const rows = this.db.prepare(`SELECT operation_id AS operationId FROM generation_operation_v2
      WHERE state='streaming' AND ${scopeSql} ORDER BY operation_id`).all(scopeId) as { operationId: unknown }[]
    for (const row of rows) {
      if (typeof row.operationId !== 'string' || this.#entries.get(row.operationId)?.abort) continue
      this.#cancelAwaitingTool(row.operationId)
    }
  }

  async runWithBranchQuiesced<T>(
    branchId: string,
    action: () => T | Promise<T>,
    timeoutMs = 5_000,
  ): Promise<T> {
    if (this.#quiescingBranches.has(branchId)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BRANCH_QUIESCING')
    }
    this.#quiescingBranches.add(branchId)
    try {
      this.#cancelAwaitingToolWhere('branch_id=?', branchId)
      await this.#abortAndDrainScope(
        (entry) => entry.snapshot.binding.branchId === branchId,
        timeoutMs,
        'GENERATION_V2_RUNTIME_BRANCH_ABORT_TIMEOUT',
      )
      return await action()
    } finally {
      this.#quiescingBranches.delete(branchId)
    }
  }

  async runWithConversationQuiesced<T>(
    conversationId: string,
    action: () => T | Promise<T>,
    timeoutMs = 5_000,
  ): Promise<T> {
    if (this.#quiescingConversations.has(conversationId)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING')
    }
    this.#quiescingConversations.add(conversationId)
    try {
      this.#cancelAwaitingToolWhere('conversation_id=?', conversationId)
      await this.#abortAndDrainScope(
        (entry) => entry.snapshot.binding.conversationId === conversationId,
        timeoutMs,
        'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT',
      )
      return await action()
    } finally {
      this.#quiescingConversations.delete(conversationId)
    }
  }

  async runWithProjectQuiesced<T>(
    projectId: string,
    action: () => T | Promise<T>,
    timeoutMs = 5_000,
  ): Promise<T> {
    if (this.#quiescingProjects.has(projectId)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECT_QUIESCING')
    }
    this.#quiescingProjects.add(projectId)
    try {
      this.#cancelAwaitingToolWhere(
        'conversation_id IN (SELECT conversation_id FROM conversation_v2 WHERE project_id=?)', projectId)
      await this.#abortAndDrainScope(
        (entry) => this.#projectIdForConversation(entry.snapshot.binding.conversationId) === projectId,
        timeoutMs,
        'GENERATION_V2_RUNTIME_PROJECT_ABORT_TIMEOUT',
      )
      return await action()
    } finally {
      this.#quiescingProjects.delete(projectId)
    }
  }

  #projectIdForConversation(conversationId: string): string | null {
    const row = this.db.prepare('SELECT project_id AS projectId FROM conversation_v2 WHERE conversation_id=?')
      .get(conversationId) as { projectId?: unknown } | undefined
    return typeof row?.projectId === 'string' ? row.projectId : null
  }

  async #abortAndDrainScope(
    matches: (entry: RuntimeEntry) => boolean,
    timeoutMs: number,
    timeoutCode: 'GENERATION_V2_RUNTIME_BRANCH_ABORT_TIMEOUT' |
      'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT' |
      'GENERATION_V2_RUNTIME_PROJECT_ABORT_TIMEOUT' |
      'GENERATION_V2_RUNTIME_SHUTDOWN_ABORT_TIMEOUT',
  ): Promise<void> {
    const remaining = new Set([...this.#entries.entries()]
      .filter(([, entry]) => matches(entry) && entry.snapshot.status === 'generating' && entry.abort !== null)
      .map(([operationId]) => operationId))
    if (remaining.size === 0) return

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: GenerationOperationRuntimeRegistryV2Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe()
        if (error) reject(error); else resolve()
      }
      const reconcile = () => {
        for (const operationId of remaining) {
          const snapshot = this.#entries.get(operationId)?.snapshot
          if (!snapshot || snapshot.status !== 'generating') remaining.delete(operationId)
        }
        if (remaining.size === 0) finish()
      }
      const unsubscribe = this.subscribe((event) => {
        if (!remaining.has(event.operationId) || event.payload.type !== 'terminal') return
        if (event.payload.state === 'awaiting_tool') {
          // The abort was requested, so a stream that still ended awaiting a
          // tool is cancelled once this event has reached every listener (P4a-19).
          const { operationId } = event
          queueMicrotask(() => { if (!settled) this.#cancelAwaitingTool(operationId) })
          return
        }
        remaining.delete(event.operationId)
        if (remaining.size === 0) finish()
      })
      const timer = setTimeout(() => finish(new GenerationOperationRuntimeRegistryV2Error(timeoutCode)), timeoutMs)
      for (const operationId of remaining) this.abort(operationId)
      reconcile()
    })
  }

  publishPersistedProjection(projection: GenerationStreamProjectionV2): GenerationStreamEventV2 {
    if (this.#sealed) throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_SHUTTING_DOWN')
    const bundle = this.#execution.findOperation(projection.operationId)
    if (!bundle) throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_OPERATION_UNKNOWN')
    const binding = bindingOf(bundle)
    if (binding.targetAnswerId !== projection.answerRootId) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BINDING_CONFLICT')
    }
    const existing = this.#entries.get(binding.operationId)
    if (existing && !sameBinding(existing.snapshot.binding, binding)) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_BINDING_CONFLICT')
    }
    const entry = existing ?? { snapshot: this.#hydrate(bundle, 0), abort: null }
    if (!existing) this.#entries.set(binding.operationId, entry)

    const payload = this.#persistedPayload(projection)
    const sequence = entry.snapshot.lastSequence + 1
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_SEQUENCE_INVALID')
    }
    entry.snapshot = this.#reduce(entry.snapshot, payload, sequence)
    if (payload.type === 'terminal' && payload.state !== 'awaiting_tool') entry.abort = null
    const event = Object.freeze({ operationId: binding.operationId, sequence, payload })
    for (const listener of this.#listeners) {
      try { listener(event) } catch { /* One observer cannot block the persisted runtime snapshot. */ }
    }
    return event
  }

  #hydrate(bundle: GenerationExecutionOperationBundleV2, lastSequence: number): GenerationOperationRuntimeSnapshotV2 {
    const bodyRow = this.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(bundle.operation.targetAnswerId.value) as { body?: unknown } | undefined
    if (!bodyRow || typeof bodyRow.body !== 'string') {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
    }
    const imageRows = this.db.prepare(`SELECT output_index AS outputIndex,asset_id AS assetId,
      asset_revision_id AS assetRevisionId,mime FROM generation_image_output_v2
      WHERE operation_id=? ORDER BY output_index ASC`).all(bundle.operation.operationId.value) as
      Array<{ outputIndex: unknown; assetId: unknown; assetRevisionId: unknown; mime: unknown }>
    const images = Object.freeze(imageRows.map((row) => {
      if (!Number.isSafeInteger(row.outputIndex) || typeof row.assetId !== 'string' ||
          typeof row.assetRevisionId !== 'string' || typeof row.mime !== 'string') {
        throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
      }
      return Object.freeze({
        outputIndex: row.outputIndex as number,
        assetId: row.assetId,
        assetRevisionId: row.assetRevisionId,
        mime: row.mime,
      })
    }))
    return Object.freeze({
      binding: bindingOf(bundle),
      status: statusOf(bundle.operation.state),
      body: bodyRow.body,
      reasoning: freezeReasoning(this.#reasoning.list(bundle.operation.targetAnswerId.value)),
      images,
      lastSequence,
      errorFact: bundle.operation.errorFact,
      updatedAtMs: bundle.operation.updatedAtMs,
    })
  }

  #persistedPayload(
    projection: GenerationStreamProjectionV2,
  ): GenerationStreamPayloadV2 {
    if (projection.type === 'assistant_body') {
      const row = this.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(projection.answerRootId) as { body?: unknown } | undefined
      if (!row || row.body !== projection.content) {
        throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
      }
      return Object.freeze({ type: 'assistant_body', content: projection.content })
    }
    if (projection.type === 'reasoning_detail') {
      if (projection.persisted !== true) this.#reasoning.append(projection.answerRootId, projection.detail)
      return Object.freeze({ type: 'reasoning_detail', detail: Object.freeze({ ...projection.detail }) })
    }
    if (projection.type === 'image_output') {
      const row = this.db.prepare(`SELECT 1 AS present FROM generation_image_output_v2
        WHERE operation_id=? AND answer_root_id=? AND output_index=? AND asset_id=?
          AND asset_revision_id=? AND mime=?`).get(
        projection.operationId,
        projection.answerRootId,
        projection.outputIndex,
        projection.assetId,
        projection.assetRevisionId,
        projection.mime,
      ) as { present?: unknown } | undefined
      if (row?.present !== 1) {
        throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
      }
      return Object.freeze({
        type: 'image_output',
        outputIndex: projection.outputIndex,
        assetId: projection.assetId,
        assetRevisionId: projection.assetRevisionId,
        mime: projection.mime,
      })
    }
    const current = this.#execution.getOperation(projection.operationId)
    const expected = projection.state === 'awaiting_tool' ? 'streaming' : projection.state
    if (current.operation.state !== expected) {
      throw new GenerationOperationRuntimeRegistryV2Error('GENERATION_V2_RUNTIME_PROJECTION_NOT_PERSISTED')
    }
    return Object.freeze({
      type: 'terminal',
      state: projection.state,
      errorCode: projection.errorCode,
      errorMessage: projection.errorMessage,
      errorFact: projection.errorFact ?? current.operation.errorFact,
    })
  }

  #reduce(
    previous: GenerationOperationRuntimeSnapshotV2,
    payload: GenerationStreamPayloadV2,
    sequence: number,
  ): GenerationOperationRuntimeSnapshotV2 {
    const now = this.nowMs()
    if (payload.type === 'assistant_body') {
      return Object.freeze({ ...previous, body: payload.content, lastSequence: sequence, updatedAtMs: now })
    }
    if (payload.type === 'reasoning_detail') {
      return Object.freeze({
        ...previous,
        reasoning: Object.freeze([...previous.reasoning, payload.detail]),
        lastSequence: sequence,
        updatedAtMs: now,
      })
    }
    if (payload.type === 'image_output') {
      const images = previous.images.filter((image) => image.outputIndex !== payload.outputIndex)
      return Object.freeze({
        ...previous,
        images: Object.freeze([...images, Object.freeze({
          outputIndex: payload.outputIndex,
          assetId: payload.assetId,
          assetRevisionId: payload.assetRevisionId,
          mime: payload.mime,
        })].sort((left, right) => left.outputIndex - right.outputIndex)),
        lastSequence: sequence,
        updatedAtMs: now,
      })
    }
    return Object.freeze({
      ...previous,
      status: payload.state === 'awaiting_tool' ? 'generating' : payload.state,
      errorFact: payload.errorFact,
      lastSequence: sequence,
      updatedAtMs: now,
    })
  }
}
