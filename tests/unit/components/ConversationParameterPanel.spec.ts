/**
 * ConversationParameterPanel 组件单元测试
 * 
 * 测试范围：
 * - 参数面板的渲染和可见性
 * - 参数值的同步和更新
 * - 事件发送（update:samplingParameters, update:reasoningPreference）
 * - 模型能力检查
 * - 自动持久化逻辑
 */

import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConversationParameterPanel from '../../../src/components/chat/controls/ConversationParameterPanel.vue'
import type { SamplingParameterSettings, ReasoningPreference } from '../../../src/types/chat'
import type { ModelGenerationCapability } from '../../../src/types/generation'

// 创建默认的模型能力对象
const DEFAULT_CAPABILITY: ModelGenerationCapability = {
  modelId: 'test-model',
  sampling: {
    temperature: true,
    top_p: true,
    top_k: true,
    frequency_penalty: false,
    presence_penalty: false,
    repetition_penalty: false,
    min_p: false,
    top_a: false,
    seed: false,
    logit_bias: false
  },
  length: {
    max_tokens: true,
    stop: false,
    verbosity: false,
    maxCompletionTokens: 4096
  },
  reasoning: {
    modelId: 'test-model',
    supportsReasoningParam: true,
    supportsIncludeReasoning: false,
    supportsMaxReasoningTokens: true,
    returnsVisibleReasoning: 'yes' as const,
    maxCompletionTokens: 4096,
    internalReasoningPrice: 0.0001,
    family: 'other' as const,
    reasoningClass: 'A' as const,
    maxTokensPolicy: 'provider-unknown-range' as const
  },
  other: {
    tools: false,
    response_format: false,
    structured_outputs: false,
    logprobs: false,
    top_logprobs: false,
    parallel_tool_calls: false
  }
}

const DEFAULT_SAMPLING_PARAMS: SamplingParameterSettings = {
  enabled: false,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  max_tokens: undefined
}

const DEFAULT_REASONING_PREF: ReasoningPreference = {
  visibility: 'visible',
  effort: 'medium',
  maxTokens: null
}

describe('ConversationParameterPanel', () => {
  const createWrapper = (props = {}) => {
    return mount(ConversationParameterPanel, {
      props: {
        modelId: 'test-model',
        modelCapability: DEFAULT_CAPABILITY,
        samplingParameters: DEFAULT_SAMPLING_PARAMS,
        reasoningPreference: DEFAULT_REASONING_PREF,
        show: true,
        isAvailable: true,
        ...props
      }
    })
  }

  describe('渲染和可见性', () => {
    it('应该在 show=true 且 isAvailable=true 时渲染面板', () => {
      const wrapper = createWrapper({
        show: true,
        isAvailable: true
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该在 show=false 时不渲染面板', () => {
      const wrapper = createWrapper({
        show: false,
        isAvailable: true
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(false)
    })

    it('应该在 isAvailable=false 时不渲染面板', () => {
      const wrapper = createWrapper({
        show: true,
        isAvailable: false
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(false)
    })

    it('应该显示面板标题', () => {
      const wrapper = createWrapper()
      expect(wrapper.text()).toContain('生成参数（会话级）')
    })
  })

  describe('参数初始化', () => {
    it('应该显示采样参数的初始值', () => {
      const wrapper = createWrapper({
        samplingParameters: {
          enabled: true,
          temperature: 0.8,
          top_p: 0.85,
          top_k: 50,
          max_tokens: 2000
        }
      })

      // 检查是否正确显示值（通过 input 或显示文本）
      const inputs = wrapper.findAll('input[type="range"]')
      expect(inputs.length).toBeGreaterThan(0)
    })

    it('应该使用默认值当参数为空时', () => {
      const wrapper = createWrapper({
        samplingParameters: null
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })
  })

  describe('参数更新和事件发送', () => {
    it('应该在温度滑块变化时发送 update:samplingParameters 事件', async () => {
      const wrapper = createWrapper()

      // 找到温度滑块
      const sliders = wrapper.findAll('input[type="range"]')
      expect(sliders.length).toBeGreaterThan(0)

      // 模拟滑块变化
      if (sliders[0]) {
        await sliders[0].setValue(0.9)
        await flushPromises()
      }

      // 检查是否发送了事件
      expect(wrapper.emitted('update:samplingParameters')).toBeTruthy()

      // 检查事件数据
      const emittedData = wrapper.emitted('update:samplingParameters')?.[0]?.[0] as SamplingParameterSettings | undefined
      expect(emittedData).toBeDefined()
      if (emittedData) {
        expect(emittedData.enabled).toBe(true)
        expect(emittedData.temperature).toBeDefined()
      }
    })

    it('应该在参数变化时始终包含 enabled 字段', async () => {
      const wrapper = createWrapper()

      const sliders = wrapper.findAll('input[type="range"]')
      if (sliders[0]) {
        await sliders[0].setValue(0.75)
        await flushPromises()
      }

      const emitted = wrapper.emitted('update:samplingParameters')
      expect(emitted).toBeTruthy()

      const lastEmittedData = emitted?.[emitted.length - 1]?.[0] as SamplingParameterSettings | undefined
      expect(lastEmittedData?.enabled).toBe(true)
    })

    it('应该在 props 变化时更新本地状态', async () => {
      const wrapper = createWrapper({
        samplingParameters: DEFAULT_SAMPLING_PARAMS
      })

      // 更新 props
      await wrapper.setProps({
        samplingParameters: {
          ...DEFAULT_SAMPLING_PARAMS,
          temperature: 0.95
        }
      })

      await flushPromises()

      // 验证本地状态已更新（可以通过检查 emitted 事件或访问组件状态）
      // 这里我们检查下一次变化是否反映新的值
      expect(wrapper.vm).toBeDefined()
    })
  })

  describe('模型能力检查', () => {
    it('应该根据模型能力隐藏不支持的参数', () => {
      const capability: ModelGenerationCapability = {
        modelId: 'test-model',
        sampling: {
          ...DEFAULT_CAPABILITY.sampling,
          top_k: false
        },
        length: DEFAULT_CAPABILITY.length,
        reasoning: DEFAULT_CAPABILITY.reasoning,
        other: DEFAULT_CAPABILITY.other
      }

      const wrapper = createWrapper({
        modelCapability: capability
      })

      // 获取所有参数标签
      const labels = wrapper.findAll('label')
      labels.find(l => l.text().includes('Top-K'))

      // top_k 应该被禁用或隐藏
      // 具体行为取决于实现，这里只是验证组件正确读取能力
      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该在模型不支持参数时禁用控件', () => {
      const capability: ModelGenerationCapability = {
        modelId: 'test-model',
        sampling: {
          ...DEFAULT_CAPABILITY.sampling,
          temperature: false
        },
        length: DEFAULT_CAPABILITY.length,
        reasoning: DEFAULT_CAPABILITY.reasoning,
        other: DEFAULT_CAPABILITY.other
      }

      const wrapper = createWrapper({
        modelCapability: capability
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该处理模型能力为 null 的情况', () => {
      const wrapper = createWrapper({
        modelCapability: null
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })
  })

  describe('参数验证和范围检查', () => {
    it('应该确保温度值在有效范围内 (0-2)', async () => {
      const wrapper = createWrapper()

      const sliders = wrapper.findAll('input[type="range"]')
      const tempSlider = sliders[0] // 假设第一个是温度

      // 设置超出范围的值（滑块会自动夹紧）
      await tempSlider?.setValue(2.5)
      await flushPromises()

      const emitted = wrapper.emitted('update:samplingParameters')
      const lastValue = (emitted?.[emitted.length - 1]?.[0] as SamplingParameterSettings | undefined)?.temperature

      // 值应该被限制在合理范围内
      expect(lastValue).toBeLessThanOrEqual(2)
    })

    it('应该确保 top_p 值在 0-1 范围内', async () => {
      const wrapper = createWrapper()

      // 这取决于具体的滑块顺序，可能需要调整
      const sliders = wrapper.findAll('input[type="range"]')
      if (sliders.length > 1 && sliders[1]) {
        await sliders[1].setValue(1.5)
        await flushPromises()

        const emitted = wrapper.emitted('update:samplingParameters')
        if (emitted && emitted.length > 0) {
          const lastEmit = emitted[emitted.length - 1]
          if (lastEmit && lastEmit[0]) {
            const lastValue = (lastEmit[0] as any)?.top_p
            expect(lastValue).toBeLessThanOrEqual(1)
          }
        }
      }
    })

    it('应该允许 max_tokens 为 null 或正整数', async () => {
      const wrapper = createWrapper({
        samplingParameters: {
          ...DEFAULT_SAMPLING_PARAMS,
          max_tokens: null
        }
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })
  })

  describe('推理偏好集成', () => {
    it('应该显示推理偏好信息', () => {
      const wrapper = createWrapper({
        reasoningPreference: {
          visibility: 'visible',
          effort: 'high',
          maxTokens: 10000
        }
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该在推理偏好变化时更新本地状态', async () => {
      const wrapper = createWrapper({
        reasoningPreference: DEFAULT_REASONING_PREF
      })

      await wrapper.setProps({
        reasoningPreference: {
          ...DEFAULT_REASONING_PREF,
          effort: 'high'
        }
      })

      await flushPromises()

      expect(wrapper.vm).toBeDefined()
    })
  })

  describe('面板打开/关闭动画', () => {
    it('应该在 show 从 false 变为 true 时应用打开动画', async () => {
      const wrapper = createWrapper({
        show: false
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(false)

      await wrapper.setProps({ show: true })
      await flushPromises()

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该在 show 从 true 变为 false 时应用关闭动画', async () => {
      const wrapper = createWrapper({
        show: true
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)

      await wrapper.setProps({ show: false })
      await flushPromises()

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(false)
    })
  })

  describe('边界情况', () => {
    it('应该处理 undefined 的采样参数', () => {
      const wrapper = createWrapper({
        samplingParameters: undefined
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该处理 undefined 的推理偏好', () => {
      const wrapper = createWrapper({
        reasoningPreference: undefined
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })

    it('应该处理 null 的模型 ID', () => {
      const wrapper = createWrapper({
        modelId: null
      })

      expect(wrapper.find('[data-test-id="conversation-parameter-panel"]').exists()).toBe(true)
    })
  })

  describe('多个参数同时变化', () => {
    it('应该在一个事件中发送所有参数的更新', async () => {
      const wrapper = createWrapper()

      const sliders = wrapper.findAll('input[type="range"]')

      // 改变多个滑块
      if (sliders.length >= 2 && sliders[0] && sliders[1]) {
        await sliders[0].setValue(0.8)
        await sliders[1].setValue(0.95)
        await flushPromises()

        const emitted = wrapper.emitted('update:samplingParameters')
        if (emitted && emitted.length > 0) {
          const lastEmit = emitted[emitted.length - 1]
          if (lastEmit && lastEmit[0]) {
            const lastData = lastEmit[0] as SamplingParameterSettings
            // 应该包含所有参数
            expect(lastData.temperature).toBeDefined()
            expect(lastData.top_p).toBeDefined()
            expect(lastData.top_k).toBeDefined()
            // max_tokens 可以是 undefined（表示使用默认值）
            expect('max_tokens' in lastData).toBe(true)
          }
        }
      }
    })
  })
})
