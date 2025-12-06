/**
 * 项目工作区 Store
 * 
 * ========== 核心职责 ==========
 * 1. 管理项目工作区的加载、缓存和状态
 * 2. 提供项目元数据（概述、提示词模板、主页配置）的增删改查
 * 3. 跟踪加载状态和错误信息
 * 
 * ========== 缓存策略 ==========
 * workspaceMap:
 * - Map<projectId, ProjectWorkspaceSummary>
 * - 内存缓存，避免重复加载
 * - loadWorkspace({ force: false }): 使用缓存
 * - loadWorkspace({ force: true }): 强制刷新
 * 
 * loadingProjects:
 * - Set<projectId>
 * - 跟踪正在加载的项目，防止重复请求
 * 
 * errorByProject:
 * - Map<projectId, errorMessage>
 * - 记录每个项目的错误信息
 * 
 * ========== 不可变更新原则 ==========
 * 所有状态更新都使用不可变模式：
 * - cloneMap / cloneSet: 创建新实例
 * - 保障 Vue 响应式系统正确检测变更
 * - 防止意外的副作用
 * 
 * @module stores/projectWorkspaceStore
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProjectOverview, ProjectPromptTemplate, ProjectHomepageConfig } from '../services/projectPersistence'
import {
  projectWorkspaceService,
  type ProjectWorkspaceSummary
} from '../services/projectWorkspaceService'

/**
 * 加载选项
 */
type LoadOptions = {
  force?: boolean  // 是否强制刷新（忽略缓存）
}

/**
 * 不可变地复制 Map
 * 
 * 保证 Vue 响应式系统检测到变更。
 */
const cloneMap = <K, V>(input: Map<K, V>) => new Map(input)

/**
 * 不可变地复制 Set
 * 
 * 保证 Vue 响应式系统检测到变更。
 */
const cloneSet = <T>(input: Set<T>) => new Set(input)

/**
 * 项目工作区 Store
 * 
 * 管理项目相关的元数据和配置。
 */
export const useProjectWorkspaceStore = defineStore('projectWorkspace', () => {
  // ========== State (状态) ==========
  
  /**
   * 当前激活的项目 ID
   * 
   * 用于确定当前用户正在查看的项目。
   */
  const activeProjectId = ref<string | null>(null)
  
  /**
   * 项目工作区缓存
   * 
   * Map<projectId, ProjectWorkspaceSummary>
   * 
   * 缓存内容：
   * - overview: 项目概述（目标、状态、标签）
   * - promptTemplates: 提示词模板数组
   * - homepage: 主页配置（快速启动 ID）
   * - conversationCount: 对话数量
   * 
   * 缓存策略：
   * - 首次访问：从数据库加载
   * - 再次访问：使用缓存
   * - 强制刷新：refreshWorkspace()
   */
  const workspaceMap = ref(new Map<string, ProjectWorkspaceSummary>())
  
  /**
   * 正在加载的项目 ID 集合
   * 
   * 用于：
   * - 显示加载状态 (isCurrentProjectLoading)
   * - 防止重复请求
   */
  const loadingProjects = ref(new Set<string>())
  
  /**
   * 项目错误信息映射
   * 
   * Map<projectId, errorMessage>
   * 
   * 存储加载或保存失败的错误信息。
   */
  const errorByProject = ref(new Map<string, string>())

  // ========== Getters (计算属性) ==========
  
  /**
   * 当前激活项目的工作区数据
   * 
   * @returns ProjectWorkspaceSummary | null
   */
  const currentWorkspace = computed(() => {
    if (!activeProjectId.value) {
      return null
    }
    return workspaceMap.value.get(activeProjectId.value) ?? null
  })

  /**
   * 当前项目的概述信息
   * 
   * @returns ProjectOverview | null
   */
  const currentOverview = computed(() => currentWorkspace.value?.overview ?? null)

  /**
   * 当前项目是否正在加载
   * 
   * @returns boolean
   */
  const isCurrentProjectLoading = computed(() => {
    if (!activeProjectId.value) {
      return false
    }
    return loadingProjects.value.has(activeProjectId.value)
  })

  // ========== 内部状态管理函数 ==========
  
  /**
   * 设置项目工作区数据
   * 
   * 使用不可变更新模式，保证 Vue 响应式。
   * 
   * @param projectId - 项目 ID
   * @param workspace - 工作区数据，null 表示删除
   */
  const setWorkspace = (projectId: string, workspace: ProjectWorkspaceSummary | null) => {
    const next = cloneMap(workspaceMap.value)
    if (workspace) {
      next.set(projectId, workspace)
    } else {
      next.delete(projectId)
    }
    workspaceMap.value = next
  }

  /**
   * 设置项目的加载状态
   * 
   * @param projectId - 项目 ID
   * @param isLoading - 是否正在加载
   */
  const setLoading = (projectId: string, isLoading: boolean) => {
    const next = cloneSet(loadingProjects.value)
    if (isLoading) {
      next.add(projectId)
    } else {
      next.delete(projectId)
    }
    loadingProjects.value = next
  }

  /**
   * 设置项目的错误信息
   * 
   * @param projectId - 项目 ID
   * @param message - 错误信息，null 表示清除错误
   */
  const setError = (projectId: string, message: string | null) => {
    const next = cloneMap(errorByProject.value)
    if (message && message.length > 0) {
      next.set(projectId, message)
    } else {
      next.delete(projectId)
    }
    errorByProject.value = next
  }

  /**
   * 获取指定项目的工作区数据
   * 
   * @param projectId - 项目 ID
   * @returns ProjectWorkspaceSummary | null
   */
  const getWorkspace = (projectId: string) => workspaceMap.value.get(projectId) ?? null
  
  /**
   * 获取指定项目的错误信息
   * 
   * @param projectId - 项目 ID
   * @returns string | null
   */
  const getError = (projectId: string) => errorByProject.value.get(projectId) ?? null

  // ========== Actions (操作) ==========
  
  /**
   * 加载项目工作区数据
   * 
   * 缓存策略：
   * - force = false: 优先使用缓存，缓存不存在时加载
   * - force = true: 忽略缓存，强制从数据库加载
   * 
   * 执行流程：
   * 1. 检查 projectId 是否有效
   * 2. 检查是否有缓存（除非 force = true）
   * 3. 设置加载状态
   * 4. 调用 projectWorkspaceService.getWorkspace
   * 5. 更新缓存
   * 6. 清除加载状态
   * 
   * @param projectId - 项目 ID
   * @param options - 加载选项
   * @returns Promise<ProjectWorkspaceSummary | null>
   * @throws {Error} 加载失败时抛出
   * 
   * @example
   * // 使用缓存
   * const workspace = await loadWorkspace(projectId)
   * 
   * // 强制刷新
   * const workspace = await loadWorkspace(projectId, { force: true })
   */
  const loadWorkspace = async (
    projectId: string,
    options: LoadOptions = {}
  ): Promise<ProjectWorkspaceSummary | null> => {
    if (!projectId) {
      return null
    }

    if (!options.force && workspaceMap.value.has(projectId)) {
      return workspaceMap.value.get(projectId) ?? null
    }

    try {
      setLoading(projectId, true)
      setError(projectId, null)
      const workspace = await projectWorkspaceService.getWorkspace(projectId)
      setWorkspace(projectId, workspace)
      return workspace
    } catch (error) {
      console.error('Failed to load project workspace', error)
      setError(projectId, error instanceof Error ? error.message : 'Unknown error')
      throw error
    } finally {
      setLoading(projectId, false)
    }
  }

  /**
   * 刷新项目工作区数据
   * 
   * 快捷方法，相当于 loadWorkspace(projectId, { force: true })
   * 
   * 使用场景：
   * - 用户手动点击刷新按钮
   * - 保存后需要更新显示
   * 
   * @param projectId - 项目 ID
   * @returns Promise<ProjectWorkspaceSummary | null>
   */
  const refreshWorkspace = (projectId: string) => loadWorkspace(projectId, { force: true })

  /**
   * 更新项目概述
   * 
   * 支持部分更新（patch），不需要传递完整对象。
   * 
   * 可更新字段：
   * - goal: 项目目标
   * - status: 项目状态 ('exploring' | 'active' | 'stabilized' | 'archived')
   * - tags: 项目标签
   * 
   * 执行流程：
   * 1. 调用 projectWorkspaceService.updateProjectOverview
   * 2. 更新本地缓存
   * 3. 返回更新后的 overview
   * 
   * @param projectId - 项目 ID
   * @param patch - 部分更新的字段
   * @returns Promise<ProjectOverview | null>
   * @throws {Error} 更新失败时抛出
   * 
   * @example
   * // 只更新状态
   * await updateProjectOverview(projectId, { status: 'active' })
   * 
   * // 更新多个字段
   * await updateProjectOverview(projectId, {
   *   goal: '实现聊天机器人',
   *   tags: ['AI', 'Vue.js']
   * })
   */
  const updateProjectOverview = async (
    projectId: string,
    patch: Partial<ProjectOverview>
  ): Promise<ProjectOverview | null> => {
    if (!projectId) {
      return null
    }

    try {
      setError(projectId, null)
      const workspace = await projectWorkspaceService.updateProjectOverview(projectId, patch)
      setWorkspace(projectId, workspace)
      return workspace?.overview ?? null
    } catch (error) {
      console.error('Failed to update project overview', error)
      setError(projectId, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * 保存提示词模板
   * 
   * 全量替换模式，不是合并更新。
   * 
   * 模板类型：
   * - base: 基础层模板（可被其他模板引用）
   * - mode: 模式层模板（直接使用）
   * 
   * 模板结构：
   * - id, name, layer, description, content
   * - parameters: 参数定义数组
   * - baseTemplateIds: 依赖的 base 模板 ID
   * - order, createdAt, updatedAt, useCount, lastUsedAt
   * 
   * @param projectId - 项目 ID
   * @param templates - 完整的模板数组
   * @returns Promise<ProjectPromptTemplate[] | null>
   * @throws {Error} 保存失败时抛出
   * 
   * ⚠️ 注意：
   * - 是全量替换，不在数组中的模板将被删除
   * - 确保传递完整的模板列表
   */
  const savePromptTemplates = async (
    projectId: string,
    templates: ProjectPromptTemplate[]
  ): Promise<ProjectPromptTemplate[] | null> => {
    if (!projectId) {
      return null
    }

    try {
      setError(projectId, null)
      const workspace = await projectWorkspaceService.updatePromptTemplates(projectId, templates)
      setWorkspace(projectId, workspace)
      return workspace?.promptTemplates ?? null
    } catch (error) {
      console.error('Failed to update prompt templates', error)
      setError(projectId, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * 更新项目主页配置
   * 
   * 支持部分更新（patch）。
   * 
   * 主页配置：
   * - quickStartPromptIds: 快速启动区显示的模板 ID 数组
   * 
   * 使用场景：
   * - 用户调整快速启动区的模板
   * - 添加/移除快捷方式
   * 
   * @param projectId - 项目 ID
   * @param patch - 部分更新的字段
   * @returns Promise<ProjectHomepageConfig | null>
   * @throws {Error} 更新失败时抛出
   */
  const updateHomepageConfig = async (
    projectId: string,
    patch: Partial<ProjectHomepageConfig>
  ): Promise<ProjectHomepageConfig | null> => {
    if (!projectId) {
      return null
    }

    try {
      setError(projectId, null)
      const workspace = await projectWorkspaceService.updateHomepageConfig(projectId, patch)
      setWorkspace(projectId, workspace)
      return workspace?.homepage ?? null
    } catch (error) {
      console.error('Failed to update homepage config', error)
      setError(projectId, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  /**
   * 设置当前激活的项目
   * 
   * 自动加载机制：
   * - 设置后自动调用 loadWorkspace 加载项目数据
   * - 加载失败不会抛出错误，只记录日志
   * 
   * 使用场景：
   * - 用户点击项目列表中的项目
   * - 路由切换到项目主页
   * 
   * @param projectId - 项目 ID，null 表示清除当前选择
   * 
   * @example
   * // 激活项目
   * setActiveProject('project-123')
   * 
   * // 清除选择
   * setActiveProject(null)
   */
  const setActiveProject = (projectId: string | null) => {
    activeProjectId.value = projectId
    if (projectId) {
      loadWorkspace(projectId).catch(error => {
        console.error('Failed to load active project workspace', error)
      })
    }
  }

  // ========== 返回公共 API ==========
  return {
    // State
    activeProjectId,
    currentWorkspace,
    currentOverview,
    isCurrentProjectLoading,

    // Getters
    getWorkspace,
    getError,

    // Actions
    setActiveProject,
    loadWorkspace,
    refreshWorkspace,
    updateProjectOverview,
    savePromptTemplates,
    updateHomepageConfig
  }
})
