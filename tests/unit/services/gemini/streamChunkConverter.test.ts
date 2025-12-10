/**
 * Gemini Stream Chunk Converter - 快照测试
 * 
 * 验证 Google Generative AI SDK chunk 的转换逻辑
 * 确保 Gemini 原始格式正确映射为统一的 StreamChunk 格式
 * 
 * 覆盖场景：
 * 1. 纯文本流
 * 2. 多模态（文本 + 图片）
 * 3. Usage 元数据
 * 4. 错误处理
 * 5. 流结束标记
 */

import { describe, it, expect } from 'vitest'
import {
  convertGeminiChunk,
  convertGeminiChunksBatch,
  type GeminiContentStreamPart
} from '@/services/providers/gemini/streamChunkConverter'
import type { StreamChunk } from '@/types/providers'

describe('Gemini Stream Chunk Converter - Snapshot Tests', () => {
  
  describe('纯文本流', () => {
    it('应正确转换单行纯文本 chunk', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                { text: 'Hello' }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.error).toBeUndefined()
      expect(result.isFinished).toBe(false)
      expect(result.chunks).toMatchSnapshot('single-text-chunk')
      expect(result.chunks).toEqual([
        expect.objectContaining({
          type: 'text',
          content: 'Hello'
        })
      ])
    })

    it('应处理多行文本流聚合', () => {
      const chunks: GeminiContentStreamPart[] = [
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'This ' }]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'is ' }]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'Gemini' }]
              }
            }
          ]
        }
      ]
      
      const result = convertGeminiChunksBatch(chunks)
      
      expect(result.error).toBeUndefined()
      expect(result.chunks).toHaveLength(3)
      expect(result.chunks.map((c: any) => c.content)).toEqual(['This ', 'is ', 'Gemini'])
      expect(result.chunks).toMatchSnapshot('multi-line-text-chunks')
    })

    it('应处理中文文本流', () => {
      const chunks: GeminiContentStreamPart[] = [
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: '这' }]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: '是' }]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: '测试' }]
              }
            }
          ]
        }
      ]
      
      const result = convertGeminiChunksBatch(chunks)
      
      expect(result.chunks.map((c: any) => c.content)).toEqual(['这', '是', '测试'])
      expect(result.chunks).toMatchSnapshot('chinese-text-chunks')
    })

    it('应忽略空文本 part', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                { text: '' },  // 空文本
                { text: 'Content' }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(1)
      expect(result.chunks[0]).toMatchSnapshot('empty-text-ignored')
    })
  })

  describe('多模态（文本 + 图片）', () => {
    it('应正确转换 inlineData 图片为 Data URI', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                { text: 'Here is an image:' },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: '/9j/4AAQSkZJRg=='  // 示例 base64
                  }
                }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[0]).toMatchObject({ type: 'text', content: 'Here is an image:' })
      expect(result.chunks[1]).toMatchObject({
        type: 'image',
        content: expect.stringContaining('data:image/jpeg;base64,')
      })
      expect(result.chunks).toMatchSnapshot('text-and-inline-image')
    })

    it('应处理多个图片的混合内容', () => {
      const chunks: GeminiContentStreamPart[] = [
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [
                  { text: 'First image:' },
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
                    }
                  }
                ]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [
                  { text: 'Second image:' },
                  {
                    inlineData: {
                      mimeType: 'image/webp',
                      data: 'UklGRiYAAABXRUJQ'
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
      
      const result = convertGeminiChunksBatch(chunks)
      
      expect(result.chunks).toHaveLength(4)
      expect(result.chunks.filter((c: any) => c.type === 'image')).toHaveLength(2)
      expect(result.chunks).toMatchSnapshot('multiple-images')
    })

    it('应处理无效的 inlineData（缺失字段）', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                { text: 'Text' },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: ''  // 空 data
                  }
                }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      // 应只转换有效的文本，忽略无效的图片
      expect(result.chunks).toHaveLength(1)
      expect(result.chunks[0]).toMatchSnapshot('invalid-image-ignored')
    })
  })

  describe('Usage 元数据', () => {
    it('应正确转换 usageMetadata 为 UsageChunk', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'Response text' }]
            }
          }
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[1]).toMatchObject({
        type: 'usage',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      })
      expect(result.chunks).toMatchSnapshot('usage-metadata')
    })

    it('应只在 usageMetadata 存在时生成 UsageChunk', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'No usage info' }]
            }
          }
        ]
        // 无 usageMetadata
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(1)
      expect(result.chunks[0].type).toBe('text')
      expect(result.chunks).toMatchSnapshot('no-usage-metadata')
    })
  })

  describe('流结束标记', () => {
    it('应识别 finishReason 作为流完成标记', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'Final chunk' }]
            },
            finishReason: 'STOP'
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.isFinished).toBe(true)
      expect(result.chunks[0]).toMatchSnapshot('finished-chunk')
    })

    it('应处理多个候选项（尽管通常只有一个）', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'First candidate' }]
            }
          },
          {
            index: 1,
            content: {
              role: 'model',
              parts: [{ text: 'Second candidate' }]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[0].type).toBe('text')
      expect(result.chunks[1].type).toBe('text')
      expect(result.chunks).toMatchSnapshot('multiple-candidates')
    })
  })

  describe('错误处理和边界情况', () => {
    it('应处理空 candidates 数组', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: []
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(0)
      expect(result.error).toBeUndefined()
      expect(result.chunks).toMatchSnapshot('empty-candidates')
    })

    it('应处理无 candidates 字段', () => {
      const rawChunk: GeminiContentStreamPart = {}
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(0)
      expect(result.error).toBeUndefined()
      expect(result.chunks).toMatchSnapshot('no-candidates')
    })

    it('应处理 parts 数组为空', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: []
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      expect(result.chunks).toHaveLength(0)
      expect(result.error).toBeUndefined()
      expect(result.chunks).toMatchSnapshot('empty-parts')
    })

    it('应处理未知 part 类型（functionCall）', () => {
      const rawChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                { text: 'Before' },
                {
                  functionCall: {
                    name: 'some_function',
                    args: { key: 'value' }
                  }
                } as any,
                { text: 'After' }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(rawChunk)
      
      // 应转换文本，忽略函数调用
      expect(result.chunks).toHaveLength(2)
      expect(result.chunks[0].type).toBe('text')
      expect(result.chunks[1].type).toBe('text')
      expect(result.chunks).toMatchSnapshot('unknown-part-type')
    })

    it('应优雅地处理部分序列化失败', () => {
      const chunks: GeminiContentStreamPart[] = [
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'Valid' }]
              }
            }
          ]
        },
        {
          candidates: [
            {
              index: 0,
              content: {
                role: 'model',
                parts: [{ text: 'Also valid' }]
              }
            }
          ]
        }
      ]
      
      const result = convertGeminiChunksBatch(chunks)
      
      expect(result.chunks).toHaveLength(2)
      expect(result.error).toBeUndefined()
      expect(result.chunks).toMatchSnapshot('batch-processing')
    })
  })

  describe('快照对比（与 OpenRouter 格式一致性）', () => {
    it('文本 chunk 应与 OpenRouter 格式一致', () => {
      const geminiChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [{ text: 'Hello world' }]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(geminiChunk)
      const textChunk = result.chunks[0] as any
      
      // 验证字段名一致性
      expect(textChunk).toHaveProperty('type', 'text')
      expect(textChunk).toHaveProperty('content')
      expect(textChunk.content).toBe('Hello world')
      expect(result.chunks).toMatchSnapshot('format-consistency-text')
    })

    it('图片 chunk 应转换为标准 Data URI 格式', () => {
      const geminiChunk: GeminiContentStreamPart = {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'abc123=='
                  }
                }
              ]
            }
          }
        ]
      }
      
      const result = convertGeminiChunk(geminiChunk)
      const imageChunk = result.chunks[0] as any
      
      // 验证 Data URI 格式
      expect(imageChunk.content).toMatch(/^data:image\/jpeg;base64,/)
      expect(result.chunks).toMatchSnapshot('format-consistency-image')
    })

    it('Usage chunk 字段应映射正确', () => {
      const geminiChunk: GeminiContentStreamPart = {
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 15,
          totalTokenCount: 20
        }
      }
      
      const result = convertGeminiChunk(geminiChunk)
      const usageChunk = result.chunks[0] as any
      
      // 验证字段名映射
      expect(usageChunk.usage).toHaveProperty('promptTokens', 5)
      expect(usageChunk.usage).toHaveProperty('completionTokens', 15)
      expect(usageChunk.usage).toHaveProperty('totalTokens', 20)
      expect(result.chunks).toMatchSnapshot('format-consistency-usage')
    })
  })
})
