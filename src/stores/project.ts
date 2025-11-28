/**
 * 项目管理 Store
 * 
 * 职责：
 * - 项目 CRUD (创建、删除、重命名)
 * - 活动项目管理
 * - 对话与项目关联管理
 * - 项目数据持久化
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useConversationStore } from './conversation'
import { sqliteProjectPersistence } from '../services/projectPersistence'
import { sqliteChatPersistence } from '../services/chatPersistence'
import { electronStore as persistenceStore } from '../utils/electronBridge'
import { serializeTree } from './branchTreeHelpers'

// ========== 类型定义 ==========

/**
 * 项目接口
 */
export interface Project {
  /** 项目唯一标识符 */
  id: string
  /** 项目名称 */
  name: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
  /** 是否为系统项目（如 "全部对话"、"未分配"） */
  isSystem?: boolean
}

/**
 * 项目 Store 状态接口
 */
export interface ProjectStoreState {
  /** 所有项目列表 */
  projects: Project[]
  /** 当前活动的项目 ID（null 表示 "全部对话" 视图） */
  activeProjectId: string | null
  /** 需要持久化的项目 ID 集合 */
  dirtyProjectIds: Set<string>
}

// ========== Store 定义 ==========

export const useProjectStore = defineStore('project', () => {
  // ========== State ==========
  
  /**
   * 所有项目列表
   */
  const projects = ref<Project[]>([])

  /**
   * 当前激活的项目 ID
   * - null: "全部对话" 视图
   * - 'unassigned': "未分配" 视图
   * - string: 特定项目 ID
   */
  const activeProjectId = ref<string | null>(null)

  /**
   * 需要保存到数据库的项目 ID 集合
   */
  const dirtyProjectIds = ref<Set<string>>(new Set())

  /**
   * 元状态是否需要持久化（activeProjectId 变更）
   */
  const metaStateDirty = ref(false)

  // ========== Getters ==========

  /**
   * 根据 ID 获取项目对象
   */
  const getProjectById = computed(() => {
    return (projectId: string | null | undefined): Project | null => {
      if (!projectId) {
        return null
      }
      return projects.value.find(p => p.id === projectId) || null
    }
  })

  /**
   * 按更新时间降序排列的项目列表
   */
  const orderedProjects = computed<Project[]>(() => {
    return [...projects.value].sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || 0
      const bTime = b.updatedAt || b.createdAt || 0
      // 时间相同时按 ID 排序确保稳定性
      if (bTime === aTime) {
        return a.id.localeCompare(b.id)
      }
      return bTime - aTime
    })
  })

  /**
   * 每个项目下的对话数量统计
   */
  const projectConversationCounts = computed<Record<string, number>>(() => {
    const conversationStore = useConversationStore()
    const counts: Record<string, number> = { unassigned: 0 }
    
    for (const conversation of conversationStore.conversations) {
      const projectId = conversation.projectId
      if (projectId) {
        counts[projectId] = (counts[projectId] || 0) + 1
      } else {
        counts.unassigned += 1
      }
    }
    
    return counts
  })

  // ========== Actions - 脏数据标记 ==========

  /**
   * 标记项目为脏数据（需要持久化）
   */
  const markProjectDirty = (projectId: string) => {
    dirtyProjectIds.value.add(projectId)
  }

  /**
   * 标记元状态为脏数据（activeProjectId 需要持久化）
   */
  const markMetaStateDirty = () => {
    metaStateDirty.value = true
  }

  // ========== Actions - 项目 CRUD ==========

  /**
   * 创建新项目
   * @param name 项目名称
   * @returns 项目 ID（新建或已存在）；null 表示失败
   */
  const createProject = async (name: string): Promise<string | null> => {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) {
      console.warn('⚠️ createProject: 项目名称不能为空')
      return null
    }

    // 检查项目名称是否已存在
    const existingProject = projects.value.find(p => p.name === trimmed)
    if (existingProject) {
      console.info('ℹ️ createProject: 项目名称已存在，返回已有项目 ID', trimmed)
      return existingProject.id
    }

    const now = Date.now()
    const newProject: Project = {
      id: uuidv4(),
      name: trimmed,
      createdAt: now,
      updatedAt: now
    }

    projects.value = [...projects.value, newProject]
    markProjectDirty(newProject.id)
    await saveProjects()
    console.log('✅ 项目已保存到 SQLite:', newProject.name)
    
    return newProject.id
  }

  /**
   * 重命名项目
   * @param projectId 项目 ID
   * @param newName 新名称
   * @returns true (成功) | false (失败) | string (名称重复，返回已存在项目的 ID)
   */
  const renameProject = async (
    projectId: string,
    newName: string
  ): Promise<boolean | string> => {
    const project = projects.value.find(p => p.id === projectId)
    if (!project) {
      console.error('❌ renameProject: 找不到项目', projectId)
      return false
    }

    const trimmed = typeof newName === 'string' ? newName.trim() : ''
    if (!trimmed) {
      console.warn('⚠️ renameProject: 新名称不能为空')
      return false
    }

    if (project.name === trimmed) {
      return true
    }

    // 检查新名称是否与其他项目重复
    const existingProject = projects.value.find(
      p => p.id !== projectId && p.name === trimmed
    )
    if (existingProject) {
      console.info('ℹ️ renameProject: 项目名称已存在，返回已有项目 ID', trimmed)
      return existingProject.id
    }

    project.name = trimmed
    project.updatedAt = Date.now()
    markProjectDirty(project.id)
    await saveProjects()
    console.log('✅ 项目已更新到 SQLite:', project.name)
    
    return true
  }

  /**
   * 删除项目并解除对话关联
   * @param projectId 项目 ID
   * @returns 是否成功
   */
  const deleteProject = async (projectId: string): Promise<boolean> => {
    const index = projects.value.findIndex(p => p.id === projectId)
    if (index === -1) {
      console.error('❌ deleteProject: 找不到项目', projectId)
      return false
    }

    projects.value.splice(index, 1)
    dirtyProjectIds.value.delete(projectId)

    // 清除关联对话的 projectId 并保存到 SQLite
    const conversationStore = useConversationStore()
    const now = Date.now()
    const affectedConversations: any[] = []
    
    for (const conversation of conversationStore.conversations) {
      if (conversation.projectId === projectId) {
        conversation.projectId = null
        conversation.updatedAt = now
        affectedConversations.push(conversation)
      }
    }

    // 并行保存所有受影响的对话
    if (affectedConversations.length > 0) {
      await Promise.all(
        affectedConversations.map(conv => saveConversationToSQLite(conv))
      )
    }

    // 如果删除的是当前激活项目，重置为 null（"全部对话"）
    if (activeProjectId.value === projectId) {
      activeProjectId.value = null
      markMetaStateDirty()
    }

    // 从 SQLite 删除项目
    await sqliteProjectPersistence.deleteProject(projectId)
    console.log('✅ 项目已从 SQLite 删除，已清除 %d 个关联对话', affectedConversations.length)
    
    return true
  }

  /**
   * 设置当前活动项目
   * @param projectId 项目 ID（null 表示 "全部对话"，'unassigned' 表示 "未分配"）
   */
  const setActiveProject = (projectId: string | null) => {
    if (!projectId) {
      activeProjectId.value = null
      markMetaStateDirty()
      saveProjectsSync()
      return
    }

    if (projectId === 'unassigned') {
      activeProjectId.value = 'unassigned'
      markMetaStateDirty()
      saveProjectsSync()
      return
    }

    const exists = projects.value.some(project => project.id === projectId)
    if (!exists) {
      console.warn('⚠️ setActiveProject: 项目不存在', projectId)
      activeProjectId.value = null
      markMetaStateDirty()
      saveProjectsSync()
      return
    }

    activeProjectId.value = projectId
    markMetaStateDirty()
    saveProjectsSync()
  }

  // ========== Actions - 对话关联管理 ==========

  /**
   * 将对话分配到项目
   * @param conversationId 对话 ID
   * @param projectId 项目 ID
   * @returns 是否成功
   */
  const assignConversationToProject = (
    conversationId: string,
    projectId: string
  ): boolean => {
    if (!projectId) {
      return removeConversationFromProject(conversationId)
    }

    const projectExists = projects.value.some(p => p.id === projectId)
    if (!projectExists) {
      console.error('❌ assignConversationToProject: 项目不存在', projectId)
      return false
    }

    const conversationStore = useConversationStore()
    const conversation = conversationStore.conversations.find(
      conv => conv.id === conversationId
    )
    if (!conversation) {
      console.error('❌ assignConversationToProject: 找不到对话', conversationId)
      return false
    }

    if (conversation.projectId === projectId) {
      return true
    }

    conversation.projectId = projectId
    conversation.updatedAt = Date.now()
    
    // 立即保存到 SQLite
    saveConversationToSQLite(conversation).catch(err => {
      console.error('❌ 保存对话项目分配失败:', err)
    })
    
    return true
  }

  /**
   * 从项目中移除对话
   * @param conversationId 对话 ID
   * @returns 是否成功
   */
  const removeConversationFromProject = (conversationId: string): boolean => {
    const conversationStore = useConversationStore()
    const conversation = conversationStore.conversations.find(
      conv => conv.id === conversationId
    )
    if (!conversation) {
      console.error('❌ removeConversationFromProject: 找不到对话', conversationId)
      return false
    }

    if (!conversation.projectId) {
      return true
    }

    conversation.projectId = null
    conversation.updatedAt = Date.now()
    
    // 立即保存到 SQLite
    saveConversationToSQLite(conversation).catch(err => {
      console.error('❌ 保存对话项目移除失败:', err)
    })
    
    return true
  }

  // ========== Actions - 数据持久化 ==========

  /**
   * 保存对话到 SQLite（用于项目分配变更）
   * @param conversation 对话对象
   */
  const saveConversationToSQLite = async (conversation: any) => {
    try {
      // 序列化树结构
      const serializedTree = serializeTree(conversation.tree)
      
      // 构建快照
      const snapshot = {
        id: conversation.id,
        title: conversation.title,
        draft: conversation.draft,
        tree: serializedTree,
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        projectId: conversation.projectId,
        status: conversation.status,
        tags: conversation.tags,
        webSearchEnabled: conversation.webSearch?.enabled,
        webSearchLevel: conversation.webSearch?.level,
        reasoningPreference: conversation.reasoning
      }
      
      await sqliteChatPersistence.saveConversation(snapshot)
      console.log('✅ 对话项目关联已保存到 SQLite:', conversation.id)
    } catch (error) {
      console.error('❌ 保存对话到 SQLite 失败:', error)
      throw error
    }
  }

  /**
   * 从数据库加载项目数据
   */
  const loadProjects = async () => {
    try {
      // 加载项目列表
      const projectSnapshots = await sqliteProjectPersistence.listProjects()
      projects.value = projectSnapshots.map(project => ({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }))
      console.log(`✅ 从 SQLite 加载了 ${projects.value.length} 个项目`)

      // 加载活动项目 ID
      const savedActiveProjectId = await persistenceStore.get('activeProjectId')
      if (savedActiveProjectId) {
        const isUnassigned = savedActiveProjectId === 'unassigned'
        const projectExists = projects.value.some(
          project => project.id === savedActiveProjectId
        )
        if (isUnassigned || projectExists) {
          activeProjectId.value = savedActiveProjectId
          if (activeProjectId.value) {
            console.log(`✅ 恢复活动项目: ${activeProjectId.value}`)
          }
        } else {
          console.warn('⚠️ 活动项目不存在，重置为 null')
          activeProjectId.value = null
        }
      }

      dirtyProjectIds.value.clear()
      metaStateDirty.value = false
    } catch (error) {
      console.error('❌ 加载项目数据失败:', error)
      throw error
    }
  }

  /**
   * 保存项目数据到数据库（异步）
   */
  const saveProjects = async () => {
    try {
      // 保存脏项目
      if (dirtyProjectIds.value.size > 0) {
        for (const projectId of dirtyProjectIds.value) {
          const project = projects.value.find(p => p.id === projectId)
          if (project) {
            await sqliteProjectPersistence.saveProject({
              id: project.id,
              name: project.name,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt
            })
          }
        }
        dirtyProjectIds.value.clear()
      }

      // 保存元状态
      if (metaStateDirty.value) {
        const plainActiveProjectId = activeProjectId.value
        if (plainActiveProjectId !== null) {
          await persistenceStore.set('activeProjectId', plainActiveProjectId)
        } else {
          await persistenceStore.delete('activeProjectId')
        }
        metaStateDirty.value = false
      }
    } catch (error) {
      console.error('❌ 保存项目数据失败:', error)
      throw error
    }
  }

  /**
   * 同步保存项目数据（使用 Promise 但不等待）
   */
  const saveProjectsSync = () => {
    saveProjects().catch(error => {
      console.error('❌ 同步保存项目数据失败:', error)
    })
  }

  // ========== 返回 Store API ==========

  return {
    // State
    projects,
    activeProjectId,
    
    // Getters
    getProjectById,
    orderedProjects,
    projectConversationCounts,
    
    // Actions - CRUD
    createProject,
    renameProject,
    deleteProject,
    setActiveProject,
    
    // Actions - 关联管理
    assignConversationToProject,
    removeConversationFromProject,
    
    // Actions - 持久化
    loadProjects,
    saveProjects,
    saveProjectsSync
  }
})
