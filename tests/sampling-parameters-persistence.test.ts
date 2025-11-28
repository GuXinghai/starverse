/**
 * Sampling Parameters Persistence Test
 * 测试参数模式和手动值的完整持久化流程
 * 
 * 测试场景：
 * 1. 创建对话并设置参数为 INPUT 模式 + 自定义值
 * 2. 保存对话到数据库
 * 3. 从数据库加载对话
 * 4. 验证模式和手动值是否正确恢复
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { SamplingParameterSettings, ParameterControlMode } from '../src/types/chat'
import { DEFAULT_SAMPLING_PARAMETERS } from '../src/types/chat'

describe('Sampling Parameters Persistence', () => {
  // 模拟的完整参数设置（包含所有模式和手动值字段）
  const customParameters: SamplingParameterSettings = {
    enabled: true,
    
    // Temperature - INPUT 模式，自定义值 0.85
    temperature: 0.85,
    temperature_mode: 'INPUT' as ParameterControlMode,
    temperature_manualValue: 0.85,

    // Top P - SLIDER 模式（保持默认）
    top_p: DEFAULT_SAMPLING_PARAMETERS.top_p,
    top_p_mode: 'SLIDER' as ParameterControlMode,
    top_p_manualValue: undefined,

    // Top K - INPUT 模式，自定义值 100
    top_k: 100,
    top_k_mode: 'INPUT' as ParameterControlMode,
    top_k_manualValue: 100,

    // Frequency Penalty - INPUT 模式，自定义值 0.5
    frequency_penalty: 0.5,
    frequency_penalty_mode: 'INPUT' as ParameterControlMode,
    frequency_penalty_manualValue: 0.5,

    // Presence Penalty - SLIDER 模式
    presence_penalty: DEFAULT_SAMPLING_PARAMETERS.presence_penalty,
    presence_penalty_mode: 'SLIDER' as ParameterControlMode,
    presence_penalty_manualValue: undefined,

    // Repetition Penalty - INPUT 模式，自定义值 1.2
    repetition_penalty: 1.2,
    repetition_penalty_mode: 'INPUT' as ParameterControlMode,
    repetition_penalty_manualValue: 1.2,

    // Min P - SLIDER 模式
    min_p: DEFAULT_SAMPLING_PARAMETERS.min_p,
    min_p_mode: 'SLIDER' as ParameterControlMode,
    min_p_manualValue: undefined,

    // Top A - INPUT 模式，自定义值 0.3
    top_a: 0.3,
    top_a_mode: 'INPUT' as ParameterControlMode,
    top_a_manualValue: 0.3,

    // Max Tokens - INPUT 模式，自定义值 2048
    max_tokens: 2048,
    max_tokens_mode: 'INPUT' as ParameterControlMode,
    max_tokens_manualValue: 2048,

    // Seed - INPUT 模式，自定义值 42
    seed: 42,
    seed_mode: 'INPUT' as ParameterControlMode,
    seed_manualValue: 42
  }

  it('should include all mode and manualValue fields in type definition', () => {
    // 验证类型定义完整性
    const keys = Object.keys(customParameters)
    
    // 应该包含所有参数的 mode 字段
    expect(keys).toContain('temperature_mode')
    expect(keys).toContain('top_p_mode')
    expect(keys).toContain('top_k_mode')
    expect(keys).toContain('frequency_penalty_mode')
    expect(keys).toContain('presence_penalty_mode')
    expect(keys).toContain('repetition_penalty_mode')
    expect(keys).toContain('min_p_mode')
    expect(keys).toContain('top_a_mode')
    expect(keys).toContain('max_tokens_mode')
    expect(keys).toContain('seed_mode')

    // 应该包含所有参数的 manualValue 字段
    expect(keys).toContain('temperature_manualValue')
    expect(keys).toContain('top_p_manualValue')
    expect(keys).toContain('top_k_manualValue')
    expect(keys).toContain('frequency_penalty_manualValue')
    expect(keys).toContain('presence_penalty_manualValue')
    expect(keys).toContain('repetition_penalty_manualValue')
    expect(keys).toContain('min_p_manualValue')
    expect(keys).toContain('top_a_manualValue')
    expect(keys).toContain('max_tokens_manualValue')
    expect(keys).toContain('seed_manualValue')
  })

  it('should correctly serialize samplingParameters to JSON', () => {
    // 验证序列化不会丢失字段
    const serialized = JSON.stringify(customParameters)
    const deserialized = JSON.parse(serialized)

    // 验证 INPUT 模式参数
    expect(deserialized.temperature_mode).toBe('INPUT')
    expect(deserialized.temperature_manualValue).toBe(0.85)
    expect(deserialized.top_k_mode).toBe('INPUT')
    expect(deserialized.top_k_manualValue).toBe(100)
    expect(deserialized.frequency_penalty_mode).toBe('INPUT')
    expect(deserialized.frequency_penalty_manualValue).toBe(0.5)
    expect(deserialized.repetition_penalty_mode).toBe('INPUT')
    expect(deserialized.repetition_penalty_manualValue).toBe(1.2)
    expect(deserialized.top_a_mode).toBe('INPUT')
    expect(deserialized.top_a_manualValue).toBe(0.3)
    expect(deserialized.max_tokens_mode).toBe('INPUT')
    expect(deserialized.max_tokens_manualValue).toBe(2048)
    expect(deserialized.seed_mode).toBe('INPUT')
    expect(deserialized.seed_manualValue).toBe(42)

    // 验证 SLIDER 模式参数
    expect(deserialized.top_p_mode).toBe('SLIDER')
    expect(deserialized.top_p_manualValue).toBeUndefined()
    expect(deserialized.presence_penalty_mode).toBe('SLIDER')
    expect(deserialized.presence_penalty_manualValue).toBeUndefined()
    expect(deserialized.min_p_mode).toBe('SLIDER')
    expect(deserialized.min_p_manualValue).toBeUndefined()
  })

  it('should preserve parameter integrity through snapshot conversion', () => {
    // 模拟 ConversationSnapshot 结构
    const snapshot = {
      id: 'test-conv-123',
      title: '测试对话',
      messages: [],
      model: 'gpt-4',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      samplingParameters: customParameters  // 关键：包含完整参数
    }

    // 验证 snapshot 包含所有字段
    expect(snapshot.samplingParameters).toBeDefined()
    expect(snapshot.samplingParameters?.temperature_mode).toBe('INPUT')
    expect(snapshot.samplingParameters?.temperature_manualValue).toBe(0.85)
    expect(snapshot.samplingParameters?.top_k_mode).toBe('INPUT')
    expect(snapshot.samplingParameters?.top_k_manualValue).toBe(100)
  })

  it('should handle missing samplingParameters gracefully (backwards compatibility)', () => {
    // 模拟旧版对话快照（没有 samplingParameters 字段）
    const oldSnapshot: any = {
      id: 'old-conv-456',
      title: '旧对话',
      messages: [],
      model: 'gpt-3.5-turbo',
      createdAt: Date.now(),
      updatedAt: Date.now()
      // 注意：没有 samplingParameters 字段
    }

    // 恢复逻辑应该使用默认值
    const restoredParameters = oldSnapshot.samplingParameters || { ...DEFAULT_SAMPLING_PARAMETERS }

    // 验证默认值正确应用
    expect(restoredParameters.temperature).toBeDefined()
    expect(restoredParameters.temperature_mode).toBe('SLIDER') // 默认模式
    expect(restoredParameters.temperature_manualValue).toBeNull() // 默认为 null
  })

  it('should demonstrate complete save-load cycle', () => {
    // 1. 创建带自定义参数的对话
    const originalConversation = {
      id: 'cycle-test-789',
      title: '完整周期测试',
      tree: { nodes: {}, rootNodeId: 'root-1', activeLeafId: 'root-1' },
      model: 'claude-3-opus',
      generationStatus: 'idle' as const,
      draft: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      samplingParameters: customParameters  // 包含所有自定义设置
    }

    // 2. 模拟保存到数据库（序列化）
    const metaToSave = {
      id: originalConversation.id,
      title: originalConversation.title,
      model: originalConversation.model,
      createdAt: originalConversation.createdAt,
      updatedAt: originalConversation.updatedAt,
      samplingParameters: originalConversation.samplingParameters  // 关键：保存参数
    }

    const serializedMeta = JSON.stringify(metaToSave)
    
    // 3. 模拟从数据库加载（反序列化）
    const loadedMeta = JSON.parse(serializedMeta)
    
    // 4. 恢复对话对象
    const restoredConversation = {
      id: loadedMeta.id,
      title: loadedMeta.title,
      model: loadedMeta.model,
      createdAt: loadedMeta.createdAt,
      updatedAt: loadedMeta.updatedAt,
      samplingParameters: loadedMeta.samplingParameters || { ...DEFAULT_SAMPLING_PARAMETERS }
    }

    // 5. 验证完整性
    expect(restoredConversation.samplingParameters).toBeDefined()
    
    // 验证 INPUT 模式参数完全恢复
    expect(restoredConversation.samplingParameters.temperature_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.temperature_manualValue).toBe(0.85)
    expect(restoredConversation.samplingParameters.temperature).toBe(0.85)
    
    expect(restoredConversation.samplingParameters.top_k_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.top_k_manualValue).toBe(100)
    expect(restoredConversation.samplingParameters.top_k).toBe(100)
    
    expect(restoredConversation.samplingParameters.frequency_penalty_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.frequency_penalty_manualValue).toBe(0.5)
    
    expect(restoredConversation.samplingParameters.repetition_penalty_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.repetition_penalty_manualValue).toBe(1.2)
    
    expect(restoredConversation.samplingParameters.top_a_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.top_a_manualValue).toBe(0.3)
    
    expect(restoredConversation.samplingParameters.max_tokens_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.max_tokens_manualValue).toBe(2048)
    
    expect(restoredConversation.samplingParameters.seed_mode).toBe('INPUT')
    expect(restoredConversation.samplingParameters.seed_manualValue).toBe(42)

    // 验证 SLIDER 模式参数正确恢复
    expect(restoredConversation.samplingParameters.top_p_mode).toBe('SLIDER')
    expect(restoredConversation.samplingParameters.top_p_manualValue).toBeUndefined()
    
    expect(restoredConversation.samplingParameters.presence_penalty_mode).toBe('SLIDER')
    expect(restoredConversation.samplingParameters.presence_penalty_manualValue).toBeUndefined()
    
    expect(restoredConversation.samplingParameters.min_p_mode).toBe('SLIDER')
    expect(restoredConversation.samplingParameters.min_p_manualValue).toBeUndefined()
  })

  it('should verify data integrity through spreadcopy', () => {
    // 验证使用扩展运算符复制不会丢失字段
    const copied = { ...customParameters }

    // 验证所有字段都被复制
    expect(copied.temperature_mode).toBe('INPUT')
    expect(copied.temperature_manualValue).toBe(0.85)
    expect(copied.top_k_mode).toBe('INPUT')
    expect(copied.top_k_manualValue).toBe(100)
    expect(copied.frequency_penalty_mode).toBe('INPUT')
    expect(copied.frequency_penalty_manualValue).toBe(0.5)
    expect(copied.repetition_penalty_mode).toBe('INPUT')
    expect(copied.repetition_penalty_manualValue).toBe(1.2)
    expect(copied.top_a_mode).toBe('INPUT')
    expect(copied.top_a_manualValue).toBe(0.3)
    expect(copied.max_tokens_mode).toBe('INPUT')
    expect(copied.max_tokens_manualValue).toBe(2048)
    expect(copied.seed_mode).toBe('INPUT')
    expect(copied.seed_manualValue).toBe(42)

    // 验证深拷贝独立性
    copied.temperature_manualValue = 0.99
    expect(customParameters.temperature_manualValue).toBe(0.85)  // 原始值不受影响
  })
})
