import type BetterSqlite3 from 'better-sqlite3'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { GenerationOperationBindingV2 } from '../../src/next/generation-v2/domain/generationOperationBindingV2'
import type {
  GenerationOperationRuntimeSnapshotV2,
  GenerationStreamEventV2,
  GenerationStreamPayloadV2,
} from '../../src/next/generation-v2/domain/generationStreamEventV2'
import {
  GENERATION_OPERATION_RUNTIME_START_V2,
  type CoordinatedGenerationStreamProjectionSinkV2,
  type GenerationStreamProjectionV2,
} from './generationStreamProjectionV2'

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
    | 'GENERATION_V2_RUNTIME_CONVERSATION_QUIESCING'
    | 'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT'
    | 'GENERATION_V2_RUNTIME_PROJECT_QUIESCING'
    | 'GENERATION_V2_RUNTIME_PROJECT_ABORT_TIMEOUT') {
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
  readonly #quiescingConversations = new Set<string>()
  readonly #quiescingProjects = new Set<string>()

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly nowMs: () => number = Date.now,
  ) {
    this.#execution = new GenerationExecutionV2Repo(db, nowMs)
    this.#reasoning = new AnswerReasoningProjectionV2Repo(db, nowMs)
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
    return Object.freeze([...this.#entries.values()].map((entry) => entry.snapshot))
  }

  getSnapshot(operationId: string): GenerationOperationRuntimeSnapshotV2 | null {
    return this.#entries.get(operationId)?.snapshot ?? null
  }

  register(result: StartableGenerationResultV2): GenerationOperationRuntimeSnapshotV2 {
    const binding = bindingOf(result.execution)
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
      return existing.snapshot
    }
    const snapshot = this.#hydrate(result.execution, 0)
    this.#entries.set(binding.operationId, { snapshot, abort: null })
    return snapshot
  }

  start(
    result: StartableGenerationResultV2,
    run: (signal: AbortSignal) => Promise<unknown>,
  ): boolean {
    const snapshot = this.register(result)
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
        .catch((error) => this.#terminalizeUnhandledRunFailure(result, error))
        .finally(() => {
          const current = this.#entries.get(snapshot.binding.operationId)
          if (current?.abort) current.abort = null
        })
    })
    return true
  }

  #terminalizeUnhandledRunFailure(result: StartableGenerationResultV2, error: unknown): void {
    const operationId = result.execution.operation.operationId.value
    const current = this.#execution.findOperation(operationId)
    if (!current || ['completed', 'failed', 'cancelled'].includes(current.operation.state)) return
    const rawMessage = error instanceof Error ? error.message : String(error)
    const errorMessage = rawMessage.length > 0 && rawMessage.length <= 8_192 && !rawMessage.includes('\u0000')
      ? rawMessage
      : 'Generation runner failed before it could persist a terminal result.'
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
                  code: 'GENERATION_V2_RUNTIME_RUNNER_FAILED',
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
        errorCode: 'GENERATION_V2_RUNTIME_RUNNER_FAILED',
        errorMessage,
      }, at)
    })
    this.publishPersistedProjection(Object.freeze({
      type: 'terminal',
      operationId,
      answerRootId: current.operation.targetAnswerId.value,
      state: 'failed',
      errorCode: 'GENERATION_V2_RUNTIME_RUNNER_FAILED',
      errorMessage,
    }))
  }

  abort(operationId: string): boolean {
    return this.#entries.get(operationId)?.abort?.() ?? false
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
    timeoutCode: 'GENERATION_V2_RUNTIME_CONVERSATION_ABORT_TIMEOUT' |
      'GENERATION_V2_RUNTIME_PROJECT_ABORT_TIMEOUT',
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
        if (remaining.has(event.operationId) && event.payload.type === 'terminal' &&
            event.payload.state !== 'awaiting_tool') remaining.delete(event.operationId)
        if (remaining.size === 0) finish()
      })
      const timer = setTimeout(() => finish(new GenerationOperationRuntimeRegistryV2Error(timeoutCode)), timeoutMs)
      for (const operationId of remaining) this.abort(operationId)
      reconcile()
    })
  }

  publishPersistedProjection(projection: GenerationStreamProjectionV2): GenerationStreamEventV2 {
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
    for (const listener of this.#listeners) listener(event)
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
