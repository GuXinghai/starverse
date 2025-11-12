import { toRaw } from 'vue'
import { dbService, type ProjectRecord } from './db'

export interface ProjectSnapshot {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

/**
 * 深度去除 Vue Proxy 包装
 */
function deepToRaw(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }
  const raw = toRaw(obj)
  if (Array.isArray(raw)) {
    return raw.map(item => deepToRaw(item))
  }
  const result: any = {}
  for (const key in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      result[key] = deepToRaw(raw[key])
    }
  }
  return result
}

/**
 * 项目 SQLite 持久化服务
 */
export class SqliteProjectPersistence {
  /**
   * 加载所有项目
   */
  async listProjects(): Promise<ProjectSnapshot[]> {
    const records = await dbService.listProjects({ limit: 1000 })
    return records.map(this.mapRecordToSnapshot)
  }

  /**
   * 保存单个项目（存在则更新）
   */
  async saveProject(snapshot: ProjectSnapshot): Promise<void> {
    // 🛡️ 边界防御：统一对 snapshot 进行深度去代理化
    const cleanSnapshot = deepToRaw(snapshot)
    
    await dbService.saveProject({
      id: cleanSnapshot.id,
      name: cleanSnapshot.name,
      createdAt: cleanSnapshot.createdAt,
      updatedAt: cleanSnapshot.updatedAt
    })
  }

  /**
   * 创建新项目
   */
  async createProject(snapshot: ProjectSnapshot): Promise<void> {
    // 🛡️ 边界防御：统一对 snapshot 进行深度去代理化
    const cleanSnapshot = deepToRaw(snapshot)
    
    await dbService.createProject({
      id: cleanSnapshot.id,
      name: cleanSnapshot.name,
      createdAt: cleanSnapshot.createdAt
    })
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    await dbService.deleteProject({ id: projectId })
  }

  /**
   * 根据名称查找项目
   */
  async findByName(name: string): Promise<ProjectSnapshot | null> {
    const record = await dbService.findProjectByName(name)
    return record ? this.mapRecordToSnapshot(record) : null
  }

  /**
   * 根据 ID 查找项目
   */
  async findById(id: string): Promise<ProjectSnapshot | null> {
    const record = await dbService.findProjectById(id)
    return record ? this.mapRecordToSnapshot(record) : null
  }

  /**
   * 统计项目下的对话数量
   */
  async countConversations(projectId: string): Promise<number> {
    const result = await dbService.countProjectConversations(projectId)
    return result.count
  }

  private mapRecordToSnapshot(record: ProjectRecord): ProjectSnapshot {
    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }
}

export const sqliteProjectPersistence = new SqliteProjectPersistence()
