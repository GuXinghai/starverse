import { createHash, randomUUID } from 'node:crypto'
import {
  ModelCatalogV2Repo,
  type ModelCatalogActiveSnapshotV2,
  type ModelCatalogScopeIdentityV2,
  type ModelCatalogStatusV2,
  type ModelCatalogStoredSnapshotV2,
} from '../../infra/db/repo/modelCatalogV2Repo'
import { stableSerializeProviderRequestBoundedV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
  type ProviderFailureV2Context,
} from '../../src/shared/provider/providerFailureV2'

export type CatalogScopeStateV2 = Readonly<{
  status: ModelCatalogStatusV2 | null
  active: ModelCatalogActiveSnapshotV2 | null
  pending: ModelCatalogStoredSnapshotV2 | null
}>

export type CatalogSyncAdapterResultV2 =
  | Readonly<{
      ok: true
      items: readonly Readonly<Record<string, unknown>>[]
      responseDigest?: string
      observedAtMs?: number
      visibleModelCount?: number
      hiddenModelCount?: number
      completeness?: 'complete' | 'incomplete'
    }>
  | Readonly<{ ok: false; providerFailure: ProviderFailureV2 }>

export type CatalogSyncResultV2 =
  | Readonly<{ ok: true; publication: 'active' | 'pending'; state: CatalogScopeStateV2 }>
  | Readonly<{
      ok: false
      providerFailure: ProviderFailureV2
      persistenceFailure?: ProviderFailureV2
      readFailure?: ProviderFailureV2
      state: CatalogScopeStateV2
    }>

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u
const EMPTY_SCOPE_STATE: CatalogScopeStateV2 = Object.freeze({ status: null, active: null, pending: null })

function responseDigest(items: readonly Readonly<Record<string, unknown>>[]): string {
  return createHash('sha256')
    .update(stableSerializeProviderRequestBoundedV2(items, 32 * 1024 * 1024), 'utf8')
    .digest('hex')
}

export class CatalogScopeCoordinatorV2 {
  readonly #inflight = new Map<string, Map<string, Promise<CatalogSyncResultV2>>>()
  readonly #scopeTails = new Map<string, Promise<CatalogSyncResultV2>>()

  constructor(
    private readonly repo: ModelCatalogV2Repo,
    private readonly nowMs: () => number = Date.now,
  ) {}

  read(scope: ModelCatalogScopeIdentityV2): CatalogScopeStateV2 {
    return Object.freeze({
      status: this.repo.readStatus(scope),
      active: this.repo.readActive(scope),
      pending: this.repo.readPending(scope),
    })
  }

  readSnapshot(scope: ModelCatalogScopeIdentityV2, snapshotDigest: string): ModelCatalogStoredSnapshotV2 | null {
    return this.repo.readSnapshot(scope, snapshotDigest)
  }

  #databaseFailure(error: unknown, context: ProviderFailureV2Context, diagnosticCode: string): ProviderFailureV2 {
    return providerFailureFromUnknownV2(error, {
      ...context,
      origin: 'database',
      phase: 'terminal_persistence',
      starverseDiagnosticCode: diagnosticCode,
    })
  }

  #failureResult(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    failureContext: ProviderFailureV2Context
    providerFailure: ProviderFailureV2
    persistenceFailure?: ProviderFailureV2
  }>): CatalogSyncResultV2 {
    try {
      return Object.freeze({
        ok: false,
        providerFailure: input.providerFailure,
        ...(input.persistenceFailure ? { persistenceFailure: input.persistenceFailure } : {}),
        state: this.read(input.scope),
      })
    } catch (error) {
      const readFailure = this.#databaseFailure(error, input.failureContext, 'MODEL_CATALOG_STATE_READ_FAILED')
      return Object.freeze({
        ok: false,
        providerFailure: input.providerFailure,
        ...(input.persistenceFailure ? { persistenceFailure: input.persistenceFailure } : {}),
        readFailure,
        state: EMPTY_SCOPE_STATE,
      })
    }
  }

  sync(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    applyMode: 'automatic' | 'manual'
    retentionMs: number | 'never'
    failureContext: ProviderFailureV2Context
    execute: (signal: AbortSignal) => Promise<CatalogSyncAdapterResultV2>
    timeoutMs: number
    adapterRevision?: string
  }>): Promise<CatalogSyncResultV2> {
    const scopeKey = stableSerializeProviderRequestBoundedV2(input.scope, 4_096)
    const adapterRevision = String(input.adapterRevision ?? 'catalog-adapter-v1').trim()
    const semanticKey = stableSerializeProviderRequestBoundedV2({
      scope: input.scope,
      applyMode: input.applyMode,
      retentionMs: input.retentionMs,
      timeoutMs: input.timeoutMs,
      adapterRevision,
    }, 8_192)
    let scopeInflight = this.#inflight.get(scopeKey)
    if (!scopeInflight) {
      scopeInflight = new Map()
      this.#inflight.set(scopeKey, scopeInflight)
    }
    const existing = scopeInflight.get(semanticKey)
    if (existing) return existing

    const predecessor = this.#scopeTails.get(scopeKey)
    const pending = (predecessor ? predecessor.catch(() => undefined) : Promise.resolve())
      .then(() => this.#syncOnce({ ...input, adapterRevision }))
    scopeInflight.set(semanticKey, pending)
    this.#scopeTails.set(scopeKey, pending)
    void pending.finally(() => {
      const currentInflight = this.#inflight.get(scopeKey)
      if (currentInflight?.get(semanticKey) === pending) currentInflight.delete(semanticKey)
      if (currentInflight?.size === 0) this.#inflight.delete(scopeKey)
      if (this.#scopeTails.get(scopeKey) === pending) this.#scopeTails.delete(scopeKey)
    }).catch(() => undefined)
    return pending
  }

  async #syncOnce(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    applyMode: 'automatic' | 'manual'
    retentionMs: number | 'never'
    failureContext: ProviderFailureV2Context
    execute: (signal: AbortSignal) => Promise<CatalogSyncAdapterResultV2>
    timeoutMs: number
    adapterRevision: string
  }>): Promise<CatalogSyncResultV2> {
    const attemptId = randomUUID()
    try {
      this.repo.beginSync(input.scope, attemptId)
    } catch (error) {
      const providerFailure = this.#databaseFailure(error, input.failureContext, 'MODEL_CATALOG_SYNC_BEGIN_FAILED')
      return this.#failureResult({ scope: input.scope, failureContext: input.failureContext, providerFailure })
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('catalog_sync_timeout'), input.timeoutMs)
    try {
      const result = await input.execute(controller.signal)
      if (!result.ok) {
        try {
          this.repo.failSync(input.scope, attemptId, result.providerFailure)
        } catch (error) {
          const persistenceFailure = this.#databaseFailure(
            error,
            input.failureContext,
            'MODEL_CATALOG_FAILURE_PERSIST_FAILED',
          )
          return this.#failureResult({ scope: input.scope, failureContext: input.failureContext,
            providerFailure: result.providerFailure, persistenceFailure })
        }
        return this.#failureResult({ scope: input.scope, failureContext: input.failureContext,
          providerFailure: result.providerFailure })
      }
      if (result.completeness === 'incomplete') {
        const providerFailure = providerFailureFromUnknownV2(new Error('MODEL_CATALOG_SNAPSHOT_INCOMPLETE'), {
          ...input.failureContext,
          origin: 'response_decoder',
          phase: 'response_body',
          starverseDiagnosticCode: 'MODEL_CATALOG_SNAPSHOT_INCOMPLETE',
        })
        try {
          this.repo.failSync(input.scope, attemptId, providerFailure)
        } catch (error) {
          const persistenceFailure = this.#databaseFailure(error, input.failureContext,
            'MODEL_CATALOG_FAILURE_PERSIST_FAILED')
          return this.#failureResult({ scope: input.scope, failureContext: input.failureContext,
            providerFailure, persistenceFailure })
        }
        return this.#failureResult({ scope: input.scope, failureContext: input.failureContext, providerFailure })
      }
      const digest = DIGEST_PATTERN.test(result.responseDigest ?? '')
        ? result.responseDigest!
        : responseDigest(result.items)
      try {
        this.repo.commitSync({
          scope: input.scope,
          attemptId,
          responseDigest: digest,
          observedAtMs: Number.isSafeInteger(result.observedAtMs) && result.observedAtMs! >= 0
            ? result.observedAtMs!
            : this.nowMs(),
          items: result.items,
          ...(result.visibleModelCount === undefined ? {} : { visibleModelCount: result.visibleModelCount }),
          ...(result.hiddenModelCount === undefined ? {} : { hiddenModelCount: result.hiddenModelCount }),
          applyMode: input.applyMode,
          codecVersion: 1,
          completeness: 'complete',
          adapterRevision: input.adapterRevision,
          ...(typeof input.retentionMs === 'number'
            ? { retentionCutoffMs: Math.max(0, this.nowMs() - input.retentionMs) }
            : {}),
        })
      } catch (error) {
        const providerFailure = this.#databaseFailure(error, input.failureContext, 'MODEL_CATALOG_PUBLICATION_FAILED')
        try { this.repo.failSync(input.scope, attemptId, providerFailure) } catch { /* preserve the publication failure */ }
        return this.#failureResult({ scope: input.scope, failureContext: input.failureContext, providerFailure })
      }
      let state: CatalogScopeStateV2
      try {
        state = this.read(input.scope)
      } catch (error) {
        const providerFailure = this.#databaseFailure(error, input.failureContext, 'MODEL_CATALOG_STATE_READ_FAILED')
        return Object.freeze({ ok: false, providerFailure, readFailure: providerFailure, state: EMPTY_SCOPE_STATE })
      }
      return Object.freeze({
        ok: true,
        publication: input.applyMode === 'manual' && state.pending ? 'pending' : 'active',
        state,
      })
    } catch (error) {
      const providerFailure = providerFailureFromUnknownV2(error, input.failureContext)
      try { this.repo.failSync(input.scope, attemptId, providerFailure) } catch { /* a newer attempt owns this scope */ }
      return this.#failureResult({ scope: input.scope, failureContext: input.failureContext, providerFailure })
    } finally {
      clearTimeout(timer)
    }
  }

  applyPending(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    expectedSnapshotDigest: string
  }>): CatalogScopeStateV2 {
    this.repo.applyPendingSnapshot(input.scope, input.expectedSnapshotDigest)
    return this.read(input.scope)
  }

  discardPending(input: Readonly<{
    scope: ModelCatalogScopeIdentityV2
    expectedSnapshotDigest: string
  }>): CatalogScopeStateV2 {
    this.repo.discardPendingSnapshot(input.scope, input.expectedSnapshotDigest)
    return this.read(input.scope)
  }
}

export function catalogSyncFailureResultV2(failure: ProviderFailureV2, state: CatalogScopeStateV2) {
  return Object.freeze({
    ok: false,
    code: failure.starverseDiagnosticCode,
    message: providerFailurePrimaryMessageV2(failure),
    providerFailure: failure,
    state,
  })
}
