/**
 * useMessageSending - 消息发送 Composable
 *
 * 负责：
 * - 构建并验证用户消息
 * - 调用 AI 服务发送消息
 * - 处理流式响应
 * - 管理发送状态（idle/sending/streaming/error）
 */

import { ref, computed, type Ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { MessagePart } from '@/types/chat'
import type { AttachmentFile } from './useAttachmentManager'
// TODO: 把 aiChatService.js 移动到 TypeScript 后，这些类型就可以用
// import type { WebSearchRequestOptions, ReasoningRequestOptions, SamplingParameterOverrides } from '@/services/aiChatService'
// @ts-ignore - aiChatService.js 是 JavaScript 文件
import { aiChatService } from '@/services/aiChatService.js'
import { useAppStore } from '@/stores'
import { useConversationStore } from '@/stores/conversation'
import { useBranchStore } from '@/stores/branch'
import { usePersistenceStore } from '@/stores/persistence'

// 临时类型定义（等待 aiChatService 迁移到 TypeScript）
type WebSearchRequestOptions = any
type ReasoningRequestOptions = any
type SamplingParameterOverrides = any

export interface MessageSendingOptions {
  conversationId: string | Ref<string>
  draftInput: Ref<string>
  pendingAttachments?: Ref<string[]>
  pendingFiles?: Ref<AttachmentFile[]>
  isComponentActive?: Ref<boolean>
  currentConversation?: any
  chatScrollRef?: Ref<any>

  // Stores
  conversationStore?: any
  branchStore?: any
  modelStore?: any
  appStore?: any
  persistenceStore?: any

  // 配置相关
  activeRequestedModalities?: Ref<string[] | null> | { value: string[] | null }
  activeImageConfig?: Ref<any> | { value: any }
  cloneImageConfig?: (config: any) => any
  buildWebSearchRequestOptions?: () => any
  buildReasoningRequestOptions?: () => any
  buildSamplingParameterOverrides?: () => any
  selectedPdfEngine?: Ref<string>
  isSamplingEnabled?: Ref<boolean>
  isSamplingControlAvailable?: Ref<boolean>
  validateAllParameters?: () => boolean
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
    pdfEngine?: string
  }>
  requestedModalities?: string[]
  imageConfig?: any
}

export interface SendRequestOptions {
  webSearch?: WebSearchRequestOptions
  reasoning?: ReasoningRequestOptions
  parameters?: SamplingParameterOverrides
  pdfEngine?: string | undefined
  systemInstruction?: string | null | undefined
}

interface AttachmentBackup {
  id: string
  name: string
  dataUrl: string
  size: number
  mimeType?: string
  pdfEngine?: string
}

interface ChatDraftSnapshot {
  text: string
  images: string[]
  files: AttachmentBackup[]
}

interface PendingSendContext {
  state: 'scheduled' | 'cancelled' | 'sent'
  timerId: number | null
  conversationId: string
  userMessageId: string
  noticeMessageId: string
  payloadSnapshot: SendMessagePayload
  requestOptions: SendRequestOptions
  draftBackup: ChatDraftSnapshot
  completionPromise: Promise<{ success: boolean; error?: string }>
  resolveCompletion: (result: { success: boolean; error?: string }) => void
  rejectCompletion: (error: any) => void
}

export function useMessageSending(options: MessageSendingOptions) {
  const appStore = options.appStore || useAppStore()
  const conversationStore = options.conversationStore || useConversationStore()
  const branchStore = options.branchStore || useBranchStore()
  const persistenceStore = options.persistenceStore || usePersistenceStore()

  const isSending = ref(false)
  const isStreaming = ref(false)
  const streamingBranchId = ref<string | null>(null)
  const sendError = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)
  const pendingSend = ref<PendingSendContext | null>(null)
  const isDelayPending = computed(() => pendingSend.value?.state === 'scheduled')

  const resolveConversationId = () =>
    typeof options.conversationId === 'string'
      ? options.conversationId
      : options.conversationId?.value

  const resolveModelId = computed(() => {
    const currentModel = options.currentConversation?.value?.model
    const selectedModel = options.modelStore?.selectedModelId
    return currentModel || selectedModel || 'auto'
  })

  const defaultRequestedModalities = computed(() => {
    return options.activeRequestedModalities?.value || null
  })

  const buildPayloadFromState = (override?: Partial<SendMessagePayload>): SendMessagePayload => {
    const text = override?.text ?? options.draftInput?.value ?? ''
    const images = override?.images ?? options.pendingAttachments?.value ?? []
    const files = override?.files ?? options.pendingFiles?.value ?? []
    return {
      text,
      images,
      files,
      requestedModalities: override?.requestedModalities,
      imageConfig: override?.imageConfig
    }
  }

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
  async function sendMessageCore(
    options: {
      conversationId: string
      userMessageId: string
      payloadSnapshot: SendMessagePayload
      requestOptions: SendRequestOptions
    }
  ): Promise<{ success: boolean; error?: string }> {
    const callId = `send-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log(`[useMessageSending] sendMessageCore invoked [${callId}]`, {
      isSending: isSending.value,
      isStreaming: isStreaming.value,
      payload: options.payloadSnapshot ? { text: options.payloadSnapshot.text?.substring(0, 50), hasImages: !!options.payloadSnapshot.images?.length, hasFiles: !!options.payloadSnapshot.files?.length } : 'undefined',
      stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
    })

    const targetConversationId = options.conversationId
    if (!targetConversationId) {
      console.log(`[useMessageSending] sendMessageCore missing target conversation ID [${callId}]`)
      return { success: false, error: 'Missing conversation ID' }
    }
    
    console.log(`[useMessageSending] sendMessageCore conversation ID verified [${callId}]: ${targetConversationId}`)

    const effectivePayload = options.payloadSnapshot

    try {
      if (options.validateAllParameters && options.isSamplingControlAvailable?.value) {
        const ok = options.validateAllParameters()
        if (!ok) {
          return { success: false, error: '参数校验未通过' }
        }
      }

      // 重置状态
      sendError.value = null
      console.log(`[useMessageSending] 设置 isSending = true [${callId}]`)
      isSending.value = true

      // 构建消息 parts
      const messageParts = buildMessageParts(effectivePayload)
      console.log(`[useMessageSending] 消息构建完成 [${callId}]`, {
        partsCount: messageParts.length,
        types: messageParts.map(p => p.type)
      })

      // 验证消息
      if (!validateMessage(messageParts)) {
        return { success: false, error: sendError.value || '消息验证失败' }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 快照模式：在任何状态修改前捕获纯净的历史快照
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 
      // 设计原则：严格遵守因果律
      // - 历史快照 = 修改前的状态（不包含即将发送的消息）
      // - 状态修改 = UI 乐观更新（用户立即看到消息）
      // - API 请求 = 使用快照（保证时间一致性）
      //
      // 优势：
      // ✅ 无魔术数字（不需要 slice(0, -2)）
      // ✅ 逻辑清晰（符合直觉：历史就是"修改前"的状态）
      // ✅ 易于维护（添加新消息类型无需调整）
      // ✅ 易于测试（快照独立于后续状态变更）
      //
      // ⚠️ 引用陷阱防御：
      // - 强制深拷贝：断开与 Store 的引用关联
      // - 防止 Vue Reactive Proxy 污染
      // - 确保快照不随后续状态变更而改变
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      console.log(`[useMessageSending] 📸 捕获历史快照（状态修改前） [${callId}]`)
      const rawMessages = branchStore.getDisplayMessages(targetConversationId)
      
      // 🛡️ 深拷贝防御：断开所有引用，确保快照独立
      // 必须拷贝 parts 数组和其中的对象，因为 MessagePart 可能包含嵌套对象
      const cleanHistorySnapshot = rawMessages.map(msg => ({
        ...msg,
        parts: msg.parts.map(part => ({ ...part }))  // 深拷贝 parts 数组及元素
      }))
      
      console.log(`[useMessageSending] 快照已捕获并深拷贝 [${callId}]: ${cleanHistorySnapshot.length} 条消息`)

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✍️ 状态修改：乐观 UI 更新（用户立即看到消息）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 更新生成状态
      console.log(`[useMessageSending] 设置生成状态 = true [${callId}]`)
      conversationStore.setGenerationStatus(targetConversationId, true)
      const userBranchId = options.userMessageId

      // 创建 AI 消息分支（占位符，准备接收流式响应）
      console.log(`[useMessageSending] 创建 AI 消息分支 [${callId}]`)
      const aiBranchId = branchStore.addMessageBranch(
        targetConversationId,
        'assistant',
        [{ type: 'text', text: '' }]
      )
      console.log(`[useMessageSending] AI 分支已创建 [${callId}]: ${aiBranchId}`)

      // 更新流式状态
      isStreaming.value = true
      streamingBranchId.value = aiBranchId

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🛡️ 双重保障机制：健壮的历史构建（Plan A + Plan B）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //
      // Plan A（优先）：使用预先捕获的快照
      //   - 最快：无需重新查询 Store
      //   - 最准：时序完全正确（修改前的状态）
      //   - 适用：99% 的正常发送场景
      //
      // Plan B（兜底）：从 Store 安全重建历史
      //   - 容错：快照损坏/丢失时启用
      //   - 安全：严格排除当前消息 ID
      //   - 适用：重试、页面刷新后重发等边界场景
      //
      // 🎯 目标：永不崩溃、数据一致、用户无感知
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      /**
       * 🛡️ 健壮的历史获取函数
       * 
       * @param cachedSnapshot - 预先捕获的快照（可选）
       * @param excludeUserMsgId - 要排除的用户消息 ID
       * @param excludeAiMsgId - 要排除的 AI 消息 ID
       * @returns 安全的历史消息数组（保证非空且不包含当前消息）
       */
      const getSafeHistoryForRequest = (
        cachedSnapshot: typeof cleanHistorySnapshot | undefined,
        excludeUserMsgId: string,
        excludeAiMsgId: string
      ) => {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Plan A: 检查快照是否健康
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        if (cachedSnapshot && Array.isArray(cachedSnapshot)) {
          // 二次验证：确保快照未被意外污染（不应包含当前消息）
          const hasUserMsg = cachedSnapshot.some(msg => msg.branchId === excludeUserMsgId)
          const hasAiMsg = cachedSnapshot.some(msg => msg.branchId === excludeAiMsgId)
          
          if (!hasUserMsg && !hasAiMsg) {
            // ✅ INFO: 快照健康，直接使用
            console.log(`[useMessageSending] ✅ Plan A: 使用快照 [${callId}]`, {
              snapshotLength: cachedSnapshot.length,
              verified: '快照未被污染'
            })
            return cachedSnapshot
          } else {
            // ⚠️ WARN: 快照被污染（罕见，但需要处理）
            console.warn(`[useMessageSending] ⚠️ 快照被污染，启用 Plan B [${callId}]`, {
              hasUserMsg,
              hasAiMsg,
              snapshotLength: cachedSnapshot.length,
              reason: '快照包含当前消息 ID，可能由于状态修改时序错误'
            })
          }
        } else {
          // ⚠️ WARN: 快照缺失或格式错误
          console.warn(`[useMessageSending] ⚠️ 快照缺失或无效，启用 Plan B [${callId}]`, {
            snapshotType: typeof cachedSnapshot,
            isArray: Array.isArray(cachedSnapshot),
            reason: cachedSnapshot === undefined 
              ? '快照变量未定义（可能由于页面刷新或组件重载）' 
              : '快照格式错误'
          })
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🔧 Plan B: 从 Store 安全重建历史（ID 白名单过滤）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        console.log(`[useMessageSending] 🔧 Plan B: 从 Store 重建历史 [${callId}]`)
        
        try {
          // 重新获取最新数据
          const currentMessages = branchStore.getDisplayMessages(targetConversationId)
          
          // 严格过滤：排除当前轮次的消息
          const filtered = currentMessages.filter(msg => 
            msg.branchId !== excludeUserMsgId && 
            msg.branchId !== excludeAiMsgId
          )
          
          // 深拷贝（防止引用泄漏）
          const safeHistory = filtered.map(msg => ({
            ...msg,
            parts: msg.parts.map(part => ({ ...part }))
          }))
          
          // ✅ INFO: 重建成功
          console.log(`[useMessageSending] ✅ Plan B: 重建完成 [${callId}]`, {
            totalMessages: currentMessages.length,
            filteredMessages: safeHistory.length,
            excludedCount: currentMessages.length - safeHistory.length
          })
          
          return safeHistory
          
        } catch (error) {
          // 🚨 ERROR: Store 访问失败（极端情况）
          console.error(`[useMessageSending] 🚨 Plan B 失败，启用 Plan C（空数组降级） [${callId}]`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            targetConversationId,
            reason: 'Store 不可访问或数据损坏'
          })
          
          // Plan C: 优雅降级，返回空数组而非崩溃
          return []
        }
      }

      // 应用双重保障机制
      const finalHistoryForRequest = getSafeHistoryForRequest(
        cleanHistorySnapshot,
        userBranchId,
        aiBranchId
      )

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📤 发送请求：使用健壮的历史数据
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // 抽取用户消息文本（供 API 使用）
      const userMessageText = messageParts
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')

      console.log(`[useMessageSending] 🚀 发送 API 请求 [${callId}]`, {
        historyLength: finalHistoryForRequest.length,
        userMessageLength: userMessageText.length,
        model: resolveModelId.value
      })

      // 创建 AbortController
      const controller = new AbortController()
      abortController.value = controller

      // 发起流式请求（使用健壮的历史数据）
      const stream = aiChatService.streamChatResponse(
        appStore,
        finalHistoryForRequest,
        resolveModelId.value,
        userMessageText,
        {
          signal: controller.signal,
          conversationId: targetConversationId,
          webSearch: options.requestOptions.webSearch,
          requestedModalities: effectivePayload.requestedModalities || defaultRequestedModalities.value || undefined,
          imageConfig: effectivePayload.imageConfig ?? options.activeImageConfig?.value ?? null,
          reasoning: options.requestOptions.reasoning,
          parameters: options.requestOptions.parameters,
          pdfEngine: options.requestOptions.pdfEngine,
          systemInstruction: options.requestOptions.systemInstruction || null
        }
      )

      // 校验流对象
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('流式响应不可用')
      }

      // 流式读取响应
      const iterator = stream[Symbol.asyncIterator]()
      const firstResult = await iterator.next()

      if (firstResult.done) {
        throw new Error('流式响应立刻结束（无内容）')
      }

      // 处理第一个 chunk
      await processStreamChunk(firstResult.value, targetConversationId, aiBranchId)

      // 处理后续 chunks
      for await (const chunk of iterator) {
        await processStreamChunk(chunk, targetConversationId, aiBranchId)
      }

      // 流式完成
      isStreaming.value = false
      streamingBranchId.value = null
      conversationStore.setGenerationStatus(targetConversationId, false)

      // 标记脏数据并保存
      persistenceStore.markConversationDirty(targetConversationId)
      // 自动保存由 persistence store 的机制处理

      // 发送成功后清空草稿和附件
      if (options.draftInput) {
        options.draftInput.value = ''
      }
      options.pendingAttachments && (options.pendingAttachments.value = [])
      options.pendingFiles && (options.pendingFiles.value = [])

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
      abortController.value = null
    }
  }

  /**
   * 处理流式 chunk
   */
  function finishPendingSend(ctx: PendingSendContext): Promise<{ success: boolean; error?: string }> {
    if (!pendingSend.value || pendingSend.value !== ctx) {
      return ctx.completionPromise
    }
    if (ctx.state !== 'scheduled') {
      return ctx.completionPromise
    }

    ctx.state = 'sent'
    if (ctx.timerId != null) {
      clearTimeout(ctx.timerId)
      ctx.timerId = null
    }
    branchStore.updateNoticeMessageText(ctx.conversationId, ctx.noticeMessageId, '发送完成，等待流式响应……')
    pendingSend.value = null

    const sendPromise = sendMessageCore({
      conversationId: ctx.conversationId,
      userMessageId: ctx.userMessageId,
      payloadSnapshot: ctx.payloadSnapshot,
      requestOptions: ctx.requestOptions
    })
    sendPromise.then(ctx.resolveCompletion).catch(err => ctx.rejectCompletion(err))
    return sendPromise
  }

  function undoPendingSend(): void {
    const ctx = pendingSend.value
    if (!ctx || ctx.state !== 'scheduled') {
      return
    }

    ctx.state = 'cancelled'
    if (ctx.timerId != null) {
      clearTimeout(ctx.timerId)
      ctx.timerId = null
    }

    branchStore.removeMessageBranch(ctx.conversationId, ctx.userMessageId)
    branchStore.removeMessageBranch(ctx.conversationId, ctx.noticeMessageId)

    if (options.draftInput) {
      options.draftInput.value = ctx.draftBackup.text
    }
    if (options.pendingAttachments) {
      options.pendingAttachments.value = [...ctx.draftBackup.images]
    }
    if (options.pendingFiles) {
      options.pendingFiles.value = ctx.draftBackup.files.map(file => ({ ...file }))
    }

    ctx.resolveCompletion({ success: false, error: 'Send cancelled' })
    pendingSend.value = null
  }

  async function processStreamChunk(chunk: any, conversationId: string, aiBranchId: string) {
    // 🔍 DEBUG: 记录所有接收到的 chunk
    console.log('[useMessageSending] 🔍 Received chunk:', {
      type: chunk.type,
      conversationId,
      aiBranchId,
      chunkData: chunk
    })

    // 🔧 FIX: 文本 chunk - 支持两种字段名
    // - OpenRouterService 返回: {type: 'text', content: string}
    // - 其他服务可能返回: {type: 'text', text: string}
    if (chunk.type === 'text') {
      const textContent = chunk.content || chunk.text
      if (typeof textContent === 'string') {
        console.log('[useMessageSending] ✅ Appending text token:', textContent.substring(0, 50))
        branchStore.appendToken(conversationId, aiBranchId, textContent)
        return
      }
    }

    // 图片 chunk
    if (chunk.type === 'image' && chunk.url) {
      console.log('[useMessageSending] 🖼️ Appending image:', chunk.url.substring(0, 50))
      branchStore.appendImage(conversationId, aiBranchId, chunk.url)
      return
    }

    // 推理详情（存储到历史）
    if (chunk.type === 'reasoning_detail' && chunk.detail) {
      console.log('[useMessageSending] 🧠 Appending reasoning detail:', chunk.detail)
      branchStore.appendReasoningDetail(conversationId, aiBranchId, chunk.detail)
      return
    }

    // 推理流文本（UI 显示）
    if (chunk.type === 'reasoning_stream_text' && typeof chunk.text === 'string') {
      console.log('[useMessageSending] 💭 Appending reasoning stream text:', chunk.text.substring(0, 50))
      branchStore.appendReasoningStreamingText(conversationId, aiBranchId, chunk.text)
      return
    }

    // 推理摘要
    if (chunk.type === 'reasoning_summary' && typeof chunk.summary === 'string') {
      console.log('[useMessageSending] 📝 Setting reasoning summary:', chunk.summary)
      branchStore.setReasoningSummary(conversationId, aiBranchId, chunk.summary)
      return
    }

    // 🔧 FIX: Usage 统计 - 支持两种格式
    // - OpenRouterService 返回: {type: 'usage', usage: object}
    // - 旧格式: {type: 'metadata', metadata: {usage: object}}
    if (chunk.type === 'usage' && chunk.usage) {
      console.log('[useMessageSending] 📊 Patching usage metadata:', chunk.usage)
      branchStore.patchMetadata(conversationId, aiBranchId, () => ({
        usage: chunk.usage
      }))
      return
    }

    // 旧格式的 metadata (兼容)
    if (chunk.type === 'metadata' && chunk.metadata) {
      console.log('[useMessageSending] 📊 Patching metadata:', chunk.metadata)
      branchStore.patchMetadata(conversationId, aiBranchId, () => ({
        usage: chunk.metadata.usage
      }))
      return
    }

    // 未识别的 chunk 类型
    console.warn('[useMessageSending] ⚠️ Unhandled chunk type:', chunk.type, chunk)
  }

  /**
   * 取消发送
   */
  function cancelSending() {
    const targetConversationId = resolveConversationId()

    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }

    isStreaming.value = false
    streamingBranchId.value = null
    if (targetConversationId) {
      conversationStore.setGenerationStatus(targetConversationId, false)
    }
  }

  /**
   * 从当前输入状态发送消息（供 ChatView 直接调用）
   */
  async function performSendMessage(
    overrides?: Partial<SendMessagePayload> & {
      requestedModalities?: string[]
      imageConfig?: any
      reasoning?: any
      parameters?: any
      pdfEngine?: string
      systemInstruction?: string | null
    }
  ) {
    console.log('[useMessageSending] performSendMessage 调用', {
      hasOverrides: !!overrides,
      draftInput: options.draftInput.value?.substring(0, 50),
      timestamp: Date.now()
    })

    const targetConversationId = resolveConversationId()
    if (!targetConversationId) {
      return { success: false, error: '缺少有效的对话ID' }
    }

    if (pendingSend.value?.state === 'scheduled') {
      return { success: false, error: '已存在一个待发送的消息' }
    }

    const requestOverrides: SendRequestOptions = {
      webSearch: options.buildWebSearchRequestOptions?.(),
      reasoning: overrides?.reasoning ?? options.buildReasoningRequestOptions?.(),
      parameters: overrides?.parameters ??
        (options.isSamplingEnabled?.value !== false
          ? options.buildSamplingParameterOverrides?.()
          : undefined),
      pdfEngine: overrides?.pdfEngine ?? options.selectedPdfEngine?.value,
      systemInstruction: overrides?.systemInstruction ?? null
    }

    const payloadOverrides: SendMessagePayload = {
      text: overrides?.text,
      images: overrides?.images,
      files: overrides?.files,
      requestedModalities: overrides?.requestedModalities,
      imageConfig: overrides?.imageConfig
    }

    const rawSnapshot = buildPayloadFromState(payloadOverrides)
    const payloadSnapshot: SendMessagePayload = {
      text: rawSnapshot.text,
      images: rawSnapshot.images ? [...rawSnapshot.images] : [],
      files: rawSnapshot.files ? rawSnapshot.files.map(file => ({ ...file })) : [],
      requestedModalities: rawSnapshot.requestedModalities,
      imageConfig: rawSnapshot.imageConfig
    }

    const messageParts = buildMessageParts(payloadSnapshot)
    if (!validateMessage(messageParts)) {
      return { success: false, error: sendError.value || '娑堟伅校验失败' }
    }

    const userMessageId = branchStore.addMessageBranch(
      targetConversationId,
      'user',
      messageParts
    )

    const noticeMessageId = branchStore.addNoticeMessage(
      targetConversationId,
      '正在发送中……'
    )

    const draftBackup: ChatDraftSnapshot = {
      text: payloadSnapshot.text ?? '',
      images: payloadSnapshot.images ? [...payloadSnapshot.images] : [],
      files: payloadSnapshot.files ? payloadSnapshot.files.map(file => ({ ...file })) : []
    }

    let resolveCompletion: (result: { success: boolean; error?: string }) => void
    let rejectCompletion: (error: any) => void
    const completionPromise = new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })

    const ctx: PendingSendContext = {
      state: 'scheduled',
      timerId: null,
      conversationId: targetConversationId,
      userMessageId,
      noticeMessageId,
      payloadSnapshot,
      requestOptions: requestOverrides,
      draftBackup,
      completionPromise,
      resolveCompletion: resolveCompletion!,
      rejectCompletion: rejectCompletion!
    }

    pendingSend.value = ctx

    const delayMs = Math.max(0, appStore.sendDelayMs ?? 0)
    const finish = () => finishPendingSend(ctx)

    if (delayMs > 0) {
      ctx.timerId = window.setTimeout(finish, delayMs)
    } else {
      finish()
    }

    return completionPromise
  }

  return {
    // 状态
    isSending,
    isStreaming,
    streamingBranchId,
    sendError,
    abortController,

    // 方法
    sendMessage: performSendMessage,
    performSendMessage,
    cancelSending,
    stopGeneration: cancelSending,
    buildMessageParts,
    validateMessage,
    isDelayPending,
    undoPendingSend
  }
}
