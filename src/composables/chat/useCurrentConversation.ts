/**
 * useCurrentConversation - 当前对话状态与模型能力检测
 * 
 * 职责：
 * - 获取当前对话数据（从 conversationStore）
 * - 获取当前模型元数据（从 modelStore）
 * - 检测模型能力（视觉输入、图像输出）
 * - 提供视觉模型警告提示
 * 
 * 迁移自：ChatView.vue Phase 5 重构
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import { useConversationStore } from '../../stores/conversation'
import { useModelStore } from '../../stores/model'
import { aiChatService } from '../../services/aiChatService'

/**
 * useCurrentConversation Composable 参数
 */
export interface UseCurrentConversationOptions {
  conversationId: Ref<string>
  isActive: ComputedRef<boolean>
  pendingAttachments: Ref<any[]>  // 待发送的附件列表（图片等），用于判断是否需要视觉模型
  activeProvider: ComputedRef<string>
  appStore: any  // AppStore 实例，用于 supportsVision 检查
}

/**
 * useCurrentConversation Composable
 * 
 * 提供当前对话和模型状态的计算属性
 */
export function useCurrentConversation(options: UseCurrentConversationOptions) {
  const { conversationId, isActive, pendingAttachments, activeProvider } = options

  const conversationStore = useConversationStore()
  const modelStore = useModelStore()

  /**
   * 当前对话对象
   * 
   * 响应式来源：
   * - conversations 数组变化（新建、删除对话）
   * - 对话的任何属性变化（标题、模型、消息等）
   * - conversationId 变化（切换标签页）
   * 
   * 返回值：
   * - 找到对话：返回对话对象（包含 id、title、tree、model 等）
   * - 未找到：返回 null（可能对话已被删除）
   * 
   * 注意：在异步操作中不要直接使用此 computed，应该使用固化的 conversationId
   */
  const currentConversation = computed(() => {
    return conversationStore.conversations.find(c => c.id === conversationId.value) || null
  })

  /**
   * 当前模型元数据
   * 
   * 从 modelStore 的 modelDataMap 中查找当前对话使用的模型信息
   * 
   * 查找策略：
   * 1. 直接匹配 modelId
   * 2. 小写规范化后匹配（兼容大小写不一致）
   * 
   * 性能优化：
   * - 非激活状态下跳过查找（避免不必要的计算）
   * 
   * 返回值：
   * - 找到模型：返回模型元数据对象（包含 capabilities、modalities 等）
   * - 未找到：返回 null
   */
  const currentModelMetadata = computed(() => {
    // 性能优化：非激活状态下跳过模型元数据查找
    if (!isActive.value) {
      console.log('[ModelMetadata] ⏸️ 组件未激活，跳过查询')
      return null
    }

    const modelId = currentConversation.value?.model
    const modelsMap = modelStore.modelDataMap
    const mapSize = modelsMap && typeof modelsMap.size === 'number' ? modelsMap.size : 0
    
    console.log('[ModelMetadata] 🔍 查询模型元数据:', {
      modelId,
      isActive: isActive.value,
      hasModelDataMap: !!modelsMap,
      modelDataMapSize: mapSize,
      provider: activeProvider.value
    })
    
    if (!modelId) {
      console.log('[ModelMetadata] ❌ modelId 为空')
      return null
    }

    if (modelsMap && typeof modelsMap.get === 'function') {
      const directMatch = modelsMap.get(modelId)
      if (directMatch) {
        console.log('[ModelMetadata] ✅ 直接匹配成功:', {
          modelId,
          hasOutputModalities: !!directMatch.output_modalities,
          outputModalities: directMatch.output_modalities,
          architecture: directMatch.architecture
        })
        return directMatch
      }

      const normalizedMatch = modelsMap.get(modelId.toLowerCase())
      if (normalizedMatch) {
        console.log('[ModelMetadata] ✅ 标准化匹配成功:', {
          modelId: modelId.toLowerCase(),
          hasOutputModalities: !!normalizedMatch.output_modalities,
          outputModalities: normalizedMatch.output_modalities,
          architecture: normalizedMatch.architecture
        })
        return normalizedMatch
      }
      
      // 未找到时输出可用模型列表（前10个）
      const availableModels = Array.from(modelsMap.keys()).slice(0, 10)
      console.log('[ModelMetadata] ❌ 未找到模型元数据:', {
        searchedModelId: modelId,
        searchedLowercaseId: modelId?.toLowerCase(),
        totalAvailableModels: mapSize,
        sampleAvailableModels: availableModels
      })
    } else {
      console.log('[ModelMetadata] ❌ modelDataMap 不可用')
    }

    return null
  })

  /**
   * 当前模型是否支持图像输出
   * 
   * 检测逻辑：
   * - 检查 output_modalities 数组是否包含 'image'
   * - 不区分大小写
   * - 注意：'vision' 通常指视觉输入能力，不代表图像生成能力
   * - 注意：'multimodal' 可能指多模态输入/输出，但不一定包含图像生成
   * 
   * 用途：
   * - 控制图像生成按钮的显示
   * - 决定是否允许用户请求图像输出
   */
  const currentModelSupportsImageOutput = computed(() => {
    const metadata = currentModelMetadata.value
    const modelId = currentConversation.value?.model
    
    console.log('[ImageOutput] 🎨 开始检测模型图像输出能力:', {
      modelId,
      provider: activeProvider.value,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : [],
      output_modalities: metadata?.output_modalities,
      isActive: isActive.value
    })
    
    if (!metadata) {
      console.log('[ImageOutput] ❌ 不支持 - metadata 为 null/undefined')
      return false
    }
    
    if (!Array.isArray(metadata.output_modalities)) {
      console.log('[ImageOutput] ❌ 不支持 - output_modalities 不是数组:', {
        type: typeof metadata.output_modalities,
        value: metadata.output_modalities
      })
      return false
    }

    const normalized = metadata.output_modalities
      .map((mod: any) => (typeof mod === 'string' ? mod.toLowerCase() : ''))
      .filter(Boolean)

    console.log('[ImageOutput] 🔄 标准化 output_modalities:', {
      original: metadata.output_modalities,
      normalized,
      length: normalized.length
    })

    if (normalized.length === 0) {
      console.log('[ImageOutput] ❌ 不支持 - output_modalities 为空数组')
      return false
    }

    // 只检查 'image'，不包括 'vision' 和 'multimodal'
    // 'vision' 通常指视觉输入（接受图片），而非图像生成
    // 'multimodal' 可能指多种模态但不一定支持图像生成
    const hasImage = normalized.includes('image')
    const hasVision = normalized.includes('vision')
    const hasMultimodal = normalized.includes('multimodal')
    
    console.log('[ImageOutput] 🎯 模态检测结果:', {
      modelId,
      hasImage,
      hasVision,
      hasMultimodal,
      supportsImageOutput: hasImage,
      note: 'vision=视觉输入, multimodal=多模态, 只有image=图像生成'
    })
    
    if (hasImage) {
      console.log('[ImageOutput] ✅ 支持图像输出 - 检测到 "image" 模态')
    } else if (hasVision || hasMultimodal) {
      console.log('[ImageOutput] ⚠️ 不支持图像输出 - 仅有 vision/multimodal（这些是输入能力）')
    } else {
      console.log('[ImageOutput] ❌ 不支持图像输出 - 未检测到 "image" 模态')
    }
    
    return hasImage
  })

  /**
   * 是否需要视觉模型
   * 
   * 判断条件：pendingAttachments 中有图片
   * 
   * 用途：
   * - 触发视觉模型检测
   * - 提示用户选择支持视觉的模型
   */
  const needsVisionModel = computed(() => {
    return pendingAttachments.value.length > 0
  })

  /**
   * 当前模型是否支持图像输入
   * 
   * 检测逻辑：
   * - 如果没有待发送的图片，不需要检查（返回 true）
   * - 使用 aiChatService.supportsImage() 检测模型是否支持图像输入
   * 
   * 用途：
   * - 生成视觉模型警告提示
   * - 防止用户向不支持图像的模型发送图片
   */
  const currentModelSupportsVision = computed(() => {
    const modelId = currentConversation.value?.model
    if (!modelId || !needsVisionModel.value) return true  // 无图片时不需要检查
    return aiChatService.supportsImage(options.appStore, modelId)
  })

  /**
   * 视觉模型警告提示
   * 
   * 显示条件：
   * - 有待发送的图片（needsVisionModel）
   * - 当前模型不支持图像（!currentModelSupportsVision）
   * 
   * 返回值：
   * - 需要警告：返回警告文本
   * - 不需要警告：返回空字符串
   * 
   * 用途：
   * - 在 UI 中显示警告提示
   * - 引导用户选择支持图像输入的模型
   */
  const visionModelWarning = computed(() => {
    if (!needsVisionModel.value) return ''
    if (currentModelSupportsVision.value) return ''
    
    return '⚠️ 当前模型不支持图像，请选择支持视觉的模型（如 GPT-4o、Gemini 1.5+、Claude 3）'
  })

  return {
    currentConversation,
    currentModelMetadata,
    currentModelSupportsImageOutput,
    needsVisionModel,
    currentModelSupportsVision,
    visionModelWarning
  }
}
