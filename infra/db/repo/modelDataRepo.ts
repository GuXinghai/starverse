import BetterSqlite3 from 'better-sqlite3'
import type { ModelDataRecord, SaveModelDataInput } from '../types'

type SqlDatabase = BetterSqlite3.Database

/**
 * 模型数据 Repository
 * 
 * 职责：持久化 AI 提供商的模型列表信息
 * - 模型列表不应存储在用户配置（electron-store）中
 * - 使用 SQLite 数据库持久化，与对话数据分离
 * - 支持批量保存和查询
 */
export class ModelDataRepo {
  private upsertStmt: BetterSqlite3.Statement
  private deleteStmt: BetterSqlite3.Statement
  private deleteByProviderStmt: BetterSqlite3.Statement
  private getAllStmt: BetterSqlite3.Statement
  private getByProviderStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO model_data(id, provider, name, description, context_length, pricing, created_at, updated_at, meta)
      VALUES (@id, @provider, @name, @description, @contextLength, @pricing, @createdAt, @updatedAt, @meta)
      ON CONFLICT(id) DO UPDATE SET
        provider = @provider,
        name = @name,
        description = @description,
        context_length = @contextLength,
        pricing = @pricing,
        updated_at = @updatedAt,
        meta = @meta
    `)

    this.deleteStmt = this.db.prepare(`DELETE FROM model_data WHERE id = ?`)
    this.deleteByProviderStmt = this.db.prepare(`DELETE FROM model_data WHERE provider = ?`)
    this.getAllStmt = this.db.prepare(`SELECT * FROM model_data ORDER BY provider, name`)
    this.getByProviderStmt = this.db.prepare(`SELECT * FROM model_data WHERE provider = ? ORDER BY name`)
    this.getByIdStmt = this.db.prepare(`SELECT * FROM model_data WHERE id = ?`)
  }

  /**
   * 保存单个模型数据（插入或更新）
   */
  save(input: SaveModelDataInput): void {
    const now = Date.now()
    this.upsertStmt.run({
      id: input.id,
      provider: input.provider,
      name: input.name || input.id,
      description: input.description || null,
      contextLength: input.contextLength || null,
      pricing: input.pricing ? JSON.stringify(input.pricing) : null,
      createdAt: input.createdAt || now,
      updatedAt: now,
      meta: input.meta ? JSON.stringify(input.meta) : null
    })
  }

  /**
   * 批量保存模型数据（事务）
   */
  saveMany(inputs: SaveModelDataInput[]): void {
    const tx = this.db.transaction((items: SaveModelDataInput[]) => {
      for (const item of items) {
        this.save(item)
      }
    })
    tx(inputs)
  }

  /**
   * 替换指定提供商的所有模型数据
   */
  replaceByProvider(provider: string, models: SaveModelDataInput[]): void {
    const tx = this.db.transaction(() => {
      this.deleteByProviderStmt.run(provider)
      for (const model of models) {
        this.save(model)
      }
    })
    tx()
  }

  /**
   * 删除模型
   */
  delete(modelId: string): void {
    this.deleteStmt.run(modelId)
  }

  /**
   * 删除指定提供商的所有模型
   */
  deleteByProvider(provider: string): void {
    this.deleteByProviderStmt.run(provider)
  }

  /**
   * 获取所有模型
   */
  getAll(): ModelDataRecord[] {
    const rows = this.getAllStmt.all() as any[]
    return rows.map(mapRow)
  }

  /**
   * 根据提供商获取模型列表
   */
  getByProvider(provider: string): ModelDataRecord[] {
    const rows = this.getByProviderStmt.all(provider) as any[]
    return rows.map(mapRow)
  }

  /**
   * 根据 ID 获取单个模型
   */
  getById(modelId: string): ModelDataRecord | null {
    const row = this.getByIdStmt.get(modelId) as any
    return row ? mapRow(row) : null
  }

  /**
   * 清空所有模型数据
   */
  clear(): void {
    this.db.prepare(`DELETE FROM model_data`).run()
  }
}

/**
 * 映射数据库行到类型
 */
const mapRow = (row: any): ModelDataRecord => ({
  id: row.id,
  provider: row.provider,
  name: row.name,
  description: row.description || undefined,
  contextLength: row.context_length || undefined,
  pricing: row.pricing ? (safeParse(row.pricing) || undefined) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  meta: row.meta ? (safeParse(row.meta) || undefined) : undefined
})

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}
