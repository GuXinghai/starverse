/**
 * Gemini Stream Response Aggregator - 单元测试
 * 
 * 验证聚合器的核心功能：
 * - 文本/图片/Usage 的独立缓冲
 * - MessageMetadata 输出格式验证
 * - 去重逻辑正确性
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  GeminiStreamAggregator,
  createGeminiAggregator,
  type AggregatorConfig
} from '@/services/providers/gemini/responseAggregator'
import type { StreamChunk } from '@/types/providers'

describe('GeminiStreamAggregator', () => {
  let aggregator: GeminiStreamAggregator
  const defaultConfig: AggregatorConfig = {
    modelId: 'gemini-2.0-flash',
    provider: 'Gemini'
  }

  beforeEach(() => {
    aggregator = new GeminiStreamAggregator(defaultConfig)
  })

  describe('文本处理', () => {
    it('应正确累积文本 chunks', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'world' },
        { type: 'text', content: '!' }
      ]

      for (const chunk of chunks) {
        aggregator.processChunk(chunk)
      }

      expect(aggregator.getFullContent()).toBe('Hello world!')
    })

    it('应处理中文文本', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: '这' },
        { type: 'text', content: '是' },
        { type: 'text', content: '测试' }
      ]

      aggregator.processChunks(chunks)
      expect(aggregator.getFullContent()).toBe('这是测试')
    })

    it('应处理空文本 chunk', () => {
      aggregator.processChunk({ type: 'text', content: '' })
      aggregator.processChunk({ type: 'text', content: 'Content' })
      expect(aggregator.getFullContent()).toBe('Content')
    })

    it('应保持文本顺序', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: '1' },
        { type: 'text', content: '2' },
        { type: 'text', content: '3' }
      ]

      aggregator.processChunks(chunks)
      expect(aggregator.getFullContent()).toBe('123')
    })
  })

  describe('图片处理', () => {
    it('应收集图片 URLs', () => {
      const chunks: StreamChunk[] = [
        { type: 'image', content: 'data:image/png;base64,abc123' },
        { type: 'text', content: 'Image above' },
        { type: 'image', content: 'data:image/jpeg;base64,def456' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getImages()).toHaveLength(2)
      expect(aggregator.getImages()).toContain('data:image/png;base64,abc123')
      expect(aggregator.getImages()).toContain('data:image/jpeg;base64,def456')
    })

    it('应去重相同的图片 URL', () => {
      const url = 'data:image/png;base64,abc123'
      aggregator.processChunk({ type: 'image', content: url })
      aggregator.processChunk({ type: 'image', content: url })
      aggregator.processChunk({ type: 'image', content: url })

      expect(aggregator.getImages()).toHaveLength(1)
      expect(aggregator.getImages()[0]).toBe(url)
    })

    it('应混合处理文本和图片', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Text 1' },
        { type: 'image', content: 'url1' },
        { type: 'text', content: ' Text 2' },
        { type: 'image', content: 'url2' },
        { type: 'text', content: ' Text 3' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getFullContent()).toBe('Text 1 Text 2 Text 3')
      expect(aggregator.getImages()).toEqual(['url1', 'url2'])
    })
  })

  describe('Usage 元数据', () => {
    it('应收集 Usage 数据', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Response' },
        {
          type: 'usage',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30
          }
        }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getUsage()).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
      })
    })

    it('应合并多个 Usage chunks', () => {
      aggregator.processChunk({
        type: 'usage',
        usage: {
          promptTokens: 10,
          completionTokens: 20
        }
      })

      aggregator.processChunk({
        type: 'usage',
        usage: {
          totalTokens: 30,
          cost: 0.001
        }
      })

      const usage = aggregator.getUsage()
      expect(usage?.['promptTokens']).toBe(10)
      expect(usage?.['completionTokens']).toBe(20)
      expect(usage?.['totalTokens']).toBe(30)
      expect(usage?.['cost']).toBe(0.001)
    })

    it('应在 Usage chunk 中提取 requestId', () => {
      aggregator.processChunk({
        type: 'usage',
        usage: { totalTokens: 30 },
        requestId: 'req-12345'
      })

      const result = aggregator.getResult()
      expect(result.metadata.generationId).toBe('req-12345')
    })
  })

  describe('最终结果构建', () => {
    it('应构建完整的 AggregationResult', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'image', content: 'image-url' },
        {
          type: 'usage',
          usage: { totalTokens: 50 }
        }
      ]

      aggregator.processChunks(chunks)
      const result = aggregator.getResult()

      expect(result).toHaveProperty('fullContent', 'Hello')
      expect(result).toHaveProperty('images', ['image-url'])
      expect(result).toHaveProperty('metadata')
      expect(result.metadata).toHaveProperty('provider', 'Gemini')
      expect(result.metadata).toHaveProperty('model', 'gemini-2.0-flash')
      expect(result.metadata).toHaveProperty('usage')
    })

    it('metadata 应符合 MessageMetadata 接口', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Response' },
        {
          type: 'usage',
          usage: { promptTokens: 5, completionTokens: 15, totalTokens: 20 }
        }
      ]

      aggregator.processChunks(chunks)
      const metadata = aggregator.getResult().metadata

      // 必须字段
      expect(metadata).toHaveProperty('provider')
      expect(metadata).toHaveProperty('model')
      
      // 可选但期望的字段
      expect(metadata.provider).toBe('Gemini')
      expect(metadata.model).toBe('gemini-2.0-flash')
      expect(metadata.usage).toBeDefined()
    })

    it('不含 reasoning 字段（Gemini 暂不支持）', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Response' },
        { type: 'usage', usage: { totalTokens: 20 } }
      ]

      aggregator.processChunks(chunks)
      const metadata = aggregator.getResult().metadata

      // Gemini 暂不产生 reasoning 数据
      expect(metadata.reasoning).toBeUndefined()
    })
  })

  describe('错误处理', () => {
    it('应抛出 error chunk 异常', () => {
      const errorChunk: StreamChunk = {
        type: 'error',
        error: {
          message: 'API error',
          code: 'PERMISSION_DENIED'
        }
      }

      expect(() => {
        aggregator.processChunk(errorChunk)
      }).toThrow('Gemini stream error: API error')
    })

    it('应忽略未知 chunk 类型（向前兼容）', () => {
      // 这会产生 warning，但不应抛出异常
      aggregator.processChunk({
        type: 'unknown_type' as any
      } as any)

      // 应该正常继续
      aggregator.processChunk({ type: 'text', content: 'After unknown' })
      expect(aggregator.getFullContent()).toBe('After unknown')
    })

    it('应处理并忽略意外的推理 chunks', () => {
      // Gemini 暂不产生这些，但如果收到应忽略并 warn
      aggregator.processChunk({
        type: 'reasoning_stream_text',
        text: 'Unexpected reasoning'
      })

      aggregator.processChunk({ type: 'text', content: 'Normal response' })
      expect(aggregator.getFullContent()).toBe('Normal response')
    })
  })

  describe('重置功能', () => {
    it('应完全重置聚合器状态', () => {
      // 初始化一些数据
      aggregator.processChunk({ type: 'text', content: 'Initial' })
      aggregator.processChunk({ type: 'image', content: 'image-url' })
      aggregator.processChunk({
        type: 'usage',
        usage: { totalTokens: 30 }
      })

      // 验证数据存在
      expect(aggregator.getFullContent()).toBe('Initial')
      expect(aggregator.getImages()).toHaveLength(1)
      expect(aggregator.getUsage()).toBeDefined()

      // 重置
      aggregator.reset()

      // 验证全部清空
      expect(aggregator.getFullContent()).toBe('')
      expect(aggregator.getImages()).toHaveLength(0)
      expect(aggregator.getUsage()).toBeNull()
    })

    it('重置后应能继续正常使用', () => {
      aggregator.processChunk({ type: 'text', content: 'First' })
      aggregator.reset()
      aggregator.processChunk({ type: 'text', content: 'Second' })

      expect(aggregator.getFullContent()).toBe('Second')
    })
  })

  describe('工厂函数', () => {
    it('createGeminiAggregator 应创建有效实例', () => {
      const agg = createGeminiAggregator(defaultConfig)

      expect(agg).toBeInstanceOf(GeminiStreamAggregator)

      agg.processChunk({ type: 'text', content: 'Test' })
      expect(agg.getFullContent()).toBe('Test')
    })

    it('不同配置应创建不同实例', () => {
      const agg1 = createGeminiAggregator({
        modelId: 'gemini-2.0-flash',
        provider: 'Gemini'
      })

      const agg2 = createGeminiAggregator({
        modelId: 'gemini-1.5-pro',
        provider: 'Gemini'
      })

      agg1.processChunk({ type: 'text', content: 'Model 1' })
      agg2.processChunk({ type: 'text', content: 'Model 2' })

      expect(agg1.getFullContent()).toBe('Model 1')
      expect(agg2.getFullContent()).toBe('Model 2')

      const result1 = agg1.getResult()
      const result2 = agg2.getResult()

      expect(result1.metadata.model).toBe('gemini-2.0-flash')
      expect(result2.metadata.model).toBe('gemini-1.5-pro')
    })
  })

  describe('批量处理', () => {
    it('processChunks 应正确处理数组', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'text', content: ' ' },
        { type: 'text', content: 'World' }
      ]

      aggregator.processChunks(chunks)
      expect(aggregator.getFullContent()).toBe('Hello World')
    })

    it('批量处理应与单个处理等价', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'A' },
        { type: 'image', content: 'img1' },
        { type: 'text', content: 'B' },
        {
          type: 'usage',
          usage: { totalTokens: 100 }
        }
      ]

      // 方式 1：单个处理
      const agg1 = new GeminiStreamAggregator(defaultConfig)
      for (const chunk of chunks) {
        agg1.processChunk(chunk)
      }

      // 方式 2：批量处理
      const agg2 = new GeminiStreamAggregator(defaultConfig)
      agg2.processChunks(chunks)

      expect(agg1.getFullContent()).toBe(agg2.getFullContent())
      expect(agg1.getImages()).toEqual(agg2.getImages())
      expect(agg1.getUsage()).toEqual(agg2.getUsage())
    })
  })
})
