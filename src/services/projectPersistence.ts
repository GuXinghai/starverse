/**
 * 项目数据持久化服务
 * 
 * ========== 核心职责 ==========
 * 1. 管理项目工作区的 CRUD 操作
 * 2. 序列化/反序列化项目元数据（提示词模板、概述、配置）
 * 3. 规范化和验证项目数据（防止损坏数据）
 * 
 * ========== 数据结构 ==========
 * ProjectSnapshot (内存格式):
 *   - id: 项目唯一标识符
 *   - name: 项目名称
 *   - meta: 项目元数据 (ProjectMeta)
 *     - overview: 项目概述（目标、状态、标签）
 *     - homepage: 主页配置（快速启动提示词 ID）
 *     - promptTemplates: 提示词模板数组
 * 
 * ProjectPromptTemplate (提示词模板):
 *   - layer: 'base' | 'mode' (基础层/模式层)
 *   - content: 模板内容（支持参数替换）
 *   - parameters: 参数定义数组
 *   - baseTemplateIds: 依赖的基础模板 ID
 *   - useCount, lastUsedAt: 使用统计
 * 
 * ========== 数据库表 ==========
 * projects 表:
 *   - id, name, createdAt, updatedAt
 *   - meta (JSON): 存储 ProjectMeta
 * 
 * 关联关系:
 *   - conversations.projectId → projects.id (1:N)
 * 
 * ========== 设计原则 ==========
 * - 所有字段都有默认值，防止空指针
 * - 使用 normalize 函数规范化数据，处理遗留数据
 * - 使用 deepToRaw 移除 Vue Proxy，确保可序列化
 * 
 * @module services/projectPersistence
 */

import { toRaw } from 'vue'
import { dbService, type ProjectRecord } from './db'

/**
 * 项目状态选项
 * 
 * - exploring: 探索阶段（初始阶段）
 * - active: 活跃开发
 * - stabilized: 已稳定
 * - archived: 已归档
 */
export const PROJECT_STATUS_OPTIONS = ['exploring', 'active', 'stabilized', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUS_OPTIONS)[number]

/**
 * 项目概述
 * 
 * 存储项目的高层信息和状态。
 */
export interface ProjectOverview {
  goal: string            // 项目目标描述
  status: ProjectStatus   // 项目状态
  tags: string[]          // 项目标签（去重）
}

/**
 * 项目主页配置
 * 
 * 控制项目主页的显示内容。
 */
export interface ProjectHomepageConfig {
  quickStartPromptIds: string[]  // 快速启动区显示的提示词模板 ID
}

/**
 * 项目元数据
 * 
 * 存储在 projects.meta 字段中的 JSON 数据。
 * 
 * 🔒 扩展性:
 * - 使用 [key: string]: unknown 允许未来添加新字段
 * - 已知字段有明确类型定义
 */
export interface ProjectMeta {
  overview: ProjectOverview
  homepage: ProjectHomepageConfig
  promptTemplates?: ProjectPromptTemplate[]  // 提示词模板数组
  [key: string]: unknown  // 允许扩展字段
}

/**
 * 提示词模板层级
 * 
 * - base: 基础层模板（可被其他模板引用）
 * - mode: 模式层模板（直接使用）
 */
export type PromptTemplateLayer = 'base' | 'mode'

/**
 * 提示词模板参数
 * 
 * 定义模板中可替换的参数。
 * 
 * @example
 * 模板内容: "Analyze {{topic}} in detail"
 * 参数: { key: "topic", label: "主题", defaultValue: "code" }
 */
export interface PromptTemplateParameter {
  key: string           // 参数键名（在模板中使用 {{key}}）
  label: string         // 显示标签
  defaultValue?: string // 默认值
}

/**
 * 项目提示词模板
 * 
 * 定义可重用的提示词模板，支持参数替换和模板组合。
 * 
 * 🔗 模板组合:
 * - mode 模板可以引用多个 base 模板 (baseTemplateIds)
 * - 最终内容 = base 模板 + mode 模板
 */
export interface ProjectPromptTemplate {
  id: string
  name: string
  layer: PromptTemplateLayer
  description?: string
  content: string                      // 模板内容（支持 {{param}} 语法）
  parameters?: PromptTemplateParameter[]  // 参数定义
  baseTemplateIds?: string[]           // 依赖的 base 模板 ID
  order?: number                       // 显示顺序
  createdAt?: number
  updatedAt?: number
  useCount?: number                    // 使用次数统计
  lastUsedAt?: number                  // 最后使用时间
}

/**
 * 项目快照
 * 
 * 内存中的项目数据结构，与 SQLite 之间的数据交换格式。
 */
export interface ProjectSnapshot {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta?: ProjectMeta | null
}

/**
 * 限制字符串长度
 * 
 * 防止恶意数据占用大量存储空间。
 * 
 * @param value - 输入字符串
 * @param max - 最大长度（默认 2000）
 * @returns 截断后的字符串
 */
const clampLength = (value: string, max = 2000) => {
  if (value.length <= max) {
    return value
  }
  return value.slice(0, max)
}

/**
 * 创建默认项目概述
 * 
 * 用于新建项目或修复损坏数据。
 */
export const createDefaultProjectOverview = (): ProjectOverview => ({
  goal: '',
  status: 'exploring',
  tags: []
})

/**
 * 创建默认主页配置
 */
export const createDefaultHomepageConfig = (): ProjectHomepageConfig => ({
  quickStartPromptIds: []
})

/**
 * 创建默认项目元数据
 * 
 * 包含所有必需字段的默认值。
 */
export const createDefaultProjectMeta = (): ProjectMeta => ({
  overview: createDefaultProjectOverview(),
  homepage: createDefaultHomepageConfig(),
  promptTemplates: []
})

/**
 * 字符串数组去重
 * 
 * @param values - 字符串数组
 * @returns 去重后的数组
 */
const dedupeStrings = (values: string[]) => Array.from(new Set(values))

/**
 * 规范化项目概述
 * 
 * 处理可能损坏或遗留的数据，确保所有字段合法。
 * 
 * 验证规则:
 * - goal: 字符串，限制长度
 * - status: 只能是 PROJECT_STATUS_OPTIONS 之一
 * - tags: 字符串数组，去重、去空
 * 
 * @param input - 输入数据（可能不完整）
 * @returns 规范化后的 ProjectOverview
 */
export const normalizeProjectOverview = (
  input?: Partial<ProjectOverview> | null
): ProjectOverview => {
  const source = input && typeof input === 'object' ? input : {}
  const goal =
    typeof source.goal === 'string' ? clampLength(source.goal) : createDefaultProjectOverview().goal

  const status = PROJECT_STATUS_OPTIONS.includes(source.status as ProjectStatus)
    ? (source.status as ProjectStatus)
    : 'exploring'

  const tags = Array.isArray(source.tags)
    ? dedupeStrings(
        source.tags
          .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(tag => tag.length > 0)
      )
    : []

  return { goal, status, tags }
}

export const normalizeProjectHomepage = (
  input?: Partial<ProjectHomepageConfig> | null
): ProjectHomepageConfig => {
  const source = input && typeof input === 'object' ? input : {}
  const ids = Array.isArray(source.quickStartPromptIds)
    ? source.quickStartPromptIds
        .map(id => (typeof id === 'string' ? id.trim() : ''))
        .filter(id => id.length > 0)
    : []

  return { quickStartPromptIds: dedupeStrings(ids) }
}

export const normalizeProjectMeta = (meta?: ProjectMeta | null): ProjectMeta => {
  if (!meta || typeof meta !== 'object') {
    return createDefaultProjectMeta()
  }

  const base = { ...(meta as Record<string, unknown>) } as ProjectMeta
  return {
    ...base,
    overview: normalizeProjectOverview(base.overview),
    homepage: normalizeProjectHomepage(base.homepage),
    promptTemplates: normalizePromptTemplates(base.promptTemplates)
  }
}

export const normalizePromptTemplates = (
  input?: ProjectPromptTemplate[] | null
): ProjectPromptTemplate[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map(template => {
      if (!template || typeof template !== 'object') {
        return null
      }

      const id =
        typeof template.id === 'string' && template.id.trim().length > 0
          ? template.id.trim()
          : null
      if (!id) {
        return null
      }

      const name =
        typeof template.name === 'string' && template.name.trim().length > 0
          ? template.name.trim()
          : null
      if (!name) {
        return null
      }

      const layer: PromptTemplateLayer =
        template.layer === 'mode' ? 'mode' : 'base'

      const content =
        typeof template.content === 'string' ? template.content : ''

      const parameters = Array.isArray(template.parameters)
        ? template.parameters
            .map<PromptTemplateParameter | null>(param => {
              if (!param || typeof param !== 'object') {
                return null
              }
              const key =
                typeof param.key === 'string' && param.key.trim().length > 0
                  ? param.key.trim()
                  : null
              if (!key) {
                return null
              }
              const parameter: PromptTemplateParameter = {
                key,
                label:
                  typeof param.label === 'string' && param.label.trim().length > 0
                    ? param.label.trim()
                    : key
              }
              if (typeof param.defaultValue === 'string') {
                parameter.defaultValue = param.defaultValue
              }
              return parameter
            })
            .filter(
              (param): param is PromptTemplateParameter =>
                param !== null
            )
        : undefined

      const baseTemplateIds = Array.isArray(template.baseTemplateIds)
        ? Array.from(
            new Set(
              template.baseTemplateIds
                .map(item => (typeof item === 'string' ? item.trim() : ''))
                .filter(item => item.length > 0)
            )
          )
        : undefined

      const order =
        typeof template.order === 'number' && Number.isFinite(template.order)
          ? template.order
          : undefined

      return {
        id,
        name,
        layer,
        description:
          typeof template.description === 'string'
            ? template.description
            : undefined,
        content,
        parameters,
        baseTemplateIds,
        order,
        createdAt:
          typeof template.createdAt === 'number' ? template.createdAt : Date.now(),
        updatedAt:
          typeof template.updatedAt === 'number' ? template.updatedAt : Date.now(),
        useCount:
          typeof template.useCount === 'number' && Number.isFinite(template.useCount)
            ? Math.max(0, Math.floor(template.useCount))
            : 0,
        lastUsedAt:
          typeof template.lastUsedAt === 'number' ? template.lastUsedAt : undefined
      } satisfies ProjectPromptTemplate
    })
    .filter(Boolean) as ProjectPromptTemplate[]
}

const sanitizeMetaForPersist = (meta?: ProjectMeta | null): ProjectMeta | null => {
  if (!meta) {
    return null
  }
  return normalizeProjectMeta(meta)
}

/**
 * 娣卞害鍘婚櫎 Vue Proxy 鍖呰
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
 * 椤圭洰 SQLite 鎸佷箙鍖栨湇鍔?
 */
export class SqliteProjectPersistence {
  /**
   * 鍔犺浇鎵€鏈夐」鐩?
   */
  async listProjects(): Promise<ProjectSnapshot[]> {
    const records = await dbService.listProjects({ limit: 1000 })
    return records.map(this.mapRecordToSnapshot)
  }

  /**
   * 淇濆瓨鍗曚釜椤圭洰锛堝瓨鍦ㄥ垯鏇存柊锛?
   */
  async saveProject(snapshot: ProjectSnapshot): Promise<void> {
    const cleanSnapshot = deepToRaw(snapshot)
    const meta = sanitizeMetaForPersist(cleanSnapshot.meta)

    await dbService.saveProject({
      id: cleanSnapshot.id,
      name: cleanSnapshot.name,
      createdAt: cleanSnapshot.createdAt,
      updatedAt: cleanSnapshot.updatedAt,
      meta
    })
  }

  /**
   * 鍒涘缓鏂伴」鐩?
   */
  async createProject(snapshot: ProjectSnapshot): Promise<void> {
    const cleanSnapshot = deepToRaw(snapshot)
    const meta = sanitizeMetaForPersist(cleanSnapshot.meta)

    await dbService.createProject({
      id: cleanSnapshot.id,
      name: cleanSnapshot.name,
      createdAt: cleanSnapshot.createdAt,
      meta
    })
  }

  /**
   * 鍒犻櫎椤圭洰
   */
  async deleteProject(projectId: string): Promise<void> {
    await dbService.deleteProject({ id: projectId })
  }

  /**
   * 鏍规嵁鍚嶇О鏌ユ壘椤圭洰
   */
  async findByName(name: string): Promise<ProjectSnapshot | null> {
    const record = await dbService.findProjectByName(name)
    return record ? this.mapRecordToSnapshot(record) : null
  }

  /**
   * 鏍规嵁 ID 鏌ユ壘椤圭洰
   */
  async findById(id: string): Promise<ProjectSnapshot | null> {
    const record = await dbService.findProjectById(id)
    return record ? this.mapRecordToSnapshot(record) : null
  }

  /**
   * 缁熻椤圭洰涓嬬殑瀵硅瘽鏁伴噺
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
      updatedAt: record.updatedAt,
      meta: normalizeProjectMeta(record.meta as ProjectMeta | null)
    }
  }
}

export const sqliteProjectPersistence = new SqliteProjectPersistence()
