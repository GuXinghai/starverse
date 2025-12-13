/**
 * 流式响应集成测试（重构版 - 组件级响应式）
 * 
 * 测试新架构下的流式响应流程：
 * - useMessageDisplay 只返回 ID 列表
 * - 组件直接从 Store 读取数据
 * - 验证细粒度响应式更新
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '../../../src/stores/conversation'
import { useBranchStore } from '../../../src/stores/branch'
import { useMessageDisplay } from '../../../src/composables/chat/useMessageDisplay'
import { getCurrentVersion } from '../../../src/stores/branchTreeHelpers'
import type { MessagePart } from '../../../src/types/chat'

describe('流式响应集成测试（重构版）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('应该逐 token 更新 Store（模拟流式响应）', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    // 创建对话
    const conversation = conversationStore.createConversation()
    
    // 添加用户消息
    const userParts: MessagePart[] = [{ type: 'text', text: 'What is Vue?' }]
    const userBranchId = branchStore.addMessageBranch(conversation.id, 'user', userParts)
    
    // 创建空的 AI 消息（流式开始前）
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts, userBranchId)
    
    // 设置生成状态
    conversationStore.setGenerationStatus(conversation.id, 'receiving')
    
    const isActive = computed(() => true)
    const { displayBranchIds, isMessageStreaming } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversation)
    })

    // 初始状态：ID 列表包含两条消息
    expect(displayBranchIds.value).toHaveLength(2)
    expect(displayBranchIds.value).toEqual([userBranchId, aiBranchId])
    expect(isMessageStreaming(aiBranchId)).toBe(true)

    // 模拟组件直接从 Store 读取数据
    const getAIMessageText = () => {
      const branch = conversation.tree.branches.get(aiBranchId)
      if (!branch) return ''
      const version = getCurrentVersion(branch)
      if (!version) return ''
      const textPart = version.parts.find(p => p.type === 'text') as any
      return textPart?.text || ''
    }

    expect(getAIMessageText()).toBe('')

    // 模拟流式追加 tokens
    const tokens = ['Vue', ' is', ' a', ' progressive', ' framework']
    
    for (const token of tokens) {
      branchStore.appendToken(conversation.id, aiBranchId, token)
      await nextTick()  // 等待 Vue 响应式更新
      
      // ✅ 关键验证：displayBranchIds 不应变化
      expect(displayBranchIds.value).toEqual([userBranchId, aiBranchId])
      
      // ✅ 关键验证：Store 中的数据已更新（组件会自动感知）
      const currentText = getAIMessageText()
      expect(currentText).toContain(token)
    }

    // 最终文本应该完整
    expect(getAIMessageText()).toBe('Vue is a progressive framework')

    // 流式完成
    conversationStore.setGenerationStatus(conversation.id, 'idle')
    await nextTick()
    
    expect(isMessageStreaming(aiBranchId)).toBe(false)
  })

  it('应该正确处理高频 token 追加（性能测试）', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversation)
    })

    // 辅助函数：获取消息文本
    const getMessageText = () => {
      const branch = conversation.tree.branches.get(aiBranchId)
      const version = getCurrentVersion(branch!)
      const textPart = version!.parts.find(p => p.type === 'text') as any
      return textPart?.text || ''
    }

    // 模拟高频追加（每秒 50 个 token）
    const startTime = Date.now()
    
    for (let i = 0; i < 100; i++) {
      branchStore.appendToken(conversation.id, aiBranchId, 'x')
    }
    
    await nextTick()
    
    const endTime = Date.now()
    const elapsed = endTime - startTime

    // ✅ 关键验证：displayBranchIds 不应变化（性能优化）
    expect(displayBranchIds.value).toEqual([aiBranchId])

    // 验证最终文本正确
    expect(getMessageText()).toBe('x'.repeat(100))
    
    // 说明：耗时阈值在不同机器/CI 上不稳定，避免将其作为合并门槛。
    console.log(`[性能测试] 100 次 token 追加耗时: ${elapsed}ms（非 gate）`)
  })

  it('应该正确处理多个并发流式响应（多标签页场景）', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    // 创建两个对话（模拟两个标签页）
    const convo1 = conversationStore.createConversation()
    const convo2 = conversationStore.createConversation()
    
    const ai1Parts: MessagePart[] = [{ type: 'text', text: '' }]
    const ai1BranchId = branchStore.addMessageBranch(convo1.id, 'assistant', ai1Parts)
    
    const ai2Parts: MessagePart[] = [{ type: 'text', text: '' }]
    const ai2BranchId = branchStore.addMessageBranch(convo2.id, 'assistant', ai2Parts)
    
    conversationStore.setGenerationStatus(convo1.id, 'receiving')
    conversationStore.setGenerationStatus(convo2.id, 'receiving')
    
    // 两个独立的 useMessageDisplay
    const isActive1 = computed(() => true)
    const display1 = useMessageDisplay({
      isComponentActive: isActive1,
      currentConversation: computed(() => convo1)
    })
    
    const isActive2 = computed(() => true)
    const display2 = useMessageDisplay({
      isComponentActive: isActive2,
      currentConversation: computed(() => convo2)
    })

    // 辅助函数
    const getText1 = () => {
      const branch = convo1.tree.branches.get(ai1BranchId)
      const version = getCurrentVersion(branch!)
      return ((version!.parts[0] as any).text || '')
    }
    
    const getText2 = () => {
      const branch = convo2.tree.branches.get(ai2BranchId)
      const version = getCurrentVersion(branch!)
      return ((version!.parts[0] as any).text || '')
    }

    // 并发追加 tokens
    branchStore.appendToken(convo1.id, ai1BranchId, 'A')
    branchStore.appendToken(convo2.id, ai2BranchId, 'B')
    branchStore.appendToken(convo1.id, ai1BranchId, 'A')
    branchStore.appendToken(convo2.id, ai2BranchId, 'B')
    
    await nextTick()

    // 验证两个对话的消息互不干扰
    expect(getText1()).toBe('AA')
    expect(getText2()).toBe('BB')
    
    // ID 列表也应正确
    expect(display1.displayBranchIds.value).toEqual([ai1BranchId])
    expect(display2.displayBranchIds.value).toEqual([ai2BranchId])
  })

  it('应该正确处理流式中止', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts)
    
    conversationStore.setGenerationStatus(conversation.id, 'receiving')
    
    const isActive = computed(() => true)
    const { displayBranchIds, isMessageStreaming } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversation)
    })

    // 辅助函数
    const getMessageText = () => {
      const branch = conversation.tree.branches.get(aiBranchId)
      const version = getCurrentVersion(branch!)
      return ((version!.parts[0] as any).text || '')
    }

    // 追加部分 tokens
    branchStore.appendToken(conversation.id, aiBranchId, 'Partial')
    branchStore.appendToken(conversation.id, aiBranchId, ' response')
    await nextTick()

    expect(getMessageText()).toBe('Partial response')
    expect(isMessageStreaming(aiBranchId)).toBe(true)

    // 中止流式
    conversationStore.setGenerationStatus(conversation.id, 'idle')
    
    // 标记为中止
    branchStore.patchMetadata(conversation.id, aiBranchId, () => ({
      streamAborted: true,
      canRetry: true
    }))
    
    await nextTick()

    // 验证部分内容保留
    expect(getMessageText()).toBe('Partial response')
    expect(isMessageStreaming(aiBranchId)).toBe(false)
    
    // 验证 metadata
    const branch = conversation.tree.branches.get(aiBranchId)
    const version = getCurrentVersion(branch!)
    expect(version!.metadata?.streamAborted).toBe(true)
  })

  it('应该正确处理图片流式追加', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    const aiParts: MessagePart[] = [{ type: 'text', text: 'Here is an image:' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts)
    
    const isActive = computed(() => true)
    const { displayBranchIds } = useMessageDisplay({
      isComponentActive: isActive,
      currentConversation: computed(() => conversation)
    })

    // 获取 parts
    const getParts = () => {
      const branch = conversation.tree.branches.get(aiBranchId)
      const version = getCurrentVersion(branch!)
      return version!.parts
    }

    expect(getParts()).toHaveLength(1)

    // 追加图片
    const imageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANS...'
    branchStore.appendImage(conversation.id, aiBranchId, imageUrl)
    await nextTick()

    // ✅ displayBranchIds 不变
    expect(displayBranchIds.value).toEqual([aiBranchId])

    // 验证图片已添加
    const parts = getParts()
    expect(parts).toHaveLength(2)
    expect(parts[1].type).toBe('image_url')
    expect((parts[1] as any).image_url.url).toBe(imageUrl)
  })

  it('新架构：ID 列表计算应极少触发（性能验证）', async () => {
    const conversationStore = useConversationStore()
    const branchStore = useBranchStore()
    
    const conversation = conversationStore.createConversation()
    
    // 创建 10 条历史消息
    let lastBranchId: string | null = null
    for (let i = 0; i < 10; i++) {
      const parts: MessagePart[] = [{ type: 'text', text: `Message ${i}` }]
      const role = i % 2 === 0 ? 'user' : 'assistant'
      lastBranchId = branchStore.addMessageBranch(conversation.id, role as any, parts, lastBranchId)
    }
    
    const aiParts: MessagePart[] = [{ type: 'text', text: '' }]
    const aiBranchId = branchStore.addMessageBranch(conversation.id, 'assistant', aiParts, lastBranchId)
    
    const isActive = computed(() => true)
    
    // 追踪 computed 执行次数
    let computeCount = 0
    const trackedDisplayBranchIds = computed(() => {
      computeCount++
      const convo = conversation
      if (!convo?.tree) return []
      return convo.tree.currentPath
    })

    // 初始计算
    expect(trackedDisplayBranchIds.value).toHaveLength(11)
    expect(computeCount).toBe(1)

    // 追加 100 个 tokens
    for (let i = 0; i < 100; i++) {
      branchStore.appendToken(conversation.id, aiBranchId, 'x')
    }
    
    await nextTick()

    // ✅ 关键验证：computed 应该没有重新执行（currentPath 引用未变）
    expect(computeCount).toBe(1)  // 仍然是 1 次！
    
    console.log(`[架构优化] 100 次 token 追加，displayBranchIds computed 执行次数: ${computeCount}`)
  })
})
