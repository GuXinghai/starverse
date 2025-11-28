/**
 * Conversation Store 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '../../../src/stores/conversation'
import type { Conversation } from '../../../src/types/store'

describe('Conversation Store', () => {
  beforeEach(() => {
    // 为每个测试创建新的 pinia 实例
    setActivePinia(createPinia())
  })

  describe('创建对话', () => {
    it('应该创建带默认值的新对话', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      expect(conversation.id).toBeDefined()
      expect(conversation.title).toBe('新对话')
      expect(conversation.draft).toBe('')
      expect(conversation.model).toBe('gemini-2.0-flash-exp')
      expect(conversation.projectId).toBeNull()
      expect(conversation.tags).toEqual([])
      expect(conversation.isGenerating).toBe(false)
    })

    it('应该创建带自定义选项的对话', () => {
      const store = useConversationStore()
      const conversation = store.createConversation({
        title: '测试对话',
        model: 'gpt-4',
        projectId: 'project-123'
      })

      expect(conversation.title).toBe('测试对话')
      expect(conversation.model).toBe('gpt-4')
      expect(conversation.projectId).toBe('project-123')
    })

    it('应该将新对话添加到对话列表', () => {
      const store = useConversationStore()
      expect(store.conversations).toHaveLength(0)

      store.createConversation()
      expect(store.conversations).toHaveLength(1)

      store.createConversation()
      expect(store.conversations).toHaveLength(2)
    })
  })

  describe('删除对话', () => {
    it('应该成功删除存在的对话', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      expect(store.conversations).toHaveLength(1)
      const result = store.deleteConversation(conversation.id)

      expect(result).toBe(true)
      expect(store.conversations).toHaveLength(0)
    })

    it('删除不存在的对话应该返回 false', () => {
      const store = useConversationStore()
      const result = store.deleteConversation('non-existent-id')

      expect(result).toBe(false)
    })

    it('删除对话时应该关闭相关标签页', () => {
      const store = useConversationStore()
      const conv1 = store.createConversation()
      const conv2 = store.createConversation()

      store.openConversationInTab(conv1.id)
      store.openConversationInTab(conv2.id)

      expect(store.openTabIds).toHaveLength(2)
      expect(store.activeTabId).toBe(conv2.id)

      store.deleteConversation(conv2.id)

      expect(store.openTabIds).toHaveLength(1)
      expect(store.activeTabId).toBe(conv1.id)
    })

    it('删除最后一个标签页时应该清空激活状态', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.openConversationInTab(conversation.id)
      expect(store.activeTabId).toBe(conversation.id)

      store.deleteConversation(conversation.id)

      expect(store.openTabIds).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })
  })

  describe('重命名对话', () => {
    it('应该成功重命名对话', () => {
      const store = useConversationStore()
      const conversation = store.createConversation({ title: '原标题' })

      const result = store.renameConversation(conversation.id, '新标题')

      expect(result).toBe(true)
      expect(conversation.title).toBe('新标题')
    })

    it('重命名不存在的对话应该返回 false', () => {
      const store = useConversationStore()
      const result = store.renameConversation('non-existent-id', '新标题')

      expect(result).toBe(false)
    })
  })

  describe('标签页管理', () => {
    it('应该打开对话到标签页', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.openConversationInTab(conversation.id)

      expect(store.openTabIds).toContain(conversation.id)
      expect(store.activeTabId).toBe(conversation.id)
    })

    it('重复打开同一对话应该只激活不重复添加', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.openConversationInTab(conversation.id)
      store.openConversationInTab(conversation.id)

      expect(store.openTabIds).toHaveLength(1)
      expect(store.activeTabId).toBe(conversation.id)
    })

    it('应该关闭标签页', () => {
      const store = useConversationStore()
      const conv1 = store.createConversation()
      const conv2 = store.createConversation()

      store.openConversationInTab(conv1.id)
      store.openConversationInTab(conv2.id)

      store.closeConversationTab(conv1.id)

      expect(store.openTabIds).not.toContain(conv1.id)
      expect(store.openTabIds).toContain(conv2.id)
      expect(store.activeTabId).toBe(conv2.id)
    })

    it('关闭激活标签应该自动切换到下一个标签', () => {
      const store = useConversationStore()
      const conv1 = store.createConversation()
      const conv2 = store.createConversation()
      const conv3 = store.createConversation()

      store.openConversationInTab(conv1.id)
      store.openConversationInTab(conv2.id)
      store.openConversationInTab(conv3.id)

      expect(store.activeTabId).toBe(conv3.id)

      // 关闭中间标签
      store.closeConversationTab(conv2.id)
      expect(store.activeTabId).toBe(conv3.id) // 仍然是 conv3

      // 关闭激活标签
      store.closeConversationTab(conv3.id)
      expect(store.activeTabId).toBe(conv1.id) // 切换到剩余的标签
    })
  })

  describe('对话配置', () => {
    it('应该更新草稿内容', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.updateConversationDraft(conversation.id, '测试草稿')

      expect(conversation.draft).toBe('测试草稿')
    })

    it('应该设置 Web 搜索开关', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setWebSearchEnabled(conversation.id, true)

      expect(conversation.webSearch?.enabled).toBe(true)
    })

    it('应该设置 Web 搜索级别', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setWebSearchLevel(conversation.id, 'deep')

      expect(conversation.webSearch?.level).toBe('deep')
    })

    it('应该更新对话模型', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.updateConversationModel(conversation.id, 'gpt-4-turbo')

      expect(conversation.model).toBe('gpt-4-turbo')
    })

    it('应该设置对话状态', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setConversationStatus(conversation.id, 'active')

      expect(conversation.status).toBe('active')
    })
  })

  describe('标签管理', () => {
    it('应该添加标签', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.addConversationTag(conversation.id, '重要')

      expect(conversation.tags).toContain('重要')
    })

    it('不应该添加重复标签', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.addConversationTag(conversation.id, '重要')
      store.addConversationTag(conversation.id, '重要')

      expect(conversation.tags).toHaveLength(1)
    })

    it('应该移除标签', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.addConversationTag(conversation.id, '重要')
      store.removeConversationTag(conversation.id, '重要')

      expect(conversation.tags).not.toContain('重要')
    })

    it('应该设置多个标签', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setConversationTags(conversation.id, ['工作', '项目A', '紧急'])

      expect(conversation.tags).toEqual(['工作', '项目A', '紧急'])
    })
  })

  describe('Computed 属性', () => {
    it('activeConversation 应该返回当前激活的对话', () => {
      const store = useConversationStore()
      const conv1 = store.createConversation({ title: '对话1' })
      const conv2 = store.createConversation({ title: '对话2' })

      store.openConversationInTab(conv1.id)
      expect(store.activeConversation?.title).toBe('对话1')

      store.openConversationInTab(conv2.id)
      expect(store.activeConversation?.title).toBe('对话2')
    })

    it('conversationMap 应该提供 O(1) 查找', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      const found = store.conversationMap.get(conversation.id)

      expect(found).toStrictEqual(conversation)
    })

    it('hasAnyGeneratingConversation 应该检测生成状态', () => {
      const store = useConversationStore()
      const conv1 = store.createConversation()
      const conv2 = store.createConversation()

      expect(store.hasAnyGeneratingConversation).toBe(false)

      store.setGenerationStatus(conv1.id, true)
      expect(store.hasAnyGeneratingConversation).toBe(true)

      store.setGenerationStatus(conv1.id, false)
      store.setGenerationStatus(conv2.id, true)
      expect(store.hasAnyGeneratingConversation).toBe(true)

      store.setGenerationStatus(conv2.id, false)
      expect(store.hasAnyGeneratingConversation).toBe(false)
    })
  })
})
