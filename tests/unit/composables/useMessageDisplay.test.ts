/**
 * useMessageDisplay 单元测试（重构版 - 基于 ID 的细粒度渲染）
 * 
 * 测试新架构下的消息显示逻辑：
 * - 只返回 ID 列表（拓扑结构）
 * - 删除了数据转换层
 * - 流式状态判断
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useMessageDisplay } from '../../../src/composables/chat/useMessageDisplay'
import { useConversationStore } from '../../../src/stores/conversation'
import { useBranchStore } from '../../../src/stores/branch'
import type { MessagePart } from '../../../src/types/chat'

describe('useMessageDisplay (重构版)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该返回空数组（无对话）', () => {
    const isActive = computed(() => true)
    
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => null)
    })

    expect(displayBranchIds.value).toEqual([])
  })

  it('应该在非激活状态返回空数组', () => {
    const conversationStore = useConversationStore()
    const conversation = conversationStore.createConversation()
    
    const isActive = computed(() => false)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversation)
    })

    expect(displayBranchIds.value).toEqual([])
  })

  it('应该返回当前路径的 branchId 列表', () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    // 创建对话和消息
    const conversation = conversationStore.createConversation()
    const userParts: MessagePart[] = [{ type: 'text', text: 'Hello' }]
    const userBranchId = branchStore.addMessageBranch(conversation.id, 'user', userParts)
    
    const aiParts: MessagePart[] = [{ type: 'text', text: 'Hi' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts, userBranchId)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversationStore.getConversationById(conversation.id))
    })

    // 验证返回的是 ID 列表
    expect(displayBranchIds.value).toHaveLength(2)
    expect(displayBranchIds.value[0]).toBe(userBranchId)
    expect(displayBranchIds.value[1]).toBe(aiBranchId)
  })

  it('流式追加 token 不应改变 displayBranchIds（ID 列表不变）', () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const userParts: MessagePart[] = [{ type: 'text', text: 'Test' }]
    const userBranchId = branchStore.addMessageBranch(conversation.id, 'user', userParts)
    
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts, userBranchId)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversationStore.getConversationById(conversation.id))
    })

    const firstResult = displayBranchIds.value
    expect(firstResult).toHaveLength(2)
    expect(firstResult).toEqual([userBranchId, aiBranchId])

    // 追加 token（currentPath 不变）
    branchStore.appendToken(conversation.id, aiBranchId, 'Hello')
    const secondResult = displayBranchIds.value
    
    // ✅ 关键验证：ID 列表应该完全相同（引用相等）
    expect(secondResult).toEqual(firstResult)
    expect(secondResult).toHaveLength(2)

    // 再追加 token
    branchStore.appendToken(conversation.id, aiBranchId, ' World')
    const thirdResult = displayBranchIds.value
    
    // ID 列表仍然不变
    expect(thirdResult).toEqual([userBranchId, aiBranchId])
  })

  it('currentPath 变化时应返回新的 ID 列表', () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const msg1Parts: MessagePart[] = [{ type: 'text', text: 'Message 1' }]
    const msg1Id = branchStore.addMessageBranch(conversation.id, 'user', msg1Parts)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversationStore.getConversationById(conversation.id))
    })

    expect(displayBranchIds.value).toHaveLength(1)
    expect(displayBranchIds.value[0]).toBe(msg1Id)

    // 添加新消息（currentPath 变化）
    const msg2Parts: MessagePart[] = [{ type: 'text', text: 'Message 2' }]
    const msg2Id = branchStore.addMessageBranch(conversation.id, 'assistant', msg2Parts, msg1Id)

    // 应该返回更新后的 ID 列表
    expect(displayBranchIds.value).toHaveLength(2)
    expect(displayBranchIds.value).toEqual([msg1Id, msg2Id])
  })

  it('isMessageStreaming 应该正确判断流式状态', () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const userParts: MessagePart[] = [{ type: 'text', text: 'Hello' }]
    const userBranchId = branchStore.addMessageBranch(conversation.id, 'user', userParts)
    
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts, userBranchId)
    
    const isActive = computed(() => true)
    const { isMessageStreaming } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversationStore.getConversationById(conversation.id))
    })

    // 未开始流式
    expect(isMessageStreaming(aiBranchId)).toBe(false)

    // 设置流式状态
    conversationStore.setGenerationStatus(conversation.id, 'receiving')
    expect(isMessageStreaming(aiBranchId)).toBe(true)

    // 只有最后一条消息是流式
    expect(isMessageStreaming(userBranchId)).toBe(false)

    // 流式完成
    conversationStore.setGenerationStatus(conversation.id, 'idle')
    expect(isMessageStreaming(aiBranchId)).toBe(false)
  })

  it('删除消息后 ID 列表应该更新', () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const msg1Parts: MessagePart[] = [{ type: 'text', text: 'Msg 1' }]
    const msg1Id = branchStore.addMessageBranch(conversation.id, 'user', msg1Parts)
    
    const msg2Parts: MessagePart[] = [{ type: 'text', text: 'Msg 2' }]
    const msg2Id = branchStore.addMessageBranch(conversation.id, 'assistant', msg2Parts, msg1Id)
    
    const msg3Parts: MessagePart[] = [{ type: 'text', text: 'Msg 3' }]
    const msg3Id = branchStore.addMessageBranch(conversation.id, 'user', msg3Parts, msg2Id)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversationStore.getConversationById(conversation.id))
    })

    expect(displayBranchIds.value).toEqual([msg1Id, msg2Id, msg3Id])

    // 删除中间消息
    branchStore.removeMessageBranch(conversation.id, msg2Id)

    // currentPath 应该被截断
    expect(displayBranchIds.value).toEqual([msg1Id])
  })
})
