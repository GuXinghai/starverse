/**
 * OpenRouter SSE Parser 单元测试
 * 
 * 测试范围：
 * - 正常流式响应（有 delta.content）
 * - 非流式响应（只有 message.content，无 delta）
 * - 空 delta 但有 message.content 的边缘情况
 * - reasoning_details 处理
 * - 图片数据处理
 * - usage 统计处理
 */

import { describe, it, expect } from 'vitest'
import { parseOpenRouterChunk, parseSSELine } from '../../../../../src/services/providers/openrouter/sseParser'
import type { StreamChunk } from '../../../../../src/types/providers'

describe('parseSSELine', () => {
  it('should parse standard SSE data line and return SSEParseResult', () => {
    const line = 'data: {"id":"test-123","choices":[{"delta":{"content":"Hello"}}]}'
    const result = parseSSELine(line)
    
    expect(result).toBeTruthy()
    expect(result).toHaveProperty('chunk')
    expect(result).toHaveProperty('isDone', false)
    expect(result.chunk).toHaveProperty('type', 'text')
    expect(result.chunk).toHaveProperty('content', 'Hello')
  })

  it('should expose multiple chunks when one data line contains usage + content', () => {
    const line = 'data: {"id":"req-1","usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3},"choices":[{"delta":{"content":"Hi"}}]}'
    const result = parseSSELine(line)

    // 旧行为：只返回第一个 chunk（通常是 usage），会丢失正文
    // 新行为：当存在多个 chunk 时，用 result.chunks 暴露全部
    expect(result.isDone).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.chunks).toBeTruthy()
    expect(result.chunks?.map(c => c.type)).toEqual(['usage', 'text'])
  })

  it('should return isDone: true for [DONE] signal', () => {
    const line = 'data: [DONE]'
    const result = parseSSELine(line)
    
    expect(result).toEqual({
      chunk: null,
      isDone: true
    })
  })

  it('should return SSEParseResult with null chunk for empty lines', () => {
    const result1 = parseSSELine('')
    const result2 = parseSSELine('   ')
    
    expect(result1).toEqual({ chunk: null, isDone: false })
    expect(result2).toEqual({ chunk: null, isDone: false })
  })

  it('should return SSEParseResult with null chunk for comment lines', () => {
    const result = parseSSELine(': this is a comment')
    expect(result).toEqual({ chunk: null, isDone: false })
  })
})

describe('parseOpenRouterChunk - 流式响应（有 delta）', () => {
  it('should parse text content from delta', () => {
    const chunk = {
      id: 'test-1',
      choices: [{
        delta: {
          content: 'Hello World'
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'text',
      content: 'Hello World'
    })
  })

  it('should parse structured content array from delta', () => {
    const chunk = {
      choices: [{
        delta: {
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' }
          ]
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('text')
    expect(results[0].content).toBe('First part')
    expect(results[1].type).toBe('text')
    expect(results[1].content).toBe('Second part')
  })

  it('should parse reasoning_details from delta', () => {
    const chunk = {
      choices: [{
        delta: {
          reasoning_details: [
            {
              id: 'r1',
              type: 'reasoning.text',
              text: 'Thinking...',
              summary: 'Analysis'
            }
          ]
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'reasoning_detail',
      detail: {
        id: 'r1',
        type: 'reasoning.text',
        text: 'Thinking...',
        summary: 'Analysis',
        data: '',
        format: '',
        index: undefined
      }
    })
  })

  it('should parse reasoning stream text from delta', () => {
    const chunk = {
      choices: [{
        delta: {
          reasoning: 'Analyzing the problem...'
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'reasoning_stream_text',
      text: 'Analyzing the problem...'
    })
  })

  it('should parse usage statistics even without choices', () => {
    // 关键场景：chunk 只有 usage，没有 choices
    const chunk = {
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      },
      id: 'req-123'
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'usage',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      },
      requestId: 'req-123'
    })
  })

  it('should parse usage from choices when available', () => {
    const chunk = {
      choices: [{
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15
        },
        delta: {
          content: 'Final message'
        }
      }],
      id: 'req-456'
    }

    const results = parseOpenRouterChunk(chunk)
    
    const usageChunk = results.find((r: StreamChunk) => r.type === 'usage')
    expect(usageChunk).toBeTruthy()
    expect(usageChunk?.usage).toEqual({
      prompt_tokens: 5,
      completion_tokens: 10,
      total_tokens: 15
    })
  })
})

describe('parseOpenRouterChunk - 非流式响应（无 delta，只有 message）', () => {
  it('🔧 CRITICAL: should parse message.content when delta is missing', () => {
    // 这是修复超时问题的关键场景
    const chunk = {
      id: 'test-2',
      choices: [{
        message: {
          content: 'Complete response without delta'
        }
        // 注意：没有 delta 字段
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    // 🎯 关键断言：即使没有 delta，也应该 yield message.content
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      type: 'text',
      content: 'Complete response without delta'
    })
  })

  it('🔧 CRITICAL: should parse message.content array format', () => {
    const chunk = {
      choices: [{
        message: {
          content: [
            { type: 'text', text: 'Message part 1' },
            { type: 'text', text: 'Message part 2' }
          ]
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(2)
    expect(results[0].content).toBe('Message part 1')
    expect(results[1].content).toBe('Message part 2')
  })

  it('🔧 CRITICAL: should handle chunk with empty delta but valid message', () => {
    // 边缘情况：delta 存在但为空对象
    const chunk = {
      choices: [{
        delta: {},  // 空对象
        message: {
          content: 'Fallback to message content'
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    // 应该回退到 message.content
    expect(results.length).toBeGreaterThan(0)
    const textChunks = results.filter((r: StreamChunk) => r.type === 'text')
    expect(textChunks).toHaveLength(1)
    expect(textChunks[0].content).toBe('Fallback to message content')
  })
})

describe('parseOpenRouterChunk - 图片数据处理', () => {
  it('should parse image from delta.images array', () => {
    const chunk = {
      choices: [{
        delta: {
          images: [
            { url: 'https://example.com/image1.png' },
            { url: 'https://example.com/image2.png' }
          ]
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    const imageChunks = results.filter((r: StreamChunk) => r.type === 'image')
    expect(imageChunks).toHaveLength(2)
    expect(imageChunks[0].content).toContain('image1.png')
  })

  it('should parse single image from delta.image', () => {
    const chunk = {
      choices: [{
        delta: {
          image: { url: 'https://example.com/single.png' }
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    const imageChunks = results.filter((r: StreamChunk) => r.type === 'image')
    expect(imageChunks).toHaveLength(1)
    expect(imageChunks[0].content).toContain('single.png')
  })
})

describe('parseOpenRouterChunk - 错误处理', () => {
  it('should parse error chunk', () => {
    const chunk = {
      error: {
        message: 'Rate limit exceeded',
        code: '429'  // 字符串类型
      }
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('error')
    expect(results[0].error).toHaveProperty('message', 'Rate limit exceeded')
  })

  it('should return empty array for invalid chunk', () => {
    const results = parseOpenRouterChunk({})
    expect(results).toEqual([])
  })

  it('should return empty array for null input', () => {
    const results = parseOpenRouterChunk(null as any)
    expect(results).toEqual([])
  })

  it('should return empty array for undefined input', () => {
    const results = parseOpenRouterChunk(undefined as any)
    expect(results).toEqual([])
  })
})

describe('parseOpenRouterChunk - 综合场景', () => {
  it('should parse chunk with both usage and content', () => {
    const chunk = {
      choices: [{
        delta: {
          content: 'Final message'
        }
      }],
      usage: {
        total_tokens: 100
      }
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results.some((r: StreamChunk) => r.type === 'text')).toBe(true)
    expect(results.some((r: StreamChunk) => r.type === 'usage')).toBe(true)
  })

  it('should parse chunk with reasoning and content', () => {
    const chunk = {
      choices: [{
        delta: {
          reasoning: 'Thinking step...',
          content: 'Answer text'
        }
      }]
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(2)
    expect(results.find((r: StreamChunk) => r.type === 'reasoning_stream_text')).toBeTruthy()
    expect(results.find((r: StreamChunk) => r.type === 'text')).toBeTruthy()
  })

  it('should handle chunk with only usage (no choices)', () => {
    // 流式结束时可能只返回 usage
    const chunk = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300
      }
    }

    const results = parseOpenRouterChunk(chunk)
    
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('usage')
    expect(results[0].usage.total_tokens).toBe(300)
  })
})
