/**
 * 对话元数据管理 Composable
 * 
 * 封装对话状态、标签和模板保存功能
 * 
 * 核心功能：
 * - 对话状态管理（status）
 * - 标签管理（tags）
 * - 模板保存功能
 * - 输入状态管理
 * 
 * 设计原则：
 * - 与 UI 解耦，专注业务逻辑
 * - 集成 Store 操作
 * - 提供类型安全的接口
 */

import { computed, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { ProjectPromptTemplate } from '../../services/projectPersistence'
import type { ConversationStatus } from '../../types/conversation'
import { DEFAULT_CONVERSATION_STATUS } from '../../types/conversation'

// ========== 类型定义 ==========

export interface UseConversationMetadataOptions {
  conversationId: Ref<string>
  draftInput: Ref<string>
  conversationTagInput: Ref<string>
  saveTemplateInProgress: Ref<boolean>
  currentConversation: ComputedRef<any>
  conversationStore: any
  branchStore: any
  projectWorkspaceStore: any
}

export interface UseConversationMetadataReturn {
  conversationStatus: ComputedRef<ConversationStatus>
  conversationTags: ComputedRef<string[]>
  canSaveConversationTemplate: ComputedRef<boolean>
  handleConversationStatusChange: (event: Event) => void
  handleConversationTagAdd: () => void
  handleConversationTagKeydown: (event: KeyboardEvent) => void
  handleConversationTagRemove: (tag: string) => void
  handleSaveConversationAsTemplate: () => Promise<void>
  getLastUserMessageText: () => string
}

// ========== Composable 实现 ==========

export function useConversationMetadata(
  options: UseConversationMetadataOptions
): UseConversationMetadataReturn {
  const {
    conversationId,
    draftInput,
    conversationTagInput,
    saveTemplateInProgress,
    currentConversation,
    conversationStore,
    branchStore,
    projectWorkspaceStore
  } = options
  
  // ========== 计算属性 ==========
  
  const conversationStatus = computed<ConversationStatus>(() => {
    return currentConversation.value?.status ?? DEFAULT_CONVERSATION_STATUS
  })
  
  const conversationTags = computed(() => {
    return currentConversation.value?.tags ?? []
  })
  
  const canSaveConversationTemplate = computed(() => {
    return !!currentConversation.value?.projectId
  })
  
  // ========== Watch 对话切换，清空标签输入 ==========
  
  watch(
    () => currentConversation.value?.id,
    () => {
      conversationTagInput.value = ''
    }
  )
  
  // ========== 状态变更处理 ==========
  
  const handleConversationStatusChange = (event: Event) => {
    if (!currentConversation.value) {
      return
    }
    const target = event.target as HTMLSelectElement | null
    if (!target) {
      return
    }
    conversationStore.setConversationStatus(
      conversationId.value,
      target.value as ConversationStatus
    )
  }
  
  // ========== 标签管理 ==========
  
  const handleConversationTagAdd = () => {
    if (!currentConversation.value) {
      return
    }
    const value = conversationTagInput.value.trim()
    if (!value) {
      return
    }
    conversationStore.addTag(conversationId.value, value)
    conversationTagInput.value = ''
  }
  
  const handleConversationTagKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    handleConversationTagAdd()
  }
  
  const handleConversationTagRemove = (tag: string) => {
    if (!currentConversation.value) {
      return
    }
    conversationStore.removeTag(conversationId.value, tag)
  }
  
  // ========== 辅助函数：获取最后一条用户消息文本 ==========
  
  const getLastUserMessageText = (): string => {
    const messages = branchStore.getDisplayMessages(conversationId.value)
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message?.role === 'user') {
        // 从 DisplayMessage 提取文本
        const text = message.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join('')
        if (text && text.trim()) {
          return text.trim()
        }
      }
    }
    return ''
  }
  
  // ========== 模板保存 ==========
  
  const handleSaveConversationAsTemplate = async () => {
    const conversation = currentConversation.value
    if (!conversation) {
      return
    }
    if (!conversation.projectId) {
      window.alert('请先将对话分配到某个项目后再保存模板。')
      return
    }

    const draftContent = draftInput.value?.trim()
    const lastUserContent = draftContent || getLastUserMessageText()
    if (!lastUserContent) {
      window.alert('当前没有可保存的内容。请先输入或选择一段文本。')
      return
    }

    const suggestedName = conversation.title?.trim() || '新模板'
    const name = window.prompt('请输入模板名称', suggestedName)
    if (!name || !name.trim()) {
      return
    }

    saveTemplateInProgress.value = true
    try {
      const projectId = conversation.projectId
      await projectWorkspaceStore.loadWorkspace(projectId)
      const workspace = projectWorkspaceStore.getWorkspace(projectId)
      const existingTemplates = workspace?.promptTemplates ?? []
      const newTemplate: ProjectPromptTemplate = {
        id: uuidv4(),
        name: name.trim(),
        layer: 'mode',
        description: `来自对话「${conversation.title}」`,
        content: lastUserContent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        useCount: 0
      }
      await projectWorkspaceStore.savePromptTemplates(projectId, [
        ...existingTemplates,
        newTemplate
      ])
      window.alert('已保存为项目模板，前往项目主页即可在 Quick Start 中使用。')
    } catch (error) {
      console.error('Failed to save conversation as template', error)
      window.alert('保存模板失败，请稍后再试。')
    } finally {
      saveTemplateInProgress.value = false
    }
  }
  
  return {
    conversationStatus,
    conversationTags,
    canSaveConversationTemplate,
    handleConversationStatusChange,
    handleConversationTagAdd,
    handleConversationTagKeydown,
    handleConversationTagRemove,
    handleSaveConversationAsTemplate,
    getLastUserMessageText
  }
}
