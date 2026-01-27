import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
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
import {
  type WorkerInitConfig,
  type WorkerRequestMessage,
  type WorkerResponseMessage,
  type DbHandler,
  type DbMethod
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
    console.log('[DbWorkerRuntime] 确保 Branching Schema...')
    ensureBranchingSchema(this.db)

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

    // Ensure important indexes exist for aggregation performance
    const indexStatements = [
      "CREATE INDEX IF NOT EXISTS idx_usage_time_project ON usage_log(timestamp DESC, project_id)",
      "CREATE INDEX IF NOT EXISTS idx_usage_time_provider_model ON usage_log(timestamp DESC, provider, model)",
      "CREATE INDEX IF NOT EXISTS idx_usage_status ON usage_log(status, timestamp DESC)",
      "CREATE INDEX IF NOT EXISTS idx_usage_request_attempt ON usage_log(request_id, attempt)"
    ]
    for (const sql of indexStatements) {
      this.db.exec(sql)
    }
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

  private registerHandlers() {
    this.handlers.set('health.ping', () => ({ ok: true, now: Date.now() }))
    
    // ========== Project Handlers ==========
    this.handlers.set('project.create', (raw) => {
      const input = CreateProjectSchema.parse(raw)
      return this.projectRepo.create(input)
    })

    this.handlers.set('project.save', (raw) => {
      const input = SaveProjectSchema.parse(raw)
      this.projectRepo.save(input)
      return { ok: true }
    })

    this.handlers.set('project.list', (raw) => {
      const input = ListProjectSchema.parse(raw ?? {})
      return this.projectRepo.list(input)
    })

    this.handlers.set('project.delete', (raw) => {
      const input = DeleteProjectSchema.parse(raw)
      this.projectRepo.delete(input.id)
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

    this.handlers.set('project.countConversations', (raw) => {
      const input = CountConversationsSchema.parse(raw)
      return { count: this.projectRepo.countConversations(input.projectId) }
    })

    // ========== Conversation Handlers ==========
    this.handlers.set('convo.create', (raw) => {
      const input = CreateConvoSchema.parse(raw)
      return this.convoRepo.create(input)
    })

    this.handlers.set('convo.save', (raw) => {
      const input = SaveConvoSchema.parse(raw)
      this.convoRepo.save(input)
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
      this.convoRepo.delete(input.id)
      return { ok: true }
    })

    this.handlers.set('convo.deleteMany', (raw) => {
      const input = BatchDeleteSchema.parse(raw)
      const deleted = this.convoRepo.deleteMany(input.ids)
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
      this.convoRepo.restore(input.id)
      return { ok: true }
    })

    this.handlers.set('convo.setProject', (raw) => {
      const input = SetConvoProjectSchema.parse(raw)
      this.convoRepo.setProject(input.id, input.projectId)
      return { ok: true }
    })

    this.handlers.set('convo.setProjectMany', (raw) => {
      const input = SetConvoProjectManySchema.parse(raw)
      return this.convoRepo.setProjectMany(input.ids, input.projectId)
    })

    this.handlers.set('convo.listArchived', (raw) => {
      const input = ListArchivedSchema.parse(raw ?? {})
      return this.convoRepo.listArchived(input)
    })

    // ========== Message Handlers ==========
    this.handlers.set('message.append', (raw) => {
      const input = AppendMessageSchema.parse(raw)
      return this.messageRepo.append(input)
    })

    this.handlers.set('message.appendDelta', (raw) => {
      const input = AppendMessageDeltaSchema.parse(raw)
      return this.messageRepo.appendDelta(input)
    })

    this.handlers.set('message.setStatus', (raw) => {
      const input = SetMessageStatusSchema.parse(raw)
      return this.messageRepo.setStatus(input)
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
      this.messageRepo.replaceForConvo(input.convoId, messages)
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

      return txn()
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
