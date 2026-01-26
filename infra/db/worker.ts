import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
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
  EffectiveFilterSchema,
  BeginTurnSchema,
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
const dbgDb = (label: string, data?: unknown) => {
  if (!debugDbOps) return
  if (data !== undefined) console.log(`[db][dbg] ${label}`, data)
  else console.log(`[db][dbg] ${label}`)
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
      return this.branchRepo.switchCandidate(input.branchId, input.questionId, input.answerRootId)
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
