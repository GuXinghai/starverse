/**
 * 模型数据客户端测试
 * 验证 IPC 序列化和数据库操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { AppModel } from '../../../src/types/appModel'

describe('Model Data Client - IPC Serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('AppModel 序列化', () => {
    it('应创建可序列化的 AppModel 对象', () => {
      const modelIds = ['gemini-2.0-flash-exp', 'gemini-1.5-pro']
      
      const models: AppModel[] = modelIds.map(id => ({
        id,
        name: id,
        context_length: -1,
        capabilities: {
          hasReasoning: false,
          hasTools: false,
          hasJsonMode: false,
          isMultimodal: false,
        },
        pricing: {
          promptUsdPerToken: '0',
          completionUsdPerToken: '0',
          requestUsd: '0',
          imageUsd: '0',
          webSearchUsd: '0',
          internalReasoningUsdPerToken: '0',
          inputCacheReadUsdPerToken: '0',
          inputCacheWriteUsdPerToken: '0',
        },
        is_archived: false,
        router_source: 'gemini_api',
        vendor: 'google',
        description: undefined,
        max_output_tokens: undefined,
        input_modalities: undefined,
        output_modalities: undefined,
        supported_parameters: undefined,
      }))
      
      expect(models).toHaveLength(2)
      expect(models[0]).toMatchObject({
        id: 'gemini-2.0-flash-exp',
        name: 'gemini-2.0-flash-exp'
      })
      
      // 验证可序列化（无函数、无循环引用）
      expect(() => JSON.parse(JSON.stringify(models))).not.toThrow()
    })

    it('应处理包含 undefined 可选字段的对象（IPC 兼容）', () => {
      const model: AppModel = {
        id: 'test-model',
        name: 'test-model',
        context_length: 8192,
        capabilities: {
          hasReasoning: false,
          hasTools: false,
          hasJsonMode: false,
          isMultimodal: false,
        },
        pricing: {
          promptUsdPerToken: '0',
          completionUsdPerToken: '0',
          requestUsd: '0',
          imageUsd: '0',
          webSearchUsd: '0',
          internalReasoningUsdPerToken: '0',
          inputCacheReadUsdPerToken: '0',
          inputCacheWriteUsdPerToken: '0',
        },
        is_archived: false,
        router_source: 'openrouter',
        vendor: 'unknown',
        description: undefined,
        max_output_tokens: undefined,
        input_modalities: undefined,
        output_modalities: undefined,
        supported_parameters: undefined,
      }
      
      // IPC 传输会移除 undefined 字段
      const serialized = JSON.parse(JSON.stringify(model))
      
      expect(serialized.id).toBe('test-model')
      expect(serialized.name).toBe('test-model')
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
      const model: AppModel = {
        id: 'openrouter/anthropic/claude-3',
        name: 'Claude 3',
        description: 'Test model',
        context_length: 200000,
        capabilities: {
          hasReasoning: true,
          hasTools: true,
          hasJsonMode: true,
          isMultimodal: false,
        },
        pricing: {
          promptUsdPerToken: '0.01',
          completionUsdPerToken: '0.02',
          requestUsd: '0',
          imageUsd: '0',
          webSearchUsd: '0',
          internalReasoningUsdPerToken: '0',
          inputCacheReadUsdPerToken: '0',
          inputCacheWriteUsdPerToken: '0',
        },
        is_archived: false,
        router_source: 'openrouter',
        vendor: 'anthropic',
        input_modalities: ['text'],
        output_modalities: ['text'],
        supported_parameters: ['reasoning', 'tools', 'response_format'],
        max_output_tokens: 8192,
      }
      
      // 模拟 modelDataClient.saveAppModels 的映射逻辑（核心字段必须可 structuredClone / JSON 序列化）
      const input = {
        id: String(model.id),
        routerSource: model.router_source,
        vendor: model.vendor,
        name: model.name || model.id,
        description: model.description,
        contextLength: model.context_length,
        pricing: model.pricing,
        capabilities: model.capabilities,
        isArchived: model.is_archived,
        firstSeenAt: model.first_seen_at,
        lastSeenAt: model.last_seen_at,
        meta: {
          input_modalities: model.input_modalities,
          output_modalities: model.output_modalities,
          supported_parameters: model.supported_parameters,
          max_output_tokens: model.max_output_tokens,
        }
      }
      
      expect(input.routerSource).toBe('openrouter')
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
