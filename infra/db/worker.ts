import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { ProjectRepo } from './repo/projectRepo'
import { ConvoRepo } from './repo/convoRepo'
import { MessageRepo } from './repo/messageRepo'
import { SearchRepo } from './repo/searchRepo'
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
  CreateConvoSchema,
  SaveConvoSchema,
  SaveConvoWithMessagesSchema,
  DeleteConvoSchema,
  ArchiveConvoSchema,
  RestoreConvoSchema,
  ListArchivedSchema,
  FulltextQuerySchema,
  ListConvoSchema,
  ListMessageSchema,
  ReplaceMessagesSchema,
  BatchDeleteSchema
} from './validation'
import { configureLogging, logSlowQuery } from './logger'

type SqlDatabase = BetterSqlite3.Database

const defaultSchemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')

export class DbWorkerRuntime {
  private db: SqlDatabase
  private projectRepo: ProjectRepo
  private convoRepo: ConvoRepo
  private messageRepo: MessageRepo
  private searchRepo: SearchRepo
  private handlers = new Map<DbMethod, DbHandler>()

  constructor(config: WorkerInitConfig) {
    if (!config.dbPath) {
      throw new DbWorkerError('ERR_INTERNAL', 'dbPath missing for worker initialization')
    }

    mkdirSync(path.dirname(config.dbPath), { recursive: true })
    const schemaPath = config.schemaPath ?? defaultSchemaPath

    this.db = new BetterSqlite3(config.dbPath)
    this.applyPragmas()
    this.db.exec(readFileSync(schemaPath, 'utf8'))

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
    this.searchRepo = new SearchRepo(this.db)
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

    this.handlers.set('message.list', (raw) => {
      const input = ListMessageSchema.parse(raw)
      return this.messageRepo.list(input)
    })

    this.handlers.set('message.replace', (raw) => {
      const input = ReplaceMessagesSchema.parse(raw)
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

    this.handlers.set('search.fulltext', (raw) => {
      const input = FulltextQuerySchema.parse(raw)
      return this.searchRepo.fulltext(input)
    })

    this.handlers.set('maintenance.optimize', () => {
      this.searchRepo.optimize()
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
