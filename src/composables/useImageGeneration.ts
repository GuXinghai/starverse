/**
 * useImageGeneration - 图像生成配置 Composable
 * 
 * 职责：
 * - 图像生成开关管理
 * - 长宽比选择和配置
 * - 模型支持检测
 * - 对话级偏好保存
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { watchDebounced } from '@vueuse/core'

/**
 * 图像生成配置类型
 */
export type ImageGenerationConfig = {
  aspect_ratio: string
}

/**
 * 图像宽高比选项
 */
export const IMAGE_ASPECT_RATIO_OPTIONS: ReadonlyArray<{
  value: string
  label: string
  resolution: string
}> = [
  { value: '9:16', label: '9:16', resolution: '768x1344' },   // 竖屏
  { value: '2:3', label: '2:3', resolution: '832x1248' },
  { value: '3:4', label: '3:4', resolution: '864x1184' },
  { value: '4:5', label: '4:5', resolution: '896x1152' },
  { value: '1:1', label: '1:1', resolution: '1024x1024' },    // 正方形（默认）
  { value: '5:4', label: '5:4', resolution: '1152x896' },
  { value: '4:3', label: '4:3', resolution: '1184x864' },
  { value: '3:2', label: '3:2', resolution: '1248x832' },
  { value: '16:9', label: '16:9', resolution: '1344x768' },   // 横屏
  { value: '21:9', label: '21:9', resolution: '1536x672' }    // 超宽屏
]

/**
 * 默认宽高比索引（1:1 正方形）
 */
export const DEFAULT_ASPECT_RATIO_INDEX = Math.max(
  0,
  IMAGE_ASPECT_RATIO_OPTIONS.findIndex(option => option.value === '1:1')
)

/**
 * 图像响应模态类型
 */
export const IMAGE_RESPONSE_MODALITIES = ['text', 'image'] as const

export interface ImageGenerationOptions {
  /**
   * 当前对话 ID（用于保存偏好设置）
   * 允许 null 表示没有激活的对话
   */
  conversationId: Ref<string | null>
  
  /**
   * 组件是否处于激活状态
   */
  isActive: Ref<boolean>
  
  /**
   * 当前模型是否支持图像输出
   */
  modelSupportsImageOutput: ComputedRef<boolean>
  
  /**
   * 当前激活的 Provider
   */
  activeProvider: ComputedRef<string>
  
  /**
   * 当前模型 ID
   * 允许 undefined/null 表示没有选择模型
   */
  currentModelId: ComputedRef<string | null | undefined>
  
  /**
   * 生成状态
   */
  generationStatus: ComputedRef<string>
}

export function useImageGeneration(options: ImageGenerationOptions) {
  const {
    conversationId,
    isActive,
    modelSupportsImageOutput,
    activeProvider,
    currentModelId,
    generationStatus
  } = options

  // ========== 状态 ==========
  
  /**
   * 图像生成开关
   */
  const imageGenerationEnabled = ref(false)
  
  /**
   * 当前选择的长宽比索引
   */
  const imageAspectRatioIndex = ref<number>(DEFAULT_ASPECT_RATIO_INDEX)
  
  /**
   * 对话级别的长宽比偏好（全局 Map）
   */
  const aspectRatioPreferenceByConversation = new Map<string, number>()
  
  /**
   * 对话级别的图像生成开关状态（全局 Map）
   */
  const imageGenerationEnabledByConversation = new Map<string, boolean>()

  // ========== 工具函数 ==========
  
  /**
   * 限制长宽比索引在有效范围内
   */
  function clampAspectRatioIndex(index: number | undefined | null): number {
    if (index === undefined || index === null || Number.isNaN(index)) {
      return DEFAULT_ASPECT_RATIO_INDEX
    }
    const rounded = Math.round(index)
    if (!Number.isFinite(rounded)) {
      return DEFAULT_ASPECT_RATIO_INDEX
    }
    const maxIndex = IMAGE_ASPECT_RATIO_OPTIONS.length - 1
    if (rounded < 0) {
      return 0
    }
    if (rounded > maxIndex) {
      return maxIndex
    }
    return rounded
  }
  
  /**
   * 克隆图像配置对象
   */
  function cloneImageConfig(
    config?: ImageGenerationConfig | null
  ): ImageGenerationConfig | undefined {
    if (!config || typeof config.aspect_ratio !== 'string') {
      return undefined
    }
    const aspect = config.aspect_ratio.trim()
    if (!aspect) {
      return undefined
    }
    return { aspect_ratio: aspect }
  }

  // ========== 计算属性 ==========
  
  /**
   * 是否可以显示图像生成按钮
   */
  const canShowImageGenerationButton = computed(() => {
    return modelSupportsImageOutput.value
  })
  
  /**
   * 当前长宽比选项
   */
  const currentAspectRatioOption = computed(() => {
    const maxIndex = IMAGE_ASPECT_RATIO_OPTIONS.length - 1
    const normalizedIndex = Math.min(Math.max(imageAspectRatioIndex.value, 0), maxIndex)
    return IMAGE_ASPECT_RATIO_OPTIONS[normalizedIndex] ?? IMAGE_ASPECT_RATIO_OPTIONS[0]
  })
  
  /**
   * 是否支持长宽比配置（仅 OpenRouter + Gemini）
   */
  const supportsImageAspectRatioConfig = computed(() => {
    // 性能优化：非激活状态下跳过检查
    if (!isActive.value) {
      return false
    }
    
    if (activeProvider.value !== 'OpenRouter') {
      return false
    }
    
    if (!modelSupportsImageOutput.value) {
      return false
    }
    
    const modelId = currentModelId.value
    if (!modelId || typeof modelId !== 'string') {
      return false
    }
    
    const normalized = modelId.toLowerCase()
    if (!normalized) {
      return false
    }
    
    // 只有 Gemini 系列支持长宽比配置
    if (normalized.includes('gemini')) {
      return true
    }
    if (normalized.startsWith('google/')) {
      return true
    }
    
    return false
  })
  
  /**
   * 是否可以配置长宽比
   */
  const canConfigureImageAspectRatio = computed(() => {
    return supportsImageAspectRatioConfig.value
  })
  
  /**
   * 当前激活的图像配置
   */
  const activeImageConfig = computed<ImageGenerationConfig | null>(() => {
    if (!imageGenerationEnabled.value || !supportsImageAspectRatioConfig.value) {
      return null
    }
    const option = currentAspectRatioOption.value
    if (!option) {
      return null
    }
    return {
      aspect_ratio: option.value
    }
  })
  
  /**
   * 当前长宽比标签
   */
  const currentAspectRatioLabel = computed(() => {
    const option = currentAspectRatioOption.value
    return option ? option.label : ''
  })
  
  /**
   * 当前长宽比分辨率
   */
  const currentAspectRatioResolution = computed(() => {
    const option = currentAspectRatioOption.value
    return option ? option.resolution : ''
  })
  
  /**
   * 激活的请求模态类型
   */
  const activeRequestedModalities = computed<string[] | null>(() => {
    if (!imageGenerationEnabled.value) {
      return null
    }
    return [...IMAGE_RESPONSE_MODALITIES]
  })
  
  /**
   * 图像生成按钮提示文本
   */
  const imageGenerationTooltip = computed(() => {
    if (!canShowImageGenerationButton.value) {
      return '当前模型不支持图像生成输出'
    }
    
    return imageGenerationEnabled.value
      ? '图像生成已启用，发送消息将请求图像输出'
      : '启用图像生成后，发送消息将请求模型返回图像'
  })

  // ========== 方法 ==========
  
  /**
   * 切换图像生成开关
   */
  function toggleImageGeneration() {
    if (!canShowImageGenerationButton.value) {
      return
    }
    if (generationStatus.value !== 'idle') {
      return
    }
    
    imageGenerationEnabled.value = !imageGenerationEnabled.value
  }

  /**
   * 寮€鍏跺畾鍥惧儚寮€鍏抽閫?
   */
  function cycleAspectRatio() {
    if (!supportsImageAspectRatioConfig.value) {
      return
    }
    const optionCount = IMAGE_ASPECT_RATIO_OPTIONS.length
    if (optionCount === 0) {
      return
    }
    imageAspectRatioIndex.value = (imageAspectRatioIndex.value + 1) % optionCount
  }

  // ========== Watchers ==========
  
  /**
   * 监听对话切换，恢复该对话的偏好设置
   */
  watch(conversationId, (newConversationId) => {
    // 恢复图像生成开关状态
    if (typeof newConversationId === 'string') {
      const savedEnabled = imageGenerationEnabledByConversation.get(newConversationId)
      imageGenerationEnabled.value = savedEnabled ?? false
    } else {
      imageGenerationEnabled.value = false
    }
    
    // 恢复长宽比索引
    const restoredIndex = typeof newConversationId === 'string'
      ? aspectRatioPreferenceByConversation.get(newConversationId)
      : undefined
    
    const targetIndex = restoredIndex ?? DEFAULT_ASPECT_RATIO_INDEX
    const clampedIndex = clampAspectRatioIndex(targetIndex)
    imageAspectRatioIndex.value = clampedIndex
  })
  
  /**
   * 监听图像生成开关变化并保存偏好
   */
  watch(imageGenerationEnabled, (newEnabled) => {
    const currentConversationId = conversationId.value
    if (!currentConversationId) {
      return
    }
    imageGenerationEnabledByConversation.set(currentConversationId, newEnabled)
  })
  
  /**
   * 监听长宽比索引变化并保存偏好（防抖 200ms）
   */
  watchDebounced(
    imageAspectRatioIndex,
    (newIndex) => {
      const currentConversationId = conversationId.value
      if (!currentConversationId) {
        return
      }
      const clamped = clampAspectRatioIndex(newIndex)
      if (clamped !== newIndex) {
        imageAspectRatioIndex.value = clamped
        return
      }
      aspectRatioPreferenceByConversation.set(currentConversationId, clamped)
    },
    { debounce: 200 }
  )
  
  /**
   * 监听模型支持状态，自动关闭不支持的功能
   */
  watch(modelSupportsImageOutput, (supports) => {
    if (!supports && imageGenerationEnabled.value) {
      imageGenerationEnabled.value = false
    }
  })
  
  /**
   * 监听模型切换，自动关闭图像生成
   */
  watch(currentModelId, () => {
    if (!modelSupportsImageOutput.value && imageGenerationEnabled.value) {
      imageGenerationEnabled.value = false
    }
  })

  return {
    // 状态
    imageGenerationEnabled,
    imageAspectRatioIndex,
    
    // 计算属性
    canShowImageGenerationButton,
    currentAspectRatioOption,
    supportsImageAspectRatioConfig,
    canConfigureImageAspectRatio,
    activeImageConfig,
    currentAspectRatioLabel,
    currentAspectRatioResolution,
    activeRequestedModalities,
    imageGenerationTooltip,
    
    // 方法
    toggleImageGeneration,
    cycleAspectRatio,
    cloneImageConfig,
    clampAspectRatioIndex
  }
}
