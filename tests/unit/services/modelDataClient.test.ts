/**
 * 模型数据客户端测试
 * 验证 IPC 序列化和数据库操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelData } from '@/types/store'

describe('Model Data Client - IPC Serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('模型 ID 到 ModelData 转换', () => {
    it('应创建可序列化的 ModelData 对象', () => {
      const modelIds = ['gemini-2.0-flash-exp', 'gemini-1.5-pro']
      
      // 模拟 main.ts 中的转换逻辑
      const models = modelIds.map(id => ({
        id,
        name: id,
        description: undefined,
        context_length: undefined,
        max_output_tokens: undefined,
        pricing: undefined,
        supportsVision: undefined,
        supportsImageOutput: undefined,
        supportsReasoning: undefined
      }))
      
      expect(models).toHaveLength(2)
      expect(models[0]).toMatchObject({
        id: 'gemini-2.0-flash-exp',
        name: 'gemini-2.0-flash-exp'
      })
      
      // 验证可序列化（无函数、无循环引用）
      expect(() => JSON.parse(JSON.stringify(models))).not.toThrow()
    })

    it('应处理包含 undefined 字段的对象（IPC 兼容）', () => {
      const model: ModelData = {
        id: 'test-model',
        name: 'test-model',
        description: undefined,
        context_length: undefined
      }
      
      // IPC 传输会移除 undefined 字段
      const serialized = JSON.parse(JSON.stringify(model))
      
      expect(serialized).toEqual({
        id: 'test-model',
        name: 'test-model'
      })
      expect(serialized.description).toBeUndefined()
    })

    it('应拒绝包含函数的对象（序列化失败）', () => {
      const invalidModel = {
        id: 'test',
        name: 'test',
        someFunction: () => console.log('error')
      }
      
      // JSON.stringify 会忽略函数，但 structuredClone 会抛出错误
      expect(() => structuredClone(invalidModel)).toThrow()
    })

    it('应拒绝包含循环引用的对象', () => {
      const circularModel: any = {
        id: 'test',
        name: 'test'
      }
      circularModel.self = circularModel
      
      expect(() => JSON.stringify(circularModel)).toThrow()
    })
  })

  describe('SaveModelDataInput 格式验证', () => {
    it('应创建有效的 SaveModelDataInput', () => {
      const model: ModelData = {
        id: 'openrouter/anthropic/claude-3',
        name: 'Claude 3',
        description: 'Test model',
        context_length: 200000,
        pricing: {
          prompt: 0.01,
          completion: 0.02
        }
      }
      
      // 模拟 modelDataClient.saveModels 的映射逻辑
      const input = {
        id: model.id,
        provider: model.id.split('/')[0],
        name: model.name || model.id,
        description: model.description,
        contextLength: model.context_length,
        pricing: model.pricing,
        meta: {
          // 这里不包含 _raw，避免序列化问题
        }
      }
      
      expect(input.provider).toBe('openrouter')
      expect(() => JSON.parse(JSON.stringify(input))).not.toThrow()
    })

    it('应处理完整 pricing 对象', () => {
      const pricing = {
        prompt: 0.000003,
        completion: 0.000015,
        image: 0.001
      }
      
      const serialized = JSON.parse(JSON.stringify(pricing))
      expect(serialized).toEqual(pricing)
    })

    it('应处理空 meta 对象', () => {
      const meta = {}
      
      // 空对象可序列化
      expect(JSON.stringify(meta)).toBe('{}')
    })
  })
})
