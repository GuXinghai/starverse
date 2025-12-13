/**
 * GenerationConfigManager 对话级配置单元测试
 * 
 * 测试范围：
 * - 对话级配置的读写
 * - 4 层配置的合并逻辑（Global < Model < Conversation < Request）
 * - 配置持久化
 * - 配置继承和覆盖
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { generationConfigManager } from '../../../src/services/providers/generationConfigManager'
import type { PartialGenerationConfig } from '../../../src/types/generation'

describe('GenerationConfigManager - Conversation Config', () => {
  beforeEach(async () => {
    // 清理测试数据
    await generationConfigManager.resetGlobalConfig()
  })

  describe('对话级配置读写', () => {
    it('应该设置对话级配置', async () => {
      const conversationId = 'test-conv-1'
      const config: PartialGenerationConfig = {
        sampling: {
          temperature: 0.8,
          top_p: 0.9
        }
      }

      await generationConfigManager.setConversationConfig(conversationId, config)

      // 验证配置已设置（通过 getEffectiveConfig）
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.9)
    })

    it('应该支持对话级配置的部分更新', async () => {
      const conversationId = 'test-conv-2'

      // 第一次设置
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { temperature: 0.7 }
      })

      // 第二次部分更新
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { top_p: 0.95 }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      // 两个参数都应该存在
      expect(effective.sampling?.temperature).toBe(0.7)
      expect(effective.sampling?.top_p).toBe(0.95)
    })

    it('应该删除对话级配置', async () => {
      const conversationId = 'test-conv-3'

      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { temperature: 0.8 }
      })

      // 验证配置已设置
      let effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })
      expect(effective.sampling?.temperature).toBe(0.8)

      // 删除配置
      await generationConfigManager.deleteConversationConfig(conversationId)

      // 验证配置已删除（应该回到默认值）
      effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })
      expect(effective.sampling?.temperature).not.toBe(0.8)
    })
  })

  describe('配置合并逻辑 (4层叠加)', () => {
    it('应该按优先级合并配置: Global < Model < Conversation < Request', async () => {
      const modelId = 'test-model'
      const conversationId = 'test-conv-4'

      // 设置全局配置
      await generationConfigManager.setGlobalConfig({
        sampling: { temperature: 0.5 }
      })

      // 设置模型配置
      await generationConfigManager.setModelConfig(modelId, {
        sampling: { temperature: 0.6 }
      })

      // 设置对话配置
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { temperature: 0.8 }
      })

      // 获取有效配置（不带请求级覆盖）
      const effective = generationConfigManager.getEffectiveConfig({
        modelId,
        conversationId
      })

      // 对话级配置应该覆盖全局和模型配置
      expect(effective.sampling?.temperature).toBe(0.8)
    })

    it('应该允许请求级覆盖所有其他层级', async () => {
      const conversationId = 'test-conv-5'

      // 设置对话级配置
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { temperature: 0.8, top_p: 0.9 }
      })

      // 使用请求级覆盖
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId,
        requestOverride: {
          sampling: { temperature: 0.95 }
        }
      })

      // 请求级覆盖应该覆盖对话级配置
      expect(effective.sampling?.temperature).toBe(0.95)
      // 但保留未被覆盖的字段
      expect(effective.sampling?.top_p).toBe(0.9)
    })

    it('应该处理多层同时存在的情况', async () => {
      const modelId = 'test-model-2'
      const conversationId = 'test-conv-6'

      // 全局：temperature=0.5, top_p=0.8
      await generationConfigManager.setGlobalConfig({
        sampling: { temperature: 0.5, top_p: 0.8 }
      })

      // 模型：temperature=0.6（覆盖全局）
      await generationConfigManager.setModelConfig(modelId, {
        sampling: { temperature: 0.6 }
      })

      // 对话：top_p=0.95（覆盖全局）
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { top_p: 0.95 }
      })

      // 请求：temperature=0.9（覆盖所有）
      const effective = generationConfigManager.getEffectiveConfig({
        modelId,
        conversationId,
        requestOverride: {
          sampling: { temperature: 0.9 }
        }
      })

      // 结果应该是所有层的合并
      expect(effective.sampling?.temperature).toBe(0.9) // 请求级覆盖
      expect(effective.sampling?.top_p).toBe(0.95) // 对话级覆盖全局
    })
  })

  describe('对话级采样参数', () => {
    it('应该正确处理采样参数的嵌套结构', async () => {
      const conversationId = 'test-conv-7'

      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: {
          temperature: 0.8,
          top_p: 0.9,
          top_k: 40
        }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      expect(effective.sampling).toBeDefined()
      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.9)
      expect(effective.sampling?.top_k).toBe(40)
    })

    it('应该正确处理长度参数', async () => {
      const conversationId = 'test-conv-8'

      await generationConfigManager.setConversationConfig(conversationId, {
        length: {
          max_tokens: 2000
        }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      expect(effective.length?.max_tokens).toBe(2000)
    })
  })

  describe('对话级推理配置', () => {
    it('应该正确处理推理配置', async () => {
      const conversationId = 'test-conv-9'

      await generationConfigManager.setConversationConfig(conversationId, {
        reasoning: {
          controlMode: 'effort',
          effort: 'high',
          maxReasoningTokens: 5000,
          showReasoningContent: true
        }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      expect(effective.reasoning?.controlMode).toBe('effort')
      expect(effective.reasoning?.effort).toBe('high')
      expect(effective.reasoning?.maxReasoningTokens).toBe(5000)
      expect(effective.reasoning?.showReasoningContent).toBe(true)
    })
  })

  describe('多对话配置隔离', () => {
    it('不同对话的配置应该隔离', async () => {
      const conv1 = 'test-conv-10'
      const conv2 = 'test-conv-11'

      await generationConfigManager.setConversationConfig(conv1, {
        sampling: { temperature: 0.7 }
      })

      await generationConfigManager.setConversationConfig(conv2, {
        sampling: { temperature: 0.95 }
      })

      const effective1 = generationConfigManager.getEffectiveConfig({
        conversationId: conv1
      })

      const effective2 = generationConfigManager.getEffectiveConfig({
        conversationId: conv2
      })

      expect(effective1.sampling?.temperature).toBe(0.7)
      expect(effective2.sampling?.temperature).toBe(0.95)
    })

    it('更新一个对话的配置不应该影响其他对话', async () => {
      const conv1 = 'test-conv-12'
      const conv2 = 'test-conv-13'

      // 初始化两个对话
      await generationConfigManager.setConversationConfig(conv1, {
        sampling: { temperature: 0.7 }
      })

      await generationConfigManager.setConversationConfig(conv2, {
        sampling: { temperature: 0.95 }
      })

      // 更新 conv1
      await generationConfigManager.setConversationConfig(conv1, {
        sampling: { temperature: 0.8 }
      })

      const effective1 = generationConfigManager.getEffectiveConfig({
        conversationId: conv1
      })

      const effective2 = generationConfigManager.getEffectiveConfig({
        conversationId: conv2
      })

      // conv1 应该被更新
      expect(effective1.sampling?.temperature).toBe(0.8)
      // conv2 应该保持不变
      expect(effective2.sampling?.temperature).toBe(0.95)
    })
  })

  describe('边界情况', () => {
    it('应该处理空的对话 ID', async () => {
      const config: PartialGenerationConfig = {
        sampling: { temperature: 0.8 }
      }

      // 应该不抛出错误
      await generationConfigManager.setConversationConfig('', config)

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: ''
      })

      expect(effective).toBeDefined()
    })

    it('应该处理 undefined 的配置参数', async () => {
      const conversationId = 'test-conv-14'

      // 设置包含 undefined 的配置
      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: {
          temperature: undefined,
          top_p: 0.9
        }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      // undefined 应该被跳过或被默认值替代
      expect(effective.sampling?.top_p).toBe(0.9)
    })

    it('应该在没有对话配置时返回默认值', () => {
      const effective = generationConfigManager.getEffectiveConfig({
        conversationId: 'non-existent-conv'
      })

      expect(effective).toBeDefined()
      // 应该包含默认值
      expect(effective.sampling).toBeDefined()
      expect(effective.length).toBeDefined()
    })
  })

  describe('配置栈追踪（调试）', () => {
    it('应该提供配置来源追踪信息', async () => {
      const modelId = 'test-model-3'
      const conversationId = 'test-conv-15'

      await generationConfigManager.setGlobalConfig({
        sampling: { temperature: 0.5 }
      })

      await generationConfigManager.setModelConfig(modelId, {
        sampling: { temperature: 0.6 }
      })

      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: { temperature: 0.8 }
      })

      const configStack = generationConfigManager.getConfigStack({
        modelId,
        conversationId
      })

      expect(configStack).toBeDefined()
      expect(Array.isArray(configStack)).toBe(true)
      expect(configStack.length).toBeGreaterThan(0)
    })
  })

  describe('复杂场景测试', () => {
    it('应该支持全参数场景：采样+长度+推理混合更新', async () => {
      const conversationId = 'test-conv-complex'

      await generationConfigManager.setConversationConfig(conversationId, {
        sampling: {
          temperature: 0.8,
          top_p: 0.9,
          top_k: 40
        },
        length: {
          max_tokens: 2000
        },
        reasoning: {
          controlMode: 'effort',
          effort: 'medium',
          maxReasoningTokens: 10000,
          showReasoningContent: true
        }
      })

      const effective = generationConfigManager.getEffectiveConfig({
        conversationId
      })

      expect(effective.sampling?.temperature).toBe(0.8)
      expect(effective.sampling?.top_p).toBe(0.9)
      expect(effective.sampling?.top_k).toBe(40)
      expect(effective.length?.max_tokens).toBe(2000)
      expect(effective.reasoning?.controlMode).toBe('effort')
      expect(effective.reasoning?.effort).toBe('medium')
      expect(effective.reasoning?.maxReasoningTokens).toBe(10000)
      expect(effective.reasoning?.showReasoningContent).toBe(true)
    })
  })
})
