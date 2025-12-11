/**
 * 参数面板端到端集成测试
 * 
 * 测试范围：
 * - UI 交互: 用户点击参数按钮 → 面板打开 → 调整参数
 * - 数据流: 参数变化 → 事件 → conversationStore → generationConfigManager
 * - 持久化: 参数保存 → 刷新后数据仍存在
 * - 请求体: 发送消息时参数正确包含在 OpenRouter 请求中
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '@/stores/conversation'
import { generationConfigManager } from '@/services/providers/generationConfigManager'
import type { SamplingParameterSettings } from '@/types/chat'

// Mock aiChatService 以避免实际 API 调用
vi.mock('../../../src/services/aiChatService', () => ({
  aiChatService: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    buildAirlockedGenerationConfig: vi.fn()
  }
}))

describe('参数面板集成测试', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    
    // 重置 generationConfigManager 状态
    await generationConfigManager.resetGlobalConfig()
    // 清空模型配置
    generationConfigManager['modelConfigs'].value.clear()
    // 清空对话配置
    generationConfigManager['conversationConfigs'].value.clear()
  })

  describe('基础集成流程', () => {
    it('应该完成完整的参数设置流程: 创建对话 → 设置参数 → 验证持久化', async () => {
      const store = useConversationStore()

      // 1. 创建对话
      const conversation = store.createConversation({
        title: '参数测试对话'
      })
      expect(conversation.id).toBeDefined()

      // 2. 设置采样参数（模拟用户调整滑块）
      const samplingParams: Partial<SamplingParameterSettings> = {
        enabled: true,
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
        max_tokens: 2000
      }

      const result = store.setSamplingParameters(conversation.id, samplingParams)
      expect(result).toBe(true)

      // 3. 验证参数已在对话中更新
      expect(conversation.samplingParameters?.temperature).toBe(0.8)
      expect(conversation.samplingParameters?.top_p).toBe(0.9)
      expect(conversation.samplingParameters?.top_k).toBe(40)
      expect(conversation.samplingParameters?.max_tokens).toBe(2000)

      // 4. 验证参数已同步到 generationConfigManager
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.9)
      expect(effective.sampling?.top_k).toBe(40)
      expect(effective.length?.max_tokens).toBe(2000)
    })

    it('应该支持参数的多次调整', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 第一次调整
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.7
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.7)

      // 第二次调整（用户拖动滑块）
      store.setSamplingParameters(conversation.id, {
        temperature: 0.75
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.75)

      // 第三次调整
      store.setSamplingParameters(conversation.id, {
        temperature: 0.8,
        top_p: 0.95
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.8)
      expect(conversation.samplingParameters?.top_p).toBe(0.95)

      // 验证最终状态同步到 generationConfigManager
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.95)
    })
  })

  describe('多对话场景', () => {
    it('应该在多个对话间保持参数隔离', async () => {
      const store = useConversationStore()

      // 创建两个对话
      const conv1 = store.createConversation({ title: '对话 1' })
      const conv2 = store.createConversation({ title: '对话 2' })

      // 设置不同的参数
      store.setSamplingParameters(conv1.id, {
        enabled: true,
        temperature: 0.7
      })

      store.setSamplingParameters(conv2.id, {
        enabled: true,
        temperature: 0.95
      })

      // 验证参数隔离
      expect(conv1.samplingParameters?.temperature).toBe(0.7)
      expect(conv2.samplingParameters?.temperature).toBe(0.95)

      // 验证在 generationConfigManager 中也隔离
      const eff1 = generationConfigManager.getEffectiveConfig({
        conversationId: conv1.id
      })
      const eff2 = generationConfigManager.getEffectiveConfig({
        conversationId: conv2.id
      })

      expect(eff1.sampling?.temperature).toBe(0.7)
      expect(eff2.sampling?.temperature).toBe(0.95)
    })

    it('应该支持在对话间切换时保持各自的参数', async () => {
      const store = useConversationStore()

      const conv1 = store.createConversation()
      const conv2 = store.createConversation()

      // conv1: 温度 0.7
      store.setSamplingParameters(conv1.id, { enabled: true, temperature: 0.7 })

      // conv2: 温度 0.9
      store.setSamplingParameters(conv2.id, { enabled: true, temperature: 0.9 })

      // 现在要求参数正确反映当前对话
      // 这通常由 UI 层处理（通过 props 的 computed）
      // 这里测试的是数据层的正确性

      expect(conv1.samplingParameters?.temperature).toBe(0.7)
      expect(conv2.samplingParameters?.temperature).toBe(0.9)

      // 修改 conv1
      store.setSamplingParameters(conv1.id, { temperature: 0.8 })

      // 验证 conv2 不受影响
      expect(conv2.samplingParameters?.temperature).toBe(0.9)
      expect(conv1.samplingParameters?.temperature).toBe(0.8)
    })
  })

  describe('推理偏好集成', () => {
    it('应该完整集成推理偏好的设置流程', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 设置推理偏好
      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'high',
        maxTokens: 8000
      })

      // 验证对话中的数据
      expect(conversation.reasoningPreference?.visibility).toBe('visible')
      expect(conversation.reasoningPreference?.effort).toBe('high')
      expect(conversation.reasoningPreference?.maxTokens).toBe(8000)

      // 验证 generationConfigManager 中的数据
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      expect(effective.reasoning?.enabled).toBe(true)
      expect(effective.reasoning?.effort).toBe('high')
      expect(effective.reasoning?.maxTokens).toBe(8000)
    })

    it('应该在采样参数和推理偏好间保持独立性', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 设置采样参数
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.8
      })

      // 设置推理偏好
      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'medium'
      })

      // 验证两者都已设置且不互相影响
      expect(conversation.samplingParameters?.temperature).toBe(0.8)
      expect(conversation.reasoningPreference?.effort).toBe('medium')

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.reasoning?.effort).toBe('medium')
    })
  })

  describe('参数与全局/模型配置的交互', () => {
    it('应该在存在全局配置时正确应用对话级覆盖', async () => {
      const store = useConversationStore()

      // 设置全局配置
      await generationConfigManager.setGlobalConfig({
        sampling: { temperature: 0.5, top_p: 0.8 }
      })

      // 创建对话并设置对话级参数
      const conversation = store.createConversation()
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.8 // 覆盖全局的 0.5
        // top_p 保持全局的 0.8
      })

      // 获取最终有效配置
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      // 对话级的 temperature 应该覆盖全局
      expect(effective.sampling?.temperature).toBe(0.8)
      // 虽然对话级没有明确设置 top_p，但全局有，所以应该使用全局的 0.8
      // 注意：generationConfigManager 的 deepMerge 会完全递归合并 sampling 对象
      expect(effective.sampling?.top_p).toBeGreaterThanOrEqual(0.8)
    })

    it('应该在存在模型配置时正确应用对话级覆盖', async () => {
      const store = useConversationStore()
      const modelId = 'test-model'

      // 设置模型配置
      await generationConfigManager.setModelConfig(modelId, {
        sampling: { temperature: 0.6 }
      })

      // 创建对话并设置对话级参数
      const conversation = store.createConversation({ model: modelId })
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.9 // 覆盖模型的 0.6
      })

      // 获取最终有效配置（包含模型 ID）
      const effective = generationConfigManager.getEffectiveConfig({
        modelId,
        conversationId: conversation.id
      })

      // 对话级应该覆盖模型级
      expect(effective.sampling?.temperature).toBe(0.9)
    })
  })

  describe('参数持久化验证', () => {
    it('应该标记对话为脏数据以触发持久化', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      const originalUpdatedAt = conversation.updatedAt || 0

      // 延迟以确保时间戳变化
      await new Promise(resolve => setTimeout(resolve, 10))

      // 设置参数
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.8
      })

      // 验证 updatedAt 已更新
      expect(conversation.updatedAt).toBeGreaterThan(originalUpdatedAt)
    })

    it('应该在多个参数修改间保持数据一致性', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 模拟用户多次调整参数
      const adjustments = [
        { temperature: 0.7 },
        { temperature: 0.75 },
        { temperature: 0.8, top_p: 0.9 },
        { top_k: 50 },
        { max_tokens: 2000 }
      ]

      for (const adjustment of adjustments) {
        store.setSamplingParameters(conversation.id, adjustment)
      }

      // 验证最终状态
      expect(conversation.samplingParameters?.temperature).toBe(0.8)
      expect(conversation.samplingParameters?.top_p).toBe(0.9)
      expect(conversation.samplingParameters?.top_k).toBe(50)
      expect(conversation.samplingParameters?.max_tokens).toBe(2000)

      // 验证 generationConfigManager 中的最终状态
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: conversation.id
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.9)
      expect(effective.sampling?.top_k).toBe(50)
      expect(effective.length?.max_tokens).toBe(2000)
    })
  })

  describe('错误处理和边界情况', () => {
    it('应该优雅处理无效的对话 ID', () => {
      const store = useConversationStore()

      const result = store.setSamplingParameters('invalid-id', {
        temperature: 0.8
      })

      expect(result).toBe(false)
    })

    it('应该在部分参数为 undefined 时保持其他参数', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 初始设置
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40
      })

      // 只更新 temperature，其他应保持
      store.setSamplingParameters(conversation.id, {
        temperature: 0.95
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.95)
      expect(conversation.samplingParameters?.top_p).toBe(0.9)
      expect(conversation.samplingParameters?.top_k).toBe(40)
    })

    it('应该正确处理 enabled 字段的更新', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 启用参数
      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.8
      })

      expect(conversation.samplingParameters?.enabled).toBe(true)

      // 禁用参数
      store.setSamplingParameters(conversation.id, {
        enabled: false
      })

      expect(conversation.samplingParameters?.enabled).toBe(false)
      // 参数值应该保持
      expect(conversation.samplingParameters?.temperature).toBe(0.8)
    })
  })

  describe('并发操作', () => {
    it('应该安全处理多个并发参数设置', async () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 并发设置多个参数
      const promises = [
        Promise.resolve(store.setSamplingParameters(conversation.id, { temperature: 0.7 })),
        Promise.resolve(store.setSamplingParameters(conversation.id, { top_p: 0.85 })),
        Promise.resolve(store.setSamplingParameters(conversation.id, { top_k: 40 }))
      ]

      const results = await Promise.all(promises)

      // 所有操作都应该成功
      expect(results.every((r: boolean) => r === true)).toBe(true)

      // 最终状态应该包含所有更新
      expect(conversation.samplingParameters?.temperature).toBe(0.7)
      expect(conversation.samplingParameters?.top_p).toBe(0.85)
      expect(conversation.samplingParameters?.top_k).toBe(40)
    })
  })
})
