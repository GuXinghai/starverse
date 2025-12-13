/**
 * modelSync.spec.ts - 模型同步核心函数测试
 * 
 * 测试 /docs/openrouter-model-sync-spec.md 规范中定义的核心函数：
 * - normalizeModel: 将 OpenRouter API 响应规整为 AppModel
 * - shouldUpdate: 判断是否需要更新本地缓存
 * - mergeWithArchived: 合并远程模型与本地归档模型
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  normalizeModel, 
  shouldUpdate, 
  mergeWithArchived,
  batchNormalizeModels,
  extractVendor,
  filterActiveModels,
  filterArchivedModels
} from '@/services/modelSync'
import type { AppModel } from '@/types/appModel'

describe('modelSync', () => {
  // ============================================================================
  // normalizeModel 测试
  // ============================================================================
  describe('normalizeModel', () => {
    it('应该正确规范化完整的 OpenRouter 模型对象', () => {
      const raw = {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        description: 'OpenAI GPT-4o model',
        context_length: 128000,
        supported_parameters: ['temperature', 'top_p', 'reasoning', 'tools', 'response_format'],
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text'],
        },
        pricing: {
          prompt: '0.000005',
          completion: '0.000015',
          request: '0',
          image: '0.00765',
          web_search: '0',
          internal_reasoning: '0',
          input_cache_read: '0.0000025',
          input_cache_write: '0.00000625',
        },
      }

      const result = normalizeModel(raw)

      expect(result).not.toBeNull()
      expect(result!.id).toBe('openai/gpt-4o')
      expect(result!.name).toBe('GPT-4o')
      expect(result!.context_length).toBe(128000)
      expect(result!.vendor).toBe('openai')
      expect(result!.router_source).toBe('openrouter')
      expect(result!.is_archived).toBe(false)
      
      // 能力检测
      expect(result!.capabilities.hasReasoning).toBe(true)
      expect(result!.capabilities.hasTools).toBe(true)
      expect(result!.capabilities.hasJsonMode).toBe(true) // response_format
      expect(result!.capabilities.isMultimodal).toBe(true) // image in input_modalities
      
      // 价格
      expect(result!.pricing.promptUsdPerToken).toBe('0.000005')
      expect(result!.pricing.completionUsdPerToken).toBe('0.000015')
    })

    it('应该跳过缺少 id 的模型条目', () => {
      const raw = {
        name: 'No ID Model',
        context_length: 4096,
      }

      const result = normalizeModel(raw)

      expect(result).toBeNull()
    })

    it('应该跳过非对象模型条目', () => {
      expect(normalizeModel(null)).toBeNull()
      expect(normalizeModel(undefined)).toBeNull()
      expect(normalizeModel('string')).toBeNull()
      expect(normalizeModel(123)).toBeNull()
    })

    it('应该处理缺少 supported_parameters 的模型', () => {
      const raw = {
        id: 'vendor/model-without-params',
        name: 'Model Without Params',
      }

      const result = normalizeModel(raw)

      expect(result).not.toBeNull()
      expect(result!.capabilities.hasReasoning).toBe(false)
      expect(result!.capabilities.hasTools).toBe(false)
      expect(result!.capabilities.hasJsonMode).toBe(false)
      expect(result!.capabilities.isMultimodal).toBe(false)
    })

    it('应该正确识别多模态能力 (image/audio/video/file)', () => {
      const testCases = [
        { modalities: ['text', 'image'], expected: true },
        { modalities: ['text', 'audio'], expected: true },
        { modalities: ['text', 'video'], expected: true },
        { modalities: ['text', 'file'], expected: true },
        { modalities: ['text'], expected: false },
        { modalities: [], expected: false },
      ]

      testCases.forEach(({ modalities, expected }) => {
        const raw = {
          id: 'test/multimodal',
          architecture: { input_modalities: modalities },
        }
        const result = normalizeModel(raw)
        expect(result!.capabilities.isMultimodal).toBe(expected)
      })
    })

    it('应该正确识别 JSON mode 能力 (structured_outputs 或 response_format)', () => {
      const withStructuredOutputs = {
        id: 'test/structured',
        supported_parameters: ['structured_outputs'],
      }
      const withResponseFormat = {
        id: 'test/response-format',
        supported_parameters: ['response_format'],
      }
      const withBoth = {
        id: 'test/both',
        supported_parameters: ['structured_outputs', 'response_format'],
      }
      const withNeither = {
        id: 'test/neither',
        supported_parameters: ['temperature'],
      }

      expect(normalizeModel(withStructuredOutputs)!.capabilities.hasJsonMode).toBe(true)
      expect(normalizeModel(withResponseFormat)!.capabilities.hasJsonMode).toBe(true)
      expect(normalizeModel(withBoth)!.capabilities.hasJsonMode).toBe(true)
      expect(normalizeModel(withNeither)!.capabilities.hasJsonMode).toBe(false)
    })

    it('应该设置 context_length 为 -1 当未知时', () => {
      const raw = {
        id: 'test/no-context',
        name: 'No Context Length',
      }

      const result = normalizeModel(raw)

      expect(result!.context_length).toBe(-1)
    })

    it('应该保留现有模型的 first_seen_at', () => {
      const existingModel: AppModel = {
        id: 'test/existing',
        name: 'Existing',
        context_length: 4096,
        capabilities: { hasReasoning: false, hasTools: false, hasJsonMode: false, isMultimodal: false },
        pricing: { promptUsdPerToken: '0', completionUsdPerToken: '0', requestUsd: '0', imageUsd: '0', webSearchUsd: '0', internalReasoningUsdPerToken: '0', inputCacheReadUsdPerToken: '0', inputCacheWriteUsdPerToken: '0' },
        is_archived: false,
        first_seen_at: '2024-01-01T00:00:00.000Z',
        last_seen_at: '2024-06-01T00:00:00.000Z',
        router_source: 'openrouter',
        vendor: 'test',
      }

      const raw = {
        id: 'test/existing',
        name: 'Updated Name',
      }

      const now = '2024-12-12T00:00:00.000Z'
      const result = normalizeModel(raw, existingModel, now)

      expect(result!.first_seen_at).toBe('2024-01-01T00:00:00.000Z') // 保留原值
      expect(result!.last_seen_at).toBe(now) // 更新为当前时间
    })

    it('应该为新模型设置 first_seen_at 和 last_seen_at', () => {
      const raw = {
        id: 'test/new-model',
        name: 'New Model',
      }

      const now = '2024-12-12T00:00:00.000Z'
      const result = normalizeModel(raw, null, now)

      expect(result!.first_seen_at).toBe(now)
      expect(result!.last_seen_at).toBe(now)
    })

    it('应该正确从 id 解析 vendor', () => {
      const testCases = [
        { id: 'openai/gpt-4', expected: 'openai' },
        { id: 'anthropic/claude-3', expected: 'anthropic' },
        { id: 'google/gemini-pro', expected: 'google' },
        { id: 'deepseek/deepseek-r1', expected: 'deepseek' },
        { id: 'model-without-slash', expected: 'unknown' },
      ]

      testCases.forEach(({ id, expected }) => {
        const result = normalizeModel({ id })
        expect(result!.vendor).toBe(expected)
      })
    })

    it('应该使用默认价格值 "0" 当 pricing 缺失时', () => {
      const raw = {
        id: 'test/no-pricing',
      }

      const result = normalizeModel(raw)

      expect(result!.pricing.promptUsdPerToken).toBe('0')
      expect(result!.pricing.completionUsdPerToken).toBe('0')
      expect(result!.pricing.requestUsd).toBe('0')
      expect(result!.pricing.imageUsd).toBe('0')
      expect(result!.pricing.webSearchUsd).toBe('0')
      expect(result!.pricing.internalReasoningUsdPerToken).toBe('0')
      expect(result!.pricing.inputCacheReadUsdPerToken).toBe('0')
      expect(result!.pricing.inputCacheWriteUsdPerToken).toBe('0')
    })

    it('禁止基于 ID 字符串猜测能力 - deepseek-r1 不应自动有 reasoning', () => {
      // 如果没有 supported_parameters 包含 'reasoning'，即使 ID 包含 'r1'，也不应有推理能力
      const raw = {
        id: 'deepseek/deepseek-r1',
        name: 'DeepSeek R1',
        supported_parameters: ['temperature', 'top_p'], // 没有 'reasoning'
      }

      const result = normalizeModel(raw)

      expect(result!.capabilities.hasReasoning).toBe(false)
    })
  })

  // ============================================================================
  // shouldUpdate 测试
  // ============================================================================
  describe('shouldUpdate', () => {
    let baseModel: AppModel

    beforeEach(() => {
      baseModel = {
        id: 'test/model',
        name: 'Test Model',
        context_length: 4096,
        capabilities: { hasReasoning: false, hasTools: false, hasJsonMode: false, isMultimodal: false },
        pricing: { promptUsdPerToken: '0.001', completionUsdPerToken: '0.002', requestUsd: '0', imageUsd: '0', webSearchUsd: '0', internalReasoningUsdPerToken: '0', inputCacheReadUsdPerToken: '0', inputCacheWriteUsdPerToken: '0' },
        is_archived: false,
        router_source: 'openrouter',
        vendor: 'test',
      }
    })

    it('当远程列表为空而本地有活跃模型时应返回 true', () => {
      const local = [baseModel]
      const remote: AppModel[] = []

      expect(shouldUpdate(local, remote)).toBe(true)
    })

    it('当本地为空而远程有模型时应返回 true', () => {
      const local: AppModel[] = []
      const remote = [baseModel]

      expect(shouldUpdate(local, remote)).toBe(true)
    })

    it('当列表完全相同时应返回 false', () => {
      const local = [baseModel]
      const remote = [{ ...baseModel }]

      expect(shouldUpdate(local, remote)).toBe(false)
    })

    it('当 capabilities 变化时应返回 true', () => {
      const local = [baseModel]
      const remote = [{
        ...baseModel,
        capabilities: { ...baseModel.capabilities, hasReasoning: true },
      }]

      expect(shouldUpdate(local, remote)).toBe(true)
    })

    it('当 pricing 变化时应返回 true', () => {
      const local = [baseModel]
      const remote = [{
        ...baseModel,
        pricing: { ...baseModel.pricing, promptUsdPerToken: '0.002' },
      }]

      expect(shouldUpdate(local, remote)).toBe(true)
    })

    it('当 context_length 变化时应返回 true', () => {
      const local = [baseModel]
      const remote = [{
        ...baseModel,
        context_length: 8192,
      }]

      expect(shouldUpdate(local, remote)).toBe(true)
    })

    it('应该只比较活跃模型，忽略归档模型', () => {
      const archivedModel: AppModel = {
        ...baseModel,
        id: 'test/archived',
        is_archived: true,
      }
      const local = [baseModel, archivedModel]
      const remote = [{ ...baseModel }]

      // 虽然 local 有 2 个模型，但活跃的只有 1 个，与 remote 相同
      expect(shouldUpdate(local, remote)).toBe(false)
    })

    it('当模型 ID 不同时应返回 true', () => {
      const local = [baseModel]
      const remote = [{
        ...baseModel,
        id: 'test/different-model',
        vendor: 'test',
      }]

      expect(shouldUpdate(local, remote)).toBe(true)
    })
  })

  // ============================================================================
  // mergeWithArchived 测试
  // ============================================================================
  describe('mergeWithArchived', () => {
    let activeModel: AppModel
    let localOnlyModel: AppModel

    beforeEach(() => {
      activeModel = {
        id: 'test/active',
        name: 'Active Model',
        context_length: 4096,
        capabilities: { hasReasoning: false, hasTools: false, hasJsonMode: false, isMultimodal: false },
        pricing: { promptUsdPerToken: '0', completionUsdPerToken: '0', requestUsd: '0', imageUsd: '0', webSearchUsd: '0', internalReasoningUsdPerToken: '0', inputCacheReadUsdPerToken: '0', inputCacheWriteUsdPerToken: '0' },
        is_archived: false,
        last_seen_at: '2024-12-01T00:00:00.000Z',
        router_source: 'openrouter',
        vendor: 'test',
      }

      localOnlyModel = {
        id: 'test/local-only',
        name: 'Local Only Model',
        context_length: 4096,
        capabilities: { hasReasoning: false, hasTools: false, hasJsonMode: false, isMultimodal: false },
        pricing: { promptUsdPerToken: '0', completionUsdPerToken: '0', requestUsd: '0', imageUsd: '0', webSearchUsd: '0', internalReasoningUsdPerToken: '0', inputCacheReadUsdPerToken: '0', inputCacheWriteUsdPerToken: '0' },
        is_archived: false,
        last_seen_at: '2024-11-01T00:00:00.000Z',
        router_source: 'openrouter',
        vendor: 'test',
      }
    })

    it('应该将远程缺失的本地模型标记为 is_archived', () => {
      const remoteModels = [activeModel]
      const localModels = [activeModel, localOnlyModel]

      const result = mergeWithArchived(remoteModels, localModels)

      const archived = result.find(m => m.id === 'test/local-only')
      expect(archived).toBeDefined()
      expect(archived!.is_archived).toBe(true)
    })

    it('应该保留归档模型的 last_seen_at 不变', () => {
      const remoteModels = [activeModel]
      const localModels = [activeModel, localOnlyModel]

      const result = mergeWithArchived(remoteModels, localModels)

      const archived = result.find(m => m.id === 'test/local-only')
      expect(archived!.last_seen_at).toBe('2024-11-01T00:00:00.000Z')
    })

    it('应该将活跃模型排在归档模型前面', () => {
      const remoteModels = [activeModel]
      const localModels = [localOnlyModel, activeModel]

      const result = mergeWithArchived(remoteModels, localModels)

      // 活跃模型应在前
      expect(result[0].is_archived).toBe(false)
      expect(result[result.length - 1].is_archived).toBe(true)
    })

    it('同类模型应按 id 排序', () => {
      const model1: AppModel = { ...activeModel, id: 'a/model' }
      const model2: AppModel = { ...activeModel, id: 'z/model' }
      const model3: AppModel = { ...activeModel, id: 'm/model' }

      const result = mergeWithArchived([model1, model2, model3], [])

      expect(result[0].id).toBe('a/model')
      expect(result[1].id).toBe('m/model')
      expect(result[2].id).toBe('z/model')
    })

    it('当远程和本地完全相同时不应有归档模型', () => {
      const result = mergeWithArchived([activeModel], [activeModel])

      expect(result.length).toBe(1)
      expect(result[0].is_archived).toBe(false)
    })
  })

  // ============================================================================
  // batchNormalizeModels 测试
  // ============================================================================
  describe('batchNormalizeModels', () => {
    it('应该批量处理多个模型', () => {
      const rawModels = [
        { id: 'test/model1', name: 'Model 1' },
        { id: 'test/model2', name: 'Model 2' },
        { id: 'test/model3', name: 'Model 3' },
      ]

      const result = batchNormalizeModels(rawModels)

      expect(result.length).toBe(3)
      expect(result.map(m => m.id)).toEqual(['test/model1', 'test/model2', 'test/model3'])
    })

    it('应该过滤掉无效的模型条目', () => {
      const rawModels = [
        { id: 'test/valid', name: 'Valid' },
        { name: 'No ID' }, // 无效
        null, // 无效
        { id: 'test/another-valid', name: 'Another Valid' },
      ]

      const result = batchNormalizeModels(rawModels as any[])

      expect(result.length).toBe(2)
      expect(result.map(m => m.id)).toEqual(['test/valid', 'test/another-valid'])
    })

    it('应该保留现有模型的 first_seen_at', () => {
      const existingModels: AppModel[] = [{
        id: 'test/existing',
        name: 'Existing',
        context_length: -1,
        capabilities: { hasReasoning: false, hasTools: false, hasJsonMode: false, isMultimodal: false },
        pricing: { promptUsdPerToken: '0', completionUsdPerToken: '0', requestUsd: '0', imageUsd: '0', webSearchUsd: '0', internalReasoningUsdPerToken: '0', inputCacheReadUsdPerToken: '0', inputCacheWriteUsdPerToken: '0' },
        is_archived: false,
        first_seen_at: '2024-01-01T00:00:00.000Z',
        router_source: 'openrouter',
        vendor: 'test',
      }]

      const rawModels = [
        { id: 'test/existing', name: 'Updated' },
        { id: 'test/new', name: 'New' },
      ]

      const now = '2024-12-12T00:00:00.000Z'
      const result = batchNormalizeModels(rawModels, existingModels, now)

      const existing = result.find(m => m.id === 'test/existing')
      const newModel = result.find(m => m.id === 'test/new')

      expect(existing!.first_seen_at).toBe('2024-01-01T00:00:00.000Z')
      expect(newModel!.first_seen_at).toBe(now)
    })
  })

  // ============================================================================
  // 辅助函数测试
  // ============================================================================
  describe('extractVendor', () => {
    it('应该从模型 ID 中提取 vendor', () => {
      expect(extractVendor('openai/gpt-4')).toBe('openai')
      expect(extractVendor('anthropic/claude-3')).toBe('anthropic')
      expect(extractVendor('google/gemini-pro')).toBe('google')
    })

    it('应该处理无斜杠的 ID', () => {
      expect(extractVendor('model-name')).toBe('unknown')
    })

    it('应该处理空字符串和无效输入', () => {
      expect(extractVendor('')).toBe('unknown')
      expect(extractVendor(null as any)).toBe('unknown')
      expect(extractVendor(undefined as any)).toBe('unknown')
    })
  })

  describe('filterActiveModels', () => {
    it('应该只返回未归档的模型', () => {
      const models: AppModel[] = [
        { id: 'active1', is_archived: false } as AppModel,
        { id: 'archived1', is_archived: true } as AppModel,
        { id: 'active2', is_archived: false } as AppModel,
      ]

      const result = filterActiveModels(models)

      expect(result.length).toBe(2)
      expect(result.map(m => m.id)).toEqual(['active1', 'active2'])
    })
  })

  describe('filterArchivedModels', () => {
    it('应该只返回已归档的模型', () => {
      const models: AppModel[] = [
        { id: 'active1', is_archived: false } as AppModel,
        { id: 'archived1', is_archived: true } as AppModel,
        { id: 'active2', is_archived: false } as AppModel,
      ]

      const result = filterArchivedModels(models)

      expect(result.length).toBe(1)
      expect(result[0].id).toBe('archived1')
    })
  })
})
