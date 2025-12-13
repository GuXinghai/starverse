/**
 * 消息重试 Composable
 * 
 * 封装消息重新生成逻辑
 * 
 * 核心功能：
 * - 判断版本是否为错误
 * - 重新生成 AI 回复（创建新版本）
 * - 恢复生成配置
 * - 流式响应处理
 * 
 * 设计原则：
 * - 上下文固化（conversationId）
 * - 配置恢复机制
 * - 错误自动清理
 */

import type { Ref, ComputedRef } from 'vue'
import { getCurrentVersion } from '../../stores/branchTreeHelpers'
import { aiChatService } from '../../services/aiChatService'
import type { MessageReasoningMetadata } from '../../types/chat'
import type { ImageGenerationConfig } from '../useImageGeneration'

// ========== 类型定义 ==========

type SendRequestOverrides = {
  requestedModalities?: string[]
  imageConfig?: ImageGenerationConfig
}

export interface UseMessageRetryOptions {
  conversationId: Ref<string>
  isComponentActive: Ref<boolean>
  chatScrollRef: Ref<any>
  abortController: Ref<AbortController | null>
  currentConversation: ComputedRef<any>
  
  // Stores
  conversationStore: any
  branchStore: any
  modelStore: any
  appStore: any
  persistenceStore: any
  
  // 配置相关
  activeRequestedModalities: ComputedRef<string[] | null>
  activeImageConfig: ComputedRef<ImageGenerationConfig | null>
  canShowImageGenerationButton: ComputedRef<boolean>
  supportsImageAspectRatioConfig: ComputedRef<boolean>
  cloneImageConfig: (config: any) => ImageGenerationConfig | undefined
  selectedPdfEngine: Ref<string>
  
  // 请求构建函数
  buildWebSearchRequestOptions: () => any
  buildReasoningRequestOptions: () => any
  buildSamplingParameterOverrides: () => any
  
  // 数据捕获函数
  captureUsageForBranch: (conversationId: string, branchId: string, usage: any) => boolean
  captureReasoningForBranch: (conversationId: string, branchId: string, reasoning: MessageReasoningMetadata) => void
  
  // 分支生成偏好设置
  branchGenerationPreferences: Map<string, SendRequestOverrides>
}

export interface UseMessageRetryReturn {
  versionIndicatesError: (version: any) => boolean
  handleRetryMessage: (branchId: string) => Promise<void>
}

// ========== Composable 实现 ==========

export function useMessageRetry(options: UseMessageRetryOptions): UseMessageRetryReturn {
  const {
    conversationId,
    isComponentActive,
    chatScrollRef,
    abortController,
    currentConversation,
    conversationStore,
    branchStore,
    modelStore,
    appStore,
    persistenceStore,
    activeRequestedModalities,
    activeImageConfig,
    canShowImageGenerationButton,
    supportsImageAspectRatioConfig,
    cloneImageConfig,
    selectedPdfEngine,
    buildWebSearchRequestOptions,
    buildReasoningRequestOptions,
    buildSamplingParameterOverrides,
    captureUsageForBranch,
    captureReasoningForBranch,
    branchGenerationPreferences
  } = options
  
  /**
   * 判断消息版本是否表示错误
   * 
   * 检查条件（满足任一即为错误）：
   * 1. metadata.isError 为 true
   * 2. 消息内容包含错误关键词：
   *    - "抱歉，发生了错误"
   *    - "⏱️ 请求超时"
   *    - "error"（不区分大小写）
   * 
   * @param version - 消息版本对象
   * @returns true 表示是错误消息
   */
  const versionIndicatesError = (version: any): boolean => {
    if (!version) return false
    if (version.metadata?.isError) return true
    if (!Array.isArray(version.parts)) return false

    return version.parts.some((part: any) => {
      if (!part || part.type !== 'text' || typeof part.text !== 'string') {
        return false
      }
      const text = part.text.trim()
      if (!text) {
        return false
      }
      return text.startsWith('抱歉，发生了错误') ||
        text.startsWith('⏱️ 请求超时') ||
        text.toLowerCase().includes('error')
    })
  }
  
  /**
   * 重新生成 AI 回复（创建新版本）
   * 
   * 功能：用户点击"重新生成"按钮时调用，为 AI 回复分支创建新版本
   * 
   * 核心流程：
   * 1. 验证前置条件（对话空闲、分支有效）
   * 2. 智能处理错误版本（自动删除错误消息）
   * 3. 恢复或构建请求配置（图像生成、模态等）
   * 4. 创建新的空版本（作为流式响应的容器）
   * 5. 构建请求历史（截取到当前分支之前）
   * 6. 发起流式 API 请求
   * 7. 实时追加 token 到新版本
   * 
   * 版本管理策略：
   * - 同一分支可以有多个版本（对应不同的重新生成尝试）
   * - 用户可以通过左右箭头切换版本
   * - 错误版本会被自动删除（避免版本列表污染）
   * 
   * 配置恢复机制：
   * - 优先使用当前 UI 的配置（如果用户修改了开关）
   * - 回退到 branchGenerationPreferences 中保存的配置
   * - 如果分支包含图片，自动启用图像模态
   * 
   * 历史构建逻辑：
   * - 找到当前分支在 currentPath 中的位置
   * - 截取之前的所有消息作为上下文
   * - 不包括当前 AI 分支（避免重复）
   * 
   * 错误处理：
   * - 中止错误（AbortError）：静默处理，不显示错误
   * - 真实错误（网络、API 等）：标记对话错误状态
   * 
   * @param branchId - 要重新生成的 AI 回复分支 ID
   */
  const handleRetryMessage = async (branchId: string) => {
    // ========== 🔒 固化上下文 ==========
    const targetConversationId = conversationId.value
    
    if (!currentConversation.value) return

    // 禁止并发
    if (currentConversation.value.generationStatus !== 'idle') {
      console.warn('⚠️ 对话正在生成中，请等待完成')
      return
    }

    // 检查分支是否存在且为 assistant 角色
    const branch = currentConversation.value.tree.branches.get(branchId)
    if (!branch || branch.role !== 'assistant') {
      console.error('无效的分支ID或非 AI 消息')
      return
    }

    const currentVersion = getCurrentVersion(branch)
    const shouldRemoveErrorVersion = versionIndicatesError(currentVersion)
    const errorVersionId = shouldRemoveErrorVersion && currentVersion ? currentVersion.id : null
    const currentParts = currentVersion?.parts
    const branchHasImageParts = Array.isArray(currentParts)
      ? currentParts.some((part: any) => part?.type === 'image_url')
      : false

    const toggleModalities = activeRequestedModalities.value
      ? [...activeRequestedModalities.value]
      : undefined
    const storedPreference = branchGenerationPreferences.get(branchId)
    const toggleImageConfig = supportsImageAspectRatioConfig.value
      ? cloneImageConfig(activeImageConfig.value)
      : undefined

    let requestedModalities = toggleModalities
    const canUseStoredPreference = !canShowImageGenerationButton.value
    if (!requestedModalities && canUseStoredPreference && storedPreference?.requestedModalities?.length) {
      requestedModalities = [...storedPreference.requestedModalities]
    }
    if (!requestedModalities && branchHasImageParts) {
      requestedModalities = ['image', 'text']
    }

    let imageConfig = toggleImageConfig
    if (!imageConfig && supportsImageAspectRatioConfig.value && storedPreference?.imageConfig) {
      imageConfig = cloneImageConfig(storedPreference.imageConfig)
    }

    // 创建新版本（空内容）
    const newVersionId = branchStore.addBranchVersion(targetConversationId, branchId, [{ type: 'text' as const, text: '' }])
    
    if (!newVersionId) {
      console.error('❌ 创建新版本失败，branchId:', branchId)
      return
    }
    const hasModalities = Array.isArray(requestedModalities) && requestedModalities.length > 0
    const hasImageConfig = Boolean(imageConfig)
    if (hasModalities || hasImageConfig) {
      const preference: SendRequestOverrides = {}
      if (hasModalities && requestedModalities) {
        preference.requestedModalities = [...requestedModalities]
      }
      if (imageConfig) {
        preference.imageConfig = imageConfig
      }
      branchGenerationPreferences.set(branchId, preference)
    } else {
      branchGenerationPreferences.delete(branchId)
    }

    if (shouldRemoveErrorVersion && errorVersionId) {
      branchStore.removeBranchVersionById(targetConversationId, branchId, errorVersionId)
    }

    // ✅ 通知滚动容器
    if (isComponentActive.value) {
      chatScrollRef.value?.scrollToBottom()
    }

    // ========== 构建请求历史：获取该分支之前的消息 ==========
    const allMessages = branchStore._buildMessageHistoryForAPI(targetConversationId)
    
    // 找到当前分支在路径中的位置
    const branchIndex = currentConversation.value.tree.currentPath.indexOf(branchId)
    if (branchIndex === -1) {
      console.error('分支不在当前路径中')
      return
    }
    
    // 获取该分支之前的历史（不包括当前 AI 分支）
    const historyForStream = allMessages.slice(0, branchIndex)

    // ========== 创建新的中止控制器 ==========
    if (abortController.value) {
      abortController.value.abort()
    }
    abortController.value = new AbortController()

    // ========== 设置生成状态为 'sending' ==========
    conversationStore.setGenerationStatus(targetConversationId, true)

    let usageCaptured = false

    try {
      const conversationModel = currentConversation.value.model || modelStore.selectedModelId
      const systemInstruction = (currentConversation.value.customInstructions || '').trim()

      // 发起流式请求
      const webSearchOptions = buildWebSearchRequestOptions()
      const reasoningOptions = buildReasoningRequestOptions()
      const parameterOverrides = buildSamplingParameterOverrides()
      const stream = aiChatService.streamChatResponse(
        appStore,
        historyForStream,
        conversationModel,
        '', // 不传用户消息，从历史获取
        {
          signal: abortController.value.signal,
          webSearch: webSearchOptions,
          requestedModalities,
          imageConfig,
          reasoning: reasoningOptions,
          parameters: parameterOverrides,
          pdfEngine: selectedPdfEngine.value,
          systemInstruction: systemInstruction || null,
          conversationId: conversationId.value,
        }
      )

      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('流式响应不可用')
      }

      // 流式读取并追加到新版本
      const iterator = stream[Symbol.asyncIterator]()
      const firstResult = await iterator.next()
      
      const processChunk = async (chunk: any) => {
        if (chunk && typeof chunk === 'object') {
          const usagePayload = 'usage' in chunk ? chunk.usage : undefined
          if (!usageCaptured && usagePayload) {
            usageCaptured = captureUsageForBranch(targetConversationId, branchId, usagePayload) || usageCaptured
          } else if (usagePayload) {
            captureUsageForBranch(targetConversationId, branchId, usagePayload)
          }

          if (chunk.type === 'usage') {
            return
          }

          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          // 🧠 流式推理处理
          // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          
          // 1️⃣ reasoning_detail：结构化块（保存用于回传模型，不用于显示）
          if (chunk.type === 'reasoning_detail' && chunk.detail) {
            branchStore.appendReasoningDetail(
              targetConversationId,
              branchId,
              chunk.detail
            )
            return
          }

          // 2️⃣ reasoning_stream_text：实时文本流（用于 UI 展示）
          if (chunk.type === 'reasoning_stream_text' && typeof chunk.text === 'string') {
            branchStore.appendReasoningStreamingText(
              targetConversationId,
              branchId,
              chunk.text
            )
            // ✅ 通知滚动容器
            if (isComponentActive.value) {
              chatScrollRef.value?.onNewContent()
            }
            return
          }

          // 3️⃣ reasoning_summary：推理摘要（流结束时）
          if (chunk.type === 'reasoning_summary') {
            branchStore.setReasoningSummary(
              targetConversationId,
              branchId,
              {
                summary: chunk.summary,
                text: chunk.text,
                request: chunk.request,
                provider: chunk.provider,
                model: chunk.model,
                excluded: chunk.excluded
              }
            )
            // ✅ 通知滚动容器
            if (isComponentActive.value) {
              chatScrollRef.value?.onNewContent()
            }
            return
          }

          // 【向后兼容】保留对旧版 reasoning 块的支持
          if (chunk.type === 'reasoning' && chunk.reasoning) {
            captureReasoningForBranch(
              targetConversationId,
              branchId,
              chunk.reasoning as MessageReasoningMetadata
            )
            return
          }
        }

        if (typeof chunk === 'string' && chunk) {
          branchStore.appendToken(targetConversationId, branchId, chunk)
          // ✅ 通知滚动容器
          if (isComponentActive.value) {
            chatScrollRef.value?.onNewContent()
          }
          return
        }

        if (chunk && typeof chunk === 'object') {
          if (chunk.type === 'text' && chunk.content) {
            branchStore.appendToken(targetConversationId, branchId, chunk.content)
            // ✅ 通知滚动容器
            if (isComponentActive.value) {
              chatScrollRef.value?.onNewContent()
            }
          } else if (chunk.type === 'image' && chunk.content) {
            branchStore.appendImage(targetConversationId, branchId, chunk.content)
            // ✅ 通知滚动容器
            if (isComponentActive.value) {
              chatScrollRef.value?.onNewContent()
            }
          }
        }
      }

      if (!firstResult.done) {
        conversationStore.setGenerationStatus(targetConversationId, true)
        await processChunk(firstResult.value)
      }

      for await (const chunk of iterator) {
        await processChunk(chunk)
      }
      
    } catch (error: any) {
      const isAborted = error.name === 'AbortError' || 
                        error.message?.includes('中止') ||
                        error.message?.includes('abort')
      
      if (!isAborted) {
        console.error('❌ 重新生成失败:', error)
        conversationStore.setGenerationError(targetConversationId, { message: error?.message || '重新生成失败' })
      }
    } finally {
      // ========== 清理：设置状态为 idle ==========
      conversationStore.setGenerationStatus(targetConversationId, false)
      abortController.value = null
      
      // ✅ 通知滚动容器
      if (isComponentActive.value) {
        chatScrollRef.value?.scrollToBottom()
      }
      
      // 保存对话（使用长防抖 + requestIdleCallback）
      persistenceStore.saveAllDirtyConversations()
    }
  }
  
  return {
    versionIndicatesError,
    handleRetryMessage
  }
}
