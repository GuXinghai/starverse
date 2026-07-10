import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { parentPort } from 'node:worker_threads'
import BetterSqlite3 from 'better-sqlite3'
import { DB_SCHEMA_VERSION } from '../schemaVersion'
import { ProjectRepo } from '../repo/projectRepo'
import { ConvoRepo } from '../repo/convoRepo'
import { MessageRepo } from '../repo/messageRepo'
import { MessageErrorRepo } from '../repo/messageErrorRepo'
import { MessageAssetRepo } from '../repo/messageAssetRepo'
import { FileAssetRepo } from '../repo/fileAssetRepo'
import { FileAssetStoreRepo } from '../repo/fileAssetStoreRepo'
import { FileDerivativeRepo } from '../repo/fileDerivativeRepo'
import { DerivativeJobRepo } from '../repo/derivativeJobRepo'
import { DfcOptionGenerationStateRepo } from '../repo/dfcOptionGenerationStateRepo'
import { FileTypeVerdictRepo } from '../repo/fileTypeVerdictRepo'
import { EnginePluginRegistryRepo } from '../repo/enginePluginRegistryRepo'
import { MessageAttachmentRepo } from '../repo/messageAttachmentRepo'
import { ConversationDraftRepo } from '../repo/conversationDraftRepo'
import { BranchRepo } from '../repo/branchRepo'
import { ContextRepo } from '../repo/contextRepo'
import { SearchRepo } from '../repo/searchRepo'
import { UsageRepo } from '../repo/usageRepo'
import { DashboardPrefRepo } from '../repo/dashboardPrefRepo'
import { ModelPreferencesRepo } from '../repo/modelPreferencesRepo'
import { ModelCatalogRepo } from '../repo/modelCatalogRepo'
import { ReasoningModelIndexRepo } from '../repo/reasoningModelIndexRepo'
import { SettingsRepo } from '../repo/settingsRepo'
import { ProviderFileUploadCacheRepo } from '../repo/providerFileUploadCacheRepo'
import { ensureBranchingSchema } from '../migrations/ensureBranchingSchema'
import { ensureSearchSchema } from '../migrations/ensureSearchSchema'
import { ensureFilePipelineSchema } from '../migrations/ensureFilePipelineSchema'
import { ensureP4C1DerivedKindSchema } from '../migrations/ensureP4C1DerivedKindSchema'
import { ensureEnginePluginRegistrySchema } from '../migrations/ensureEnginePluginRegistrySchema'
import { ensureProviderFileUploadCacheSchema } from '../migrations/ensureProviderFileUploadCacheSchema'
import { ConversationAttachmentService } from '../../files/conversationAttachmentService'
import { DerivativeJobService } from '../../files/derivativeJobService'
import { FileIngestionService } from '../../files/fileIngestionService'
import { SendPlanService } from '../../files/sendPlanService'
import { FileTypeDetectionService } from '../../files/fileTypeDetectionService'
import { FileTypeDetectionCoordinator } from '../../files/fileTypeDetectionCoordinator'
import { EnginePluginLifecycleService } from '../../files/enginePluginLifecycleService'
import { createDfcLibreOfficeOfficialAssetBodyInterceptFromEnv } from '../../files/dfcLibreOfficeOfficialAssetBodyIntercept'
import { fetchPackageToFileWithFetch, type PackageDownloadTransport } from '../../../src/next/plugin-distribution/packageDownloader'
import { createElectronBridgeHttpFetch } from '../../files/electronConversionBridge'
import {
  getDfcLibreOfficeManagedRuntimeRoot,
  type DfcOfficePdfRuntimeAvailabilitySummary,
} from '../../files/dfcManagedLibreOfficeRuntime'
import { getActiveTrustedRoots } from '../../../src/next/file-type/officialPluginTrustedRoots'
import {
  createManagedPluginMagikaRuntimeLoader,
  createMagikaClassifyCallback,
  type BuildMagikaManagedRuntimeLoaderInput,
} from '../../../src/next/file-type/magikaManagedPlugin'
import type { MagikaRuntimeLoader } from '../../../src/next/file-type/magikaRuntimeLoader'
import {
  type WorkerInitConfig,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
  type DbEvent,
  type WorkerEventMessage,
  type SearchDocInput,
  type EnginePluginRegistryRecord,
} from '../types'
import { DbWorkerError } from '../errors'
import { configureLogging, logSlowQuery } from '../logger'
import { createWorkerHandlerContainer } from './container'
import { dispatchWorkerMessage, type WorkerHandlerMap } from './router'

type SqlDatabase = BetterSqlite3.Database

export type MagikaRuntimeRegistryRecord = Pick<
  EnginePluginRegistryRecord,
  'engineId' | 'enabled' | 'installState' | 'installRootKind' | 'installRef'
>
type CreateManagedMagikaRuntimeLoader = (input: BuildMagikaManagedRuntimeLoaderInput) => MagikaRuntimeLoader

function resolveEnginePluginDir(storageRootDir: string, installRootKind: string, installRef: string): string {
  const safeRef = installRef.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return path.join(storageRootDir, 'engine-plugins', installRootKind, safeRef)
}

export function collectActiveMagikaRuntimePluginDirs(input: {
  storageRootDir: string
  registryRecords: readonly MagikaRuntimeRegistryRecord[]
}): string[] {
  const activeMagika = input.registryRecords.find(
    (record) => record.engineId === 'magika' && record.enabled === true && record.installState === 'installed'
  )
  if (!activeMagika) return []
  return [resolveEnginePluginDir(input.storageRootDir, activeMagika.installRootKind, activeMagika.installRef)]
}

export function createElectronSystemAwareOfficialPackageTransport(
  bridge: WorkerInitConfig['electronConversionBridge']
): PackageDownloadTransport {
  return {
    async fetchPackage(request) {
      if (bridge?.fetchProvider) {
        const fetchImpl = createElectronBridgeHttpFetch(bridge)
        let response: Response
        try {
          response = await fetchImpl(request.transportRef, { signal: request.signal })
        } catch (error) {
          return {
            ok: false,
            code: request.signal?.aborted ? 'cancelled' : 'download_failed',
            detail: request.signal?.aborted ? 'download cancelled' : sanitizeElectronBridgeDownloadError(error),
          }
        }
        if (!response.ok) return { ok: false, code: 'download_failed', detail: `http_${response.status}`, finalRef: response.url }
        const contentLength = Number(response.headers.get('content-length') ?? NaN)
        if (Number.isFinite(contentLength) && contentLength > request.maxBytes) {
          return { ok: false, code: 'too_large', finalRef: response.url }
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > request.maxBytes) return { ok: false, code: 'too_large', finalRef: response.url }
        return { ok: true, bytes, finalRef: response.url }
      }
      return {
        ok: false,
        code: 'download_failed',
        detail: 'electron_package_download_service_unavailable',
      }
    },
    async fetchPackageToFile(request) {
      if (bridge?.fetchPackageToFile) {
        return bridge.fetchPackageToFile(request)
      }
      if (request.proxy?.proxyMode === 'system') {
        return {
          ok: false,
          code: 'download_failed',
          detail: 'electron_package_download_service_unavailable',
        }
      }
      return fetchPackageToFileWithFetch(request)
    },
  }
}

function sanitizeElectronBridgeDownloadError(error: unknown): string {
  const code = String((error as any)?.code ?? (error as any)?.message ?? '').trim()
  if (/timeout|timedout|etimedout|abort/iu.test(code)) return 'download_body_timeout'
  if (/econnreset|socket|network|closed|interrupted/iu.test(code)) return 'network_transport_failed'
  return 'download_failed'
}

function createElectronBridgeFetchIfAvailable(
  bridge: WorkerInitConfig['electronConversionBridge'],
  timeoutMs?: number
): typeof fetch | undefined {
  return bridge?.fetchProvider
    ? createElectronBridgeHttpFetch(bridge, { timeoutMs })
    : undefined
}

export function createRegistryGatedMagikaRuntimeLoader(input: Readonly<{
  storageRootDir: string
  listRegistryRecords: () => readonly MagikaRuntimeRegistryRecord[]
  classify: NonNullable<BuildMagikaManagedRuntimeLoaderInput['classify']>
  createManagedLoader?: CreateManagedMagikaRuntimeLoader
}>): MagikaRuntimeLoader {
  const createManagedLoader = input.createManagedLoader ?? createManagedPluginMagikaRuntimeLoader
  return {
    load: () => {
      const pluginDirs = collectActiveMagikaRuntimePluginDirs({
        storageRootDir: input.storageRootDir,
        registryRecords: input.listRegistryRecords(),
      })
      return createManagedLoader({
        pluginDirs,
        classify: input.classify,
      }).load()
    },
  }
}

const debugDbOps = process.env.SV_DEBUG_DB_OPS === '1'
const enableBranchInvariants = process.env.SV_BRANCH_INVARIANTS === '1'
const dbgDb = (label: string, data?: unknown) => {
  if (!debugDbOps) return
  if (data !== undefined) console.log(`[db][dbg] ${label}`, data)
  else console.log(`[db][dbg] ${label}`)
}

function requireNonToolHead(db: SqlDatabase, headMessageId: string, context: Record<string, unknown>) {
  const id = String(headMessageId ?? '').trim()
  if (!id) return
  const row = db.prepare(`SELECT role FROM message WHERE id=@id LIMIT 1`).get({ id }) as any
  const role = String(row?.role ?? '').trim()
  if (role === 'tool') {
    throw new DbWorkerError('ERR_INTERNAL', 'INVARIANT: branch head must not be tool after switch', { headMessageId: id, ...context })
  }
}

function requireHeadEquals(db: SqlDatabase, branchId: string, expectedHeadMessageId: string, context: Record<string, unknown>) {
  const bid = String(branchId ?? '').trim()
  const expected = String(expectedHeadMessageId ?? '').trim()
  if (!bid || !expected) return
  const row = db.prepare(`SELECT head_message_id AS head FROM branch WHERE id=@branchId LIMIT 1`).get({ branchId: bid }) as any
  const actual = row?.head ? String(row.head) : ''
  if (actual !== expected) {
    throw new DbWorkerError('ERR_INTERNAL', 'INVARIANT: branch head mismatch after switch', {
      branchId: bid,
      expectedHeadMessageId: expected,
      actualHeadMessageId: actual,
      ...context,
    })
  }
}

const defaultSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')

export class DbWorkerRuntime {
  readonly db: SqlDatabase
  readonly projectRepo: ProjectRepo
  readonly convoRepo: ConvoRepo
  readonly messageRepo: MessageRepo
  readonly messageErrorRepo: MessageErrorRepo
  readonly messageAssetRepo: MessageAssetRepo
  readonly fileAssetRepo: FileAssetRepo
  readonly fileAssetStoreRepo: FileAssetStoreRepo
  readonly fileDerivativeRepo: FileDerivativeRepo
  readonly derivativeJobRepo: DerivativeJobRepo
  readonly dfcOptionGenerationStateRepo: DfcOptionGenerationStateRepo
  readonly fileTypeVerdictRepo: FileTypeVerdictRepo
  readonly enginePluginRegistryRepo: EnginePluginRegistryRepo
  readonly messageAttachmentRepo: MessageAttachmentRepo
  readonly conversationDraftRepo: ConversationDraftRepo
  readonly conversationAttachmentService: ConversationAttachmentService
  readonly derivativeJobService: DerivativeJobService
  readonly fileIngestionService: FileIngestionService
  readonly fileTypeDetectionService: FileTypeDetectionService
  readonly fileTypeDetectionCoordinator: FileTypeDetectionCoordinator
  readonly enginePluginLifecycleService: EnginePluginLifecycleService
  readonly sendPlanService: SendPlanService
  readonly fileStorageRootDir: string
  readonly branchRepo: BranchRepo
  readonly contextRepo: ContextRepo
  readonly searchRepo: SearchRepo
  readonly usageRepo: UsageRepo
  readonly dashboardPrefRepo: DashboardPrefRepo
  readonly modelPreferencesRepo: ModelPreferencesRepo
  readonly modelCatalogRepo: ModelCatalogRepo
  readonly reasoningModelIndexRepo: ReasoningModelIndexRepo
  readonly settingsRepo: SettingsRepo
  readonly providerFileUploadCacheRepo: ProviderFileUploadCacheRepo
  readonly officePdfRuntimeSummary?: () => DfcOfficePdfRuntimeAvailabilitySummary | null
  private handlers: WorkerHandlerMap = new Map()
  inboxId: string = ''
  private activityThrottle = new Map<string, { timer: ReturnType<typeof setTimeout>; updatedAt: number }>()
  private activityThrottleMs = 200

  // Runtime construction wires all repos and migration guards in one place.
  // Splitting this constructor is out of scope for the file pipeline phases.
  // eslint-disable-next-line max-lines-per-function, max-statements
  constructor(config: WorkerInitConfig) {
    console.log('[DbWorkerRuntime] 开始初始化, config:', config)
    this.officePdfRuntimeSummary = config.officePdfRuntimeSummary
    
    if (!config.dbPath) {
      throw new DbWorkerError('ERR_INTERNAL', 'dbPath missing for worker initialization')
    }

    console.log('[DbWorkerRuntime] 创建数据库目录:', path.dirname(config.dbPath))
    mkdirSync(path.dirname(config.dbPath), { recursive: true })
    const schemaPath = config.schemaPath ?? defaultSchemaPath
    console.log('[DbWorkerRuntime] Schema 路径:', schemaPath)

    console.log('[DbWorkerRuntime] 打开数据库:', config.dbPath)
    this.db = new BetterSqlite3(config.dbPath)
    console.log('[DbWorkerRuntime] 应用 Pragmas...')
    this.applyPragmas()
    console.log('[DbWorkerRuntime] 执行 Schema...')
    this.db.exec(readFileSync(schemaPath, 'utf8'))
    console.log('[DbWorkerRuntime] 确保 Usage Log Schema...')
    this.ensureUsageLogSchema()
    console.log('[DbWorkerRuntime] 确保 Reasoning Schema...')
    this.ensureReasoningSchema()
    console.log('[DbWorkerRuntime] 确保 Provider Native Content Schema...')
    this.ensureProviderNativeContentSchema()
    console.log('[DbWorkerRuntime] 确保 Message Error Schema...')
    this.ensureMessageErrorSchema()
    console.log('[DbWorkerRuntime] 确保 Message Asset Schema...')
    this.ensureMessageAssetSchema()
    console.log('[DbWorkerRuntime] 确保 File Pipeline Schema...')
    ensureFilePipelineSchema(this.db)
    console.log('[DbWorkerRuntime] 确保 P4-C1 Derived Kind Schema...')
    ensureP4C1DerivedKindSchema(this.db)
    console.log('[DbWorkerRuntime] 确保 Engine Plugin Registry Schema...')
    ensureEnginePluginRegistrySchema(this.db)
    console.log('[DbWorkerRuntime] 确保 Provider File Upload Cache Schema...')
    ensureProviderFileUploadCacheSchema(this.db)
    console.log('[DbWorkerRuntime] 确保 Model Catalog Schema...')
    this.ensureModelCatalogSchema()
    console.log('[DbWorkerRuntime] 确保 Scoped Model Catalog Schema...')
    this.ensureScopedModelCatalogSchema()
    console.log('[DbWorkerRuntime] 确保 Reasoning Model Index Schema...')
    this.ensureReasoningModelIndexSchema()
    console.log('[DbWorkerRuntime] 确保 Branching Schema...')
    ensureBranchingSchema(this.db)
    console.log('[DbWorkerRuntime] 确保 Search Schema...')
    ensureSearchSchema(this.db)
    console.log('[DbWorkerRuntime] 确保 Project System Columns and Index...')
    this.ensureProjectSystemColumnsAndIndex()
    console.log('[DbWorkerRuntime] 确保 Convo Project Activity Index...')
    this.ensureConvoProjectActivityIndex()
    console.log('[DbWorkerRuntime] 确保 Core Indexes...')
    this.ensureCoreIndexes()
    if (config.stampSchemaVersion === true) {
      this.stampSchemaVersion()
      console.log('[DbWorkerRuntime] schema version stamped', {
        schemaVersion: DB_SCHEMA_VERSION,
        startupRebuildReason: config.startupRebuildReason ?? 'unspecified',
      })
    } else {
      console.log('[DbWorkerRuntime] schema version stamp skipped for existing database')
    }
    console.log('[DbWorkerRuntime] 确保 Inbox Project Data...')
    this.ensureInboxProjectData()

    if (config.logSlowQueryMs || config.logDirectory) {
      configureLogging({ slowQueryMs: config.logSlowQueryMs, directory: config.logDirectory })
    }

    this.db.pragma('busy_timeout = 5000')
    const profileFn = (this.db as any).profile as ((cb: (sql: string, ms: number) => void) => void) | undefined
    if (typeof profileFn === 'function') {
      profileFn.call(this.db, (sql: string, ms: number) => logSlowQuery(sql, ms))
    }

    this.projectRepo = new ProjectRepo(this.db)
    this.convoRepo = new ConvoRepo(this.db)
    this.messageRepo = new MessageRepo(this.db)
    this.messageErrorRepo = new MessageErrorRepo(this.db)
    this.messageAssetRepo = new MessageAssetRepo(this.db, path.join(path.dirname(config.dbPath), 'assets', 'images'))
    this.fileStorageRootDir = path.dirname(config.dbPath)
    this.fileAssetRepo = new FileAssetRepo(this.db)
    this.fileAssetStoreRepo = new FileAssetStoreRepo(this.db)
    this.fileDerivativeRepo = new FileDerivativeRepo(this.db)
    this.derivativeJobRepo = new DerivativeJobRepo(this.db)
    this.dfcOptionGenerationStateRepo = new DfcOptionGenerationStateRepo(this.db)
    this.fileTypeVerdictRepo = new FileTypeVerdictRepo(this.db)
    this.enginePluginRegistryRepo = new EnginePluginRegistryRepo(this.db)
    this.messageAttachmentRepo = new MessageAttachmentRepo(this.db)
    this.conversationDraftRepo = new ConversationDraftRepo(this.db)
    this.settingsRepo = new SettingsRepo(this.db)
    this.providerFileUploadCacheRepo = new ProviderFileUploadCacheRepo(this.db)
    this.branchRepo = new BranchRepo(this.db)
    this.conversationAttachmentService = new ConversationAttachmentService({
      db: this.db,
      fileAssetRepo: this.fileAssetRepo,
      fileAssetStoreRepo: this.fileAssetStoreRepo,
      messageRepo: this.messageRepo,
      messageAttachmentRepo: this.messageAttachmentRepo,
      branchRepo: this.branchRepo,
      draftRepo: this.conversationDraftRepo,
      storageRootDir: this.fileStorageRootDir,
    })
    this.sendPlanService = new SendPlanService({
      conversationAttachmentService: this.conversationAttachmentService,
      fileAssetRepo: this.fileAssetRepo,
      fileDerivativeRepo: this.fileDerivativeRepo,
      fileTypeVerdictRepo: this.fileTypeVerdictRepo,
    })
    this.fileIngestionService = new FileIngestionService({
      fileAssetRepo: this.fileAssetRepo,
      fileAssetStoreRepo: this.fileAssetStoreRepo,
      storageRootDir: this.fileStorageRootDir,
      fetch: createElectronBridgeFetchIfAvailable(config.electronConversionBridge),
    })
    const magikaRuntimeLoader = this.buildMagikaRuntimeLoader()
    this.fileTypeDetectionService = new FileTypeDetectionService({
      db: this.db,
      fileAssetRepo: this.fileAssetRepo,
      fileTypeVerdictRepo: this.fileTypeVerdictRepo,
      storageRootDir: this.fileStorageRootDir,
      magikaRuntimeLoader,
    })
    this.fileTypeDetectionCoordinator = new FileTypeDetectionCoordinator({
      fileTypeVerdictRepo: this.fileTypeVerdictRepo,
      enginePluginRegistryRepo: this.enginePluginRegistryRepo,
      fileTypeDetectionService: this.fileTypeDetectionService,
      magikaRuntimeLoader,
    })
    const activeTrustedRoots = getActiveTrustedRoots(undefined, {
      isProduction: config.isProduction,
      includeEmbeddedOfficialRoot: true,
    })
    const officialPackageTransport = createDfcLibreOfficeOfficialAssetBodyInterceptFromEnv() ??
      createElectronSystemAwareOfficialPackageTransport(config.electronConversionBridge)
    this.enginePluginLifecycleService = new EnginePluginLifecycleService({
      registryRepo: this.enginePluginRegistryRepo,
      trustedRoots: activeTrustedRoots.ok ? activeTrustedRoots.trustedRoots : {},
      trustedRootSource: activeTrustedRoots.ok ? activeTrustedRoots.source : null,
      resolveInstallPluginDir: ({ installRootKind, installRef }) => {
        const safeRef = installRef.replace(/[^a-zA-Z0-9._-]+/g, '_')
        return path.join(this.fileStorageRootDir, 'engine-plugins', installRootKind, safeRef)
      },
      dfcLibreOfficeAppManagedRootDir: this.fileStorageRootDir,
      dfcLibreOfficeManagedRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(this.fileStorageRootDir),
      officialPackageTransport,
      networkProxySettingsProvider: () => this.settingsRepo.getNetworkProxySettings(),
      officialDownloadProbeFetch: createElectronBridgeFetchIfAvailable(config.electronConversionBridge, 15_000),
    })
    this.contextRepo = new ContextRepo(this.db, this.branchRepo)
    this.searchRepo = new SearchRepo(this.db)
    this.usageRepo = new UsageRepo(this.db)
    this.dashboardPrefRepo = new DashboardPrefRepo(this.db)
    this.modelPreferencesRepo = new ModelPreferencesRepo(this.db)
    this.modelCatalogRepo = new ModelCatalogRepo(this.db)
    this.derivativeJobService = new DerivativeJobService({
      db: this.db,
      fileAssetRepo: this.fileAssetRepo,
      fileDerivativeRepo: this.fileDerivativeRepo,
      derivativeJobRepo: this.derivativeJobRepo,
      modelCatalogRepo: this.modelCatalogRepo,
      storageRootDir: this.fileStorageRootDir,
      electronConversionBridge: config.electronConversionBridge,
      officePdfProcessRunner: config.officePdfProcessRunner,
      officePdfRuntimeSummary: config.officePdfRuntimeSummary,
    })
    this.reasoningModelIndexRepo = new ReasoningModelIndexRepo(this.db)
    this.handlers = createWorkerHandlerContainer(this).handlers
  }

  private buildMagikaRuntimeLoader() {
    return createRegistryGatedMagikaRuntimeLoader({
      storageRootDir: this.fileStorageRootDir,
      listRegistryRecords: () => this.enginePluginRegistryRepo.list({ includeUninstalled: true }),
      classify: async ({ probe, descriptor }) => {
        const classifyCb = createMagikaClassifyCallback(descriptor)
        return classifyCb({ probe, descriptor })
      },
    })
  }

  private applyPragmas() {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 268435456')
    this.db.pragma('cache_size = -20000')
  }

  /**
   * 确保 usage_log 表包含最新的统计字段
   *
   * 早期版本的数据库可能缺少 tokens_cached / tokens_reasoning / cost / ttft_ms / meta 等列，
   * 这里通过 PRAGMA table_info 检测并按需执行 ALTER TABLE 进行增列，以避免 SQLite "no such column"
   * 错误导致 Worker 启动失败。
   */
  private ensureUsageLogSchema() {
    const tableRow = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_log'")
      .get() as { name?: string } | undefined

    if (!tableRow) {
      return
    }

    const columns = this.db.prepare('PRAGMA table_info(usage_log)').all() as { name: string }[]
    const columnNames = new Set(columns.map((col) => col.name))

    const addColumn = (name: string, definition: string) => {
      if (!columnNames.has(name)) {
        this.db.exec(`ALTER TABLE usage_log ADD COLUMN ${definition}`)
        columnNames.add(name)
      }
    }

    addColumn('tokens_cached', 'tokens_cached INTEGER DEFAULT 0')
    addColumn('tokens_reasoning', 'tokens_reasoning INTEGER DEFAULT 0')
    addColumn('cost', 'cost REAL DEFAULT 0.0')
    addColumn('request_id', 'request_id TEXT')
    addColumn('attempt', 'attempt INTEGER DEFAULT 1')
    addColumn('ttft_ms', 'ttft_ms INTEGER')
    addColumn('error_code', 'error_code TEXT')
    addColumn('meta', 'meta TEXT')
    // NOTE: Indexes are created by ensureCoreIndexes() for consistency
  }

  private ensureReasoningSchema() {
    const tableRow = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message'")
      .get() as { name?: string } | undefined

    if (!tableRow) {
      return
    }

    const columns = this.db.prepare('PRAGMA table_info(message)').all() as { name: string }[]
    const columnNames = new Set(columns.map((col) => col.name))

    const addColumn = (name: string, definition: string) => {
      if (!columnNames.has(name)) {
        this.db.exec(`ALTER TABLE message ADD COLUMN ${definition}`)
        columnNames.add(name)
      }
    }

    addColumn('reasoning_details_final_json', 'reasoning_details_final_json TEXT')
    addColumn('request_reasoning_config_json', 'request_reasoning_config_json TEXT')
    addColumn('annotations_json', 'annotations_json TEXT')
    addColumn('reasoning_duration_ms', 'reasoning_duration_ms INTEGER')
    addColumn('reasoning_end_reason', 'reasoning_end_reason TEXT')
    addColumn('reasoning_duration_is_fallback', 'reasoning_duration_is_fallback INTEGER DEFAULT 0')
    addColumn('reasoning_segments_count', 'reasoning_segments_count INTEGER DEFAULT 0')
    addColumn('reasoning_last_segment_id', 'reasoning_last_segment_id INTEGER')
    addColumn('reasoning_details_final_sha256', 'reasoning_details_final_sha256 TEXT')
    addColumn('reasoning_details_final_bytes', 'reasoning_details_final_bytes INTEGER')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_reasoning_detail_segments (
        segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        detail_id TEXT,
        format TEXT,
        detail_index INTEGER,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        delta_text TEXT,
        delta_data TEXT,
        delta_summary TEXT,
        created_at INTEGER NOT NULL,
        segment_fingerprint TEXT
      )
    `)

    // Ensure segment_fingerprint column exists for existing tables
    const segmentCols = this.db.prepare('PRAGMA table_info(message_reasoning_detail_segments)').all() as { name: string }[]
    const segmentColNames = new Set(segmentCols.map((col) => col.name))
    if (!segmentColNames.has('segment_fingerprint')) {
      this.db.exec('ALTER TABLE message_reasoning_detail_segments ADD COLUMN segment_fingerprint TEXT')
    }

    this.ensureReasoningDisplayBlocksHardCutover()

    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_message ON message_reasoning_detail_segments(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_message_order ON message_reasoning_detail_segments(message_id, segment_id)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_group ON message_reasoning_detail_segments(message_id, detail_id, detail_index, type, format, segment_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_reasoning_segment_fingerprint ON message_reasoning_detail_segments(message_id, segment_fingerprint)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_display_blocks_message_ordinal ON message_reasoning_display_blocks(message_id, ordinal)'
    ]
    for (const sql of indexStatements) {
      this.db.exec(sql)
    }

    // Backfill segment_fingerprint for historical rows (idempotent, batch processing)
    this.backfillSegmentFingerprints()
  }

  private createReasoningDisplayBlocksTable(tableName = 'message_reasoning_display_blocks') {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        block_id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        block_type TEXT NOT NULL CHECK (block_type IN ('text', 'image', 'opaque')),
        text TEXT,
        semantic_role TEXT CHECK (
          semantic_role IS NULL OR semantic_role IN ('summary', 'reasoning', 'thinking', 'thought')
        ),
        asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
        file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
        url TEXT,
        mime TEXT,
        width INTEGER,
        height INTEGER,
        alt TEXT,
        label TEXT,
        warning TEXT,
        provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
        source_event_type TEXT,
        source_raw_segment_id INTEGER REFERENCES message_reasoning_detail_segments(segment_id) ON DELETE SET NULL,
        payload_json TEXT,
        created_at INTEGER NOT NULL,
        final_at INTEGER,
        segment_fingerprint TEXT,
        UNIQUE (message_id, ordinal),
        UNIQUE (message_id, segment_fingerprint)
      )
    `)
  }

  private ensureReasoningDisplayBlocksHardCutover() {
    const tableExists = !!this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_reasoning_display_blocks'")
      .get()

    if (!tableExists) {
      this.createReasoningDisplayBlocksTable()
      this.setReasoningDisplayBlocksSchemaVersion()
      return
    }

    if (this.reasoningDisplayBlocksSchemaVersion() === 2 && this.reasoningDisplayBlocksSchemaMatchesExpected()) {
      return
    }

    this.db.exec('DROP TABLE IF EXISTS message_reasoning_display_blocks')
    this.createReasoningDisplayBlocksTable()
    this.setReasoningDisplayBlocksSchemaVersion()
  }

  private reasoningDisplayBlocksSchemaVersion(): number | null {
    const row = this.db.prepare("SELECT value_json FROM settings_kv WHERE key = 'reasoning_display_blocks_schema_version'").get() as
      | { value_json?: string }
      | undefined
    if (!row?.value_json) return null
    try {
      const parsed = JSON.parse(row.value_json)
      return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  private setReasoningDisplayBlocksSchemaVersion() {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO settings_kv(key, value_json, created_at_ms, updated_at_ms)
      VALUES ('reasoning_display_blocks_schema_version', '2', @now, @now)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at_ms = excluded.updated_at_ms
    `).run({ now })
  }

  private reasoningDisplayBlocksSchemaMatchesExpected(): boolean {
    const columns = this.db.prepare('PRAGMA table_info(message_reasoning_display_blocks)').all() as Array<{
      name: string
      notnull: number
    }>
    const columnNames = new Set(columns.map((col) => col.name))
    const requiredColumns = [
      'block_id',
      'message_id',
      'ordinal',
      'block_type',
      'asset_id',
      'file_asset_id',
      'provider_key',
      'source_raw_segment_id',
      'final_at',
      'segment_fingerprint',
    ]
    const providerKey = columns.find((col) => col.name === 'provider_key')
    const foreignKeys = this.db.prepare('PRAGMA foreign_key_list(message_reasoning_display_blocks)').all() as Array<{
      from: string
      table: string
      to: string
      on_delete: string
    }>
    const hasForeignKey = (from: string, table: string, to: string, onDelete: string) =>
      foreignKeys.some((fk) =>
        fk.from === from &&
        fk.table === table &&
        fk.to === to &&
        fk.on_delete.toUpperCase() === onDelete
      )

    if (requiredColumns.some((column) => !columnNames.has(column))) return false
    if (providerKey?.notnull !== 1) return false
    if (!hasForeignKey('asset_id', 'asset', 'id', 'SET NULL')) return false
    if (!hasForeignKey('file_asset_id', 'file_assets', 'id', 'SET NULL')) return false
    if (!hasForeignKey('source_raw_segment_id', 'message_reasoning_detail_segments', 'segment_id', 'SET NULL')) return false

    const uniqueIndexes = this.db.prepare('PRAGMA index_list(message_reasoning_display_blocks)').all() as Array<{
      name: string
      unique: number
    }>
    const uniqueColumnGroups = uniqueIndexes
      .filter((index) => index.unique === 1)
      .map((index) => {
        const escapedName = index.name.replace(/"/g, '""')
        return (this.db.prepare(`PRAGMA index_info("${escapedName}")`).all() as Array<{ name: string }>)
          .map((column) => column.name)
      })
    const hasUnique = (columns: string[]) => uniqueColumnGroups.some((group) =>
      group.length === columns.length && group.every((column, index) => column === columns[index])
    )

    return hasUnique(['message_id', 'ordinal']) && hasUnique(['message_id', 'segment_fingerprint'])
  }

  private ensureProviderNativeContentSchema() {
    const exists = !!this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_provider_native_contents'")
      .get()
    if (!exists) {
      this.createProviderNativeContentTable()
      return
    }
    if (!this.providerNativeContentSchemaMatchesExpected()) {
      this.recreateProviderNativeContentTable()
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_provider_native_contents_message
        ON message_provider_native_contents(message_id);
    `)
  }

  private createProviderNativeContentTable(tableName = 'message_provider_native_contents') {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
        source_api TEXT NOT NULL CHECK (length(source_api) > 0),
        snapshot_key TEXT NOT NULL CHECK (length(snapshot_key) > 0),
        candidate_index INTEGER CHECK (candidate_index IS NULL OR candidate_index >= 0),
        status TEXT NOT NULL CHECK (status IN ('streaming', 'final', 'error', 'cancelled')),
        content_json TEXT NOT NULL,
        role TEXT,
        finish_reason TEXT,
        stop_reason TEXT,
        stop_sequence TEXT,
        usage_json TEXT,
        model TEXT,
        model_version TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, provider_key, source_api, snapshot_key)
      );
    `)
  }

  private providerNativeContentSchemaMatchesExpected(): boolean {
    const columns = this.db.prepare('PRAGMA table_info(message_provider_native_contents)').all() as Array<{
      name: string
      notnull: number
    }>
    const columnNames = new Set(columns.map((column) => column.name))
    const required = [
      'message_id',
      'provider_key',
      'source_api',
      'snapshot_key',
      'candidate_index',
      'status',
      'content_json',
      'role',
      'finish_reason',
      'stop_reason',
      'stop_sequence',
      'usage_json',
      'model',
      'model_version',
      'created_at',
      'updated_at',
    ]
    if (required.some((name) => !columnNames.has(name))) return false
    const snapshotKey = columns.find((column) => column.name === 'snapshot_key')
    if (snapshotKey?.notnull !== 1) return false
    const indexList = this.db.prepare('PRAGMA index_list(message_provider_native_contents)').all() as Array<{
      name: string
      unique: number
    }>
    const uniqueColumnGroups = indexList
      .filter((index) => index.unique === 1)
      .map((index) => {
        const escaped = index.name.replace(/"/g, '""')
        return (this.db.prepare(`PRAGMA index_info("${escaped}")`).all() as Array<{ name: string }>)
          .map((column) => column.name)
      })
    return uniqueColumnGroups.some((group) =>
      group.length === 4 &&
      group[0] === 'message_id' &&
      group[1] === 'provider_key' &&
      group[2] === 'source_api' &&
      group[3] === 'snapshot_key'
    )
  }

  private recreateProviderNativeContentTable() {
    const oldColumns = this.db.prepare('PRAGMA table_info(message_provider_native_contents)').all() as Array<{ name: string }>
    const oldColumnNames = new Set(oldColumns.map((column) => column.name))
    const tempName = 'message_provider_native_contents_new'
    this.db.exec(`DROP TABLE IF EXISTS ${tempName}`)
    this.createProviderNativeContentTable(tempName)

    const selectExpr = (column: string, fallback: string) =>
      oldColumnNames.has(column) ? column : fallback
    const candidateSnapshotExpr = oldColumnNames.has('candidate_index')
      ? "CASE WHEN candidate_index IS NOT NULL THEN 'candidate:' || candidate_index ELSE 'snapshot' END"
      : "'snapshot'"
    const snapshotKeyExpr = oldColumnNames.has('snapshot_key')
      ? `COALESCE(NULLIF(snapshot_key, ''), ${candidateSnapshotExpr})`
      : candidateSnapshotExpr
    const candidateIndexExpr = selectExpr('candidate_index', 'NULL')
    const usageExpr = oldColumnNames.has('usage_json')
      ? 'usage_json'
      : selectExpr('usage_metadata_json', 'NULL')

    this.db.exec(`
      INSERT OR REPLACE INTO ${tempName} (
        message_id,
        provider_key,
        source_api,
        snapshot_key,
        candidate_index,
        status,
        content_json,
        role,
        finish_reason,
        stop_reason,
        stop_sequence,
        usage_json,
        model,
        model_version,
        created_at,
        updated_at
      )
      SELECT
        message_id,
        provider_key,
        source_api,
        ${snapshotKeyExpr},
        ${candidateIndexExpr},
        status,
        content_json,
        ${selectExpr('role', 'NULL')},
        ${selectExpr('finish_reason', 'NULL')},
        ${selectExpr('stop_reason', 'NULL')},
        ${selectExpr('stop_sequence', 'NULL')},
        ${usageExpr},
        ${selectExpr('model', 'NULL')},
        ${selectExpr('model_version', 'NULL')},
        created_at,
        updated_at
      FROM message_provider_native_contents
      WHERE message_id IS NOT NULL
        AND provider_key IS NOT NULL
        AND source_api IS NOT NULL
        AND status IN ('streaming', 'final', 'error', 'cancelled')
        AND content_json IS NOT NULL
    `)
    this.db.exec(`
      DROP TABLE message_provider_native_contents;
      ALTER TABLE ${tempName} RENAME TO message_provider_native_contents;
      CREATE INDEX IF NOT EXISTS idx_provider_native_contents_message
        ON message_provider_native_contents(message_id);
    `)
  }

  private ensureMessageErrorSchema() {
    const tableRow = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'message_error'")
      .get() as { name?: string } | undefined

    if (!tableRow) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS message_error (
          message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
          envelope_json TEXT NOT NULL,
          envelope_bytes INTEGER NOT NULL,
          is_truncated INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)
      return
    }

    const columns = this.db.prepare('PRAGMA table_info(message_error)').all() as { name: string }[]
    const columnNames = new Set(columns.map((col) => col.name))

    const addColumn = (name: string, definition: string) => {
      if (!columnNames.has(name)) {
        this.db.exec(`ALTER TABLE message_error ADD COLUMN ${definition}`)
        columnNames.add(name)
      }
    }

    addColumn('envelope_json', 'envelope_json TEXT')
    addColumn('envelope_bytes', 'envelope_bytes INTEGER NOT NULL DEFAULT 0')
    addColumn('is_truncated', 'is_truncated INTEGER NOT NULL DEFAULT 0')
    addColumn('created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
    addColumn('updated_at', 'updated_at INTEGER NOT NULL DEFAULT 0')
  }

  private ensureMessageAssetSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS asset (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        mime TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        bytes INTEGER NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_asset (
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, ordinal)
      )
    `)

    const ensureColumns = (tableName: string, columns: ReadonlyArray<Readonly<{ name: string; definition: string }>>) => {
      const existing = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
      const columnNames = new Set(existing.map((col) => col.name))
      for (const column of columns) {
        if (columnNames.has(column.name)) continue
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.definition}`)
        columnNames.add(column.name)
      }
    }

    ensureColumns('asset', [
      { name: 'hash', definition: 'hash TEXT' },
      { name: 'mime', definition: 'mime TEXT' },
      { name: 'width', definition: 'width INTEGER' },
      { name: 'height', definition: 'height INTEGER' },
      { name: 'bytes', definition: 'bytes INTEGER NOT NULL DEFAULT 0' },
      { name: 'path', definition: 'path TEXT' },
      { name: 'created_at', definition: 'created_at INTEGER NOT NULL DEFAULT 0' },
      { name: 'updated_at', definition: 'updated_at INTEGER NOT NULL DEFAULT 0' },
    ])
    ensureColumns('message_asset', [
      { name: 'asset_id', definition: 'asset_id TEXT' },
      { name: 'ordinal', definition: 'ordinal INTEGER NOT NULL DEFAULT 0' },
      { name: 'created_at', definition: 'created_at INTEGER NOT NULL DEFAULT 0' },
    ])
  }

  /**
   * 确保 model_catalog 表存在且包含新字段
   *
   * 避免旧库缺表/缺列导致 list/sync 时 SQLITE_ERROR。
   */
  private ensureModelCatalogSchema() {
    const tableRow = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'model_catalog'")
      .get() as { name?: string } | undefined

    if (!tableRow) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_catalog (
          model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
          router_source TEXT NOT NULL,
          vendor TEXT NOT NULL,
          name TEXT NOT NULL CHECK (length(name) > 0),
          description TEXT,
          context_length INTEGER NOT NULL DEFAULT -1,
          supported_parameters_json TEXT,
          raw_json TEXT,
          last_seen_snapshot_id TEXT,
          is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        )
      `)
      return
    }

    const columns = this.db.prepare('PRAGMA table_info(model_catalog)').all() as { name: string }[]
    const columnNames = new Set(columns.map((col) => col.name))

    const addColumn = (name: string, definition: string) => {
      if (!columnNames.has(name)) {
        this.db.exec(`ALTER TABLE model_catalog ADD COLUMN ${definition}`)
        columnNames.add(name)
      }
    }

    addColumn('router_source', 'router_source TEXT')
    addColumn('vendor', 'vendor TEXT')
    addColumn('name', 'name TEXT')
    addColumn('description', 'description TEXT')
    addColumn('context_length', 'context_length INTEGER DEFAULT -1')
    addColumn('supported_parameters_json', 'supported_parameters_json TEXT')
    addColumn('raw_json', 'raw_json TEXT')
    addColumn('last_seen_snapshot_id', 'last_seen_snapshot_id TEXT')
    addColumn('is_hidden', 'is_hidden INTEGER NOT NULL DEFAULT 0')
    addColumn('created_at_ms', 'created_at_ms INTEGER NOT NULL DEFAULT 0')
    addColumn('updated_at_ms', 'updated_at_ms INTEGER NOT NULL DEFAULT 0')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS endpoint_meta (
        provider_key TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model_id TEXT NOT NULL CHECK (length(model_id) > 0),
        endpoint_key TEXT NOT NULL CHECK (length(endpoint_key) > 0),
        provider_name TEXT,
        tag TEXT,
        quantization TEXT,
        context_length INTEGER,
        max_completion_tokens INTEGER,
        max_prompt_tokens INTEGER,
        supported_parameters_json TEXT,
        supports_implicit_caching INTEGER CHECK (supports_implicit_caching IN (0, 1)),
        status INTEGER,
        raw_json TEXT,
        fetched_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (provider_key, base_url, model_id, endpoint_key),
        FOREIGN KEY(provider_key, model_id) REFERENCES models(provider_key, model_id) ON DELETE CASCADE
      )
    `)
    this.ensureModelCatalogFtsPrefixSchema()
  }

  private ensureModelCatalogFtsPrefixSchema() {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'models_fts'")
      .get() as { sql?: string } | undefined
    const sql = String(row?.sql ?? '').toLowerCase()
    const hasExpectedPrefixIndex = /prefix\s*=\s*'?1 2 3 4'?/.test(sql)
    if (hasExpectedPrefixIndex && !sql.includes('model_id unindexed')) return

    this.db.transaction(() => {
      this.db.exec(`
        DROP TRIGGER IF EXISTS trg_models_fts_ai;
        DROP TRIGGER IF EXISTS trg_models_fts_au;
        DROP TRIGGER IF EXISTS trg_models_fts_ad;
        DROP TABLE IF EXISTS models_fts;

        CREATE VIRTUAL TABLE models_fts USING fts5(
          provider_key UNINDEXED,
          model_id,
          display_name,
          canonical_slug,
          description,
          tokenize = 'unicode61',
          prefix = '1 2 3 4'
        );

        CREATE TRIGGER trg_models_fts_ai
        AFTER INSERT ON models
        BEGIN
          INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
          VALUES (
            new.rowid,
            new.provider_key,
            new.model_id,
            coalesce(new.display_name, ''),
            coalesce(new.canonical_slug, ''),
            coalesce(new.description, '')
          );
        END;

        CREATE TRIGGER trg_models_fts_au
        AFTER UPDATE OF provider_key, model_id, display_name, canonical_slug, description ON models
        BEGIN
          DELETE FROM models_fts WHERE rowid = old.rowid;
          INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
          VALUES (
            new.rowid,
            new.provider_key,
            new.model_id,
            coalesce(new.display_name, ''),
            coalesce(new.canonical_slug, ''),
            coalesce(new.description, '')
          );
        END;

        CREATE TRIGGER trg_models_fts_ad
        AFTER DELETE ON models
        BEGIN
          DELETE FROM models_fts WHERE rowid = old.rowid;
        END;

        INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
        SELECT
          rowid,
          provider_key,
          model_id,
          coalesce(display_name, ''),
          coalesce(canonical_slug, ''),
          coalesce(description, '')
        FROM models;
      `)
    })()
  }

  private ensureScopedModelCatalogSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catalog_scope_meta (
        provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
        catalog_scope_key TEXT NOT NULL CHECK (length(catalog_scope_key) > 0),
        base_url TEXT NOT NULL,
        data_source TEXT NOT NULL CHECK (data_source IN ('models_user_primary', 'models_fallback', 'mixed')),
        active_snapshot_id TEXT,
        sync_state TEXT NOT NULL CHECK (sync_state IN ('idle', 'syncing', 'ok', 'error')),
        last_sync_at_ms INTEGER NOT NULL DEFAULT 0,
        last_used_at_ms INTEGER NOT NULL DEFAULT 0,
        model_count INTEGER NOT NULL DEFAULT 0,
        visible_model_count INTEGER NOT NULL DEFAULT 0,
        hidden_model_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        last_error_message TEXT,
        last_validated_at_ms INTEGER,
        last_repair_attempt_at_ms INTEGER,
        repair_attempt_count INTEGER NOT NULL DEFAULT 0,
        snapshot_checksum TEXT,
        schema_version INTEGER NOT NULL,
        PRIMARY KEY(provider_key, catalog_scope_key)
      );

      CREATE TABLE IF NOT EXISTS catalog_models (
        provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
        catalog_scope_key TEXT NOT NULL CHECK (length(catalog_scope_key) > 0),
        snapshot_id TEXT NOT NULL CHECK (length(snapshot_id) > 0),
        model_id TEXT NOT NULL CHECK (length(model_id) > 0),
        model_key TEXT NOT NULL CHECK (length(model_key) > 0),
        canonical_slug TEXT,
        display_name TEXT NOT NULL CHECK (length(display_name) > 0),
        description TEXT,
        vendor TEXT,
        family TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived')),
        visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden')),
        context_length INTEGER,
        max_output_tokens INTEGER,
        input_modalities_json TEXT NOT NULL DEFAULT '[]',
        output_modalities_json TEXT NOT NULL DEFAULT '[]',
        supported_parameters_json TEXT NOT NULL DEFAULT '[]',
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        pricing_json TEXT,
        raw_json TEXT,
        created_at_sec INTEGER,
        first_seen_at_ms INTEGER NOT NULL,
        last_seen_at_ms INTEGER NOT NULL,
        synced_at_ms INTEGER NOT NULL,
        PRIMARY KEY(provider_key, catalog_scope_key, snapshot_id, model_id),
        FOREIGN KEY(provider_key, catalog_scope_key)
          REFERENCES catalog_scope_meta(provider_key, catalog_scope_key)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_scope_meta_state
        ON catalog_scope_meta(provider_key, sync_state, last_sync_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_catalog_scope_meta_used
        ON catalog_scope_meta(provider_key, last_used_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_catalog_models_active_lookup
        ON catalog_models(provider_key, catalog_scope_key, snapshot_id, visibility, status, display_name COLLATE NOCASE, model_id);
      CREATE INDEX IF NOT EXISTS idx_catalog_models_model_lookup
        ON catalog_models(provider_key, catalog_scope_key, model_id);
    `)
  }

  /**
   * 确保 reasoning_model_index 表存在且包含新字段
   *
   * 避免旧库缺表/缺列导致 list/sync 时 SQLITE_ERROR。
   */
  private ensureReasoningModelIndexSchema() {
    const tableRow = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reasoning_model_index'")
      .get() as { name?: string } | undefined

    if (!tableRow) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reasoning_model_index (
          model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
          name TEXT NOT NULL CHECK (length(name) > 0),
          status TEXT NOT NULL CHECK (status IN ('visible', 'hidden')),
          last_synced_snapshot TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        )
      `)
      return
    }

    const columns = this.db.prepare('PRAGMA table_info(reasoning_model_index)').all() as { name: string }[]
    const columnNames = new Set(columns.map((col) => col.name))

    const addColumn = (name: string, definition: string) => {
      if (!columnNames.has(name)) {
        this.db.exec(`ALTER TABLE reasoning_model_index ADD COLUMN ${definition}`)
        columnNames.add(name)
      }
    }

    addColumn('name', 'name TEXT')
    addColumn('status', "status TEXT NOT NULL DEFAULT 'visible'")
    addColumn('last_synced_snapshot', "last_synced_snapshot TEXT NOT NULL DEFAULT ''")
    addColumn('created_at_ms', 'created_at_ms INTEGER NOT NULL DEFAULT 0')
    addColumn('updated_at_ms', 'updated_at_ms INTEGER NOT NULL DEFAULT 0')
  }

  private backfillSegmentFingerprints() {
    const BATCH_SIZE = 500
    let totalBackfilled = 0

    const selectStmt = this.db.prepare(`
      SELECT segment_id, payload
      FROM message_reasoning_detail_segments
      WHERE segment_fingerprint IS NULL
      LIMIT @limit
    `)

    const updateStmt = this.db.prepare(`
      UPDATE message_reasoning_detail_segments
      SET segment_fingerprint = @fingerprint
      WHERE segment_id = @segmentId AND segment_fingerprint IS NULL
    `)

    while (true) {
      const rows = selectStmt.all({ limit: BATCH_SIZE }) as { segment_id: number; payload: string }[]
      if (rows.length === 0) break

      const txn = this.db.transaction(() => {
        for (const row of rows) {
          const fingerprint = createHash('sha256').update(row.payload).digest('hex')
          updateStmt.run({ segmentId: row.segment_id, fingerprint })
        }
      })
      txn()

      totalBackfilled += rows.length
      if (rows.length < BATCH_SIZE) break
    }

    if (totalBackfilled > 0) {
      console.log(`[DbWorkerRuntime] Backfilled segment_fingerprint for ${totalBackfilled} historical rows`)
    }
  }

  /**
   * 确保 project 表有 is_system/system_key 列，并创建 UNIQUE 索引
   * 
   * 调用顺序：在 ensureBranchingSchema 之后，ensureConvoProjectActivityIndex 之前
   */
  private ensureProjectSystemColumnsAndIndex() {
    const cols = this.db.pragma('table_info(project)') as { name: string }[]
    const colNames = new Set(cols.map(c => c.name))
    
    if (!colNames.has('is_system')) {
      this.db.exec('ALTER TABLE project ADD COLUMN is_system INTEGER DEFAULT 0')
      console.log('[DbWorkerRuntime] Added column: project.is_system')
    }
    if (!colNames.has('system_key')) {
      this.db.exec('ALTER TABLE project ADD COLUMN system_key TEXT')
      console.log('[DbWorkerRuntime] Added column: project.system_key')
    }
    
    // UNIQUE 索引保证 system_key 唯一性（WHERE 条件排除 NULL）
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_system_key ON project(system_key) WHERE system_key IS NOT NULL')
  }

  /**
   * 确保 convo 表有 project_id + updated_at 复合索引
   * 用于 ORDER BY updated_at DESC 场景的查询优化
   */
  private ensureConvoProjectActivityIndex() {
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_convo_project_activity ON convo(project_id, updated_at DESC)')
  }

  /**
   * 确保 Inbox 系统项目存在，并缓存 inboxId
   * 
   * 调用前置条件：ensureProjectSystemColumnsAndIndex 已执行
   * 
   * 执行步骤：
   * 1. 幂等创建 Inbox 项目（system_key='inbox'）
   * 2. 缓存 inboxId 供 convo.create 使用
   * 3. 迁移历史 NULL 会话到 Inbox（分批 500 条，幂等安全）
   */
  private ensureInboxProjectData() {
    // 1. 幂等创建 Inbox
    const existing = this.db.prepare('SELECT id FROM project WHERE system_key = ?').get('inbox') as { id: string } | undefined
    if (!existing) {
      const inboxId = randomUUID()
      const now = Date.now()
      this.db.prepare(`
        INSERT INTO project (id, name, is_system, system_key, created_at, updated_at, meta)
        VALUES (?, 'Inbox', 1, 'inbox', ?, ?, '{"isSystemInbox":true}')
      `).run(inboxId, now, now)
      console.log('[DbWorkerRuntime] Created Inbox project:', inboxId)
    }
    
    // 2. 缓存 inboxId
    const inboxRow = this.db.prepare('SELECT id FROM project WHERE system_key = ?').get('inbox') as { id: string }
    this.inboxId = inboxRow.id
    console.log('[DbWorkerRuntime] Inbox ID cached:', this.inboxId)
    
    // 3. 迁移历史 NULL 会话（分批，不修改 updated_at，幂等安全）
    const batchSize = 500
    const updateStmt = this.db.prepare(`
      UPDATE convo SET project_id = ?
      WHERE id IN (SELECT id FROM convo WHERE project_id IS NULL LIMIT ?)
    `)
    let totalMigrated = 0
    while (true) {
      const result = updateStmt.run(this.inboxId, batchSize)
      if (!result.changes || result.changes === 0) break
      totalMigrated += result.changes
    }
    if (totalMigrated > 0) {
      console.log(`[DbWorkerRuntime] Migrated ${totalMigrated} conversations to Inbox`)
    }

    // 4. 清理历史伪项目（unassigned / No Project 系统占位）
    this.migrateLegacyUnassignedProjectData()
  }

  /**
   * 迁移并清理历史遗留的 "unassigned / No Project" 伪项目。
   *
   * 旧版本可能把未分类分区持久化成伪项目，导致 UI 出现多余的 "No Project"。
   * 这里将其会话统一迁移到 Inbox，并删除伪项目记录（幂等安全）。
   */
  private migrateLegacyUnassignedProjectData() {
    const rows = this.db.prepare(`
      SELECT id
      FROM project
      WHERE
        id = 'unassigned'
        OR lower(COALESCE(system_key, '')) = 'unassigned'
        OR (is_system = 1 AND lower(name) IN ('no project', 'unassigned'))
    `).all() as Array<{ id: string }>

    if (rows.length === 0) return

    const migrateTxn = this.db.transaction((legacyRows: Array<{ id: string }>) => {
      const moveConvosStmt = this.db.prepare('UPDATE convo SET project_id = @inboxId WHERE project_id = @legacyProjectId')
      const rebindSearchProjectStmt = this.db.prepare('UPDATE search_docs SET project_id = @inboxId WHERE project_id = @legacyProjectId')
      const deleteProjectDocStmt = this.db.prepare("DELETE FROM search_docs WHERE entity_type = 'project' AND entity_id = @legacyProjectId")
      const deleteProjectStmt = this.db.prepare('DELETE FROM project WHERE id = @legacyProjectId')

      let migratedConvos = 0
      let deletedProjects = 0

      for (const row of legacyRows) {
        const legacyProjectId = String(row.id ?? '').trim()
        if (!legacyProjectId || legacyProjectId === this.inboxId) continue

        const moveResult = moveConvosStmt.run({ inboxId: this.inboxId, legacyProjectId })
        migratedConvos += moveResult.changes ?? 0

        rebindSearchProjectStmt.run({ inboxId: this.inboxId, legacyProjectId })
        deleteProjectDocStmt.run({ legacyProjectId })

        const deleteResult = deleteProjectStmt.run({ legacyProjectId })
        deletedProjects += deleteResult.changes ?? 0
      }

      return { migratedConvos, deletedProjects }
    })

    const result = migrateTxn(rows)
    if (result.migratedConvos > 0 || result.deletedProjects > 0) {
      console.log(
        `[DbWorkerRuntime] Migrated ${result.migratedConvos} legacy unassigned convos to Inbox and removed ${result.deletedProjects} legacy projects`
      )
    }
  }

  /**
   * 确保所有核心索引存在（统一索引管理入口）
   * 
   * 包含：convo、message、tag、usage_log、model_data、model_catalog、reasoning_model_index、settings_kv 等表的索引
   * 不包含：branching 索引（由 ensureBranchingSchema 管理）、reasoning_segments 索引（由 ensureReasoningSchema 管理）
   */
  private ensureCoreIndexes() {
    const indexes = [
      // convo 表
      'CREATE INDEX IF NOT EXISTS idx_convo_project ON convo(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_convo_updated ON convo(updated_at DESC)',
      // message 表
      'CREATE INDEX IF NOT EXISTS idx_msg_convo_seq ON message(convo_id, seq)',
      // message_error 表
      'CREATE INDEX IF NOT EXISTS idx_message_error_truncated ON message_error(is_truncated)',
      // message_asset / asset 表
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_hash ON asset(hash)',
      'CREATE INDEX IF NOT EXISTS idx_message_asset_message ON message_asset(message_id, ordinal)',
      'CREATE INDEX IF NOT EXISTS idx_message_asset_asset ON message_asset(asset_id)',
      // file pipeline 表
      'CREATE INDEX IF NOT EXISTS idx_file_assets_sha256 ON file_assets(sha256)',
      'CREATE INDEX IF NOT EXISTS idx_file_assets_deleted ON file_assets(deleted_at)',
      'CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_message_attachments_asset ON message_attachments(asset_id, created_at)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_asset ON message_attachments(message_id, asset_id)',
      'CREATE INDEX IF NOT EXISTS idx_draft_attachments_conversation_order ON draft_attachments(conversation_id, attachment_order)',
      'CREATE INDEX IF NOT EXISTS idx_draft_attachments_asset ON draft_attachments(asset_id)',
      // tag 表
      'CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name)',
      // usage_log 表
      'CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_log(project_id, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_usage_convo ON usage_log(convo_id, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_usage_time_project ON usage_log(timestamp DESC, project_id)',
      'CREATE INDEX IF NOT EXISTS idx_usage_time_provider_model ON usage_log(timestamp DESC, provider, model)',
      'CREATE INDEX IF NOT EXISTS idx_usage_status ON usage_log(status, timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_usage_request_attempt ON usage_log(request_id, attempt)',
      // model_data 表
      'CREATE INDEX IF NOT EXISTS idx_model_provider ON model_data(vendor)',
      'CREATE INDEX IF NOT EXISTS idx_model_router_source ON model_data(router_source)',
      'CREATE INDEX IF NOT EXISTS idx_model_archived ON model_data(is_archived)',
      'CREATE INDEX IF NOT EXISTS idx_model_last_seen ON model_data(last_seen_at)',
      // model_catalog 表
      'CREATE INDEX IF NOT EXISTS idx_model_catalog_router_source ON model_catalog(router_source)',
      'CREATE INDEX IF NOT EXISTS idx_model_catalog_hidden ON model_catalog(router_source, is_hidden)',
      'CREATE INDEX IF NOT EXISTS idx_model_catalog_last_seen_snapshot ON model_catalog(router_source, last_seen_snapshot_id)',
      // endpoint_meta 表
      'CREATE INDEX IF NOT EXISTS idx_endpoint_meta_model ON endpoint_meta(provider_key, base_url, model_id)',
      'CREATE INDEX IF NOT EXISTS idx_endpoint_meta_fetched_at ON endpoint_meta(provider_key, base_url, model_id, fetched_at_ms DESC)',
      // reasoning_model_index 表
      'CREATE INDEX IF NOT EXISTS idx_reasoning_model_index_status ON reasoning_model_index(status)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_model_index_last_synced ON reasoning_model_index(last_synced_snapshot)',
      // search_docs 表
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_search_docs_entity ON search_docs(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_search_docs_project_time ON search_docs(project_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_search_docs_convo_time ON search_docs(convo_id, created_at)',
      // settings_kv 表
      'CREATE INDEX IF NOT EXISTS idx_settings_kv_updated ON settings_kv(updated_at_ms DESC)',
      // user_dashboard_prefs 表
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_user_view ON user_dashboard_prefs(user_id, view_id)',
      'CREATE INDEX IF NOT EXISTS idx_prefs_user_default ON user_dashboard_prefs(user_id, is_default)',
    ]
    for (const sql of indexes) {
      this.db.exec(sql)
    }
  }

  private stampSchemaVersion() {
    this.db.pragma(`user_version = ${DB_SCHEMA_VERSION}`)
  }

  /**
   * 获取 Inbox 项目 ID（供外部查询）
   */
  getInboxId(): string {
    return this.inboxId
  }

  /**
   * 关闭 Worker，清理资源
   * 
   * 主要职责：
   * 1. 清理所有待发射的节流 timer，避免内存泄漏
   * 2. 关闭数据库连接
   */
  shutdown() {
    // 清理所有节流 timer
    for (const { timer } of this.activityThrottle.values()) {
      clearTimeout(timer)
    }
    this.activityThrottle.clear()
    
    // 关闭数据库连接
    try {
      this.db.close()
    } catch {
      // 忽略关闭错误
    }
  }

  /**
   * 发射事件到主进程（通过 parentPort）
   */
  emitEvent(event: DbEvent) {
    if (parentPort) {
      const message: WorkerEventMessage = { type: 'event', event }
      parentPort.postMessage(message)
    }
  }

  /**
   * 发射 conversation.activity_updated 事件（带 200ms 节流）
   * 
   * 流式生成期间可能频繁调用 appendDelta，节流避免事件风暴。
   * 节流期间新的 updatedAt 会覆盖旧值，timer 触发时发射最新值。
   */
  emitActivityUpdated(convoId: string) {
    const now = Date.now()
    const existing = this.activityThrottle.get(convoId)
    
    if (existing) {
      // 更新 updatedAt，复用现有 timer
      existing.updatedAt = now
      return
    }
    
    // 新建节流 timer
    const timer = setTimeout(() => {
      const state = this.activityThrottle.get(convoId)
      this.activityThrottle.delete(convoId)
      if (state) {
        this.emitEvent({ type: 'conversation.activity_updated', convoId, updatedAt: state.updatedAt })
      }
    }, this.activityThrottleMs)
    
    this.activityThrottle.set(convoId, { timer, updatedAt: now })
  }

  toEpochSec(value?: number | null) {
    const ms = typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
    return Math.floor(ms / 1000)
  }

  buildProjectSearchDoc(project: { id: string; name: string; createdAt: number; updatedAt: number }): SearchDocInput {
    return {
      entityType: 'project',
      entityId: project.id,
      projectId: project.id,
      convoId: null,
      createdAtSec: this.toEpochSec(project.createdAt),
      updatedAtSec: this.toEpochSec(project.updatedAt),
      title: project.name,
      body: ''
    }
  }

  buildConvoSearchDocFromRow(row: { id: string; project_id: string | null; title: string; created_at: number; updated_at: number }): SearchDocInput {
    return {
      entityType: 'convo',
      entityId: row.id,
      projectId: row.project_id ?? null,
      convoId: row.id,
      createdAtSec: this.toEpochSec(row.created_at),
      updatedAtSec: this.toEpochSec(row.updated_at),
      title: row.title,
      body: ''
    }
  }

  loadConvoRow(convoId: string) {
    return this.db.prepare(`
      SELECT id, project_id, title, created_at, updated_at
      FROM convo
      WHERE id = @id
      LIMIT 1
    `).get({ id: convoId }) as { id: string; project_id: string | null; title: string; created_at: number; updated_at: number } | undefined
  }

  loadMessageSearchDoc(messageId: string): SearchDocInput | null {
    const row = this.db.prepare(`
      SELECT
        m.id,
        m.convo_id,
        m.created_at,
        m.status,
        mb.body,
        c.project_id
      FROM message m
      LEFT JOIN message_body mb ON mb.message_id = m.id
      LEFT JOIN convo c ON c.id = m.convo_id
      WHERE m.id = @id
      LIMIT 1
    `).get({ id: messageId }) as {
      id: string
      convo_id: string
      created_at: number
      status: string
      body: string | null
      project_id: string | null
    } | undefined

    if (!row) return null
    if (String(row.status) !== 'final') return null

    return {
      entityType: 'message',
      entityId: row.id,
      projectId: row.project_id ?? null,
      convoId: row.convo_id,
      createdAtSec: this.toEpochSec(row.created_at),
      updatedAtSec: this.toEpochSec(Date.now()),
      title: '',
      body: row.body ?? ''
    }
  }

  private *iterateFinalMessageDocsByConvo(convoId: string): Iterable<SearchDocInput> {
    const stmt = this.db.prepare(`
      SELECT
        m.id,
        m.convo_id,
        m.created_at,
        mb.body,
        c.project_id
      FROM message m
      LEFT JOIN message_body mb ON mb.message_id = m.id
      LEFT JOIN convo c ON c.id = m.convo_id
      WHERE m.convo_id = @convoId
        AND m.status = 'final'
      ORDER BY m.seq ASC
    `)

    const updatedAtSec = this.toEpochSec(Date.now())
    const rows = stmt.all({ convoId }) as Array<{ id: string; convo_id: string; created_at: number; body: string | null; project_id: string | null }>
    for (const row of rows) {
      yield {
        entityType: 'message',
        entityId: row.id,
        projectId: row.project_id ?? null,
        convoId: row.convo_id,
        createdAtSec: this.toEpochSec(row.created_at),
        updatedAtSec,
        title: '',
        body: row.body ?? ''
      }
    }
  }

  *iterateProjectDocs(): Iterable<SearchDocInput> {
    const stmt = this.db.prepare(`
      SELECT id, name, created_at, updated_at
      FROM project
      ORDER BY created_at ASC
    `)
    const rows = stmt.all() as Array<{ id: string; name: string; created_at: number; updated_at: number }>
    for (const row of rows) {
      yield this.buildProjectSearchDoc({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })
    }
  }

  *iterateConvoDocs(): Iterable<SearchDocInput> {
    const stmt = this.db.prepare(`
      SELECT id, project_id, title, created_at, updated_at
      FROM convo
      ORDER BY created_at ASC
    `)
    const rows = stmt.all() as Array<{ id: string; project_id: string | null; title: string; created_at: number; updated_at: number }>
    for (const row of rows) {
      yield this.buildConvoSearchDocFromRow(row)
    }
  }

  *iterateFinalMessageDocs(): Iterable<SearchDocInput> {
    const stmt = this.db.prepare(`
      SELECT
        m.id,
        m.convo_id,
        m.created_at,
        mb.body,
        c.project_id
      FROM message m
      LEFT JOIN message_body mb ON mb.message_id = m.id
      LEFT JOIN convo c ON c.id = m.convo_id
      WHERE m.status = 'final'
      ORDER BY m.created_at ASC
    `)

    const updatedAtSec = this.toEpochSec(Date.now())
    const rows = stmt.all() as Array<{ id: string; convo_id: string; created_at: number; body: string | null; project_id: string | null }>
    for (const row of rows) {
      yield {
        entityType: 'message',
        entityId: row.id,
        projectId: row.project_id ?? null,
        convoId: row.convo_id,
        createdAtSec: this.toEpochSec(row.created_at),
        updatedAtSec,
        title: '',
        body: row.body ?? ''
      }
    }
  }

  reindexMessagesForConvo(convoId: string) {
    this.searchRepo.deleteByConvoId(convoId, 'message')
    for (const doc of this.iterateFinalMessageDocsByConvo(convoId)) {
      this.searchRepo.upsertDoc(doc)
    }
        const row = this.loadConvoRow(convoId)
        if (row) {
          this.searchRepo.updateProjectForConvo(row.id, row.project_id ?? null, this.toEpochSec(row.updated_at))
        }
  }

  get debugDbOps() {
    return debugDbOps
  }

  get enableBranchInvariants() {
    return enableBranchInvariants
  }

  dbgDb(label: string, data?: unknown) {
    dbgDb(label, data)
  }

  requireNonToolHead(headMessageId: string, context: Record<string, unknown>) {
    requireNonToolHead(this.db, headMessageId, context)
  }

  requireHeadEquals(branchId: string, expectedHeadMessageId: string, context: Record<string, unknown>) {
    requireHeadEquals(this.db, branchId, expectedHeadMessageId, context)
  }

  async handleMessage(message: WorkerRequestMessage): Promise<WorkerResponseMessage> {
    return dispatchWorkerMessage(this.handlers, message)
  }
}


