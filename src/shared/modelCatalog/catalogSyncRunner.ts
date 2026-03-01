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
  fixedTtlMs: number
  readMeta: (providerKey: string) => Promise<CatalogSyncRunnerMeta | null>
  runSync: () => Promise<CatalogSyncRunnerSyncResult>
  onSyncSuccess?: (result: Readonly<{ snapshotId: string; modelCount: number }>) => Promise<void> | void
  now?: () => number
  logger?: RunnerLogger
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
  reason:
    | 'cache_fresh'
    | 'synced'
    | 'sync_failed_with_cache'
    | 'sync_failed_no_cache'
    | 'missing_api_key_with_cache'
    | 'missing_api_key_no_cache'
  source: 'models_user_primary' | 'models_fallback' | 'mixed' | 'none'
  modelCountBefore: number
  modelCountAfter: number
  syncSnapshotId?: string
  failureMessage?: string
}>

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isSyncSkipped(
  result: CatalogSyncRunnerSyncResult
): result is Readonly<{ ok: false; skipped: true; reason: 'missing_api_key' }> {
  return result.ok === false
}

export class CatalogSyncRunner {
  private providerKey: string
  private expectedSchemaVersion: number
  private fixedTtlMs: number
  private readMeta: (providerKey: string) => Promise<CatalogSyncRunnerMeta | null>
  private runSync: () => Promise<CatalogSyncRunnerSyncResult>
  private onSyncSuccess?: (result: Readonly<{ snapshotId: string; modelCount: number }>) => Promise<void> | void
  private now: () => number
  private logger: RunnerLogger

  constructor(input: CatalogSyncRunnerInput) {
    this.providerKey = input.providerKey
    this.expectedSchemaVersion = input.expectedSchemaVersion
    this.fixedTtlMs = Math.max(0, input.fixedTtlMs)
    this.readMeta = input.readMeta
    this.runSync = input.runSync
    this.onSyncSuccess = input.onSyncSuccess
    this.now = input.now ?? Date.now
    this.logger = input.logger ?? console
  }

  async run(): Promise<CatalogSyncRunnerResult> {
    const startedAtMs = this.now()
    let meta: CatalogSyncRunnerMeta | null = null
    try {
      meta = await this.readMeta(this.providerKey)
    } catch (error) {
      this.logger.warn('[CatalogSyncRunner] readMeta failed, proceed as no-cache', {
        providerKey: this.providerKey,
        error: toErrorMessage(error),
      })
      meta = null
    }

    const modelCountBefore = Number(meta?.modelCount ?? 0)
    const hadCache = modelCountBefore > 0
    const source = meta?.dataSource ?? 'none'
    const schemaMismatch = meta != null && meta.schemaVersion !== this.expectedSchemaVersion
    const ttlExpired =
      meta == null
        ? true
        : this.fixedTtlMs === 0
          ? true
          : this.now() - Number(meta.lastSyncAtMs ?? 0) >= this.fixedTtlMs
    const staleCache = hadCache && (schemaMismatch || ttlExpired)

    const shouldSync = !hadCache || staleCache
    if (!shouldSync) {
      const finishedAtMs = this.now()
      return {
        providerKey: this.providerKey,
        startedAtMs,
        finishedAtMs,
        durationMs: finishedAtMs - startedAtMs,
        hadCache,
        staleCache: false,
        syncAttempted: false,
        syncSucceeded: false,
        usedCacheFallback: false,
        reason: 'cache_fresh',
        source,
        modelCountBefore,
        modelCountAfter: modelCountBefore,
      }
    }

    try {
      const sync = await this.runSync()
      if (isSyncSkipped(sync)) {
        const finishedAtMs = this.now()
        const reason = hadCache ? 'missing_api_key_with_cache' : 'missing_api_key_no_cache'
        this.logger.warn('[CatalogSyncRunner] sync skipped', {
          providerKey: this.providerKey,
          reason: sync.reason,
          hadCache,
          staleCache,
          modelCountBefore,
        })
        return {
          providerKey: this.providerKey,
          startedAtMs,
          finishedAtMs,
          durationMs: finishedAtMs - startedAtMs,
          hadCache,
          staleCache,
          syncAttempted: true,
          syncSucceeded: false,
          usedCacheFallback: hadCache,
          reason,
          source,
          modelCountBefore,
          modelCountAfter: modelCountBefore,
          failureMessage: sync.reason,
        }
      }

      await this.onSyncSuccess?.({
        snapshotId: sync.snapshotId,
        modelCount: sync.modelCount,
      })

      const finishedAtMs = this.now()
      this.logger.info('[CatalogSyncRunner] sync completed', {
        providerKey: this.providerKey,
        staleCache,
        modelCountBefore,
        modelCountAfter: sync.modelCount,
        durationMs: finishedAtMs - startedAtMs,
      })
      return {
        providerKey: this.providerKey,
        startedAtMs,
        finishedAtMs,
        durationMs: finishedAtMs - startedAtMs,
        hadCache,
        staleCache,
        syncAttempted: true,
        syncSucceeded: true,
        usedCacheFallback: false,
        reason: 'synced',
        source,
        modelCountBefore,
        modelCountAfter: sync.modelCount,
        syncSnapshotId: sync.snapshotId,
      }
    } catch (error) {
      const finishedAtMs = this.now()
      const failureMessage = toErrorMessage(error)
      const reason = hadCache ? 'sync_failed_with_cache' : 'sync_failed_no_cache'
      this.logger.warn('[CatalogSyncRunner] sync failed', {
        providerKey: this.providerKey,
        hadCache,
        staleCache,
        modelCountBefore,
        error: failureMessage,
      })
      return {
        providerKey: this.providerKey,
        startedAtMs,
        finishedAtMs,
        durationMs: finishedAtMs - startedAtMs,
        hadCache,
        staleCache,
        syncAttempted: true,
        syncSucceeded: false,
        usedCacheFallback: hadCache,
        reason,
        source,
        modelCountBefore,
        modelCountAfter: modelCountBefore,
        failureMessage,
      }
    }
  }
}
