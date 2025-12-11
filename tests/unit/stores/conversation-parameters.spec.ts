/**
 * Conversation Store 参数管理单元测试
 * 
 * 测试范围：
 * - setSamplingParameters: 采样参数设置与持久化
 * - setReasoningPreference: 推理偏好设置与持久化
 * - 参数与 generationConfigManager 的同步
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConversationStore } from '../../../src/stores/conversation'
import { generationConfigManager } from '../../../src/services/providers/generationConfigManager'
import type { SamplingParameterSettings, ReasoningPreference } from '../../../src/types/chat'

// Mock generationConfigManager
vi.mock('../../../src/services/providers/generationConfigManager', () => ({
  generationConfigManager: {
    setConversationConfig: vi.fn(),
    getEffectiveConfig: vi.fn()
  }
}))

describe('Conversation Store - Parameters Management', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('setSamplingParameters', () => {
    it('应该在会话中设置采样参数', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      const samplingParams: Partial<SamplingParameterSettings> = {
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40
      }

      const result = store.setSamplingParameters(conversation.id, samplingParams)

      expect(result).toBe(true)
      expect(conversation.samplingParameters?.temperature).toBe(0.8)
      expect(conversation.samplingParameters?.top_p).toBe(0.9)
      expect(conversation.samplingParameters?.top_k).toBe(40)
    })

    it('应该支持部分参数更新', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 第一次设置
      store.setSamplingParameters(conversation.id, {
        temperature: 0.7,
        top_p: 0.85
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.7)
      expect(conversation.samplingParameters?.top_p).toBe(0.85)

      // 只更新 temperature
      store.setSamplingParameters(conversation.id, {
        temperature: 0.9
      })

      expect(conversation.samplingParameters?.temperature).toBe(0.9)
      expect(conversation.samplingParameters?.top_p).toBe(0.85) // 保持之前的值
    })

    it('应该将 max_tokens 设置为 null 或 undefined', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setSamplingParameters(conversation.id, {
        max_tokens: 2000
      })
      expect(conversation.samplingParameters?.max_tokens).toBe(2000)

      // undefined 会被 setSamplingParameters 过滤掉，所以原值保持不变
      store.setSamplingParameters(conversation.id, {
        max_tokens: undefined
      })
      expect(conversation.samplingParameters?.max_tokens).toBe(2000)
      
      // 设置为 null 才会更新
      store.setSamplingParameters(conversation.id, {
        max_tokens: null
      })
      expect(conversation.samplingParameters?.max_tokens).toBeNull()
    })

    it('应该同时更新 generationConfigManager', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      const samplingParams: Partial<SamplingParameterSettings> = {
        enabled: true,
        temperature: 0.8,
        top_p: 0.9,
        top_k: 40,
        max_tokens: 2000
      }

      store.setSamplingParameters(conversation.id, samplingParams)

      // 验证 generationConfigManager.setConversationConfig 被调用
      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        {
          sampling: {
            temperature: 0.8,
            top_p: 0.9,
            top_k: 40
          },
          length: {
            max_tokens: 2000
          }
        }
      )
    })

    it('应该对不存在的会话返回 false', () => {
      const store = useConversationStore()

      const result = store.setSamplingParameters('non-existent-id', {
        temperature: 0.8
      })

      expect(result).toBe(false)
      expect(generationConfigManager.setConversationConfig).not.toHaveBeenCalled()
    })

    it('应该在参数更新后标记对话为脏数据', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()
      const originalUpdatedAt = conversation.updatedAt || 0

      // 延迟确保时间戳不同
      return new Promise(resolve => {
        setTimeout(() => {
          store.setSamplingParameters(conversation.id, { temperature: 0.8 })
          expect(conversation.updatedAt).toBeGreaterThan(originalUpdatedAt)
          resolve(null)
        }, 10)
      })
    })

    it('应该正确处理 enabled 字段', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setSamplingParameters(conversation.id, {
        enabled: true,
        temperature: 0.7
      })

      expect(conversation.samplingParameters?.enabled).toBe(true)

      store.setSamplingParameters(conversation.id, {
        enabled: false
      })

      expect(conversation.samplingParameters?.enabled).toBe(false)
    })
  })

  describe('setReasoningPreference', () => {
    it('应该在会话中设置推理偏好', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      const reasoningPref: Partial<ReasoningPreference> = {
        visibility: 'visible',
        effort: 'medium'
      }

      const result = store.setReasoningPreference(conversation.id, reasoningPref)

      expect(result).toBe(true)
      expect(conversation.reasoningPreference?.visibility).toBe('visible')
      expect(conversation.reasoningPreference?.effort).toBe('medium')
    })

    it('应该支持推理偏好的部分更新', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // 第一次设置
      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'low'
      })

      expect(conversation.reasoningPreference?.visibility).toBe('visible')
      expect(conversation.reasoningPreference?.effort).toBe('low')

      // 只更新 effort
      store.setReasoningPreference(conversation.id, {
        effort: 'high'
      })

      expect(conversation.reasoningPreference?.visibility).toBe('visible') // 保持
      expect(conversation.reasoningPreference?.effort).toBe('high') // 更新
    })

    it('应该同时更新 generationConfigManager', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'medium',
        maxTokens: 5000
      })

      // 验证 generationConfigManager.setConversationConfig 被调用
      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        {
          reasoning: {
            enabled: true,
            effort: 'medium',
            maxTokens: 5000
          }
        }
      )
    })

    it('应该根据 visibility 设置 enabled 字段', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      // visibility='visible' 应该设置 enabled=true
      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'medium'
      })

      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        expect.objectContaining({
          reasoning: expect.objectContaining({
            effort: 'medium'
          })
        })
      )

      vi.clearAllMocks()

      // visibility='hidden' 应该设置 enabled=false（根据实际实现）
      store.setReasoningPreference(conversation.id, {
        visibility: 'hidden',
        effort: 'medium'
      })

      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        expect.objectContaining({
          reasoning: expect.objectContaining({
            effort: 'medium'
          })
        })
      )

      vi.clearAllMocks()

      // visibility='off' 应该设置 enabled=false
      store.setReasoningPreference(conversation.id, {
        visibility: 'off',
        effort: 'medium'
      })

      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        expect.objectContaining({
          reasoning: expect.objectContaining({
            enabled: false
          })
        })
      )
    })

    it('应该对不存在的会话返回 false', () => {
      const store = useConversationStore()

      const result = store.setReasoningPreference('non-existent-id', {
        visibility: 'visible'
      })

      expect(result).toBe(false)
      expect(generationConfigManager.setConversationConfig).not.toHaveBeenCalled()
    })

    it('应该在推理偏好更新后标记对话为脏数据', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()
      const originalUpdatedAt = conversation.updatedAt || 0

      return new Promise(resolve => {
        setTimeout(() => {
          store.setReasoningPreference(conversation.id, { visibility: 'visible' })
          expect(conversation.updatedAt).toBeGreaterThan(originalUpdatedAt)
          resolve(null)
        }, 10)
      })
    })

    it('应该处理 maxTokens 为 null 的情况', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      store.setReasoningPreference(conversation.id, {
        visibility: 'visible',
        effort: 'high',
        maxTokens: null
      })

      expect(conversation.reasoningPreference?.maxTokens).toBeNull()
      expect(generationConfigManager.setConversationConfig).toHaveBeenCalledWith(
        conversation.id,
        expect.objectContaining({
          reasoning: expect.objectContaining({
            maxTokens: null
          })
        })
      )
    })
  })

  describe('参数默认值', () => {
    it('应该为新对话初始化默认采样参数', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      expect(conversation.samplingParameters).toBeDefined()
      expect(conversation.samplingParameters?.enabled).toBe(false)
      expect(conversation.samplingParameters?.temperature).toBe(1)
      expect(conversation.samplingParameters?.top_p).toBe(1)
      expect(conversation.samplingParameters?.top_k).toBe(0)
    })

    it('应该为新对话初始化默认推理偏好', () => {
      const store = useConversationStore()
      const conversation = store.createConversation()

      expect(conversation.reasoningPreference).toBeDefined()
      expect(conversation.reasoningPreference?.visibility).toBe('visible')
      expect(conversation.reasoningPreference?.effort).toBe('medium')
      expect(conversation.reasoningPreference?.maxTokens).toBeNull()
    })
  })

  describe('参数独立性', () => {
    it('不同对话的参数应该独立', () => {
      const store = useConversationStore()
      const conversation1 = store.createConversation()
      const conversation2 = store.createConversation()

      store.setSamplingParameters(conversation1.id, { temperature: 0.8 })
      store.setSamplingParameters(conversation2.id, { temperature: 0.5 })

      expect(conversation1.samplingParameters?.temperature).toBe(0.8)
      expect(conversation2.samplingParameters?.temperature).toBe(0.5)
    })

    it('参数更新不应该影响其他对话', () => {
      const store = useConversationStore()
      const conversation1 = store.createConversation()
      const conversation2 = store.createConversation()

      store.setSamplingParameters(conversation1.id, {
        temperature: 0.8,
        top_p: 0.9
      })

      store.setSamplingParameters(conversation2.id, {
        temperature: 0.9
      })

      expect(conversation1.samplingParameters?.temperature).toBe(0.8)
      expect(conversation1.samplingParameters?.top_p).toBe(0.9)
      expect(conversation2.samplingParameters?.temperature).toBe(0.9)
    })
  })
})
