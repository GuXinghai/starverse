import {
  createProviderFailureV2,
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '../provider/providerFailureV2'
import type { CatalogPolicyV2 } from './catalogPolicyV2'

export type CatalogSyncRunnerMeta = Readonly<{
  providerKey: string
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  lastSyncAtMs: number
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
}>

export type CatalogSyncRunnerSyncResult =
  | Readonly<{ ok: true; snapshotId: string; modelCount: number }>
  | Readonly<{ ok: false; skipped: true; reason: 'missing_api_key' }>

type RunnerLogger = Pick<Console, 'info' | 'warn' | 'error'>

export type CatalogSyncRunnerInput = Readonly<{
  providerKey: string
  expectedSchemaVersion: number
  /** Deprecated compatibility input. New callers pass resolvedPolicy. */
  fixedTtlMs?: number
  resolvedPolicy?: CatalogPolicyV2 | null
  trigger?: 'startup' | 'picker_open' | 'manual'
  contractId?: string
  operationId?: string
  requestSequence?: number
  readMeta: (providerKey: string) => Promise<CatalogSyncRunnerMeta | null>
  runSync: () => Promise<CatalogSyncRunnerSyncResult>
  onSyncSuccess?: (result: Readonly<{ snapshotId: string; modelCount: number }>) => Promise<void> | void
  now?: () => number
  logger?: RunnerLogger
  force?: boolean
  proceedOnMetaReadFailure?: boolean
}>

export type CatalogSyncRunnerResult = Readonly<{
  providerKey: string
  startedAtMs: number
  finishedAtMs: number
  durationMs: number
  hadCache: boolean
  staleCache: boolean
  syncAttempted: boolean
  syncSucceeded: boolean
  usedCacheFallback: boolean
  force: boolean
  reason:
    | 'cache_fresh'
    | 'unconfigured_with_cache'
    | 'unconfigured_no_cache'
    | 'policy_never_with_cache'
    | 'policy_never_no_cache'
    | 'synced'
    | 'sync_failed_with_cache'
    | 'sync_failed_no_cache'
    | 'missing_api_key_with_cache'
    | 'missing_api_key_no_cache'
  source: 'models_user_primary' | 'models_fallback' | 'mixed' | 'none'
  modelCountBefore: number
  modelCountAfter: number
  lastSyncAtMs: number
  syncSnapshotId?: string
  failureMessage?: string
  providerFailure?: ProviderFailureV2
}>

function isSyncSkipped(
  result: CatalogSyncRunnerSyncResult,
): result is Readonly<{ ok: false; skipped: true; reason: 'missing_api_key' }> {
  return result.ok === false
}

export class CatalogSyncRunner {
  private readonly providerKey: string
  private readonly expectedSchemaVersion: number
  private readonly fixedTtlMs: number | undefined
  private readonly resolvedPolicy: CatalogPolicyV2 | null | undefined
  private readonly trigger: 'startup' | 'picker_open' | 'manual'
  private readonly contractId: string
  private readonly operationId: string
  private readonly requestSequence: number
  private readonly readMeta: (providerKey: string) => Promise<CatalogSyncRunnerMeta | null>
  private readonly runSync: () => Promise<CatalogSyncRunnerSyncResult>
  private readonly onSyncSuccess?: (result: Readonly<{ snapshotId: string; modelCount: number }>) => Promise<void> | void
  private readonly now: () => number
  private readonly logger: RunnerLogger
  private readonly force: boolean
  private readonly proceedOnMetaReadFailure: boolean

  constructor(input: CatalogSyncRunnerInput) {
    this.providerKey = input.providerKey
    this.expectedSchemaVersion = input.expectedSchemaVersion
    this.fixedTtlMs = input.fixedTtlMs === undefined ? undefined : Math.max(0, input.fixedTtlMs)
    this.resolvedPolicy = input.resolvedPolicy
    this.trigger = input.trigger ?? (input.force === true ? 'manual' : 'startup')
    this.contractId = input.contractId ?? 'catalog-sync-v2'
    this.operationId = input.operationId ?? `catalog-sync:${this.providerKey}`
    this.requestSequence = input.requestSequence ?? 1
    this.readMeta = input.readMeta
    this.runSync = input.runSync
    this.onSyncSuccess = input.onSyncSuccess
    this.now = input.now ?? Date.now
    this.logger = input.logger ?? console
    this.force = input.force === true
    this.proceedOnMetaReadFailure = input.proceedOnMetaReadFailure !== false
  }

  async run(): Promise<CatalogSyncRunnerResult> {
    const startedAtMs = this.now()
    let meta: CatalogSyncRunnerMeta | null = null
    try {
      meta = await this.readMeta(this.providerKey)
    } catch (error) {
      if (!this.proceedOnMetaReadFailure) throw error
      this.logger.warn('[CatalogSyncRunner] readMeta failed, proceed as no-cache', {
        providerKey: this.providerKey,
        diagnosticCode: 'CATALOG_META_READ_FAILED',
      })
    }

    const modelCountBefore = Number(meta?.modelCount ?? 0)
    const hasMeta = meta != null
    const hadCache = modelCountBefore > 0 || Boolean(meta?.snapshotId)
    const source = meta?.dataSource ?? 'none'
    const schemaMismatch = meta != null && meta.schemaVersion !== this.expectedSchemaVersion
    const syncStateMismatch = meta != null && meta.syncState !== 'ok'
    const legacyTtlExpired = meta == null || this.fixedTtlMs === undefined || this.fixedTtlMs === 0
      ? meta == null || this.fixedTtlMs !== undefined
      : this.now() - Number(meta.lastSyncAtMs ?? 0) >= this.fixedTtlMs
    const freshnessMs = this.resolvedPolicy?.freshnessMs ?? this.fixedTtlMs ?? null
    const staleByFreshness = meta == null || freshnessMs === null
      ? meta == null
      : this.now() - Number(meta.lastSyncAtMs ?? 0) >= freshnessMs
    const staleCache = hasMeta && (syncStateMismatch || schemaMismatch || staleByFreshness || legacyTtlExpired)
    const unconfigured = this.resolvedPolicy === null || (this.resolvedPolicy === undefined && this.fixedTtlMs === undefined)
    const automaticPolicy = unconfigured
      ? 'never'
      : this.resolvedPolicy === undefined
        ? 'stale_only'
      : this.trigger === 'startup'
        ? this.resolvedPolicy.startupSyncPolicy
        : this.trigger === 'picker_open'
          ? this.resolvedPolicy.pickerOpenSyncPolicy
          : 'always'
    const shouldSync = this.force || this.trigger === 'manual' || automaticPolicy === 'always' ||
      (automaticPolicy === 'stale_only' && (!hasMeta || staleCache))

    if (!shouldSync) {
      const finishedAtMs = this.now()
      const reason = automaticPolicy === 'never'
        ? unconfigured
          ? (hadCache ? 'unconfigured_with_cache' : 'unconfigured_no_cache')
          : (hadCache ? 'policy_never_with_cache' : 'policy_never_no_cache')
        : 'cache_fresh'
      return {
        providerKey: this.providerKey, startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs,
        hadCache, staleCache: false, syncAttempted: false, syncSucceeded: false, usedCacheFallback: false,
        force: this.force, reason, source, modelCountBefore, modelCountAfter: modelCountBefore,
        lastSyncAtMs: Number(meta?.lastSyncAtMs ?? 0),
      }
    }

    try {
      const sync = await this.runSync()
      if (isSyncSkipped(sync)) {
        const finishedAtMs = this.now()
        const reason = hadCache ? 'missing_api_key_with_cache' : 'missing_api_key_no_cache'
        const providerFailure = createProviderFailureV2({
          context: {
            origin: 'starverse_internal', phase: 'request_open', providerId: this.providerKey,
            contractId: this.contractId, operationId: this.operationId, requestSequence: this.requestSequence,
          },
        })
        this.logger.warn('[CatalogSyncRunner] sync skipped', { providerKey: this.providerKey, reason: sync.reason, hadCache, staleCache })
        return {
          providerKey: this.providerKey, startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs,
          hadCache, staleCache, syncAttempted: true, syncSucceeded: false, usedCacheFallback: hadCache,
          force: this.force, reason, source, modelCountBefore, modelCountAfter: modelCountBefore,
          lastSyncAtMs: Number(meta?.lastSyncAtMs ?? 0), failureMessage: providerFailure.starverseDiagnosticCode,
          providerFailure,
        }
      }

      await this.onSyncSuccess?.({ snapshotId: sync.snapshotId, modelCount: sync.modelCount })
      const finishedAtMs = this.now()
      this.logger.info('[CatalogSyncRunner] sync completed', {
        providerKey: this.providerKey, staleCache, modelCountBefore, modelCountAfter: sync.modelCount,
        durationMs: finishedAtMs - startedAtMs,
      })
      return {
        providerKey: this.providerKey, startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs,
        hadCache, staleCache, syncAttempted: true, syncSucceeded: true, usedCacheFallback: false,
        force: this.force, reason: 'synced', source, modelCountBefore, modelCountAfter: sync.modelCount,
        lastSyncAtMs: finishedAtMs, syncSnapshotId: sync.snapshotId,
      }
    } catch (error) {
      const finishedAtMs = this.now()
      const providerFailure = providerFailureFromUnknownV2(error, {
        origin: 'network_transport', phase: 'response_body', providerId: this.providerKey,
        contractId: this.contractId, operationId: this.operationId, requestSequence: this.requestSequence,
      })
      const reason = hadCache ? 'sync_failed_with_cache' : 'sync_failed_no_cache'
      this.logger.warn('[CatalogSyncRunner] sync failed', {
        providerKey: this.providerKey, hadCache, staleCache, modelCountBefore,
        diagnosticCode: providerFailure.starverseDiagnosticCode, httpStatus: providerFailure.httpStatus,
      })
      return {
        providerKey: this.providerKey, startedAtMs, finishedAtMs, durationMs: finishedAtMs - startedAtMs,
        hadCache, staleCache, syncAttempted: true, syncSucceeded: false, usedCacheFallback: hadCache,
        force: this.force, reason, source, modelCountBefore, modelCountAfter: modelCountBefore,
        lastSyncAtMs: Number(meta?.lastSyncAtMs ?? 0), failureMessage: providerFailurePrimaryMessageV2(providerFailure),
        providerFailure,
      }
    }
  }
}
