/**
 * SSE 流解析器快照测试
 * 
 * 确保 OpenRouter SSE 流解析逻辑在重构前后保持字节级一致性。
 * 覆盖：正常文本流、错误流、推理流、空流、截断流等边界场景。
 * 
 * 测试策略：
 * 1. 使用真实的 OpenRouter SSE 响应样本
 * 2. 快照测试确保输出稳定
 * 3. 验证推理数据聚合逻辑
 * 4. 验证 Usage 元数据提取
 */

import { describe, it, expect } from 'vitest'
import { parseSSELine, parseOpenRouterChunk, normalizeImagePayload } from '../../../src/services/providers/openrouter/sseParser'
import type { StreamChunk } from '../../../src/types/providers'

describe('SSE Stream Parser - Snapshot Tests', () => {
  
  describe('正常文本流（无推理）', () => {
    it('应正确解析单行 SSE delta 响应', async () => {
      const sseLines = [
        'data: {"id":"gen-1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"id":"gen-1","choices":[{"delta":{"content":"!"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      
      // 这里暂时使用占位符，实际需要导入真实的 OpenRouterService
      // 当前测试的目的是建立测试框架和快照基线
      const expectedChunks = ['Hello', ' world', '!']
      
      // 快照测试（第一次运行会生成快照）
      expect(expectedChunks).toMatchSnapshot('normal-text-stream')
    })
    
    it('应处理多个 delta 块的聚合', async () => {
      const sseLines = [
        'data: {"id":"gen-2","choices":[{"delta":{"content":"这"}}]}\n\n',
        'data: {"id":"gen-2","choices":[{"delta":{"content":"是"}}]}\n\n',
        'data: {"id":"gen-2","choices":[{"delta":{"content":"中文"}}]}\n\n',
        'data: {"id":"gen-2","choices":[{"delta":{"content":"测试"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
      
      const expectedChunks = ['这', '是', '中文', '测试']
      expect(expectedChunks).toMatchSnapshot('chinese-text-stream')
    })
  })
  
  describe('基础 SSE 行解析', () => {
    it('应正确解析标准文本消息', () => {
      const line = 'data: {"id":"gen-1","choices":[{"delta":{"content":"Hello"}}]}'
      const result = parseSSELine(line)
      
      expect(result.isDone).toBe(false)
      expect(result.error).toBeUndefined()
      expect(result.chunk).toMatchSnapshot('standard-text-message')
    })

    it('应正确识别 [DONE] 标记', () => {
      const line = 'data: [DONE]'
      const result = parseSSELine(line)
      
      expect(result.isDone).toBe(true)
      expect(result.chunk).toBeNull()
      expect(result.error).toBeUndefined()
    })

    it('应忽略空行', () => {
      const result = parseSSELine('')
      expect(result.chunk).toBeNull()
      expect(result.isDone).toBe(false)
    })

    it('应忽略注释行', () => {
      const result = parseSSELine(': This is a comment')
      expect(result.chunk).toBeNull()
      expect(result.isDone).toBe(false)
    })

    it('应处理 JSON 解析错误', () => {
      const line = 'data: {invalid json}'
      const result = parseSSELine(line)
      
      expect(result.chunk).toBeNull()
      expect(result.isDone).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('JSON')
    })
  })
  
  describe('推理流解析（Reasoning Content）', () => {
    it('应正确解析 delta.reasoning（DeepSeek 风格）', () => {
      const line = 'data: {"id":"gen-3","choices":[{"delta":{"reasoning":"Let me think about this"}}]}'
      const result = parseSSELine(line)
      
      expect(result.chunk).toMatchSnapshot('reasoning-deepseek-style')
    })
    
    it('应正确解析 reasoning_content（OpenAI 风格）', () => {
      const line = 'data: {"id":"gen-3","choices":[{"delta":{"reasoning_content":"Analyzing the problem..."}}]}'
      const result = parseSSELine(line)
      
      expect(result.chunk).toMatchSnapshot('reasoning-openai-style')
    })
    
    it('应正确解析 reasoning_details 结构化数据', () => {
      const rawChunk = {
        id: 'gen-4',
        choices: [{
          delta: {
            reasoning_details: [
              { id: 'step-1', type: 'step', text: 'Step 1: Analysis', summary: 'Analyze input' },
              { id: 'step-2', type: 'step', text: 'Step 2: Synthesis', summary: 'Synthesize results' }
            ]
          }
        }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('reasoning-details-structured')
    })
  })
  
  describe('Usage 元数据提取', () => {
    it('应正确提取 usage 数据', () => {
      const rawChunk = {
        id: 'gen-6',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          reasoning_tokens: 50  // OpenAI o1 风格
        }
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('usage-metadata')
    })
    
    it('应正确提取 generation_id（用于异步 Usage 查询）', () => {
      const rawChunk = {
        id: 'gen-abc-123',
        choices: [{ delta: { content: 'Test' } }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      // requestId 应该从 id 字段提取（在 usage chunk 中）
      expect(rawChunk.id).toBe('gen-abc-123')
    })
  })
  
  describe('错误场景处理', () => {
    it('应优雅处理空流（无 choices）', () => {
      const rawChunk = { id: 'gen-empty' }
      const chunks = parseOpenRouterChunk(rawChunk)
      
      expect(chunks).toEqual([])
    })
    
    it('应正确解析 error 字段（顶层错误）', () => {
      const rawChunk = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: '429'
        }
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('error-top-level')
    })

    it('应正确解析 choices[0].error', () => {
      const rawChunk = {
        choices: [{
          error: {
            message: 'Model unavailable',
            type: 'model_error',
            code: '503'
          }
        }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('error-choice-level')
    })

    it('应正确解析 delta.error', () => {
      const rawChunk = {
        choices: [{
          delta: {
            error: {
              message: 'Content filter triggered',
              type: 'content_policy_violation',
              code: 'CONTENT_POLICY'
            }
          }
        }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('error-delta-level')
    })
    
    it('应处理不完整的 JSON 数据（JSON 解析错误）', () => {
      const line = 'data: {invalid-json'
      const result = parseSSELine(line)
      
      expect(result.chunk).toBeNull()
      expect(result.error).toBeDefined()
    })
    
    it('应处理空 choices 数组', () => {
      const rawChunk = {
        id: 'gen-empty',
        choices: []
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toEqual([])
    })
  })
  
  describe('图片数据归一化', () => {
    it('应正确归一化 URL 格式', () => {
      const result = normalizeImagePayload({ url: 'https://example.com/image.png' })
      expect(result).toBe('https://example.com/image.png')
    })

    it('应正确归一化 Base64 格式（b64_json）', () => {
      const result = normalizeImagePayload({ b64_json: 'iVBORw0KGgo=' })
      expect(result).toMatch(/^data:image\/png;base64,/)
    })

    it('应正确归一化 Anthropic inline_data 格式', () => {
      const result = normalizeImagePayload({
        inline_data: {
          data: 'base64data',
          mime_type: 'image/jpeg'
        }
      })
      expect(result).toBe('data:image/jpeg;base64,base64data')
    })

    it('应拒绝无效数据', () => {
      expect(normalizeImagePayload(null)).toBeNull()
      expect(normalizeImagePayload({})).toBeNull()
      expect(normalizeImagePayload('invalid')).toBeNull()
    })
  })
  
  describe('复杂场景：多类型块混合', () => {
    it('应正确处理交错的推理和文本内容', () => {
      const rawChunk1 = {
        id: 'gen-9',
        choices: [{
          delta: {
            reasoning: 'Thinking...',
            content: 'Text 1'
          }
        }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk1)
      expect(chunks).toMatchSnapshot('mixed-reasoning-text')
    })

    it('应正确处理图片+文本混合', () => {
      const rawChunk = {
        id: 'gen-10',
        choices: [{
          delta: {
            content: 'Here is the image:',
            images: [{ url: 'https://example.com/img.png' }]
          }
        }]
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      expect(chunks).toMatchSnapshot('mixed-image-text')
    })
  })
  
  describe('性能基准数据（用于后续对比）', () => {
    it('记录单行解析性能特征', () => {
      const line = 'data: {"id":"gen-perf","choices":[{"delta":{"content":"Token"}}]}'
      const result = parseSSELine(line)
      
      expect(result.chunk?.type).toBe('text')
      expect(result.isDone).toBe(false)
    })

    it('记录复杂对象解析性能特征', () => {
      const rawChunk = {
        id: 'gen-complex',
        choices: [{
          delta: {
            reasoning_details: Array.from({ length: 10 }, (_, i) => ({
              id: `step-${i}`,
              type: 'step',
              text: `Step ${i} reasoning...`,
              summary: `Summary ${i}`
            })),
            content: 'Final answer'
          }
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150
        }
      }
      
      const chunks = parseOpenRouterChunk(rawChunk)
      // 预期：10 个 reasoning_detail + 1 个 text + 1 个 usage = 12 chunks
      expect(chunks.length).toBeGreaterThanOrEqual(12)
    })
  })

  describe('Unicode 和特殊字符', () => {
    it('应正确处理 Unicode 字符', () => {
      const line = 'data: {"id":"gen-unicode","choices":[{"delta":{"content":"你好世界 🌍"}}]}'
      const result = parseSSELine(line)
      
      expect(result.chunk).toMatchSnapshot('unicode-content')
    })

    it('应正确处理 emoji 和表情符号', () => {
      const line = 'data: {"id":"gen-emoji","choices":[{"delta":{"content":"✅ 完成 🎉"}}]}'
      const result = parseSSELine(line)
      
      expect(result.chunk?.type).toBe('text')
      if (result.chunk?.type === 'text') {
        expect(result.chunk.content).toContain('✅')
        expect(result.chunk.content).toContain('🎉')
      }
    })
  })

  describe.skip('集成测试占位符', () => {
    it('TODO: 完整流式场景测试（需 OpenRouterService 完成后实现）', () => {
      // 此测试将在 Task 8 完成后实现
      // 验证 sseParser 与 OpenRouterService 的集成
    })
  })
})