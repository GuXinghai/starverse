/**
 * 模型数据类型处理测试
 * 
 * 测试场景：
 * 1. Gemini 返回字符串数组
 * 2. OpenRouter 返回对象数组
 * 3. 混合格式
 * 4. 非法数据
 */

import { describe, it, expect } from 'vitest'

// 模拟的测试数据
const geminiMockData = [
  'models/gemini-2.0-flash-exp',
  'models/gemini-1.5-pro',
  'models/gemini-1.5-flash'
]

const openRouterMockData = [
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'OpenAI GPT-4 Turbo',
    context_length: 128000,
    pricing: {
      prompt: 0.01,
      completion: 0.03
    },
    architecture: {},
    input_modalities: ['text'],
    output_modalities: ['text']
  },
  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    context_length: 200000,
    pricing: {
      prompt: 0.015,
      completion: 0.075
    }
  }
]

describe('模型数据规范化处理', () => {
  it('应该正确处理 Gemini 字符串数组', () => {
    const models = geminiMockData.map((item: any) => {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        const baseModel = {
          id: String(item.id),
          name: item.name || String(item.id),
          description: item.description,
          context_length: item.context_length,
          max_output_tokens: item.max_output_tokens,
          pricing: item.pricing,
          supportsVision: item.input_modalities?.includes('image'),
          supportsImageOutput: item.output_modalities?.includes('image'),
          supportsReasoning: item.architecture?.reasoning === true
        }
        return { ...item, ...baseModel }
      }
      return {
        id: String(item),
        name: String(item),
        description: undefined,
        context_length: undefined,
        max_output_tokens: undefined,
        pricing: undefined,
        supportsVision: undefined,
        supportsImageOutput: undefined,
        supportsReasoning: undefined
      }
    })

    expect(models).toHaveLength(3)
    expect(models[0].id).toBe('models/gemini-2.0-flash-exp')
    expect(models[0].name).toBe('models/gemini-2.0-flash-exp')
    expect(typeof models[0].id).toBe('string')
  })

  it('应该正确处理 OpenRouter 对象数组', () => {
    const models = openRouterMockData.map((item: any) => {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        const baseModel = {
          id: String(item.id),
          name: item.name || String(item.id),
          description: item.description,
          context_length: item.context_length,
          max_output_tokens: item.max_output_tokens,
          pricing: item.pricing,
          supportsVision: item.input_modalities?.includes('image'),
          supportsImageOutput: item.output_modalities?.includes('image'),
          supportsReasoning: item.architecture?.reasoning === true
        }
        return { ...item, ...baseModel }
      }
      return {
        id: String(item),
        name: String(item),
        description: undefined,
        context_length: undefined,
        max_output_tokens: undefined,
        pricing: undefined,
        supportsVision: undefined,
        supportsImageOutput: undefined,
        supportsReasoning: undefined
      }
    })

    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('openai/gpt-4-turbo')
    expect(models[0].name).toBe('GPT-4 Turbo')
    expect(models[0].context_length).toBe(128000)
    expect(typeof models[0].id).toBe('string')
  })

  it('应该正确处理混合格式数组', () => {
    const mixedData: any[] = [
      'models/gemini-1.5-pro',
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        context_length: 8192
        // 注意：没有 description 字段，测试可选字段处理
      }
    ]

    const models = mixedData.map((item: any) => {
      if (typeof item === 'object' && item !== null && 'id' in item) {
        const baseModel = {
          id: String(item.id),
          name: item.name || String(item.id),
          description: item.description,
          context_length: item.context_length,
          max_output_tokens: item.max_output_tokens,
          pricing: item.pricing,
          supportsVision: item.input_modalities?.includes('image'),
          supportsImageOutput: item.output_modalities?.includes('image'),
          supportsReasoning: item.architecture?.reasoning === true
        }
        return { ...item, ...baseModel }
      }
      return {
        id: String(item),
        name: String(item),
        description: undefined,
        context_length: undefined,
        max_output_tokens: undefined,
        pricing: undefined,
        supportsVision: undefined,
        supportsImageOutput: undefined,
        supportsReasoning: undefined
      }
    })

    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('models/gemini-1.5-pro')
    expect(models[1].id).toBe('openai/gpt-4')
    expect(models[1].context_length).toBe(8192)
    expect(typeof models[0].id).toBe('string')
    expect(typeof models[1].id).toBe('string')
  })

  it('应该处理非法数据（null, undefined, number）', () => {
    const badData: any[] = [
      null,
      undefined,
      'valid-model-id',
      { id: 123 }, // 数字 ID
      { name: 'No ID' } // 缺少 ID
    ]

    const models = badData
      .filter(item => item != null) // 过滤 null 和 undefined
      .map((item: any) => {
        if (typeof item === 'object' && item !== null && 'id' in item) {
          const baseModel = {
            id: String(item.id),
            name: item.name || String(item.id),
            description: item.description,
            context_length: item.context_length,
            max_output_tokens: item.max_output_tokens,
            pricing: item.pricing,
            supportsVision: item.input_modalities?.includes('image'),
            supportsImageOutput: item.output_modalities?.includes('image'),
            supportsReasoning: item.architecture?.reasoning === true
          }
          return { ...item, ...baseModel }
        }
        return {
          id: String(item),
          name: String(item),
          description: undefined,
          context_length: undefined,
          max_output_tokens: undefined,
          pricing: undefined,
          supportsVision: undefined,
          supportsImageOutput: undefined,
          supportsReasoning: undefined
        }
      })

    expect(models).toHaveLength(3)
    expect(models[0].id).toBe('valid-model-id')
    expect(models[1].id).toBe('123') // 数字转换为字符串
    expect(typeof models[1].id).toBe('string')
  })
})

describe('extractProvider 函数测试', () => {
  function extractProvider(modelId: string): string {
    if (typeof modelId !== 'string') {
      console.error('extractProvider: modelId 不是字符串类型:', typeof modelId, modelId)
      return 'unknown'
    }
    const parts = modelId.split('/')
    return parts[0] || 'unknown'
  }

  it('应该正确提取 OpenRouter 提供商', () => {
    expect(extractProvider('openai/gpt-4')).toBe('openai')
    expect(extractProvider('anthropic/claude-3-opus')).toBe('anthropic')
    expect(extractProvider('google/gemini-pro')).toBe('google')
  })

  it('应该正确提取 Gemini 提供商', () => {
    expect(extractProvider('models/gemini-2.0-flash')).toBe('models')
  })

  it('应该处理没有斜杠的模型 ID', () => {
    expect(extractProvider('gpt-4')).toBe('gpt-4')
  })

  it('应该处理空字符串', () => {
    expect(extractProvider('')).toBe('unknown')
  })

  it('应该处理非字符串类型', () => {
    expect(extractProvider(123 as any)).toBe('unknown')
    expect(extractProvider(null as any)).toBe('unknown')
    expect(extractProvider(undefined as any)).toBe('unknown')
    expect(extractProvider({} as any)).toBe('unknown')
  })
})
