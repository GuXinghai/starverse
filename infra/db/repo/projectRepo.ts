import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type {
  ProjectRecord,
  CreateProjectInput,
  SaveProjectInput,
  ListProjectParams
} from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

const mapRow = (row: any): ProjectRecord => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  meta: row.meta ? safeParse(row.meta) : null
})

export class ProjectRepo {
  private insertStmt: BetterSqlite3.Statement
  private updateStmt: BetterSqlite3.Statement
  private deleteStmt: BetterSqlite3.Statement
  private touchStmt: BetterSqlite3.Statement

  private listBase = `
    SELECT id, name, created_at, updated_at, meta
    FROM project
  `

  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO project(id, name, created_at, updated_at, meta)
      VALUES (@id, @name, @createdAt, @updatedAt, @meta)
    `)

    this.updateStmt = this.db.prepare(`
      UPDATE project
      SET name = @name, updated_at = @updatedAt, meta = @meta
      WHERE id = @id
    `)

    this.deleteStmt = this.db.prepare(`
      DELETE FROM project WHERE id = @id
    `)

    this.touchStmt = this.db.prepare(`
      UPDATE project SET updated_at = @updatedAt WHERE id = @id
    `)
  }

  /**
   * 创建新项目
   */
  create(input: CreateProjectInput): ProjectRecord {
    const now = Date.now()
    const id = input.id ?? randomUUID()
    const payload = {
      id,
      name: input.name,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    }

    this.insertStmt.run(payload)

    return {
      id,
      name: input.name,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      meta: input.meta ?? null
    }
  }

  /**
   * 保存项目（存在则更新，不存在则插入）
   */
  save(input: SaveProjectInput) {
    const now = input.updatedAt ?? Date.now()
    const payload = {
      id: input.id,
      name: input.name,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    }

    const result = this.updateStmt.run(payload)
    if (result.changes && result.changes > 0) {
      return
    }

    // 不存在则插入
    this.insertStmt.run({
      id: input.id,
      name: input.name,
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    })
  }

  /**
   * 删除项目（自动将关联对话的 project_id 设置为 NULL）
   */
  delete(id: string) {
    this.deleteStmt.run({ id })
  }

  /**
   * 查询项目列表
   */
  list(params: ListProjectParams = {}): ProjectRecord[] {
    let sql = this.listBase
    const bindings: any = {}

    // 排序
    const order = params.order ?? 'updatedAt'
    if (order === 'updatedAt') {
      sql += ' ORDER BY updated_at DESC'
    } else if (order === 'createdAt') {
      sql += ' ORDER BY created_at DESC'
    } else if (order === 'name') {
      sql += ' ORDER BY name ASC'
    }

    // 分页
    if (params.limit) {
      sql += ' LIMIT @limit'
      bindings.limit = params.limit
    }
    if (params.offset) {
      sql += ' OFFSET @offset'
      bindings.offset = params.offset
    }

    const stmt = this.db.prepare(sql)
    const rows = stmt.all(bindings)
    return rows.map(mapRow)
  }

  /**
   * 根据 ID 查询单个项目
   */
  findById(id: string): ProjectRecord | null {
    const sql = this.listBase + ' WHERE id = @id'
    const stmt = this.db.prepare(sql)
    const row = stmt.get({ id })
    return row ? mapRow(row) : null
  }

  /**
   * 根据名称查询项目（精确匹配）
   */
  findByName(name: string): ProjectRecord | null {
    const sql = this.listBase + ' WHERE name = @name'
    const stmt = this.db.prepare(sql)
    const row = stmt.get({ name })
    return row ? mapRow(row) : null
  }

  /**
   * 更新项目的 updated_at 时间戳
   */
  touch(id: string, updatedAt: number) {
    this.touchStmt.run({ id, updatedAt })
  }

  /**
   * 统计项目下的对话数量
   */
  countConversations(projectId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM convo WHERE project_id = @projectId
    `)
    const result = stmt.get({ projectId }) as any
    return result?.count ?? 0
  }
}
