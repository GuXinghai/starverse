import { describe, it, expect, beforeAll } from 'vitest'

/** @deprecated 测试用 - ModelData 类型已删除，使用此本地定义 */
interface LegacyModelData {
  id: string
  name: string
  input_modalities?: string[]
  output_modalities?: string[]
  provider?: string
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
}

// 使用动态导入避免模块解析问题
let OpenRouterService: any
let GeminiService: any

beforeAll(async () => {
  const openRouterModule = await import('../../../../src/services/providers/OpenRouterService')
  const geminiModule = await import('../../../../src/services/providers/GeminiService')
  OpenRouterService = openRouterModule.default
  GeminiService = geminiModule.default || geminiModule.GeminiService
})

describe('Provider Capabilities - supportsImage', () => {
  describe('OpenRouterService', () => {
    it('应该检测到支持 image 模态的模型', () => {
      const model: LegacyModelData = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        provider: 'openrouter'
      }

      expect(OpenRouterService.supportsImage(model)).toBe(true)
    })

    it('应该检测到支持 vision 模态的模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        input_modalities: ['text', 'vision'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model)).toBe(true)
    })

    it('应该检测到支持 multimodal 模态的模型', () => {
      const model: LegacyModelData = {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        input_modalities: ['multimodal'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model)).toBe(true)
    })

    it('应该拒绝仅支持 text 的模型', () => {
      const model: LegacyModelData = {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        input_modalities: ['text'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model)).toBe(false)
    })

    it('应该处理缺少 input_modalities 的模型', () => {
      const model: LegacyModelData = {
        id: 'unknown-model',
        name: 'Unknown Model',
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model)).toBe(false)
    })

    it('应该处理空 input_modalities 数组', () => {
      const model: LegacyModelData = {
        id: 'empty-model',
        name: 'Empty Model',
        input_modalities: [],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model)).toBe(false)
    })

    it('应该区分大小写 (image/IMAGE/Image)', () => {
      const model1: LegacyModelData = {
        id: 'test-1',
        name: 'Test 1',
        input_modalities: ['IMAGE'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      const model2: LegacyModelData = {
        id: 'test-2',
        name: 'Test 2',
        input_modalities: ['Image'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsImage(model1)).toBe(true)
      expect(OpenRouterService.supportsImage(model2)).toBe(true)
    })
  })

  describe('GeminiService', () => {
    it('应该检测到支持 image 模态的 Gemini 模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash',
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        provider: 'google'
      } 

      expect(GeminiService.supportsImage(model)).toBe(true)
    })

    it('应该拒绝仅支持 text 的 Gemini 模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        input_modalities: ['text'],
        output_modalities: ['text'],
        provider: 'google'
      } 

      expect(GeminiService.supportsImage(model)).toBe(false)
    })

    it('应该处理缺少 input_modalities 的 Gemini 模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-unknown',
        name: 'Gemini Unknown',
        output_modalities: ['text'],
        provider: 'google'
      } 

      expect(GeminiService.supportsImage(model)).toBe(false)
    })
  })
})

describe('Provider Capabilities - supportsFileInput', () => {
  describe('OpenRouterService', () => {
    it('应该检测到支持 file 模态的模型', () => {
      const model: LegacyModelData = {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        input_modalities: ['text', 'file'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsFileInput(model)).toBe(true)
    })

    it('应该检测到支持 document 模态的模型', () => {
      const model: LegacyModelData = {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        input_modalities: ['text', 'document'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsFileInput(model)).toBe(true)
    })

    it('应该拒绝仅支持 text 和 image 的模型', () => {
      const model: LegacyModelData = {
        id: 'gpt-4o',
        name: 'GPT-4o',
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsFileInput(model)).toBe(false)
    })

    it('应该处理缺少 input_modalities 的模型', () => {
      const model: LegacyModelData = {
        id: 'unknown-model',
        name: 'Unknown Model',
        output_modalities: ['text'],
        provider: 'openrouter'
      } 

      expect(OpenRouterService.supportsFileInput(model)).toBe(false)
    })
  })

  describe('GeminiService', () => {
    it('应该检测到支持 file 模态的 Gemini 模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        input_modalities: ['text', 'image', 'file'],
        output_modalities: ['text'],
        provider: 'google'
      } 

      expect(GeminiService.supportsFileInput(model)).toBe(true)
    })

    it('应该拒绝不支持 file 模态的 Gemini 模型', () => {
      const model: LegacyModelData = {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
        provider: 'google'
      } 

      expect(GeminiService.supportsFileInput(model)).toBe(false)
    })
  })
})

describe('Provider Capabilities - 边界情况', () => {
  it('应该处理 input_modalities 为 null', () => {
    const model: LegacyModelData = {
      id: 'null-model',
      name: 'Null Model',
      input_modalities: null as any,
      output_modalities: ['text'],
      provider: 'openrouter'
    } 

    expect(OpenRouterService.supportsImage(model)).toBe(false)
    expect(OpenRouterService.supportsFileInput(model)).toBe(false)
  })

  it('应该处理 input_modalities 为非数组', () => {
    const model: LegacyModelData = {
      id: 'invalid-model',
      name: 'Invalid Model',
      input_modalities: 'text,image' as any,
      output_modalities: ['text'],
      provider: 'openrouter'
    } 

    expect(OpenRouterService.supportsImage(model)).toBe(false)
    expect(OpenRouterService.supportsFileInput(model)).toBe(false)
  })

  it('应该处理复合模态 (image + file)', () => {
    const model: LegacyModelData = {
      id: 'hybrid-model',
      name: 'Hybrid Model',
      input_modalities: ['text', 'image', 'file', 'audio'],
      output_modalities: ['text'],
      provider: 'openrouter'
    } 

    expect(OpenRouterService.supportsImage(model)).toBe(true)
    expect(OpenRouterService.supportsFileInput(model)).toBe(true)
  })
})
