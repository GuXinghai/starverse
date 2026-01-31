import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { parentPort } from 'node:worker_threads'
import BetterSqlite3 from 'better-sqlite3'
import { ProjectRepo } from './repo/projectRepo'
import { ConvoRepo } from './repo/convoRepo'
import { MessageRepo } from './repo/messageRepo'
import { BranchRepo } from './repo/branchRepo'
import { ContextRepo } from './repo/contextRepo'
import { SearchRepo } from './repo/searchRepo'
import { UsageRepo } from './repo/usageRepo'
import { DashboardPrefRepo } from './repo/dashboardPrefRepo'
import { ModelCatalogRepo } from './repo/modelCatalogRepo'
import { ReasoningModelIndexRepo } from './repo/reasoningModelIndexRepo'
import { SettingsRepo } from './repo/settingsRepo'
import { ensureBranchingSchema } from './migrations/ensureBranchingSchema'
import { ensureSearchSchema } from './migrations/ensureSearchSchema'
import {
  type WorkerInitConfig,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
  type DbHandler,
  type DbMethod,
  type DbEvent,
  type WorkerEventMessage,
  type SearchDocInput
} from './types'
import { DbWorkerError, toErrorShape } from './errors'
import {
  CreateProjectSchema,
  SaveProjectSchema,
  DeleteProjectSchema,
  ListProjectSchema,
  FindProjectByIdSchema,
  FindProjectByNameSchema,
  CountConversationsSchema,
  AppendMessageSchema,
  AppendMessageDeltaSchema,
  SetMessageStatusSchema,
  AppendReasoningDetailSegmentsSchema,
  FinalizeReasoningDetailsSchema,
  SetReasoningRequestConfigSchema,
  GetReasoningSegmentsStatsSchema,
  CreateConvoSchema,
  SaveConvoSchema,
  SaveConvoWithMessagesSchema,
  DeleteConvoSchema,
  ArchiveConvoSchema,
  RestoreConvoSchema,
  SetConvoProjectSchema,
  SetConvoProjectManySchema,
  ListArchivedSchema,
  FulltextQuerySchema,
  SearchQuerySchema,
  ListConvoSchema,
  ListMessageSchema,
  ReplaceMessagesSchema,
  SetBranchHeadSchema,
  SetBranchChoiceSchema,
  SetBranchAnswerHideSchema,
  RetryReplaceAnswerSchema,
  BatchDeleteSchema,
  EnsureDefaultBranchSchema,
  ListBranchSchema,
  CreateBranchFromMessageSchema,
  DeleteBranchSchema,
  SwitchCandidateSchema,
  RegenerateFromQuestionSchema,
  GetBranchPathSchema,
  GetCandidatesSchema,
  GetQuestionCandidatesSchema,
  EffectiveFilterSchema,
  BeginTurnSchema,
  SwitchQuestionCandidateSchema,
  ForkQuestionSchema,
  RetryReplaceQuestionSchema,
  SetBranchFilterSchema,
  ClearBranchFilterSchema,
  BuildContextForBranchSchema,
  GetRenderableTurnsSchema,
  LogUsageSchema,
  GetProjectUsageStatsSchema,
  GetConvoUsageStatsSchema,
  GetModelUsageStatsSchema,
  GetDateRangeUsageStatsSchema,
  UsageAggregateSchema,
  UsageDrillDownSchema,
  SaveDashboardPrefSchema,
  DeleteDashboardPrefSchema,
  GetDashboardPrefsSchema
} from './validation'
import { configureLogging, logSlowQuery } from './logger'

type SqlDatabase = BetterSqlite3.Database

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
  private db: SqlDatabase
  private projectRepo: ProjectRepo
  private convoRepo: ConvoRepo
  private messageRepo: MessageRepo
  private branchRepo: BranchRepo
  private contextRepo: ContextRepo
  private searchRepo: SearchRepo
  private usageRepo: UsageRepo
  private dashboardPrefRepo: DashboardPrefRepo
  private modelCatalogRepo: ModelCatalogRepo
  private reasoningModelIndexRepo: ReasoningModelIndexRepo
  private settingsRepo: SettingsRepo
  private handlers = new Map<DbMethod, DbHandler>()
  private inboxId: string = ''
  private activityThrottle = new Map<string, { timer: ReturnType<typeof setTimeout>; updatedAt: number }>()
  private activityThrottleMs = 200

  constructor(config: WorkerInitConfig) {
    console.log('[DbWorkerRuntime] 开始初始化, config:', config)
    
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
    console.log('[DbWorkerRuntime] 确保 Model Catalog Schema...')
    this.ensureModelCatalogSchema()
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
    this.branchRepo = new BranchRepo(this.db)
    this.contextRepo = new ContextRepo(this.db, this.branchRepo)
    this.searchRepo = new SearchRepo(this.db)
    this.usageRepo = new UsageRepo(this.db)
    this.dashboardPrefRepo = new DashboardPrefRepo(this.db)
    this.modelCatalogRepo = new ModelCatalogRepo(this.db)
    this.reasoningModelIndexRepo = new ReasoningModelIndexRepo(this.db)
    this.settingsRepo = new SettingsRepo(this.db)
    this.registerHandlers()
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

    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_message ON message_reasoning_detail_segments(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_message_order ON message_reasoning_detail_segments(message_id, segment_id)',
      'CREATE INDEX IF NOT EXISTS idx_reasoning_segment_group ON message_reasoning_detail_segments(message_id, detail_id, detail_index, type, format, segment_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_reasoning_segment_fingerprint ON message_reasoning_detail_segments(message_id, segment_fingerprint)'
    ]
    for (const sql of indexStatements) {
      this.db.exec(sql)
    }

    // Backfill segment_fingerprint for historical rows (idempotent, batch processing)
    this.backfillSegmentFingerprints()
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
  private emitEvent(event: DbEvent) {
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
  private emitActivityUpdated(convoId: string) {
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

  private toEpochSec(value?: number | null) {
    const ms = typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
    return Math.floor(ms / 1000)
  }

  private buildProjectSearchDoc(project: { id: string; name: string; createdAt: number; updatedAt: number }): SearchDocInput {
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

  private buildConvoSearchDocFromRow(row: { id: string; project_id: string | null; title: string; created_at: number; updated_at: number }): SearchDocInput {
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

  private loadConvoRow(convoId: string) {
    return this.db.prepare(`
      SELECT id, project_id, title, created_at, updated_at
      FROM convo
      WHERE id = @id
      LIMIT 1
    `).get({ id: convoId }) as { id: string; project_id: string | null; title: string; created_at: number; updated_at: number } | undefined
  }

  private loadMessageSearchDoc(messageId: string): SearchDocInput | null {
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

  private *iterateProjectDocs(): Iterable<SearchDocInput> {
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

  private *iterateConvoDocs(): Iterable<SearchDocInput> {
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

  private *iterateFinalMessageDocs(): Iterable<SearchDocInput> {
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

  private reindexMessagesForConvo(convoId: string) {
    this.searchRepo.deleteByConvoId(convoId, 'message')
    for (const doc of this.iterateFinalMessageDocsByConvo(convoId)) {
      this.searchRepo.upsertDoc(doc)
    }
        const row = this.loadConvoRow(convoId)
        if (row) {
          this.searchRepo.updateProjectForConvo(row.id, row.project_id ?? null, this.toEpochSec(row.updated_at))
        }
  }

  private registerHandlers() {
    this.handlers.set('health.ping', () => ({ ok: true, now: Date.now() }))
    
    // ========== Project Handlers ==========
    this.handlers.set('project.create', (raw) => {
      const input = CreateProjectSchema.parse(raw)
      
      // 特殊处理：禁止通过 UI 创建 Inbox（系统项目由 ensureInboxProjectData 管理）
      if (input.name.trim().toLowerCase() === 'inbox') {
        const inbox = this.projectRepo.findById(this.inboxId)
        if (inbox) {
          this.searchRepo.upsertDoc(this.buildProjectSearchDoc(inbox))
          return { ...inbox, alreadyExists: true, isSystemProject: true }
        }
      }
      
      // 检查同名项目
      const existing = this.projectRepo.findByName(input.name)
      if (existing) {
        this.searchRepo.upsertDoc(this.buildProjectSearchDoc(existing))
        return { ...existing, alreadyExists: true, isSystemProject: false }
      }

      const createTxn = this.db.transaction(() => {
        const project = this.projectRepo.create(input)
        this.searchRepo.upsertDoc(this.buildProjectSearchDoc(project))
        return project
      })

      const project = createTxn()
      
      // 仅在真正创建新项目时发送事件
      this.emitEvent({ type: 'project.created', projectId: project.id, name: project.name })
      
      return { ...project, alreadyExists: false, isSystemProject: false }
    })

    this.handlers.set('project.save', (raw) => {
      const input = SaveProjectSchema.parse(raw)
      const saveTxn = this.db.transaction(() => {
        this.projectRepo.save(input)
        const saved = this.projectRepo.findById(input.id)
        if (saved) {
          this.searchRepo.upsertDoc(this.buildProjectSearchDoc(saved))
        }
      })

      saveTxn()
      
      // 发送 project.updated 事件
      this.emitEvent({ type: 'project.updated', projectId: input.id, name: input.name })
      
      return { ok: true }
    })

    this.handlers.set('project.list', (raw) => {
      const input = ListProjectSchema.parse(raw ?? {})
      return this.projectRepo.list(input)
    })

    this.handlers.set('project.delete', (raw) => {
      const input = DeleteProjectSchema.parse(raw)
      
      // 禁止删除系统项目（Inbox）
      if (input.id === this.inboxId) {
        return {
          ok: false,
          error: {
            code: 'ERR_DELETE_FORBIDDEN',
            message: 'Cannot delete system project (Inbox)',
          },
        }
      }

      const deleteTxn = this.db.transaction(() => {
        this.projectRepo.delete(input.id)
        this.searchRepo.deleteDoc('project', input.id)
        this.searchRepo.clearProjectId(input.id, this.toEpochSec(Date.now()))
      })

      deleteTxn()
      
      // 发送 project.deleted 事件
      this.emitEvent({ type: 'project.deleted', projectId: input.id })
      
      return { ok: true }
    })

    this.handlers.set('project.findById', (raw) => {
      const input = FindProjectByIdSchema.parse(raw)
      return this.projectRepo.findById(input.id)
    })

    this.handlers.set('project.findByName', (raw) => {
      const input = FindProjectByNameSchema.parse(raw)
      return this.projectRepo.findByName(input.name)
    })
    
    /**
     * 获取 Inbox 项目记录
     * 渲染进程可通过此方法获取 inboxId 用于 UI 展示判断
     */
    this.handlers.set('project.getInbox', () => {
      return this.projectRepo.findById(this.inboxId)
    })

    this.handlers.set('project.countConversations', (raw) => {
      const input = CountConversationsSchema.parse(raw)
      return { count: this.projectRepo.countConversations(input.projectId) }
    })
    
    /**
     * 批量获取项目的对话计数（避免 N+1 查询）
     */
    this.handlers.set('project.countConversationsBatch', (raw) => {
      const projectIds = (raw && typeof raw === 'object' && 'projectIds' in raw && Array.isArray((raw as any).projectIds))
        ? (raw as any).projectIds as string[]
        : []
      
      if (projectIds.length === 0) return { counts: {} }
      
      // 使用 GROUP BY 一次查询所有项目的计数
      const placeholders = projectIds.map(() => '?').join(',')
      const sql = `SELECT project_id, COUNT(*) as count FROM convo WHERE project_id IN (${placeholders}) GROUP BY project_id`
      const stmt = this.db.prepare(sql)
      const rows = stmt.all(...projectIds) as Array<{ project_id: string; count: number }>
      
      const counts: Record<string, number> = {}
      for (const row of rows) {
        counts[row.project_id] = row.count
      }
      
      // 补充计数为0的项目
      for (const id of projectIds) {
        if (!(id in counts)) {
          counts[id] = 0
        }
      }
      
      return { counts }
    })

    // ========== Conversation Handlers ==========
    this.handlers.set('convo.create', (raw) => {
      const input = CreateConvoSchema.parse(raw)
      
      // 缺省 projectId 时默认写入 Inbox
      // undefined = 未指定 → 使用 inboxId
      // null = 显式传 null → 保留 null（不推荐，但保留能力）
      // string = 指定项目 → 使用指定值
      const effectiveProjectId = input.projectId !== undefined ? input.projectId : this.inboxId

      const createTxn = this.db.transaction(() => {
        const convo = this.convoRepo.create({
          ...input,
          projectId: effectiveProjectId
        })
        const row = this.loadConvoRow(convo.id)
        if (row) {
          this.searchRepo.upsertDoc(this.buildConvoSearchDocFromRow(row))
        }
        return convo
      })

      return createTxn()
    })

    this.handlers.set('convo.save', (raw) => {
      const input = SaveConvoSchema.parse(raw)
      const saveTxn = this.db.transaction(() => {
        this.convoRepo.save(input)
        const row = this.loadConvoRow(input.id)
        if (row) {
          this.searchRepo.upsertDoc(this.buildConvoSearchDocFromRow(row))
          this.searchRepo.updateProjectForConvo(row.id, row.project_id ?? null, this.toEpochSec(row.updated_at))
        }
      })

      saveTxn()
      return { ok: true }
    })

    this.handlers.set('convo.saveWithMessages', (raw) => {
      const input = SaveConvoWithMessagesSchema.parse(raw)
      const messages = input.messages.map((message, index) => ({
        convoId: input.convo.id,
        role: message.role,
        body: message.body,
        createdAt: message.createdAt,
        seq: message.seq ?? index + 1,
        meta: message.meta
      }))

      const saveTxn = this.db.transaction(() => {
        this.convoRepo.save(input.convo)
        this.messageRepo.replaceForConvo(input.convo.id, messages)
        const row = this.loadConvoRow(input.convo.id)
        if (row) {
          this.searchRepo.upsertDoc(this.buildConvoSearchDocFromRow(row))
        }
        this.reindexMessagesForConvo(input.convo.id)
      })

      saveTxn()
      return { ok: true }
    })

    this.handlers.set('convo.list', (raw) => {
      const input = ListConvoSchema.parse(raw ?? {})
      return this.convoRepo.list(input)
    })

    this.handlers.set('convo.delete', (raw) => {
      const input = DeleteConvoSchema.parse(raw)
      const deleteTxn = this.db.transaction(() => {
        this.convoRepo.delete(input.id)
        this.searchRepo.deleteByConvoId(input.id)
      })

      deleteTxn()
      return { ok: true }
    })

    this.handlers.set('convo.deleteMany', (raw) => {
      const input = BatchDeleteSchema.parse(raw)
      const deleteTxn = this.db.transaction(() => {
        const deleted = this.convoRepo.deleteMany(input.ids)
        for (const id of input.ids) {
          this.searchRepo.deleteByConvoId(id)
        }
        return deleted
      })

      const deleted = deleteTxn()
      return { deleted }
    })

    this.handlers.set('convo.archive', (raw) => {
      const input = ArchiveConvoSchema.parse(raw)
      this.convoRepo.archive(input.id)
      return { ok: true }
    })

    this.handlers.set('convo.archiveMany', (raw) => {
      const input = BatchDeleteSchema.parse(raw) // 复用 BatchDeleteSchema，因为参数相同
      const result = this.convoRepo.archiveMany(input.ids)
      return result
    })

    this.handlers.set('convo.restore', (raw) => {
      const input = RestoreConvoSchema.parse(raw)
      const restoreTxn = this.db.transaction(() => {
        this.convoRepo.restore(input.id)
        const row = this.loadConvoRow(input.id)
        if (row) {
          this.searchRepo.upsertDoc(this.buildConvoSearchDocFromRow(row))
        }
        this.reindexMessagesForConvo(input.id)
      })

      restoreTxn()
      return { ok: true }
    })

    this.handlers.set('convo.setProject', (raw) => {
      const input = SetConvoProjectSchema.parse(raw)
      
      // 查询当前 projectId 用于事件发射
      const current = this.db.prepare('SELECT project_id FROM convo WHERE id = ?').get(input.id) as { project_id: string | null } | undefined
      const fromProjectId = current?.project_id ?? null

      const updateTxn = this.db.transaction(() => {
        this.convoRepo.setProject(input.id, input.projectId)
        this.searchRepo.updateProjectForConvo(input.id, input.projectId ?? null, this.toEpochSec(Date.now()))
      })

      updateTxn()
      
      // 发送 conversation.moved 事件
      this.emitEvent({
        type: 'conversation.moved',
        convoId: input.id,
        fromProjectId,
        toProjectId: input.projectId,
      })
      
      return { ok: true }
    })

    this.handlers.set('convo.setProjectMany', (raw) => {
      const input = SetConvoProjectManySchema.parse(raw)

      const updateTxn = this.db.transaction(() => {
        const result = this.convoRepo.setProjectMany(input.ids, input.projectId)
        const updatedAtSec = this.toEpochSec(Date.now())
        for (const id of input.ids) {
          if (!result.failed.includes(id)) {
            this.searchRepo.updateProjectForConvo(id, input.projectId ?? null, updatedAtSec)
          }
        }
        return result
      })

      const result = updateTxn()
      
      // 为每个成功移动的对话发送事件（移动不多，逐条发送可接受）
      // 注意：这里无法获取 fromProjectId，可考虑后续优化为批量查询
      for (const id of input.ids) {
        if (!result.failed.includes(id)) {
          this.emitEvent({
            type: 'conversation.moved',
            convoId: id,
            fromProjectId: null, // 批量移动暂不追踪来源
            toProjectId: input.projectId,
          })
        }
      }
      
      return result
    })

    this.handlers.set('convo.listArchived', (raw) => {
      const input = ListArchivedSchema.parse(raw ?? {})
      return this.convoRepo.listArchived(input)
    })

    // ========== Message Handlers ==========
    this.handlers.set('message.append', (raw) => {
      const input = AppendMessageSchema.parse(raw)
      const appendTxn = this.db.transaction(() => {
        const result = this.messageRepo.append(input)
        const doc = this.loadMessageSearchDoc(result.id)
        if (doc) {
          this.searchRepo.upsertDoc(doc)
        }
        return result
      })

      const result = appendTxn()
      this.emitActivityUpdated(input.convoId)
      return result
    })

    this.handlers.set('message.appendDelta', (raw) => {
      const input = AppendMessageDeltaSchema.parse(raw)
      const result = this.messageRepo.appendDelta(input)
      this.emitActivityUpdated(input.convoId)
      return result
    })

    this.handlers.set('message.setStatus', (raw) => {
      const input = SetMessageStatusSchema.parse(raw)
      const updateTxn = this.db.transaction(() => {
        const result = this.messageRepo.setStatus(input)
        if (input.status === 'final') {
          const doc = this.loadMessageSearchDoc(input.messageId)
          if (doc) {
            this.searchRepo.upsertDoc(doc)
          }
        } else {
          // v0 语义：仅索引 final；streaming/error 视为不可搜索。
          // 归档/可见性过滤留待后续演进（如 is_visible/is_archived）。
          this.searchRepo.deleteDoc('message', input.messageId)
        }
        return result
      })

      const result = updateTxn()
      // setStatus 需要从 messageRepo 获取 convoId
      // 由于 input 只有 messageId，需要查询获取 convoId
      const msgRow = this.db.prepare('SELECT convo_id FROM message WHERE id = ?').get(input.messageId) as { convo_id: string } | undefined
      if (msgRow?.convo_id) {
        this.emitActivityUpdated(msgRow.convo_id)
      }
      return result
    })

    this.handlers.set('message.appendReasoningDetailSegments', (raw) => {
      const input = AppendReasoningDetailSegmentsSchema.parse(raw)
      return this.messageRepo.appendReasoningDetailSegments(input)
    })

    this.handlers.set('message.finalizeReasoningDetails', (raw) => {
      const input = FinalizeReasoningDetailsSchema.parse(raw)
      return this.messageRepo.finalizeReasoningDetails(input)
    })

    this.handlers.set('message.getReasoningSegmentsStats', (raw) => {
      const input = GetReasoningSegmentsStatsSchema.parse(raw)
      return this.messageRepo.getReasoningSegmentsStats(input)
    })

    this.handlers.set('message.setReasoningRequestConfig', (raw) => {
      const input = SetReasoningRequestConfigSchema.parse(raw)
      return this.messageRepo.setReasoningRequestConfig(input)
    })

    this.handlers.set('message.list', (raw) => {
      const input = ListMessageSchema.parse(raw)
      return this.messageRepo.list(input)
    })

    this.handlers.set('message.replace', (raw) => {
      const input = ReplaceMessagesSchema.parse(raw)
      if (this.branchRepo.hasAnyBranchForConvo(input.convoId)) {
        throw new DbWorkerError(
          'ERR_MUTATION_FORBIDDEN_ON_BRANCHING_CONVO',
          `message.replace is forbidden for branching-enabled conversations: ${input.convoId}`
        )
      }
      const messages = input.messages.map((message, index) => ({
        convoId: input.convoId,
        role: message.role,
        body: message.body,
        createdAt: message.createdAt,
        seq: message.seq ?? index + 1,
        meta: message.meta
      }))
      const replaceTxn = this.db.transaction(() => {
        this.messageRepo.replaceForConvo(input.convoId, messages)
        this.reindexMessagesForConvo(input.convoId)
      })

      replaceTxn()
      return { ok: true }
    })

    // ========== Branching (read-only, Phase 4+) ==========
    this.handlers.set('branch.ensureDefault', (raw) => {
      const input = EnsureDefaultBranchSchema.parse(raw)
      return this.branchRepo.ensureDefault(input.convoId, input.name)
    })

    this.handlers.set('branch.list', (raw) => {
      const input = ListBranchSchema.parse(raw)
      return this.branchRepo.list(input.convoId, !!input.includeDeleted)
    })

    this.handlers.set('branch.createFromMessage', (raw) => {
      const input = CreateBranchFromMessageSchema.parse(raw)
      return this.branchRepo.createFromMessage(input)
    })

    this.handlers.set('branch.delete', (raw) => {
      const input = DeleteBranchSchema.parse(raw)
      return this.branchRepo.delete(input.branchId)
    })

    this.handlers.set('branch.getPathMessages', (raw) => {
      const input = GetBranchPathSchema.parse(raw)
      return this.branchRepo.getPathMessages(input.branchId, input.limit)
    })

    this.handlers.set('branch.getCandidates', (raw) => {
      const input = GetCandidatesSchema.parse(raw)
      const list = this.branchRepo.getCandidates(input.branchId, input.questionId, input.limit)
      dbgDb('branch.getCandidates', {
        branchId: input.branchId,
        questionId: input.questionId,
        count: list.length,
        candidates: list.map((c) => ({ answerRootId: c.answerRootId, status: c.status })),
      })
      return list
    })

    this.handlers.set('branch.getQuestionCandidates', (raw) => {
      const input = GetQuestionCandidatesSchema.parse(raw)
      const list = this.branchRepo.getQuestionCandidates(input.branchId, input.baseMessageId, input.limit)
      dbgDb('branch.getQuestionCandidates', {
        branchId: input.branchId,
        baseMessageId: input.baseMessageId ?? null,
        count: list.length,
        candidates: list.map((c) => ({ questionId: c.questionId, status: c.status })),
      })
      return list
    })

    this.handlers.set('branch.getEffectiveFilters', (raw) => {
      const input = EffectiveFilterSchema.parse(raw)
      return this.branchRepo.getEffectiveFilters(input.branchId, input.questionId, input.chosenAnswerRootId)
    })

    this.handlers.set('branch.beginTurn', (raw) => {
      const input = BeginTurnSchema.parse(raw)
      const branch = this.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }
      if (branch.deletedAt != null) {
        throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      }

      const txn = this.db.transaction(() => {
        const latest = this.branchRepo.get(input.branchId)
        if (!latest?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
        if (latest.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)

        const question = this.messageRepo.append({
          convoId: latest.convoId,
          role: 'user',
          body: input.userBody,
          ...(input.userMeta !== undefined ? { meta: input.userMeta } : {}),
          parentId: latest.headMessageId,
        })

        const questionDoc = this.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          this.searchRepo.upsertDoc(questionDoc)
        }

        const assistant = this.messageRepo.append({
          convoId: latest.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        this.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        this.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          convoId: latest.convoId,
          branchId: input.branchId,
          questionId: question.id,
          questionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

      const result = txn()
      // 事务提交后发射 activity_updated
      this.emitActivityUpdated(result.convoId)
      return result
    })

    this.handlers.set('branch.switchCandidate', (raw) => {
      const input = SwitchCandidateSchema.parse(raw)
      const out = this.branchRepo.switchCandidate(input.branchId, input.questionId, input.answerRootId)

      if (enableBranchInvariants) {
        const branch = this.branchRepo.get(input.branchId)
        const convoId = branch?.convoId ? String(branch.convoId) : ''
        const expected = convoId ? this.branchRepo.computePreferredHeadForAnswerRoot(convoId, input.answerRootId) : out.headMessageId
        requireNonToolHead(this.db, out.headMessageId, {
          op: 'branch.switchCandidate',
          branchId: input.branchId,
          questionId: input.questionId,
          answerRootId: input.answerRootId,
        })
        requireHeadEquals(this.db, input.branchId, expected, {
          op: 'branch.switchCandidate',
          branchId: input.branchId,
          questionId: input.questionId,
          answerRootId: input.answerRootId,
        })
      }

      return out
    })

    this.handlers.set('branch.switchQuestionCandidate', (raw) => {
      const input = SwitchQuestionCandidateSchema.parse(raw)
      const out = this.branchRepo.switchQuestionCandidate(input.branchId, input.baseMessageId, input.questionId)

      if (enableBranchInvariants) {
        const branch = this.branchRepo.get(input.branchId)
        const convoId = branch?.convoId ? String(branch.convoId) : ''
        if (convoId) {
          const choiceRow = this.db
            .prepare(
              `SELECT chosen_answer_root_id AS chosen
               FROM branch_choice
               WHERE branch_id=@branchId AND question_id=@questionId
               LIMIT 1`
            )
            .get({ branchId: input.branchId, questionId: input.questionId }) as any
          const chosen = choiceRow?.chosen ? String(choiceRow.chosen) : null
          const expected = chosen ? this.branchRepo.computePreferredHeadForAnswerRoot(convoId, chosen) : input.questionId
          requireNonToolHead(this.db, out.headMessageId, {
            op: 'branch.switchQuestionCandidate',
            branchId: input.branchId,
            questionId: input.questionId,
            baseMessageId: input.baseMessageId ?? null,
          })
          requireHeadEquals(this.db, input.branchId, expected, {
            op: 'branch.switchQuestionCandidate',
            branchId: input.branchId,
            questionId: input.questionId,
            baseMessageId: input.baseMessageId ?? null,
            chosenAnswerRootId: chosen,
          })
        }
      }

      return out
    })

    this.handlers.set('branch.regenerateFromQuestion', (raw) => {
      const input = RegenerateFromQuestionSchema.parse(raw)
      const branch = this.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }
      if (branch.deletedAt != null) {
        throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      }

      if (debugDbOps) {
        const beforeChoice = this.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        dbgDb('branch.regenerateFromQuestion:before', {
          branchId: input.branchId,
          questionId: input.questionId,
          headMessageId: branch.headMessageId ?? null,
          chosenAnswerRootId: beforeChoice?.chosen ? String(beforeChoice.chosen) : null,
        })
      }

      // Validate question belongs to this conversation.
      const q = this.db
        .prepare(`SELECT 1 FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: input.questionId, convoId: branch.convoId }) as any
      if (!q) {
        throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${input.questionId}`)
      }

      const txn = this.db.transaction(() => {
        const created = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: input.questionId,
          status: 'streaming',
        })
        this.branchRepo.setChoice(input.branchId, input.questionId, created.id)
        this.branchRepo.setHead(input.branchId, created.id)
        return { ok: true, newAnswerRootId: created.id, newAssistantSeq: created.seq }
      })

      const out = txn()
      if (debugDbOps) {
        const afterChoice = this.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const afterHead = this.db.prepare(`SELECT head_message_id AS head FROM branch WHERE id=@branchId LIMIT 1`).get({ branchId: input.branchId }) as any
        dbgDb('branch.regenerateFromQuestion:after', {
          branchId: input.branchId,
          questionId: input.questionId,
          newAnswerRootId: out.newAnswerRootId,
          newAssistantSeq: out.newAssistantSeq,
          headMessageId: afterHead?.head ? String(afterHead.head) : null,
          chosenAnswerRootId: afterChoice?.chosen ? String(afterChoice.chosen) : null,
        })
      }
      return out
    })

    this.handlers.set('branch.forkQuestion', (raw) => {
      const input = ForkQuestionSchema.parse(raw)
      const branch = this.branchRepo.get(input.branchId)
      if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      if (!branch.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

      const oldQuestionId = String(input.oldQuestionId ?? '').trim()
      const newBody = typeof input.newBody === 'string' ? input.newBody : String(input.newBody ?? '')
      if (!oldQuestionId) throw new DbWorkerError('ERR_VALIDATION', 'Missing oldQuestionId')

      const oldRow = this.db
        .prepare(`SELECT id, parent_id AS parentId FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: oldQuestionId, convoId: branch.convoId }) as any
      if (!oldRow?.id) throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${oldQuestionId}`)
      const baseMessageId = oldRow.parentId ? String(oldRow.parentId) : null

      // Guardrail: do not mutate branch while head is streaming (prevents head-switch + streaming writes divergence).
      const headStatus = this.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: branch.headMessageId }) as any
      if (String(headStatus?.status ?? 'final') === 'streaming') {
        throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
      }

      const txn = this.db.transaction(() => {
        const question = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'user',
          body: newBody,
          parentId: baseMessageId,
        })

        const questionDoc = this.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          this.searchRepo.upsertDoc(questionDoc)
        }

        const assistant = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        this.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        this.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          branchId: input.branchId,
          baseMessageId,
          newQuestionId: question.id,
          newQuestionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

      return txn()
    })

    this.handlers.set('branch.retryReplaceQuestion', (raw) => {
      const input = RetryReplaceQuestionSchema.parse(raw)
      const branch = this.branchRepo.get(input.branchId)
      if (!branch?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      if (branch.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
      if (!branch.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

      const oldQuestionId = String(input.oldQuestionId ?? '').trim()
      const newBody = typeof input.newBody === 'string' ? input.newBody : String(input.newBody ?? '')
      if (!oldQuestionId) throw new DbWorkerError('ERR_VALIDATION', 'Missing oldQuestionId')

      const oldRow = this.db
        .prepare(`SELECT id, parent_id AS parentId FROM message WHERE id=@id AND convo_id=@convoId AND role='user' LIMIT 1`)
        .get({ id: oldQuestionId, convoId: branch.convoId }) as any
      if (!oldRow?.id) throw new DbWorkerError('ERR_VALIDATION', `Question not found in conversation: ${oldQuestionId}`)
      const baseMessageId = oldRow.parentId ? String(oldRow.parentId) : null

      // Branch-local terminal check: oldQuestion must be the last user in the current head->root path.
      const path = this.branchRepo.getPathMessages(input.branchId, 5000)
      if (path.length === 0) throw new DbWorkerError('ERR_INVALID', `Branch path is empty: ${input.branchId}`)
      let lastUserId: string | null = null
      for (let i = path.length - 1; i >= 0; i -= 1) {
        if (String((path[i] as any).role ?? '').trim() === 'user') {
          lastUserId = String((path[i] as any).id ?? '')
          break
        }
      }
      if (!lastUserId || lastUserId !== oldQuestionId) {
        throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed on the last question of the current branch')
      }

      // Guardrail (early reject): do not mutate branch while head is streaming (prevents head-switch + streaming writes divergence).
      // Safety boundary is enforced again inside the transaction.
      const headStatus = this.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: branch.headMessageId }) as any
      if (String(headStatus?.status ?? 'final') === 'streaming') {
        throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
      }

      const baseKey = baseMessageId ?? '__root__'
      const upsertHide = this.db.prepare(`
        INSERT INTO branch_question_hide(branch_id, base_message_id, question_id, hidden, updated_at)
        VALUES (@branchId, @baseMessageId, @questionId, @hidden, @updatedAt)
        ON CONFLICT(branch_id, base_message_id, question_id)
        DO UPDATE SET hidden = excluded.hidden, updated_at = excluded.updated_at
      `)
      const deleteHideAnyBase = this.db.prepare(`
        DELETE FROM branch_question_hide
        WHERE branch_id = @branchId AND question_id = @questionId
      `)
      const getHeadGrouping = this.db.prepare(`
        SELECT question_id AS questionId, answer_root_id AS answerRootId
        FROM message
        WHERE id=@id
        LIMIT 1
      `)

      const txn = this.db.transaction(() => {
        // Re-fetch branch row inside txn to avoid acting on stale head/message graph state.
        const latest = this.branchRepo.get(input.branchId)
        if (!latest?.convoId) throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
        if (latest.deletedAt != null) throw new DbWorkerError('ERR_INVALID', `Branch is deleted: ${input.branchId}`)
        if (!latest.headMessageId) throw new DbWorkerError('ERR_INVALID', `Branch has no head: ${input.branchId}`)

        // Guardrail (DB-side safety boundary): do not mutate branch while head is streaming.
        const latestHeadStatus = this.db.prepare(`SELECT status FROM message WHERE id=@id LIMIT 1`).get({ id: latest.headMessageId }) as any
        if (String(latestHeadStatus?.status ?? 'final') === 'streaming') {
          throw new DbWorkerError('ERR_INVALID', 'Branch is streaming; abort the run before editing questions')
        }

        // Branch-local terminal check (DB-side safety boundary): oldQuestion must be the last user in the current head->root path.
        const pathInTxn = this.branchRepo.getPathMessages(input.branchId, 5000)
        if (pathInTxn.length === 0) throw new DbWorkerError('ERR_INVALID', `Branch path is empty: ${input.branchId}`)
        let lastUserIdInTxn: string | null = null
        for (let i = pathInTxn.length - 1; i >= 0; i -= 1) {
          if (String((pathInTxn[i] as any).role ?? '').trim() === 'user') {
            lastUserIdInTxn = String((pathInTxn[i] as any).id ?? '')
            break
          }
        }
        if (!lastUserIdInTxn || lastUserIdInTxn !== oldQuestionId) {
          throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed on the last question of the current branch')
        }

        // Strict terminal condition (DB-side safety boundary):
        // - Allow when head == oldQuestionId (question has no answer yet), OR
        // - Allow when head is within the chosen answer group for oldQuestionId.
        // Chosen group definition is fixed to branchRepo.ensureChoice(branchId, questionId), which:
        // - Uses existing branch_choice when present, OR
        // - Chooses a default answer root (branch-aware; excludes hidden candidates) and persists it.
        if (latest.headMessageId !== oldQuestionId) {
          const chosen = this.branchRepo.ensureChoice(input.branchId, oldQuestionId)
          if (!chosen) {
            throw new DbWorkerError('ERR_INVALID', 'Replace question requires either head==question (no answer yet) or a chosen answer group')
          }

          const headGroup = getHeadGrouping.get({ id: latest.headMessageId }) as { questionId?: string | null; answerRootId?: string | null } | undefined
          const headQuestionId = headGroup?.questionId ? String(headGroup.questionId) : null
          const headAnswerRootId = headGroup?.answerRootId ? String(headGroup.answerRootId) : null

          if (headQuestionId !== oldQuestionId || headAnswerRootId !== chosen) {
            throw new DbWorkerError('ERR_INVALID', 'Replace question is only allowed when branch head is within the chosen answer group')
          }
        }

        const now = Date.now()
        // Enforce a single hide record per (branch_id, question_id) even if callers accidentally pass mismatched base keys.
        deleteHideAnyBase.run({ branchId: input.branchId, questionId: oldQuestionId })
        upsertHide.run({
          branchId: input.branchId,
          baseMessageId: baseKey,
          questionId: oldQuestionId,
          hidden: 1,
          updatedAt: now,
        })

        const question = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'user',
          body: newBody,
          parentId: baseMessageId,
        })

        const questionDoc = this.loadMessageSearchDoc(question.id)
        if (questionDoc) {
          this.searchRepo.upsertDoc(questionDoc)
        }

        const assistant = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: question.id,
          status: 'streaming',
        })

        this.branchRepo.setChoice(input.branchId, question.id, assistant.id)
        this.branchRepo.setHead(input.branchId, assistant.id)

        return {
          ok: true as const,
          branchId: input.branchId,
          baseMessageId,
          newQuestionId: question.id,
          newQuestionSeq: question.seq,
          assistantId: assistant.id,
          assistantSeq: assistant.seq,
        }
      })

      return txn()
    })

    this.handlers.set('branch.setHead', (raw) => {
      const input = SetBranchHeadSchema.parse(raw)
      return this.branchRepo.setHead(input.branchId, input.headMessageId)
    })

    this.handlers.set('branchChoice.set', (raw) => {
      const input = SetBranchChoiceSchema.parse(raw)
      return this.branchRepo.setChoice(input.branchId, input.questionId, input.chosenAnswerRootId)
    })

    this.handlers.set('branchAnswerHide.set', (raw) => {
      const input = SetBranchAnswerHideSchema.parse(raw)
      return this.branchRepo.setAnswerHide(input.branchId, input.questionId, input.answerRootId, input.hidden)
    })

    this.handlers.set('branch.retryReplaceAnswer', (raw) => {
      const input = RetryReplaceAnswerSchema.parse(raw)
      const branch = this.branchRepo.get(input.branchId)
      if (!branch?.convoId) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Branch not found: ${input.branchId}`)
      }

      if (debugDbOps) {
        const beforeChoice = this.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const beforeHide = this.db
          .prepare(
            `SELECT hidden FROM branch_answer_hide WHERE branch_id=@branchId AND question_id=@questionId AND answer_root_id=@answerRootId LIMIT 1`
          )
          .get({ branchId: input.branchId, questionId: input.questionId, answerRootId: input.currentAnswerRootId }) as any
        dbgDb('branch.retryReplaceAnswer:before', {
          branchId: input.branchId,
          questionId: input.questionId,
          currentAnswerRootId: input.currentAnswerRootId,
          headMessageId: branch.headMessageId ?? null,
          chosenAnswerRootId: beforeChoice?.chosen ? String(beforeChoice.chosen) : null,
          currentHidden: beforeHide?.hidden != null ? Number(beforeHide.hidden) : null,
        })
      }

      const txn = this.db.transaction(() => {
        // Validate terminal conditions (no follow-up question, head within group, etc.)
        this.branchRepo.canRetryReplace(input.branchId, input.questionId, input.currentAnswerRootId)

        // Hide the old answer root for this branch (branch-local).
        this.branchRepo.setAnswerHide(input.branchId, input.questionId, input.currentAnswerRootId, true)

        // Create a new answer variant root under the same question.
        const created = this.messageRepo.append({
          convoId: branch.convoId,
          role: 'assistant',
          body: '',
          parentId: input.questionId,
          status: 'streaming',
        })

        // Choose the new answer root and move head to it.
        this.branchRepo.setChoice(input.branchId, input.questionId, created.id)
        this.branchRepo.setHead(input.branchId, created.id)

        return { ok: true, newAnswerRootId: created.id, newMessageId: created.id, newAssistantSeq: created.seq }
      })

      const out = txn()
      if (debugDbOps) {
        const afterChoice = this.db
          .prepare(`SELECT chosen_answer_root_id AS chosen FROM branch_choice WHERE branch_id=@branchId AND question_id=@questionId LIMIT 1`)
          .get({ branchId: input.branchId, questionId: input.questionId }) as any
        const afterHead = this.db.prepare(`SELECT head_message_id AS head FROM branch WHERE id=@branchId LIMIT 1`).get({ branchId: input.branchId }) as any
        const hiddenRows = this.db
          .prepare(
            `SELECT answer_root_id AS answerRootId, hidden FROM branch_answer_hide WHERE branch_id=@branchId AND question_id=@questionId ORDER BY updated_at DESC LIMIT 5`
          )
          .all({ branchId: input.branchId, questionId: input.questionId }) as any[]
        dbgDb('branch.retryReplaceAnswer:after', {
          branchId: input.branchId,
          questionId: input.questionId,
          newAnswerRootId: out.newAnswerRootId,
          newAssistantSeq: out.newAssistantSeq,
          headMessageId: afterHead?.head ? String(afterHead.head) : null,
          chosenAnswerRootId: afterChoice?.chosen ? String(afterChoice.chosen) : null,
          recentHides: hiddenRows.map((r) => ({ answerRootId: String(r.answerRootId), hidden: Number(r.hidden) })),
        })
      }
      return out
    })

    this.handlers.set('branchFilter.set', (raw) => {
      const input = SetBranchFilterSchema.parse(raw)
      return this.branchRepo.setFilter(input.branchId, input.targetType, input.targetId, input.mode)
    })

    this.handlers.set('branchFilter.clear', (raw) => {
      const input = ClearBranchFilterSchema.parse(raw)
      return this.branchRepo.clearFilter(input.branchId, input.targetType, input.targetId)
    })

    this.handlers.set('context.buildForBranch', (raw) => {
      const input = BuildContextForBranchSchema.parse(raw)
      return this.contextRepo.buildForBranch(input.branchId, { limit: input.limit, debug: input.debug })
    })

    this.handlers.set('context.getRenderableTurns', (raw) => {
      const input = GetRenderableTurnsSchema.parse(raw)
      return this.contextRepo.getRenderableTurns(input.branchId, { limit: input.limit, debug: input.debug })
    })

    this.handlers.set('search.fulltext', (raw) => {
      const input = FulltextQuerySchema.parse(raw)
      return this.searchRepo.fulltext(input)
    })

    this.handlers.set('search.query', (raw) => {
      const input = SearchQuerySchema.parse(raw)
      return this.searchRepo.query(input)
    })

    this.handlers.set('search.rebuildIndex', () => {
      const rebuildTxn = this.db.transaction(() => {
        this.searchRepo.rebuildIndex({
          loadProjects: () => this.iterateProjectDocs(),
          loadConvos: () => this.iterateConvoDocs(),
          loadMessages: () => this.iterateFinalMessageDocs(),
        })
      })

      rebuildTxn()
      return { ok: true }
    })

    this.handlers.set('maintenance.optimize', () => {
      this.searchRepo.optimize()
      return { ok: true }
    })

    // ========== Usage Handlers ==========
    this.handlers.set('usage.log', (raw) => {
        const input = LogUsageSchema.parse(raw)
        this.usageRepo.logUsage(input)
        return { ok: true }
    })

    this.handlers.set('usage.getProjectStats', (raw) => {
        const input = GetProjectUsageStatsSchema.parse(raw)
        return this.usageRepo.getProjectStats(input.projectId, input.days)
    })

    this.handlers.set('usage.getConvoStats', (raw) => {
        const input = GetConvoUsageStatsSchema.parse(raw)
        return this.usageRepo.getConvoStats(input.convoId, input.days)
    })

    this.handlers.set('usage.getModelStats', (raw) => {
        const input = GetModelUsageStatsSchema.parse(raw)
        return this.usageRepo.getModelStats(input.model, input.days)
    })

    this.handlers.set('usage.getDateRangeStats', (raw) => {
        const input = GetDateRangeUsageStatsSchema.parse(raw)
        return this.usageRepo.getDateRangeStats(input.startTime, input.endTime)
    })

    this.handlers.set('usage.aggregate', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return this.usageRepo.aggregateUsage(input)
    })

    this.handlers.set('usage.drillDown', (raw) => {
        const input = UsageDrillDownSchema.parse(raw ?? {})
        return this.usageRepo.drillDown(input)
    })

    this.handlers.set('usage.reasoningTrend', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return this.usageRepo.getReasoningTrend(input)
    })

    this.handlers.set('usage.reasoningModelComparison', (raw) => {
        const input = UsageAggregateSchema.parse(raw ?? {})
        return this.usageRepo.getReasoningModelComparison(input)
    })

    // ========== Dashboard Prefs ==========
    this.handlers.set('prefs.save', (raw) => {
        const input = SaveDashboardPrefSchema.parse(raw ?? {})
        return this.dashboardPrefRepo.save(input)
    })

    this.handlers.set('prefs.list', (raw) => {
        const input = GetDashboardPrefsSchema.parse(raw ?? {})
        const items = this.dashboardPrefRepo.list(input.userId)
        return { items }
    })

    this.handlers.set('prefs.delete', (raw) => {
        const input = DeleteDashboardPrefSchema.parse(raw ?? {})
        return this.dashboardPrefRepo.delete(input)
    })

    this.handlers.set('prefs.default', (raw) => {
        const input = GetDashboardPrefsSchema.parse(raw ?? {})
        return this.dashboardPrefRepo.getDefault(input.userId)
    })

    // ========== Model Catalog (Snapshot Sync) ==========
    this.handlers.set('modelCatalog.syncSnapshot', (raw) => {
        // Intentionally keep this as a single-writer DB entrypoint.
        // Validation is performed in the caller/job layer for this stage.
        this.modelCatalogRepo.syncSnapshot(raw)
        return { ok: true }
    })

    this.handlers.set('modelCatalog.list', (raw) => {
        const routerSource = raw?.routerSource
        if (!routerSource || typeof routerSource !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'modelCatalog.list requires routerSource')
        }
        return this.modelCatalogRepo.listByRouterSource(routerSource)
    })

    // ========== Reasoning Model Index ==========
    this.handlers.set('reasoningIndex.syncFromCatalog', (raw) => {
        const routerSource = raw?.routerSource
        if (!routerSource || typeof routerSource !== 'string') {
          throw new DbWorkerError('ERR_VALIDATION', 'reasoningIndex.syncFromCatalog requires routerSource')
        }
        return this.reasoningModelIndexRepo.syncFromCatalog(routerSource)
    })

    this.handlers.set('reasoningIndex.list', () => {
        return this.reasoningModelIndexRepo.listAll()
    })

    // ========== Settings ==========
    this.handlers.set('settings.getOpenRouterProviderRequireParameters', () => {
        return { value: this.settingsRepo.getOpenRouterProviderRequireParameters() }
    })

    this.handlers.set('settings.setOpenRouterProviderRequireParameters', (raw) => {
        const value = raw?.value
        if (typeof value !== 'boolean') {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setOpenRouterProviderRequireParameters requires boolean value')
        }
        this.settingsRepo.setOpenRouterProviderRequireParameters(value)
        return { ok: true }
    })

    this.handlers.set('settings.getReasoningPrefs', () => {
        return { value: this.settingsRepo.getReasoningPrefs() }
    })

    this.handlers.set('settings.setReasoningPrefs', (raw) => {
        const value = raw?.value
        if (value === undefined) {
          throw new DbWorkerError('ERR_VALIDATION', 'settings.setReasoningPrefs requires value')
        }
        this.settingsRepo.setReasoningPrefs(value)
        return { ok: true }
    })
  }

  async handleMessage(message: WorkerRequestMessage): Promise<WorkerResponseMessage> {
    try {
      const handler = this.handlers.get(message.method)
      if (!handler) {
        throw new DbWorkerError('ERR_NOT_FOUND', `Unknown method: ${message.method}`)
      }

      const result = await Promise.resolve(handler(message.params))
      return { id: message.id, ok: true, result }
    } catch (error) {
      return { id: message.id, ok: false, error: toErrorShape(error) }
    }
  }
}

export const attachWorkerPort = (
  runtime: DbWorkerRuntime,
  port: import('node:worker_threads').MessagePort
) => {
  port.on('message', (message: WorkerRequestMessage) => {
    runtime
      .handleMessage(message)
      .then((response) => port.postMessage(response))
      .catch((error) => {
        const fallback: WorkerResponseMessage = {
          id: message.id,
          ok: false,
          error: toErrorShape(error)
        }
        port.postMessage(fallback)
      })
  })
}
