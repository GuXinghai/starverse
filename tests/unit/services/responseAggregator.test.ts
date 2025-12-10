/**
 * OpenRouter Stream Aggregator 单元测试
 * 
 * 验证有状态聚合器的核心功能：
 * - 文本/推理/图片/Usage 的独立缓冲
 * - 推理与回答的竞态处理
 * - MessageMetadata 输出格式验证
 * - 去重逻辑正确性
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  OpenRouterStreamAggregator,
  createOpenRouterAggregator,
  type AggregatorConfig
} from '../../../src/services/providers/openrouter/responseAggregator'
import type { StreamChunk } from '../../../src/types/providers'

describe('OpenRouterStreamAggregator', () => {
  let aggregator: OpenRouterStreamAggregator
  const baseConfig: AggregatorConfig = {
    modelId: 'anthropic/claude-3-opus',
    provider: 'OpenRouter'
  }

  beforeEach(() => {
    aggregator = new OpenRouterStreamAggregator(baseConfig)
  })

  describe('文本内容聚合', () => {
    it('应正确累积多个文本块', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'text', content: ' ' },
        { type: 'text', content: 'World' },
        { type: 'text', content: '!' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getFullContent()).toBe('Hello World!')
    })

    it('应处理空文本块', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: '' },
        { type: 'text', content: 'Valid' },
        { type: 'text', content: '' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getFullContent()).toBe('Valid')
    })
  })

  describe('推理数据聚合', () => {
    it('应正确累积推理文本流', () => {
      const chunks: StreamChunk[] = [
        { type: 'reasoning_stream_text', text: 'Let me think' },
        { type: 'reasoning_stream_text', text: ' about this' },
        { type: 'reasoning_stream_text', text: '...' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getReasoningText()).toBe('Let me think about this...')
    })

    it('应去重推理详情（基于 id）', () => {
      const chunks: StreamChunk[] = [
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-1',
            type: 'analysis',
            text: 'Step 1',
            summary: 'Analyze',
            data: {},
            format: 'text'
          }
        },
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-1', // 重复 ID
            type: 'analysis',
            text: 'Step 1 Duplicate',
            summary: 'Analyze Again',
            data: {},
            format: 'text'
          }
        },
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-2',
            type: 'synthesis',
            text: 'Step 2',
            summary: 'Synthesize',
            data: {},
            format: 'text'
          }
        }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getReasoningDetailCount()).toBe(2) // 只保留 2 个
    })

    it('应去重推理详情（基于内容指纹）', () => {
      const chunks: StreamChunk[] = [
        {
          type: 'reasoning_detail',
          detail: {
            id: null, // 无 ID
            type: 'step',
            text: 'Same content',
            summary: 'Same summary',
            data: {},
            format: 'text'
          }
        },
        {
          type: 'reasoning_detail',
          detail: {
            id: null,
            type: 'step',
            text: 'Same content', // 相同内容
            summary: 'Same summary',
            data: {},
            format: 'text'
          }
        }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getReasoningDetailCount()).toBe(1) // 去重后只保留 1 个
    })

    it('应正确设置推理摘要（覆盖式更新）', () => {
      const chunks: StreamChunk[] = [
        { 
          type: 'reasoning_summary', 
          summary: 'First summary', 
          text: '', 
          detailCount: 0, 
          request: { visibility: 'visible', effort: 'medium', maxTokens: null, payload: {} }, 
          provider: 'openrouter', 
          model: 'test-model', 
          excluded: false 
        },
        { 
          type: 'reasoning_summary', 
          summary: 'Final summary', 
          text: '', 
          detailCount: 0, 
          request: { visibility: 'visible', effort: 'medium', maxTokens: null, payload: {} }, 
          provider: 'openrouter', 
          model: 'test-model', 
          excluded: false 
        }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()
      expect(result.metadata.reasoning?.summary).toBe('Final summary')
    })
  })

  describe('图片数据聚合', () => {
    it('应去重图片 URL', () => {
      const chunks: StreamChunk[] = [
        { type: 'image', content: 'https://example.com/img1.png' },
        { type: 'image', content: 'https://example.com/img1.png' }, // 重复
        { type: 'image', content: 'https://example.com/img2.png' }
      ]

      aggregator.processChunks(chunks)

      const images = aggregator.getImages()
      expect(images).toHaveLength(2)
      expect(images).toContain('https://example.com/img1.png')
      expect(images).toContain('https://example.com/img2.png')
    })

    it('应支持 Data URI 格式', () => {
      const chunks: StreamChunk[] = [
        { type: 'image', content: 'data:image/png;base64,iVBORw0KGgo=' }
      ]

      aggregator.processChunks(chunks)

      const images = aggregator.getImages()
      expect(images[0]).toMatch(/^data:image/)
    })
  })

  describe('Usage 数据聚合', () => {
    it('应正确合并 Usage 数据', () => {
      const chunks: StreamChunk[] = [
        {
          type: 'usage',
          usage: { prompt_tokens: 10 }
        },
        {
          type: 'usage',
          usage: { completion_tokens: 20 }
        }
      ]

      aggregator.processChunks(chunks)

      const usage = aggregator.getUsage()
      expect(usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20
      })
    })

    it('应提取 requestId', () => {
      const chunks: StreamChunk[] = [
        {
          type: 'usage',
          usage: { total_tokens: 30 },
          requestId: 'gen-abc-123'
        }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()
      expect(result.metadata.generationId).toBe('gen-abc-123')
    })
  })

  describe('竞态处理：推理与文本交替', () => {
    it('应正确区分推理文本和正文文本', () => {
      const chunks: StreamChunk[] = [
        { type: 'reasoning_stream_text', text: 'Thinking...' },
        { type: 'text', content: 'Answer part 1' },
        { type: 'reasoning_stream_text', text: ' more thoughts' },
        { type: 'text', content: ' Answer part 2' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getFullContent()).toBe('Answer part 1 Answer part 2')
      expect(aggregator.getReasoningText()).toBe('Thinking... more thoughts')
    })

    it('应独立累积图片和文本', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Check this image:' },
        { type: 'image', content: 'https://example.com/img.png' },
        { type: 'text', content: ' Amazing!' }
      ]

      aggregator.processChunks(chunks)

      expect(aggregator.getFullContent()).toBe('Check this image: Amazing!')
      expect(aggregator.getImages()).toEqual(['https://example.com/img.png'])
    })
  })

  describe('MessageMetadata 输出验证', () => {
    it('应输出符合 MessageMetadata 规范的对象', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Hello' },
        { type: 'reasoning_stream_text', text: 'Thinking' },
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-1',
            type: 'analysis',
            text: 'Step 1',
            summary: 'Analyze',
            data: {},
            format: 'text'
          }
        },
        {
          type: 'usage',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          requestId: 'gen-xyz'
        }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()

      // 验证结构
      expect(result.metadata).toHaveProperty('provider', 'OpenRouter')
      expect(result.metadata).toHaveProperty('model', 'anthropic/claude-3-opus')
      expect(result.metadata).toHaveProperty('usage')
      expect(result.metadata).toHaveProperty('generationId', 'gen-xyz')
      expect(result.metadata).toHaveProperty('reasoning')

      // 验证 reasoning 结构
      expect(result.metadata.reasoning).toHaveProperty('summary')
      expect(result.metadata.reasoning).toHaveProperty('details')
      expect(result.metadata.reasoning?.details).toHaveLength(1)
      expect(result.metadata.reasoning?.details?.[0]).toEqual({
        type: 'analysis',
        content: 'Step 1'
      })
    })

    it('应在无推理数据时省略 reasoning 字段', () => {
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Plain answer' }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()

      expect(result.metadata.reasoning).toBeUndefined()
    })

    it('应生成自动摘要（当模型未提供时）', () => {
      const chunks: StreamChunk[] = [
        { type: 'reasoning_stream_text', text: 'Long reasoning text that exceeds 200 characters... '.repeat(10) }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()

      expect(result.metadata.reasoning?.summary).toBeDefined()
      expect(result.metadata.reasoning?.summary.length).toBeLessThanOrEqual(203) // 200 + '...'
    })
  })

  describe('推理可见性配置', () => {
    it('应遵循 reasoningConfig 的 showReasoningContent 设置', () => {
      const aggregatorHidden = new OpenRouterStreamAggregator({
        ...baseConfig,
        reasoningConfig: {
          controlMode: 'effort',
          effort: 'medium',
          showReasoningContent: false
        }
      })

      aggregatorHidden.processChunk({ type: 'reasoning_stream_text', text: 'Hidden thoughts' })

      const result = aggregatorHidden.getResult()
      expect(result.metadata.reasoning).toBeUndefined()
    })

    it('应自动提升可见性（收到推理但配置为 off）', () => {
      const aggregatorAuto = new OpenRouterStreamAggregator({
        ...baseConfig
        // 无 reasoningConfig，默认应自动提升
      })

      aggregatorAuto.processChunk({ type: 'reasoning_stream_text', text: 'Auto-visible' })

      const result = aggregatorAuto.getResult()
      expect(result.metadata.reasoning).toBeDefined()
    })
  })

  describe('错误处理', () => {
    it('应抛出异常（当收到 error chunk）', () => {
      const errorChunk: StreamChunk = {
        type: 'error',
        error: {
          message: 'Rate limit exceeded',
          code: '429'
        }
      }

      expect(() => {
        aggregator.processChunk(errorChunk)
      }).toThrow('OpenRouter stream error: Rate limit exceeded')
    })
  })

  describe('状态重置', () => {
    it('应清空所有缓冲区', () => {
      aggregator.processChunks([
        { type: 'text', content: 'Content' },
        { type: 'reasoning_stream_text', text: 'Reasoning' },
        { type: 'image', content: 'https://example.com/img.png' }
      ])

      aggregator.reset()

      expect(aggregator.getFullContent()).toBe('')
      expect(aggregator.getReasoningText()).toBe('')
      expect(aggregator.getImages()).toHaveLength(0)
      expect(aggregator.getReasoningDetailCount()).toBe(0)
      expect(aggregator.getUsage()).toBeNull()
    })
  })

  describe('工厂函数', () => {
    it('应通过工厂函数创建实例', () => {
      const factoryAggregator = createOpenRouterAggregator({
        modelId: 'openai/gpt-4',
        provider: 'OpenRouter'
      })

      expect(factoryAggregator).toBeInstanceOf(OpenRouterStreamAggregator)

      factoryAggregator.processChunk({ type: 'text', content: 'Test' })
      expect(factoryAggregator.getFullContent()).toBe('Test')
    })
  })

  describe('快照测试：完整流程', () => {
    it('应生成完整的聚合结果快照', () => {
      const chunks: StreamChunk[] = [
        { type: 'reasoning_stream_text', text: 'First, let me analyze the problem.' },
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-1',
            type: 'analysis',
            text: 'Problem decomposition',
            summary: 'Breaking down the problem',
            data: {},
            format: 'text'
          }
        },
        { type: 'text', content: 'Based on my analysis, ' },
        { type: 'image', content: 'https://example.com/diagram.png' },
        { type: 'reasoning_stream_text', text: ' Now synthesizing...' },
        {
          type: 'reasoning_detail',
          detail: {
            id: 'step-2',
            type: 'synthesis',
            text: 'Combining insights',
            summary: 'Integration phase',
            data: {},
            format: 'text'
          }
        },
        { type: 'text', content: 'the answer is 42.' },
        {
          type: 'usage',
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            reasoning_tokens: 80
          },
          requestId: 'gen-complete-flow'
        }
      ]

      aggregator.processChunks(chunks)

      const result = aggregator.getResult()

      expect(result).toMatchSnapshot('complete-aggregation-flow')
    })
  })
})
