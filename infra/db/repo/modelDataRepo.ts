import BetterSqlite3 from 'better-sqlite3'
import type { 
  ModelDataRecord, 
  SaveModelDataInput, 
  ListModelParams 
} from '../types'

type SqlDatabase = BetterSqlite3.Database

/**
 * 模型数据 Repository
 * 
 * 职责：持久化 AI 提供商的模型列表信息（AppModel）
 * - 支持 router_source 区分接入来源 (openrouter, openai_api 等)
 * - 支持 vendor 区分模型厂商 (openai, anthropic 等)
 * - 支持软删除 (is_archived) 和时间戳追踪 (first_seen_at, last_seen_at)
 * - 支持能力 (capabilities) 和定价 (pricing) 存储
 */
export class ModelDataRepo {
  private upsertStmt: BetterSqlite3.Statement
  private deleteStmt: BetterSqlite3.Statement
  private deleteByRouterSourceStmt: BetterSqlite3.Statement
  private getByIdStmt: BetterSqlite3.Statement
  private archiveStmt: BetterSqlite3.Statement
  private unarchiveStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    // UPSERT 语句 - 保留 first_seen_at，更新其他字段
    this.upsertStmt = this.db.prepare(`
      INSERT INTO model_data(
        id, router_source, vendor, name, description, context_length, 
        pricing, capabilities, is_archived, first_seen_at, last_seen_at,
        created_at, updated_at, meta
      )
      VALUES (
        @id, @routerSource, @vendor, @name, @description, @contextLength,
        @pricing, @capabilities, @isArchived, @firstSeenAt, @lastSeenAt,
        @createdAt, @updatedAt, @meta
      )
      ON CONFLICT(id) DO UPDATE SET
        router_source = @routerSource,
        vendor = @vendor,
        name = @name,
        description = @description,
        context_length = @contextLength,
        pricing = @pricing,
        capabilities = @capabilities,
        is_archived = @isArchived,
        last_seen_at = @lastSeenAt,
        updated_at = @updatedAt,
        meta = @meta
    `)

    this.deleteStmt = this.db.prepare(`DELETE FROM model_data WHERE id = ?`)
    this.deleteByRouterSourceStmt = this.db.prepare(`DELETE FROM model_data WHERE router_source = ?`)
    this.getByIdStmt = this.db.prepare(`SELECT * FROM model_data WHERE id = ?`)
    this.archiveStmt = this.db.prepare(`UPDATE model_data SET is_archived = 1, updated_at = ? WHERE id = ?`)
    this.unarchiveStmt = this.db.prepare(`UPDATE model_data SET is_archived = 0, updated_at = ? WHERE id = ?`)
  }

  /**
   * 保存单个模型数据（插入或更新）
   */
  save(input: SaveModelDataInput): void {
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    
    this.upsertStmt.run({
      id: input.id,
      routerSource: input.routerSource || 'openrouter',
      vendor: input.vendor || extractVendorFromId(input.id),
      name: input.name || input.id,
      description: input.description || null,
      contextLength: input.contextLength ?? -1,
      pricing: input.pricing ? JSON.stringify(input.pricing) : null,
      capabilities: input.capabilities ? JSON.stringify(input.capabilities) : null,
      isArchived: input.isArchived ? 1 : 0,
      firstSeenAt: input.firstSeenAt || nowIso,
      lastSeenAt: input.lastSeenAt || nowIso,
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
   * 替换指定 router_source 的模型（软删除策略）
   * 
   * 1. 标记不在新列表中的模型为 is_archived = true
   * 2. 更新/插入新列表中的模型，标记为 is_archived = false
   * 
   * @param routerSource 接入来源
   * @param models 最新模型列表
   */
  replaceByRouterSource(routerSource: string, models: SaveModelDataInput[]): void {
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const newIds = new Set(models.map(m => m.id))
    
    const tx = this.db.transaction(() => {
      // 1. 获取当前该 router_source 下所有活跃模型
      const existingRows = this.db.prepare(`
        SELECT id FROM model_data WHERE router_source = ? AND is_archived = 0
      `).all(routerSource) as { id: string }[]
      
      // 2. 归档不在新列表中的模型
      for (const row of existingRows) {
        if (!newIds.has(row.id)) {
          this.archiveStmt.run(now, row.id)
        }
      }
      
      // 3. 保存新模型（更新 last_seen_at，取消归档）
      for (const model of models) {
        this.save({
          ...model,
          routerSource,
          isArchived: false,
          lastSeenAt: nowIso
        })
      }
    })
    tx()
  }

  /**
   * 归档模型（软删除）
   */
  archive(modelId: string): void {
    this.archiveStmt.run(Date.now(), modelId)
  }

  /**
   * 取消归档模型
   */
  unarchive(modelId: string): void {
    this.unarchiveStmt.run(Date.now(), modelId)
  }

  /**
   * 硬删除模型
   */
  delete(modelId: string): void {
    this.deleteStmt.run(modelId)
  }

  /**
   * 删除指定 router_source 的所有模型（硬删除）
   */
  deleteByRouterSource(routerSource: string): void {
    this.deleteByRouterSourceStmt.run(routerSource)
  }

  /**
   * 获取所有模型（支持过滤）
   */
  getAll(params: ListModelParams = {}): ModelDataRecord[] {
    let sql = `SELECT * FROM model_data WHERE 1=1`
    const bindings: any[] = []
    
    if (params.routerSource) {
      sql += ` AND router_source = ?`
      bindings.push(params.routerSource)
    }
    
    if (params.vendor) {
      sql += ` AND vendor = ?`
      bindings.push(params.vendor)
    }
    
    if (!params.includeArchived) {
      sql += ` AND is_archived = 0`
    }
    
    sql += ` ORDER BY router_source, vendor, name`
    
    if (params.limit) {
      sql += ` LIMIT ?`
      bindings.push(params.limit)
    }
    
    if (params.offset) {
      sql += ` OFFSET ?`
      bindings.push(params.offset)
    }
    
    const rows = this.db.prepare(sql).all(...bindings) as any[]
    return rows.map(mapRow)
  }

  /**
   * 根据 router_source 获取模型列表
   */
  getByRouterSource(routerSource: string, includeArchived = false): ModelDataRecord[] {
    return this.getAll({ routerSource, includeArchived })
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
 * 从模型 ID 提取 vendor（如 openai/gpt-4o -> openai）
 */
function extractVendorFromId(id: string): string {
  const slashIndex = id.indexOf('/')
  return slashIndex > 0 ? id.substring(0, slashIndex) : 'unknown'
}

/**
 * 映射数据库行到类型
 */
const mapRow = (row: any): ModelDataRecord => ({
  id: row.id,
  routerSource: row.router_source,
  vendor: row.vendor,
  name: row.name,
  description: row.description || undefined,
  contextLength: row.context_length ?? -1,
  pricing: row.pricing ? safeParse(row.pricing) : undefined,
  capabilities: row.capabilities ? safeParse(row.capabilities) : undefined,
  isArchived: Boolean(row.is_archived),
  firstSeenAt: row.first_seen_at || undefined,
  lastSeenAt: row.last_seen_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  meta: row.meta ? safeParse(row.meta) : undefined
})

const safeParse = <T = any>(input: string): T | undefined => {
  try {
    return JSON.parse(input)
  } catch {
    return undefined
  }
}
