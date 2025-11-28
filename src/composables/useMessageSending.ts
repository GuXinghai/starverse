/**
 * useMessageSending - 消息发送 Composable
 * 
 * 职责：
 * - 构建和验证用户消息
 * - 调用 AI 服务发送消息
 * - 处理流式响应
 * - 管理发送状态（idle/sending/streaming/error）
 */

import { ref, type Ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { MessagePart } from '@/types/chat'
// TODO: 将 aiChatService.js 迁移到 TypeScript 后，这些类型将可用
// import type { WebSearchRequestOptions, ReasoningRequestOptions, SamplingParameterOverrides } from '@/services/aiChatService'
// @ts-ignore - aiChatService.js 是 JavaScript 文件
import aiChatService from '@/services/aiChatService.js'
import { useAppStore } from '@/stores'
import { useConversationStore } from '@/stores/conversation'
import { useBranchStore } from '@/stores/branch'
import { usePersistenceStore } from '@/stores/persistence'

// 临时类型定义（等待 aiChatService 迁移到 TypeScript）
type WebSearchRequestOptions = any
type ReasoningRequestOptions = any
type SamplingParameterOverrides = any

export interface MessageSendingOptions {
  conversationId: string
  model: string
  abortController: Ref<AbortController | null>
}

export interface SendMessagePayload {
  text?: string
  images?: string[] // Data URIs
  files?: Array<{
    id: string
    name: string
    dataUrl: string
    size: number
    mimeType?: string
  }>
  requestedModalities?: string[]
  imageConfig?: any
}

export function useMessageSending(options: MessageSendingOptions) {
  const appStore = useAppStore()
  const conversationStore = useConversationStore()
  const branchStore = useBranchStore()
  const persistenceStore = usePersistenceStore()

  const isSending = ref(false)
  const isStreaming = ref(false)
  const streamingBranchId = ref<string | null>(null)
  const sendError = ref<string | null>(null)

  /**
   * 构建多模态消息的 parts 数组
   */
  function buildMessageParts(payload: SendMessagePayload): MessagePart[] {
    const parts: MessagePart[] = []

    // 添加文本部分
    if (payload.text?.trim()) {
      parts.push({
        type: 'text',
        text: payload.text.trim()
      })
    }

    // 添加文件部分
    if (payload.files && payload.files.length > 0) {
      for (const file of payload.files) {
        parts.push({
          id: file.id,
          type: 'file',
          file: {
            filename: file.name,
            file_data: file.dataUrl,
            mime_type: file.mimeType,
            size_bytes: file.size
          }
        })
      }
    }

    // 添加图片部分
    if (payload.images && payload.images.length > 0) {
      for (const imageDataUri of payload.images) {
        parts.push({
          id: uuidv4(),
          type: 'image_url',
          image_url: {
            url: imageDataUri
          }
        })
      }
    }

    return parts
  }

  /**
   * 验证消息是否有效
   */
  function validateMessage(parts: MessagePart[]): boolean {
    if (parts.length === 0) {
      sendError.value = '消息不能为空'
      return false
    }

    const hasContent = parts.some(part => {
      if (part.type === 'text') return part.text.trim().length > 0
      if (part.type === 'image_url') return !!part.image_url.url
      if (part.type === 'file') return !!part.file?.file_data
      return false
    })

    if (!hasContent) {
      sendError.value = '消息不能为空'
      return false
    }

    sendError.value = null
    return true
  }

  /**
   * 发送消息的核心逻辑
   */
  async function sendMessage(
    payload: SendMessagePayload,
    requestOptions?: {
      webSearch?: WebSearchRequestOptions
      reasoning?: ReasoningRequestOptions
      parameters?: SamplingParameterOverrides
      pdfEngine?: string
      systemInstruction?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    // 🔒 固化上下文
    const targetConversationId = options.conversationId

    try {
      // 重置状态
      sendError.value = null
      isSending.value = true

      // 构建消息 parts
      const messageParts = buildMessageParts(payload)

      // 验证消息
      if (!validateMessage(messageParts)) {
        return { success: false, error: sendError.value || '消息验证失败' }
      }

      // 更新生成状态
      conversationStore.setGenerationStatus(targetConversationId, true)

      // 创建用户消息分支
      branchStore.addMessageBranch(
        targetConversationId,
        'user',
        messageParts
      )

      // 创建 AI 消息分支（初始为空）
      const aiBranchId = branchStore.addMessageBranch(
        targetConversationId,
        'assistant',
        [{ type: 'text', text: '' }]
      )

      // 更新流式状态
      isStreaming.value = true
      streamingBranchId.value = aiBranchId

      // 获取对话历史（用于 API 请求）
      const displayMessages = branchStore.getDisplayMessages(targetConversationId)
      const historyWithoutLastAI = displayMessages.slice(0, -1) // 移除刚创建的空 AI 消息

      // 提取用户消息文本（供 API 使用）
      const userMessageText = messageParts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')

      // 创建 AbortController
      const controller = new AbortController()
      options.abortController.value = controller

      // 发起流式请求
      const stream = aiChatService.streamChatResponse(
        appStore,
        historyWithoutLastAI,
        options.model,
        userMessageText,
        {
          signal: controller.signal,
          webSearch: requestOptions?.webSearch,
          requestedModalities: payload.requestedModalities,
          imageConfig: payload.imageConfig,
          reasoning: requestOptions?.reasoning,
          parameters: requestOptions?.parameters,
          pdfEngine: requestOptions?.pdfEngine,
          systemInstruction: requestOptions?.systemInstruction || null
        }
      )

      // 验证流对象
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('流式响应不可用')
      }

      // 流式读取响应
      const iterator = stream[Symbol.asyncIterator]()
      const firstResult = await iterator.next()

      if (firstResult.done) {
        throw new Error('流式响应立即结束（无内容）')
      }

      // 处理首个 chunk
      await processStreamChunk(firstResult.value, targetConversationId, aiBranchId)

      // 处理后续 chunks
      for await (const chunk of iterator) {
        await processStreamChunk(chunk, targetConversationId, aiBranchId)
      }

      // 流式完成
      isStreaming.value = false
      streamingBranchId.value = null
      conversationStore.setGenerationStatus(targetConversationId, false)

      // 标记为脏数据并保存
      persistenceStore.markConversationDirty(targetConversationId)
      // 自动保存由 persistence store 的自动存储机制处理

      return { success: true }
    } catch (error: any) {
      // 错误处理
      isStreaming.value = false
      streamingBranchId.value = null
      conversationStore.setGenerationStatus(targetConversationId, false)

      const errorMessage = error?.message || '发送失败'
      sendError.value = errorMessage
      conversationStore.setGenerationError(targetConversationId, errorMessage)

      return { success: false, error: errorMessage }
    } finally {
      isSending.value = false
      options.abortController.value = null
    }
  }

  /**
   * 处理流式 chunk
   */
  async function processStreamChunk(chunk: any, conversationId: string, aiBranchId: string) {
    // 文本 chunk
    if (chunk.type === 'text' && typeof chunk.text === 'string') {
      branchStore.appendToken(conversationId, aiBranchId, chunk.text)
      return
    }

    // 图片 chunk
    if (chunk.type === 'image' && chunk.url) {
      branchStore.appendImage(conversationId, aiBranchId, chunk.url)
      return
    }

    // 推理详情（保存到历史）
    if (chunk.type === 'reasoning_detail' && chunk.detail) {
      branchStore.appendReasoningDetail(conversationId, aiBranchId, chunk.detail)
      return
    }

    // 推理流式文本（UI 显示）
    if (chunk.type === 'reasoning_stream_text' && typeof chunk.text === 'string') {
      branchStore.appendReasoningStreamingText(conversationId, aiBranchId, chunk.text)
      return
    }

    // 推理汇总
    if (chunk.type === 'reasoning_summary' && typeof chunk.summary === 'string') {
      branchStore.setReasoningSummary(conversationId, aiBranchId, chunk.summary)
      return
    }

    // Usage 元数据
    if (chunk.type === 'metadata' && chunk.metadata) {
      branchStore.patchMetadata(conversationId, aiBranchId, () => ({
        usage: chunk.metadata.usage
      }))
      return
    }
  }

  /**
   * 取消发送
   */
  function cancelSending() {
    if (options.abortController.value) {
      options.abortController.value.abort()
      options.abortController.value = null
    }

    isStreaming.value = false
    streamingBranchId.value = null
    conversationStore.setGenerationStatus(options.conversationId, false)
  }

  return {
    // 状态
    isSending,
    isStreaming,
    streamingBranchId,
    sendError,

    // 方法
    sendMessage,
    cancelSending,
    buildMessageParts,
    validateMessage
  }
}
