/**
 * 对话持久化测试
 * 
 * 验证新建会话是否能正确标记为脏数据并被保存
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '../../../src/stores/conversation'
import { usePersistenceStore } from '../../../src/stores/persistence'

describe('对话持久化 - 创建新会话', () => {
  beforeEach(() => {
    // 为每个测试创建新的 pinia 实例
    setActivePinia(createPinia())
  })

  it('创建新对话时应该自动标记为脏数据', () => {
    const conversationStore = useConversationStore()
    const persistenceStore = usePersistenceStore()

    // 初始状态：没有脏数据
    expect(persistenceStore.dirtyConversationIds.size).toBe(0)

    // 创建新对话
    const newConversation = conversationStore.createConversation({
      title: '测试对话持久化'
    })

    // 验证：新对话应该被标记为脏数据
    expect(persistenceStore.dirtyConversationIds.has(newConversation.id)).toBe(true)
    expect(persistenceStore.dirtyConversationIds.size).toBe(1)
  })

  it('创建多个新对话应该都被标记为脏数据', () => {
    const conversationStore = useConversationStore()
    const persistenceStore = usePersistenceStore()

    const conv1 = conversationStore.createConversation({
      title: '对话 1'
    })
    const conv2 = conversationStore.createConversation({
      title: '对话 2'
    })
    const conv3 = conversationStore.createConversation({
      title: '对话 3'
    })

    // 验证：所有新对话都应该被标记为脏数据
    expect(persistenceStore.dirtyConversationIds.size).toBe(3)
    expect(persistenceStore.dirtyConversationIds.has(conv1.id)).toBe(true)
    expect(persistenceStore.dirtyConversationIds.has(conv2.id)).toBe(true)
    expect(persistenceStore.dirtyConversationIds.has(conv3.id)).toBe(true)
  })

  it('清除脏标记后，新创建的对话应该重新标记为脏数据', () => {
    const conversationStore = useConversationStore()
    const persistenceStore = usePersistenceStore()

    const conv1 = conversationStore.createConversation({
      title: '对话 1'
    })
    expect(persistenceStore.dirtyConversationIds.has(conv1.id)).toBe(true)

    // 清除脏标记
    persistenceStore.clearConversationDirty(conv1.id)
    expect(persistenceStore.dirtyConversationIds.has(conv1.id)).toBe(false)
    expect(persistenceStore.dirtyConversationIds.size).toBe(0)

    // 创建新对话
    const conv2 = conversationStore.createConversation({
      title: '对话 2'
    })

    // 验证：只有新对话应该有脏标记
    expect(persistenceStore.dirtyConversationIds.size).toBe(1)
    expect(persistenceStore.dirtyConversationIds.has(conv1.id)).toBe(false)
    expect(persistenceStore.dirtyConversationIds.has(conv2.id)).toBe(true)
  })
})
