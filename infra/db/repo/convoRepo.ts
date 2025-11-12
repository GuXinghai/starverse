import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  ConvoRecord,
  CreateConvoInput,
  ListConvoParams,
  SaveConvoInput,
  ArchivedConvoRecord,
  ListArchivedParams
} from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

const mapRow = (row: any): ConvoRecord => ({
  id: row.id,
  projectId: row.project_id ?? null,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  meta: row.meta ? safeParse(row.meta) : null
})

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export class ConvoRepo {
  private insertStmt: BetterSqlite3.Statement
  private touchStmt: BetterSqlite3.Statement
  private updateStmt: BetterSqlite3.Statement
  private deleteStmt: BetterSqlite3.Statement

  private listBase = `
    SELECT id, project_id, title, created_at, updated_at, meta
    FROM convo
  `

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO convo(id, project_id, title, created_at, updated_at, meta)
      VALUES (@id, @projectId, @title, @createdAt, @updatedAt, @meta)
    `)

    this.touchStmt = this.db.prepare(`
      UPDATE convo SET updated_at = @updatedAt WHERE id = @id
    `)

    this.updateStmt = this.db.prepare(`
      UPDATE convo
      SET project_id = @projectId,
          title = @title,
          updated_at = @updatedAt,
          meta = @meta
      WHERE id = @id
    `)

    this.deleteStmt = this.db.prepare(`DELETE FROM convo WHERE id = @id`)
  }

  create(input: CreateConvoInput): ConvoRecord {
    const now = Date.now()
    const id = input.id ?? randomUUID()
    this.insertStmt.run({
      id,
      projectId: input.projectId ?? null,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    })

    return {
      id,
      projectId: input.projectId ?? null,
      title: input.title,
      createdAt: now,
      updatedAt: now,
      meta: input.meta ?? null
    }
  }

  save(input: SaveConvoInput) {
    const now = input.updatedAt ?? Date.now()
    const payload = {
      id: input.id,
      projectId: input.projectId ?? null,
      title: input.title,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    }

    const result = this.updateStmt.run(payload)
    if (result.changes && result.changes > 0) {
      return
    }

    this.insertStmt.run({
      id: input.id,
      projectId: input.projectId ?? null,
      title: input.title,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    })
  }

  delete(id: string) {
    this.deleteStmt.run({ id })
  }

  /**
   * 批量删除对话
   * 使用事务确保所有删除操作原子性执行
   * 由于外键级联删除，相关的 message、message_body 和 message_fts 记录也会被自动删除
   * 
   * @param ids - 要删除的对话 ID 数组
   * @returns 实际删除的对话数量
   */
  deleteMany(ids: string[]): number {
    if (ids.length === 0) return 0

    // 使用事务确保原子性
    const deleteManyTxn = this.db.transaction((convoIds: string[]) => {
      let totalDeleted = 0
      for (const id of convoIds) {
        const result = this.deleteStmt.run({ id })
        totalDeleted += result.changes || 0
      }
      return totalDeleted
    })

    return deleteManyTxn(ids)
  }

  list(params: ListConvoParams = {}): ConvoRecord[] {
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0
    const orderBy = params.order === 'createdAt' ? 'created_at' : 'updated_at'

    let sql = `${this.listBase}`
    const bind: Record<string, unknown> = {
      limit,
      offset
    }

    if (params.projectId) {
      sql += ` WHERE project_id = @projectId`
      bind.projectId = params.projectId
    }

    sql += ` ORDER BY ${orderBy} DESC LIMIT @limit OFFSET @offset`

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(bind)
    return rows.map(mapRow)
  }

  touch(id: string, updatedAt: number) {
    this.touchStmt.run({ id, updatedAt })
  }

  /**
   * 归档对话 - 将对话数据移动到 archive_convo 表并删除原记录
   */
  archive(id: string) {
    const archiveTxn = this.db.transaction(() => {
      // 1. 获取完整的对话数据
      const convoStmt = this.db.prepare(`
        SELECT id, project_id, title, created_at, updated_at, meta
        FROM convo WHERE id = @id
      `)
      const convo = convoStmt.get({ id }) as any
      if (!convo) {
        throw new Error(`Conversation ${id} not found`)
      }

      // 2. 获取所有消息
      const messagesStmt = this.db.prepare(`
        SELECT m.id, m.convo_id, m.role, m.created_at, m.seq, m.meta, mb.body
        FROM message m
        LEFT JOIN message_body mb ON m.id = mb.message_id
        WHERE m.convo_id = @convoId
        ORDER BY m.seq ASC
      `)
      const messages = messagesStmt.all({ convoId: id })

      // 3. 构造归档快照
      const snapshot = {
        convo,
        messages
      }

      // 4. 插入到归档表
      const insertArchiveStmt = this.db.prepare(`
        INSERT INTO archive_convo(id, snapshot_at, payload)
        VALUES (@id, @snapshotAt, @payload)
      `)
      insertArchiveStmt.run({
        id,
        snapshotAt: Date.now(),
        payload: JSON.stringify(snapshot)
      })

      // 5. 删除原对话（级联删除消息）
      this.deleteStmt.run({ id })
    })

    archiveTxn()
  }

  /**
   * 批量归档对话
   * 使用事务确保所有归档操作原子性执行
   * 
   * @param ids - 要归档的对话 ID 数组
   * @returns { archived: number, failed: string[] } - 成功归档的数量和失败的 ID 列表
   */
  archiveMany(ids: string[]): { archived: number, failed: string[] } {
    if (ids.length === 0) return { archived: 0, failed: [] }

    const failed: string[] = []
    let archived = 0

    // 使用事务确保原子性
    const archiveManyTxn = this.db.transaction((convoIds: string[]) => {
      const convoStmt = this.db.prepare(`
        SELECT id, project_id, title, created_at, updated_at, meta
        FROM convo WHERE id = @id
      `)

      const messagesStmt = this.db.prepare(`
        SELECT m.id, m.convo_id, m.role, m.created_at, m.seq, m.meta, mb.body
        FROM message m
        LEFT JOIN message_body mb ON m.id = mb.message_id
        WHERE m.convo_id = @convoId
        ORDER BY m.seq ASC
      `)

      const insertArchiveStmt = this.db.prepare(`
        INSERT INTO archive_convo(id, snapshot_at, payload)
        VALUES (@id, @snapshotAt, @payload)
      `)

      const snapshotAt = Date.now()

      for (const id of convoIds) {
        try {
          // 1. 获取对话数据
          const convo = convoStmt.get({ id }) as any
          if (!convo) {
            failed.push(id)
            continue
          }

          // 2. 获取消息数据
          const messages = messagesStmt.all({ convoId: id })

          // 3. 构造快照
          const snapshot = { convo, messages }

          // 4. 插入归档
          insertArchiveStmt.run({
            id,
            snapshotAt,
            payload: JSON.stringify(snapshot)
          })

          // 5. 删除原对话
          this.deleteStmt.run({ id })
          archived++
        } catch (error) {
          failed.push(id)
          console.error(`Failed to archive conversation ${id}:`, error)
        }
      }
    })

    archiveManyTxn(ids)
    return { archived, failed }
  }

  /**
   * 恢复归档的对话
   */
  restore(id: string) {
    const restoreTxn = this.db.transaction(() => {
      // 1. 从归档表获取数据
      const getArchiveStmt = this.db.prepare(`
        SELECT id, snapshot_at, payload
        FROM archive_convo
        WHERE id = @id
      `)
      const archive = getArchiveStmt.get({ id }) as any
      if (!archive) {
        throw new Error(`Archived conversation ${id} not found`)
      }

      const snapshot = JSON.parse(archive.payload)

      // 2. 恢复对话记录
      this.insertStmt.run({
        id: snapshot.convo.id,
        projectId: snapshot.convo.project_id,
        title: snapshot.convo.title,
        createdAt: snapshot.convo.created_at,
        updatedAt: Date.now(), // 使用当前时间作为恢复时间
        meta: snapshot.convo.meta
      })

      // 3. 恢复消息
      if (snapshot.messages && snapshot.messages.length > 0) {
        const insertMessageStmt = this.db.prepare(`
          INSERT INTO message(id, convo_id, role, created_at, seq, meta)
          VALUES (@id, @convoId, @role, @createdAt, @seq, @meta)
        `)
        const insertBodyStmt = this.db.prepare(`
          INSERT INTO message_body(message_id, body)
          VALUES (@messageId, @body)
        `)
        const insertFtsStmt = this.db.prepare(`
          INSERT INTO message_fts(message_id, convo_id, body)
          VALUES (@messageId, @convoId, @body)
        `)

        for (const message of snapshot.messages) {
          insertMessageStmt.run({
            id: message.id,
            convoId: message.convo_id,
            role: message.role,
            createdAt: message.created_at,
            seq: message.seq,
            meta: message.meta
          })

          if (message.body) {
            insertBodyStmt.run({
              messageId: message.id,
              body: message.body
            })

            insertFtsStmt.run({
              messageId: message.id,
              convoId: message.convo_id,
              body: message.body
            })
          }
        }
      }

      // 4. 删除归档记录
      const deleteArchiveStmt = this.db.prepare(`
        DELETE FROM archive_convo WHERE id = @id
      `)
      deleteArchiveStmt.run({ id })
    })

    restoreTxn()
  }

  /**
   * 列出归档的对话
   */
  listArchived(params: ListArchivedParams = {}): ArchivedConvoRecord[] {
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    const stmt = this.db.prepare(`
      SELECT id, snapshot_at
      FROM archive_convo
      ORDER BY snapshot_at DESC
      LIMIT @limit OFFSET @offset
    `)

    const rows = stmt.all({ limit, offset })
    return rows.map((row: any) => ({
      id: row.id,
      snapshotAt: row.snapshot_at
    }))
  }
}
