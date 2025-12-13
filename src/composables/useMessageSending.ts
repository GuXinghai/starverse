/**
 * useMessageSending - 消息发送 Composable
 *
 * 负责：
 * - 构建并验证用户消息
 * - 调用 AI 服务发送消息
 * - 处理流式响应
 * - 管理发送状态（idle/sending/streaming/error）
 */

import { ref, computed, toRaw, type Ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { MessagePart } from '@/types/chat'
import type { AttachmentFile } from './useAttachmentManager'
import type { ParameterValidationError } from './useSamplingParameters'
import { aiChatService } from '@/services/aiChatService'
import { useAppStore } from '@/stores'
import { useConversationStore } from '@/stores/conversation'
import { useBranchStore } from '@/stores/branch'
import { usePersistenceStore } from '@/stores/persistence'

// 临时类型定义（等待完整迁移后从 providers.ts 导入）
type WebSearchRequestOptions = any
type ReasoningRequestOptions = any
type SamplingParameterOverrides = any
type AbortSource = 'user' | 'timeout' | 'other'

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
  validateAllParameters?: () => ParameterValidationError[]
}

export interface SendMessagePayload {
  text?: string
  images?: string[] // Data URIs
  files?: AttachmentFile[]
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

interface ChatDraftSnapshot {
  text: string
  images: string[]
  files: AttachmentFile[]
}

/**
 * 发送过程时间戳（用于性能诊断和日志分析）
 */
interface SendTiming {
  requestedAt: number                // 点击发送（或 delay 结束）时刻
  httpRequestStartedAt?: number      // HTTP 请求发出时刻
  httpResponseHeaderAt?: number      // 收到响应头时刻（可选，诊断用）
  firstChunkAt?: number              // 收到首个有效 chunk 时刻
  completedAt?: number               // 流式完成/取消/失败时刻
}

interface PendingSendContext {
  state: 'scheduled' | 'cancelled' | 'sent'
  
  /**
   * 发送阶段（面向 UI 和用户交互）
   * - delay: 延时计时器运行中（可撤回）
   * - requesting: 已发出 HTTP 请求，尚未收到首个 token（等待响应）
   * - streaming: 已收到首 token、开始流式追加（可中止）
   * - completed: 正常完成流式输出
   * - cancelled: 用户主动中止（不细分 before/after stream）
   * - failed: 错误终止（网络/服务端等）
   * - user_aborted: 用户主动中止（内部状态）
   * - cancelled_before_stream: 请求阶段中止
   * - cancelled_during_stream: 流式阶段中止
   */
  phase: 'delay' | 'requesting' | 'streaming' | 'completed' | 'cancelled' | 'failed' | 'user_aborted' | 'cancelled_before_stream' | 'cancelled_during_stream'
  
  timerId: number | null
  countdownIntervalId: number | null  // 倒计时间隔定时器ID
  conversationId: string
  userMessageId: string
  noticeMessageId: string | null
  assistantMessageId?: string  // 流式开始时创建的 assistant 消息 ID（可选，在收到第一个 chunk 时创建）
  payloadSnapshot: SendMessagePayload
  requestOptions: SendRequestOptions
  draftBackup: ChatDraftSnapshot
  
  /**
   * 取消时是否已经开始 streaming（用于区分是否保留 partial 内容）
   */
  cancelledAfterStreaming?: boolean
  
  /**
   * 时间戳记录（用于性能诊断）
   */
  timings: SendTiming
  
  completionPromise: Promise<{ success: boolean; error?: string; aborted?: boolean; message?: string }>
  resolveCompletion: (result: { success: boolean; error?: string; aborted?: boolean; message?: string }) => void
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
  const abortSource = ref<AbortSource | null>(null)
  const pendingSend = ref<PendingSendContext | null>(null)
  // ⭐ 只有在 delay 阶段才显示撤回按钮（requesting/streaming 阶段显示中止按钮）
  const isDelayPending = computed(() => {
    const result = pendingSend.value?.state === 'scheduled' && pendingSend.value?.phase === 'delay'
    
    // 🚨 互斥检查：isDelayPending 和 isStreaming 不能同时为 true
    if (result && isStreaming.value) {
      console.error('[useMessageSending] 🚨 状态互斥冲突！isDelayPending 和 isStreaming 同时为 true', {
        phase: pendingSend.value?.phase,
        state: pendingSend.value?.state,
        isStreaming: isStreaming.value
      })
    }
    return result
  })

  // ⭐ 是否可以中止（requesting 或 streaming 阶段）
  const isAbortable = computed(() => {
    const result = pendingSend.value?.phase === 'requesting' || pendingSend.value?.phase === 'streaming' || isStreaming.value
    return result
  })

  // 🛡️ 超时保护定时器引用
  let firstTokenTimeoutTimer: number | null = null  // 首token超时定时器
  let streamIdleTimeoutTimer: number | null = null  // 流式空闲超时定时器

  /**
   * 🚨 强制重置发送状态（用于紧急恢复）
   * 
   * 当检测到状态卡死时调用，强制清理所有发送相关状态
   */
  function forceResetSendingState() {
    // 清理所有超时定时器
    clearAllTimeouts()
    
    // 取消网络请求
    if (abortController.value) {
      abortSource.value = 'other'
      abortController.value.abort()
      abortController.value = null
    }
    
    // 清理 pendingSend
    if (pendingSend.value) {
      const ctx = pendingSend.value
      if (ctx.timerId) {
        clearTimeout(ctx.timerId)
      }
      ctx.resolveCompletion({ success: false, error: 'Force reset by user' })
      pendingSend.value = null
    }
    
    // 重置所有状态标志
    isSending.value = false
    isStreaming.value = false
    streamingBranchId.value = null
    sendError.value = null
    
    // 重置对话生成状态
    const conversationId = resolveConversationId()
    if (conversationId) {
      conversationStore.setGenerationStatus(conversationId, false)
    }
  }

  /**
   * 🕐 超时保护机制 - 精细化版本
   *
   * 区分两种超时场景：
   * - 首token超时：从请求发出到收到首个chunk的最大等待时间
   * - 流式空闲超时：流式过程中chunk间的最大间隔时间
   */

  // 超时配置常量
  const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 30000
  const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30000
  
  // 获取超时配置的辅助函数（集中处理 Ref 解包和默认值）
  const getFirstTokenTimeoutMs = () => {
    const configured = options.appStore?.firstTokenTimeoutMs?.value ?? 
                       appStore.firstTokenTimeoutMs?.value ?? 
                       DEFAULT_FIRST_TOKEN_TIMEOUT_MS
    return Math.max(0, Number(configured) || 0)
  }
  
  const getStreamIdleTimeoutMs = () => {
    const configured = options.appStore?.streamIdleTimeoutMs?.value ?? 
                       appStore.streamIdleTimeoutMs?.value ?? 
                       DEFAULT_STREAM_IDLE_TIMEOUT_MS
    return Math.max(0, Number(configured) || 0)
  }

  /**
   * 启动首token超时定时器
   * 当超过 firstTokenTimeoutMs 仍未收到首个chunk时触发
   */
  function startFirstTokenTimeout() {
    console.log('1️⃣ 首 Token 超时定时器启动')
    clearFirstTokenTimeout() // 防止重复启动

    const timeoutMs = getFirstTokenTimeoutMs()

    if (timeoutMs === 0) {
      return
    }

    const timeoutMessage = `首 token 超时：超过 ${timeoutMs}ms 未收到首个流式响应数据（服务器可能过载或网络异常）`

    firstTokenTimeoutTimer = window.setTimeout(() => {
      console.error('[useMessageSending] 🚨 首token超时 - 未在预期时间收到首个流式数据')
      handleTimeoutError('timeout_first_token', timeoutMessage)
    }, timeoutMs)
  }

  /**
   * 清除首token超时定时器
   */
  function clearFirstTokenTimeout() {
    if (firstTokenTimeoutTimer !== null) {
      clearTimeout(firstTokenTimeoutTimer)
      firstTokenTimeoutTimer = null
    }
  }

  /**
   * 刷新流式空闲超时定时器
   * 每次收到chunk时调用，确保流式过程不因网络波动而中断
   */
  function refreshStreamIdleTimeout() {
    clearStreamIdleTimeout() // 清除旧定时器

    const timeoutMs = getStreamIdleTimeoutMs()

    streamIdleTimeoutTimer = window.setTimeout(() => {
      console.error('[useMessageSending] 🚨 流式空闲超时 - 服务器停止发送数据')
      handleTimeoutError('timeout_idle', `流式传输中断：超过 ${timeoutMs}ms 未收到新数据`)
    }, timeoutMs)
  }

  /**
   * 清除流式空闲超时定时器
   */
  function clearStreamIdleTimeout() {
    if (streamIdleTimeoutTimer !== null) {
      clearTimeout(streamIdleTimeoutTimer)
      streamIdleTimeoutTimer = null
      console.log('[useMessageSending] 🕐 清除流式空闲超时定时器')
    }
  }

  /**
   * 清除所有超时定时器
   */
  function clearAllTimeouts() {
    clearFirstTokenTimeout()
    clearStreamIdleTimeout()
  }

  /**
   * 统一处理超时错误
   */
  function handleTimeoutError(errorCode: 'timeout_first_token' | 'timeout_idle', message: string) {
    // 标记 abort 来源，避免被误判为用户中止
    abortSource.value = 'timeout'

    // 立即清理所有定时器，防止重复触发
    clearAllTimeouts()

    // 强制中止当前发送
    if (abortController.value) {
      abortController.value.abort(errorCode)
    }

    // 设置错误状态
    sendError.value = message

    // 清理状态
    isSending.value = false
    isStreaming.value = false
    streamingBranchId.value = null

    // 重置对话生成状态
    const conversationId = resolveConversationId()
    if (conversationId) {
      conversationStore.setGenerationStatus(conversationId, false)
      conversationStore.setGenerationError(conversationId, { message })
    }

    // 💾 标记消息以支持重试
    if (pendingSend.value) {
      const ctx = pendingSend.value
      
      // 删除 notice 消息
      if (ctx.noticeMessageId) {
        branchStore.removeMessageBranch(ctx.conversationId, ctx.noticeMessageId)
      }

      // 标记 assistant 消息为可重试（区分 requesting 和 streaming 阶段）
      if (ctx.assistantMessageId) {
        const abortPhase = ctx.phase === 'streaming' ? 'streaming' : 'requesting'
        branchStore.patchMetadata(ctx.conversationId, ctx.assistantMessageId, () => ({
          aborted: true,
          abortedAt: Date.now(),
          abortPhase,
          canRetry: true
        }))
      } else {
        // 消息尚未创建（requesting 阶段超时）
      }

      ctx.phase = 'failed'
      ctx.resolveCompletion({
        success: false,
        error: message,
        aborted: false
      })
      pendingSend.value = null
    }
  }

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
    coreOptions: {
      conversationId: string
      userMessageId: string
      payloadSnapshot: SendMessagePayload
      requestOptions: SendRequestOptions
    }
  ): Promise<{ success: boolean; error?: string; aborted?: boolean; message?: string }> {
    const callId = `send-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const targetConversationId = coreOptions.conversationId
    if (!targetConversationId) {
      return { success: false, error: 'Missing conversation ID' }
    }

    const effectivePayload = coreOptions.payloadSnapshot
    abortSource.value = null

    // 🕐 启动首token超时保护
    startFirstTokenTimeout()

    try {
      if (options.validateAllParameters && options.isSamplingControlAvailable?.value) {
        const errors = options.validateAllParameters()
        if (errors.length > 0) {
          return { success: false, error: '参数校验未通过' }
        }
      }

      // 重置状态
      sendError.value = null
      isSending.value = true

      // 构建消息 parts
      const messageParts = buildMessageParts(effectivePayload)

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

      const rawMessages = branchStore._buildMessageHistoryForAPI(targetConversationId)
      
      // 🔧 关键修复：过滤逻辑必须排除当前消息 ID
      // 问题根源：用户消息在捕获快照前已经写入 Store
      // 解决方案：在过滤阶段就排除用户消息 ID，而不是等到校验时发现污染
      const userBranchId = coreOptions.userMessageId
      
      // ⭐ 创建 assistant 消息（流式开始前）
      console.log('3️⃣ Assistant 消息分支创建')
      const aiBranchId = branchStore.addMessageBranch(
        targetConversationId,
        'assistant',
        [{ type: 'text', text: '' }],
        userBranchId  // 🎯 关键：设置父消息为用户消息
      )
      
      // � 保存到 context（供 cancelSending 使用）
      if (pendingSend.value) {
        pendingSend.value.assistantMessageId = aiBranchId
      }
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // ✍️ 状态修改：立即设置流式状态（修复空白期问题）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      
      // 🔧 修复：创建消息后立即设置状态，避免空白期

      console.log('4️⃣ 生成状态设置为 receiving')
      conversationStore.setGenerationStatus(targetConversationId, 'receiving')
      
      // 更新流式状态
      isStreaming.value = true
      streamingBranchId.value = aiBranchId
      // - notice: 临时系统提示（"正在发送..."）
      // - openrouter: OpenRouter API 错误信息
      // - 当前 user/assistant 消息：这些是本次请求的上下文，不应作为历史
      const relevantMessages = rawMessages.filter((msg: any) => 
        msg.role !== 'notice' && 
        msg.role !== 'openrouter' &&
        msg.branchId !== userBranchId &&  // 🎯 排除当前用户消息
        msg.branchId !== aiBranchId        // 🎯 排除当前 assistant 消息
      )
      
      // 🛡️ 深拷贝防御：断开所有引用，确保快照独立
      // 必须拷贝 parts 数组和其中的对象，因为 MessagePart 可能包含嵌套对象
      const cleanHistorySnapshot = relevantMessages.map((msg: any) => ({
        ...msg,
        parts: msg.parts.map((part: any) => ({ ...part }))  // 深拷贝 parts 数组及元素
      }))

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
        console.log('2️⃣ 历史消息快照捕获')
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ✅ Plan A: 检查快照是否健康
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        if (cachedSnapshot && Array.isArray(cachedSnapshot)) {
          // 二次验证：确保快照未被意外污染（理论上已在捕获时排除，这里是双保险）
          const hasUserMsg = cachedSnapshot.some(msg => msg.branchId === excludeUserMsgId)
          const hasAiMsg = cachedSnapshot.some(msg => msg.branchId === excludeAiMsgId)
          
          if (!hasUserMsg && !hasAiMsg) {
            // ✅ INFO: 快照健康，直接使用
            return cachedSnapshot
          } else {
            // ⚠️ WARN: 快照被污染（这种情况不应该发生，说明过滤逻辑有 bug）
            console.error(`[useMessageSending] 🚨 快照被污染（过滤失败），启用 Plan B [${callId}]`, {
              hasUserMsg,
              hasAiMsg,
              snapshotLength: cachedSnapshot.length,
              reason: '快照包含当前消息 ID，过滤逻辑可能有 bug'
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
        // 🔧 Plan B: 从 Store 安全重建历史（简化版）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        try {
          // 重新获取最新数据
          const currentMessages = branchStore._buildMessageHistoryForAPI(targetConversationId)
          
          // 简化的过滤逻辑：只排除当前消息 ID（角色过滤已在快照捕获时完成）
          const filtered = currentMessages.filter((msg: any) => 
            msg.branchId !== excludeUserMsgId && 
            msg.branchId !== excludeAiMsgId
          )
          
          // 深拷贝（防止引用泄漏）
          return filtered.map((msg: any) => ({
            ...msg,
            parts: msg.parts.map((part: any) => ({ ...part }))
          }))
          
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
          webSearch: coreOptions.requestOptions.webSearch,
          requestedModalities: effectivePayload.requestedModalities || defaultRequestedModalities.value || undefined,
          imageConfig: effectivePayload.imageConfig ?? null,
          legacyReasoning: coreOptions.requestOptions.reasoning,
          legacyParameters: coreOptions.requestOptions.parameters,
          pdfEngine: coreOptions.requestOptions.pdfEngine,
          systemInstruction: coreOptions.requestOptions.systemInstruction || null
        }
      )

      // 校验流对象
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('流式响应不可用')
      }

      // 流式读取响应
      const iterator = stream[Symbol.asyncIterator]()
      console.log('8️⃣ 首个 Chunk 等待与接收')
      const firstResult = await iterator.next()
      
      // 🔍 DEBUG: 首个 chunk 接收
      console.log(`[useMessageSending] ✅ 收到首个 chunk [${callId}]`, {
        done: firstResult.done,
        hasValue: !!firstResult.value,
        chunkType: typeof firstResult.value === 'object' ? (firstResult.value as any)?.type : 'string',
        timestamp: Date.now()
      })

      console.log(`[useMessageSending] 🎉 收到第一个 chunk [${callId}]`, {
        done: firstResult.done,
        hasValue: !!firstResult.value,
        timestamp: Date.now()
      })

      if (firstResult.done) {
        throw new Error('流式响应立刻结束（无内容）')
      }

      // 注意：不在此处清除 firstTokenTimeout，而是在第一次进入 processStreamChunk 时清除
      // 原因：需要确认收到的是有效的 chunk，而不仅仅是 HTTP 连接建立

      // ⭐ 阶段转换：requesting -> streaming
      console.log('🔟 阶段转换：requesting → streaming')
      if (pendingSend.value && pendingSend.value.phase === 'requesting') {
        pendingSend.value.phase = 'streaming'
        
        // 🎯 更新系统提示消息为 streaming 阶段文案
        if (pendingSend.value.noticeMessageId) {
          branchStore.updateNoticeMessageText(
            targetConversationId,
            pendingSend.value.noticeMessageId,
            '收到首个流式回复块，正在流式显示回复，等待完成接收……'
          )
        }
      }

      // 处理第一个 chunk
      await processStreamChunk(firstResult.value, targetConversationId, aiBranchId)

      // 处理后续 chunks
      console.log('1️⃣7️⃣ Chunk 消费与 UI 更新')
      for await (const chunk of iterator) {
        await processStreamChunk(chunk, targetConversationId, aiBranchId)
      }

      // 流式完成
      console.log('2️⃣3️⃣ 流迭代器结束')
      isStreaming.value = false
      streamingBranchId.value = null
      console.log('2️⃣5️⃣ 生成状态重置为 idle')
      conversationStore.setGenerationStatus(targetConversationId, false)

      // ⭐ 阶段转换：streaming -> completed，并清理上下文
      console.log('2️⃣4️⃣ 阶段转换：streaming → completed')
      if (pendingSend.value && pendingSend.value.conversationId === targetConversationId) {
        pendingSend.value.phase = 'completed'
        
        // 🧹 删除 notice 消息（streaming 完成后）
        if (pendingSend.value.noticeMessageId) {
          branchStore.removeMessageBranch(
            pendingSend.value.conversationId,
            pendingSend.value.noticeMessageId
          )
        }
        
        pendingSend.value = null  // 清理上下文
      }

      // 标记脏数据并保存
      console.log('2️⃣6️⃣ 持久化保存')
      persistenceStore.markConversationDirty(targetConversationId)
      // 自动保存由 persistence store 的机制处理

      // ℹ️ 输入框清空已在 performSendMessage 中完成（用户点击发送后立即清空）

      console.log('2️⃣7️⃣ 完成 Promise 解决')
      return { success: true }
    } catch (error: any) {
      // 🔍 DEBUG: 检查错误类型
      const isAbortError = 
        error?.name === 'AbortError' || 
        error?.message?.includes('aborted') ||
        error?.message?.includes('BodyStreamBuffer was aborted') ||
        error?.message?.includes('user aborted') ||
        error?.code === 'ABORT_ERR'
      const abortReason = abortSource.value
      
      console.log('[useMessageSending] 🔍 捕获到错误', {
        errorName: error?.name,
        errorMessage: error?.message,
        errorCode: error?.code,
        isAbortError,
        abortReason,
        timeoutMessage: sendError.value,
        phase: pendingSend.value?.phase,
        conversationId: targetConversationId
      })
      
      // 错误处理
      isStreaming.value = false
      streamingBranchId.value = null
      conversationStore.setGenerationStatus(targetConversationId, false)

      // ⭐ 区分处理：用户主动中止 vs 真实错误
      if (isAbortError && abortReason === 'user') {
        // 🔵 用户主动中止：不是失败，不回滚消息
        
        if (pendingSend.value && pendingSend.value.conversationId === targetConversationId) {
          pendingSend.value.phase = 'user_aborted'
        }
        
        // 标记为中止状态（不是错误）
        conversationStore.setGenerationError(targetConversationId, null)
        
        // 返回 success: true，但带有 aborted 标记
        return { 
          success: true, 
          aborted: true,
          message: '用户中止了请求'
        }
      } else if (isAbortError && abortReason === 'timeout') {
        const timeoutMessage = sendError.value || error?.message || '请求超时'

        if (pendingSend.value && pendingSend.value.conversationId === targetConversationId) {
          pendingSend.value.phase = 'failed'
          
          // 💾 标记消息以支持重试（确保catch块也正确处理超时错误的消息标记）
          const ctx = pendingSend.value
          
          // 删除 notice 消息
          if (ctx.noticeMessageId) {
            console.log('[useMessageSending] 🧹 删除超时 notice 消息（catch块）')
            branchStore.removeMessageBranch(ctx.conversationId, ctx.noticeMessageId)
          }

          // 标记 assistant 消息为可重试
          if (ctx.assistantMessageId) {
            console.log('[useMessageSending] 🏷️ 标记 assistant 消息为可重试（catch块）', {
              phase: ctx.phase
            })
            
            const abortPhase = ctx.phase === 'streaming' ? 'streaming' : 'requesting'
            branchStore.patchMetadata(ctx.conversationId, ctx.assistantMessageId, () => ({
              aborted: true,
              abortedAt: Date.now(),
              abortPhase,
              canRetry: true
            }))
          }
        }

        conversationStore.setGenerationError(targetConversationId, { message: timeoutMessage })
        return { success: false, error: timeoutMessage }
      } else if (isAbortError) {
        const abortMessage = error?.message || '请求被中止'

        if (pendingSend.value && pendingSend.value.conversationId === targetConversationId) {
          pendingSend.value.phase = 'failed'
        }

        conversationStore.setGenerationError(targetConversationId, { message: abortMessage })
        return { success: false, error: abortMessage }
      } else {
        // 🔴 真实错误：网络失败、API 错误等
        console.error('[useMessageSending] ❌ 真实错误发生', {
          error: error?.message || '发送失败',
          conversationId: targetConversationId
        })
        
        if (pendingSend.value && pendingSend.value.conversationId === targetConversationId) {
          pendingSend.value.phase = 'failed'
        }

        const errorMessage = error?.message || '发送失败'
        sendError.value = errorMessage
        conversationStore.setGenerationError(targetConversationId, { message: errorMessage })

        return { success: false, error: errorMessage }
      }
    } finally {
      // 🛡️ 强制清理：确保状态不会泄漏
      console.log('[useMessageSending] 🧹 finally: 清理发送状态')
      isSending.value = false
      abortController.value = null
      abortSource.value = null
      
      // 🛑 双重保险：清除所有超时定时器（防止任何路径泄漏）
      clearAllTimeouts()
      
      // 如果 pendingSend 还指向当前任务，清空它
      // （正常流程中应该在 finishPendingSend 中已经清空）
      if (pendingSend.value?.conversationId === targetConversationId) {
        console.log('[useMessageSending] 🧹 finally: 清理 pendingSend 残留')
        pendingSend.value = null
      }
    }
  }

  /**
   * 处理流式 chunk
   */
  function finishPendingSend(ctx: PendingSendContext): Promise<{ success: boolean; error?: string; aborted?: boolean; message?: string }> {
    console.log('[useMessageSending] 🔍 finishPendingSend 被调用', {
      hasPendingSend: !!pendingSend.value,
      ctxMatches: pendingSend.value === ctx,
      ctxState: ctx.state,
      globalPendingState: pendingSend.value?.state,
      conversationId: ctx.conversationId,
      timestamp: Date.now()
    })

    // 🚨 检测不匹配：当前上下文与全局状态不一致
    // Use toRaw to compare proxy with original object
    if (!pendingSend.value || toRaw(pendingSend.value) !== ctx) {
      console.error('[useMessageSending] 🚨 finishPendingSend: 上下文不匹配！', {
        hasGlobalPending: !!pendingSend.value,
        globalState: pendingSend.value?.state,
        currentCtxState: ctx.state,
        reason: !pendingSend.value ? '全局状态为空' : '上下文对象不同'
      })
      
      // 🛡️ 强制清理幽灵任务：如果当前任务已经创建了 UI 分支，必须处理
      if (ctx.state === 'scheduled') {
        console.error('[useMessageSending] 🔧 强制清理幽灵任务并接管发送流程')
        
        // 接管：将当前上下文设置为全局状态
        pendingSend.value = ctx
        
        // 继续正常流程（不要 return）
      } else {
        // 如果已经是 'sent' 或 'cancelled'，说明已经处理过了
        console.warn('[useMessageSending] ⚠️ 任务已处理，跳过')
        return ctx.completionPromise
      }
    }
    
    if (ctx.state !== 'scheduled') {
      console.warn('[useMessageSending] ⚠️ finishPendingSend: 状态不是 scheduled，直接返回', { state: ctx.state })
      return ctx.completionPromise
    }

    // Update via proxy to trigger reactivity
    if (pendingSend.value) {
      pendingSend.value.state = 'sent'
    } else {
      ctx.state = 'sent'
    }
    
    // 清理延时定时器
    if (ctx.timerId != null) {
      clearTimeout(ctx.timerId)
      ctx.timerId = null
    }
    
    // ⭐ 不再创建空的 assistant 消息占位符
    // assistant 消息将在收到第一个流式 chunk 时创建（见 sendMessageCore）
    ctx.assistantMessageId = undefined
    
    // ⭐ 阶段转换：delay -> requesting（此时用户已可见：用户消息 + 系统消息 + 空 assistant）
    console.log('[useMessageSending] 🔄 阶段切换前:', {
      oldPhase: ctx.phase,
      oldState: ctx.state,
      pendingSendValue: pendingSend.value === ctx
    })
    
    // 🚨 关键修复：通过 reactive proxy 修改 phase，触发响应式更新
    if (pendingSend.value) {
      pendingSend.value.phase = 'requesting'
      pendingSend.value.timings.httpRequestStartedAt = Date.now()
    } else {
      // Fallback (should not happen due to check above)
      ctx.phase = 'requesting'
      ctx.timings.httpRequestStartedAt = Date.now()
    }
    
    console.log('[useMessageSending] 🔄 阶段切换后:', {
      newPhase: ctx.phase,
      newState: ctx.state,
      pendingSendPhase: pendingSend.value?.phase,
      pendingSendState: pendingSend.value?.state,
      note: '已通过 proxy 触发响应式更新'
    })
    
    branchStore.updateNoticeMessageText(ctx.conversationId, ctx.noticeMessageId, '消息已发送，等待流式回复……')
    // ⚠️ 保留 pendingSend.value 引用，以便 cancelSending 判断阶段和中止请求

    console.log('[useMessageSending] 🚀 准备调用 sendMessageCore', {
      conversationId: ctx.conversationId,
      userMessageId: ctx.userMessageId,
      hasPayload: !!ctx.payloadSnapshot,
      timestamp: Date.now()
    })

    const sendPromise = sendMessageCore({
      conversationId: ctx.conversationId,
      userMessageId: ctx.userMessageId,
      payloadSnapshot: ctx.payloadSnapshot,
      requestOptions: ctx.requestOptions
    })
    
    sendPromise
      .then(result => {
        console.log('[useMessageSending] ✅ sendMessageCore 完成', result)
        ctx.resolveCompletion(result)
      })
      .catch(err => {
        console.error('[useMessageSending] ❌ sendMessageCore 失败', err)
        ctx.rejectCompletion(err)
      })
    
    return sendPromise
  }

  function undoPendingSend(): void {
    console.log('[useMessageSending] 🔍 undoPendingSend 被调用', {
      hasPending: !!pendingSend.value,
      state: pendingSend.value?.state,
      phase: pendingSend.value?.phase,
      isStreaming: isStreaming.value,
      stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
    })
    
    const ctx = pendingSend.value
    if (!ctx || ctx.state !== 'scheduled') {
      console.warn('[useMessageSending] ⚠️ 撤回失败：无效的 pending 状态', {
        hasCtx: !!ctx,
        state: ctx?.state
      })
      return
    }

    // 🚨 严格阶段检查：只允许在 'delay' 阶段撤回
    if (ctx.phase !== 'delay') {
      console.error('[useMessageSending] 🚨 撤回失败：当前阶段不是 delay（可能是 UI 状态不同步导致）', {
        currentPhase: ctx.phase,
        isDelayPending: isDelayPending.value,
        isAbortable: isAbortable.value,
        note: '如果看到此错误，说明 UI 层的 sendDelayPending 计算错误'
      })
      return
    }

    ctx.state = 'cancelled'
    if (ctx.timerId != null) {
      clearTimeout(ctx.timerId)
      ctx.timerId = null
    }
    if (ctx.countdownIntervalId != null) {
      clearInterval(ctx.countdownIntervalId)
      ctx.countdownIntervalId = null
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
    // 🔧 CRITICAL FIX: 第一次进入此函数时清除首 token 超时定时器
    // 原因：进入此函数说明 OpenRouterService 已经 yield 了有效的 chunk
    // 这才是真正的"收到首 token"信号，而不是仅仅 HTTP 响应开始
    if (firstTokenTimeoutTimer !== null) {
      clearFirstTokenTimeout()
      console.log('9️⃣ 首 Token 超时定时器清除')
      console.log('[useMessageSending] ✅ 收到首个有效 chunk，清除首 token 超时定时器')
    }

    // 🕐 每次收到chunk时刷新流式空闲超时定时器
    refreshStreamIdleTimeout()

    // 🔍 DEBUG: 记录所有接收到的 chunk（详细版）
    const chunkInfo: Record<string, any> = {
      type: chunk.type,
      conversationId,
      aiBranchId,
      timestamp: Date.now()
    }
    
    // 根据 chunk 类型添加额外信息
    if (chunk.type === 'text') {
      chunkInfo['contentLength'] = (chunk.content || chunk.text || '').length
      chunkInfo['contentPreview'] = (chunk.content || chunk.text || '').substring(0, 50)
    } else if (chunk.type === 'openrouter_error') {
      chunkInfo['status'] = chunk.status
      chunkInfo['errorMessage'] = chunk.error?.message
      chunkInfo['retryable'] = chunk.error?.retryable
    } else if (chunk.type === 'usage') {
      chunkInfo['usage'] = chunk.usage
    }
    
    console.log('[useMessageSending] 🔍 收到 chunk:', chunkInfo)

    // 🔧 NEW: OpenRouter 错误消息 - 创建 role: 'openrouter' 消息
    if (chunk.type === 'openrouter_error') {
      console.error('[useMessageSending] ❌ Received OpenRouter error:', chunk.error)
      
      // 删除 notice 消息（如果存在）
      if (pendingSend.value && pendingSend.value.noticeMessageId) {
        branchStore.removeMessageBranch(conversationId, pendingSend.value.noticeMessageId)
        pendingSend.value.noticeMessageId = null
      }
      
      // 删除空的 assistant 消息
      branchStore.removeMessageBranch(conversationId, aiBranchId)
      
      // 创建 OpenRouter 错误消息
      const errorText = `⚠️ OpenRouter API 错误 (${chunk.status})\n\n${chunk.error.message}\n\n` +
        (chunk.error.statusName ? `**状态**: ${chunk.error.statusName}\n\n` : '') +
        (chunk.error.officialMeaning ? `**官方说明**: ${chunk.error.officialMeaning}\n\n` : '') +
        (chunk.error.typicalCauses ? `**常见原因**:\n${chunk.error.typicalCauses}\n\n` : '') +
        (chunk.error.retryable ? '✅ 此错误可以重试，请点击"重新生成"按钮。' : '❌ 此错误不可重试，请检查配置。')
      
      const errorBranchId = branchStore.addMessageBranch(
        conversationId,
        'openrouter',
        [{ type: 'text', text: errorText }]
      )
      
      // 保存错误元数据
      branchStore.patchMetadata(conversationId, errorBranchId, () => ({
        error: {
          status: chunk.status,
          message: chunk.error.message,
          statusName: chunk.error.statusName,
          officialMeaning: chunk.error.officialMeaning,
          typicalCauses: chunk.error.typicalCauses,
          retryable: chunk.error.retryable,
          retryAfter: chunk.error.retryAfter,
          responseText: chunk.responseText
        }
      }))
      
      return
    }

    // 🔧 FIX: 文本 chunk - 支持两种字段名
    // - OpenRouterService 返回: {type: 'text', content: string}
    // - 其他服务可能返回: {type: 'text', text: string}
    if (chunk.type === 'text') {
      const textContent = chunk.content || chunk.text
      if (typeof textContent === 'string') {
        console.log('[useMessageSending] 🔄 即将调用 appendToken', {
          length: textContent.length,
          preview: textContent.substring(0, 50),
          conversationId,
          aiBranchId,
          timestamp: Date.now()
        })
        console.log('1️⃣8️⃣ Token 追加到 Store')
        branchStore.appendToken(conversationId, aiBranchId, textContent)
        console.log('[useMessageSending] ✅ appendToken 完成', {
          timestamp: Date.now()
        })
        return
      } else {
        console.warn('[useMessageSending] ⚠️ 收到类型为 text 的 chunk，但 content/text 字段非字符串:', {
          contentType: typeof textContent,
          contentValue: textContent,
          chunkKeys: Object.keys(chunk)
        })
        return
      }
    }

    // 图片 chunk（仅接受 content 字段，provider 已统一为 data URI/URL）
    if (chunk.type === 'image') {
      const imageContent = typeof chunk.content === 'string' ? chunk.content : ''
      if (imageContent) {
        console.log('[useMessageSending] 🖼️ Appending image:', imageContent.substring(0, 50))
        console.log('3️⃣2️⃣ 图片生成 Chunk')
        branchStore.appendImage(conversationId, aiBranchId, imageContent)
      } else {
        console.warn('[useMessageSending] ⚠️ image chunk 缺少 content 字段', {
          keys: Object.keys(chunk || {})
        })
      }
      return
    }

    // 推理详情（存储到历史）
    if (chunk.type === 'reasoning_detail' && chunk.detail) {
      console.log('[useMessageSending] 🧠 Appending reasoning detail:', chunk.detail)
      branchStore.appendReasoningDetail(conversationId, aiBranchId, chunk.detail)
      return
    }

    // 推理流文本（UI 显示）
    console.log('1️⃣9️⃣ 推理流文本处理（特殊处理）')
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
      console.log('2️⃣1️⃣ 使用量元数据保存')
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

    // ⚠️ 未识别的 chunk 类型 - 记录详细信息以便排查
    console.warn('[useMessageSending] ⚠️ 收到未处理的 chunk 类型:', {
      type: chunk.type,
      hasContent: !!chunk.content,
      hasText: !!chunk.text,
      hasDetail: !!chunk.detail,
      hasUsage: !!chunk.usage,
      chunkKeys: Object.keys(chunk),
      chunkPreview: JSON.stringify(chunk).substring(0, 200)
    })
  }

  /**
   * 取消发送 / 中止流式响应
   * 
   * 根据当前 phase 执行不同的中止逻辑：
   * - delay: 不应调用此函数（应使用 undoPendingSend）
   * - requesting: 保留用户消息，如果 assistant 消息已创建则标记为中止
   * - streaming: 保留已生成内容，标记流式被中止
   * - completed: 无操作
   */
  function cancelSending() {
    console.log('2️⃣9️⃣ 流中止（User Cancel）')
    const targetConversationId = resolveConversationId()
    const ctx = pendingSend.value
    abortSource.value = 'user'

    console.log('[useMessageSending] 🛑 cancelSending 被调用', {
      phase: ctx?.phase,
      conversationId: targetConversationId,
      hasAbortController: !!abortController.value,
      isStreaming: isStreaming.value
    })

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 Phase 1: Requesting（请求中，未收到首个 token）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (ctx && ctx.phase === 'requesting') {
      console.log('[useMessageSending] 📋 Phase = requesting: 中止请求，保留已发送的用户消息')

      // ⭐ 标记为中止状态
      ctx.phase = 'cancelled_before_stream'

      // 中止网络请求
      if (abortController.value) {
        console.log('[useMessageSending] 🛑 中止 AbortController')
        abortController.value.abort()
        abortController.value = null
      }

      // 删除 notice 消息
      if (ctx.noticeMessageId) {
        console.log('[useMessageSending] 🧹 删除 notice 消息')
        branchStore.removeMessageBranch(ctx.conversationId, ctx.noticeMessageId)
      }

      // ⚠️ 在 requesting 阶段，assistant 消息可能还未创建（新的流程）
      // 如果已创建，标记为中止；如果未创建，则只保留用户消息
      if (ctx.assistantMessageId) {
        console.log('[useMessageSending] 🏷️ 标记 assistant 消息为中止')
        branchStore.patchMetadata(ctx.conversationId, ctx.assistantMessageId, () => ({
          aborted: true,
          abortedAt: Date.now(),
          abortPhase: 'requesting',
          canRetry: true
        }))
      } else {
        console.log('[useMessageSending] ℹ️ assistant 消息尚未创建（请求阶段中止）')
      }

      console.log('[useMessageSending] ✅ 请求已中止，保留用户消息', {
        conversationId: ctx.conversationId,
        userMessageId: ctx.userMessageId,
        hasAssistantMessage: !!ctx.assistantMessageId
      })
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 Phase 2: Streaming（流式中，已收到至少一个 token）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else if (ctx && ctx.phase === 'streaming' && streamingBranchId.value) {
      console.log('[useMessageSending] 📋 Phase = streaming: 保留已生成内容，标记中止')

      // ⭐ 标记为中止状态
      ctx.phase = 'cancelled_during_stream'

      // 中止网络请求
      if (abortController.value) {
        console.log('[useMessageSending] 🛑 中止 AbortController')
        abortController.value.abort()
        abortController.value = null
      }

      // 删除 notice 消息
      if (ctx.noticeMessageId) {
        console.log('[useMessageSending] 🧹 删除 notice 消息')
        branchStore.removeMessageBranch(ctx.conversationId, ctx.noticeMessageId)
      }

      // ⭐ 标记为"流式被中止，内容不完整"
      console.log('3️⃣0️⃣ 用户中止的内容保留')
      branchStore.patchMetadata(ctx.conversationId, streamingBranchId.value, (existing: any) => ({
        ...existing,
        streamAborted: true,  // 不是error，是aborted
        abortedAt: Date.now(),
        abortPhase: 'streaming'
      }))

      console.log('[useMessageSending] ✅ 已标记流式被中止', {
        branchId: streamingBranchId.value,
        conversationId: targetConversationId
      })
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔍 Phase 3: 兜底逻辑（无上下文或其他情况）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    else {
      console.warn('[useMessageSending] ⚠️ cancelSending: 无匹配的 phase 或上下文', {
        hasContext: !!ctx,
        phase: ctx?.phase,
        isStreaming: isStreaming.value
      })

      // 兜底：仍然尝试中止网络请求
      if (abortController.value) {
        abortController.value.abort()
        abortController.value = null
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🧹 通用清理逻辑
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 🛑 清除所有超时定时器（防止幽灵超时）
    clearAllTimeouts()
    console.log('[useMessageSending] 🕐 已清除所有超时定时器（用户中止）')
    
    isStreaming.value = false
    streamingBranchId.value = null
    if (targetConversationId) {
      conversationStore.setGenerationStatus(targetConversationId, false)
    }

    // 清理上下文
    if (ctx) {
      ctx.resolveCompletion({ success: false, error: 'Cancelled by user' })
      pendingSend.value = null
    }

    console.log('[useMessageSending] 🧹 cancelSending 完成清理')
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
      hasPendingSend: !!pendingSend.value,
      pendingSendState: pendingSend.value?.state,
      timestamp: Date.now()
    })

    const targetConversationId = resolveConversationId()
    if (!targetConversationId) {
      return { success: false, error: '缺少有效的对话ID' }
    }

    // 🛡️ 并发保护：检查是否有幽灵任务（脏状态）
    if (pendingSend.value) {
      const existingCtx = pendingSend.value
      
      // 如果是正在调度的任务，阻止重复发送
      if (existingCtx.state === 'scheduled') {
        console.warn('[useMessageSending] ⚠️ 检测到正在调度的任务，阻止重复发送')
        return { success: false, error: '已存在一个待发送的消息' }
      }
      
      // 🚨 检测幽灵任务：状态是 'sent' 但没有对应的网络请求
      if (existingCtx.state === 'sent') {
        console.error('[useMessageSending] 🚨 检测到幽灵任务（脏状态），强制清理', {
          conversationId: existingCtx.conversationId,
          userMessageId: existingCtx.userMessageId,
          state: existingCtx.state
        })
        
        // 强制清理：取消计时器、清空全局状态
        if (existingCtx.timerId != null) {
          clearTimeout(existingCtx.timerId)
        }
        pendingSend.value = null
        
        // 重置发送状态
        isSending.value = false
        isStreaming.value = false
        
        console.log('[useMessageSending] ✅ 幽灵任务已清理，继续正常发送流程')
      }
    }

    console.log('3️⃣3️⃣ Web 搜索结果整合')
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
      return { success: false, error: sendError.value || '消息校验失败' }
    }

    // 🔧 关键修复：用户消息必须接在对话历史末尾，建立完整的消息链
    // 1. 获取当前对话路径的最后一条消息
    const conversation = conversationStore.getConversationById(targetConversationId)
    if (!conversation) {
      return { success: false, error: '对话不存在' }
    }
    
    const tree = conversation.tree as any
    const currentPath: string[] = Array.isArray(tree?.currentPath) ? tree.currentPath : []
    const lastBranchId = currentPath.length > 0
      ? currentPath[currentPath.length - 1]
      : null
    
    console.log('[useMessageSending] 📍 创建用户消息', {
      conversationId: targetConversationId,
      parentBranchId: lastBranchId,
      currentPathLength: currentPath.length,
      isRootMessage: lastBranchId === null
    })

    // 2. 创建用户消息，接在历史记录后面
    const userMessageId = branchStore.addMessageBranch(
      targetConversationId,
      'user',
      messageParts,
      lastBranchId  // ✅ 设置父消息为对话历史的最后一条消息
    )

    // 🎯 立即清空输入框（用户体验优化：发送即清空）
    if (options.draftInput) {
      options.draftInput.value = ''
    }
    if (options.pendingAttachments) {
      options.pendingAttachments.value = []
    }
    if (options.pendingFiles) {
      options.pendingFiles.value = []
    }

    const delayMs = Math.max(0, appStore.sendDelayMs ?? 0)
    const delaySec = Math.ceil(delayMs / 1000)
    
    const noticeMessageId = branchStore.addNoticeMessage(
      targetConversationId,
      delayMs > 0 ? `消息准备发送，倒计时 ${delaySec}s...` : '消息准备发送……'
    )

    const draftBackup: ChatDraftSnapshot = {
      text: payloadSnapshot.text ?? '',
      images: payloadSnapshot.images ? [...payloadSnapshot.images] : [],
      files: payloadSnapshot.files ? payloadSnapshot.files.map(file => ({ ...file })) : []
    }

    let resolveCompletion: (result: { success: boolean; error?: string; aborted?: boolean; message?: string }) => void
    let rejectCompletion: (error: any) => void
    const completionPromise = new Promise<{ success: boolean; error?: string; aborted?: boolean; message?: string }>((resolve, reject) => {
      resolveCompletion = resolve
      rejectCompletion = reject
    })

    const ctx: PendingSendContext = {
      state: 'scheduled',
      phase: 'delay',  // ⭐ 初始阶段：延时中
      timerId: null,
      countdownIntervalId: null,
      conversationId: targetConversationId,
      userMessageId,
      noticeMessageId,
      payloadSnapshot,
      requestOptions: requestOverrides,
      draftBackup,
      timings: {
        requestedAt: Date.now()
      },
      completionPromise,
      resolveCompletion: resolveCompletion!,
      rejectCompletion: rejectCompletion!
    }

    pendingSend.value = ctx

    const finish = () => finishPendingSend(ctx)

    if (delayMs > 0) {
      // 设置倒计时更新定时器（每秒更新一次）
      const startTime = Date.now()
      const countdownInterval = window.setInterval(() => {
        const elapsed = Date.now() - startTime
        const remaining = Math.ceil((delayMs - elapsed) / 1000)
        
        if (remaining > 0 && ctx.noticeMessageId) {
          branchStore.updateNoticeMessageText(
            targetConversationId,
            ctx.noticeMessageId,
            `消息准备发送，倒计时 ${remaining}s...`
          )
        } else {
          clearInterval(countdownInterval)
        }
      }, 1000)
      
      // 存储间隔定时器ID
      ctx.countdownIntervalId = countdownInterval
      
      // 设置主延时定时器
      ctx.timerId = window.setTimeout(() => {
        clearInterval(countdownInterval)
        ctx.countdownIntervalId = null
        finish()
      }, delayMs)
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
    isAbortable,  // 是否可以中止（requesting/streaming 阶段）
    undoPendingSend,
    forceResetSendingState  // 🚨 紧急恢复方法
  }
}
