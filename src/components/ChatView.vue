<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

// @ts-ignore - chatStore.js is a JavaScript file
import { useChatStore } from '../stores/chatStore'
import { useAppStore } from '../stores'

// @ts-ignore - aiChatService.js is a JavaScript file
import { aiChatService } from '../services/aiChatService'

// 多模态工具函数
import { extractTextFromMessage } from '../types/chat'
import { electronApiBridge, isUsingElectronApiFallback } from '../utils/electronBridge'

import FavoriteModelSelector from './FavoriteModelSelector.vue'
import QuickModelSearch from './QuickModelSearch.vue'
import AdvancedModelPickerModal from './AdvancedModelPickerModal.vue'
import ContentRenderer from './ContentRenderer.vue'
import AttachmentPreview from './AttachmentPreview.vue'

// Props
const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const appStore = useAppStore()
const draftInput = ref('')
const chatContainer = ref<HTMLElement>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// ========== 多模态附件管理 ==========
const pendingAttachments = ref<string[]>([])
const MAX_IMAGE_SIZE_MB = 10  // 最大图片大小（MB）
const MAX_IMAGES_PER_MESSAGE = 5  // 单条消息最大图片数量

// 选择图片
const handleSelectImage = async () => {
  try {
    // 检查是否已达到最大数量
    if (pendingAttachments.value.length >= MAX_IMAGES_PER_MESSAGE) {
      alert(`每条消息最多只能添加 ${MAX_IMAGES_PER_MESSAGE} 张图片`)
      return
    }

    if (!electronApiBridge?.selectImage || isUsingElectronApiFallback) {
      alert('当前环境不支持选择图片，请在桌面应用中使用此功能。')
      console.warn('handleSelectImage: electronAPI bridge 不可用，已提示用户。')
      return
    }
    
    const dataUri = await electronApiBridge.selectImage()
    
    // 用户取消选择
    if (!dataUri) {
      console.log('ℹ️ 用户取消了图片选择')
      return
    }
    
    // 估算图片大小（base64 编码后的大小）
    const base64Part = dataUri.split(',')[1]
    const sizeInBytes = (base64Part.length * 3) / 4
    const sizeInMB = sizeInBytes / (1024 * 1024)
    
    // 检查文件大小
    if (sizeInMB > MAX_IMAGE_SIZE_MB) {
      alert(`图片文件过大（${sizeInMB.toFixed(2)} MB），请选择小于 ${MAX_IMAGE_SIZE_MB} MB 的图片`)
      return
    }
    
    pendingAttachments.value.push(dataUri)
    console.log('✓ 图片已添加到待发送列表，当前数量:', pendingAttachments.value.length, '大小:', sizeInMB.toFixed(2), 'MB')
  } catch (error) {
    console.error('❌ 选择图片失败:', error)
    alert('选择图片失败，请重试')
  }
}

// 移除附件
const removeAttachment = (index: number) => {
  pendingAttachments.value.splice(index, 1)
  console.log('✓ 已移除附件，剩余数量:', pendingAttachments.value.length)
}

// ========== 高级模型选择器状态 ==========
const showAdvancedModelPicker = ref(false)

const openAdvancedModelPicker = () => {
  showAdvancedModelPicker.value = true
}

const closeAdvancedModelPicker = () => {
  showAdvancedModelPicker.value = false
}

// ========== 删除确认状态 ==========
const deletingMessageId = ref<string | null>(null)

// ========== AbortController 管理 ==========
const abortController = ref<AbortController | null>(null)

// ========== 组件激活状态管理 ==========
// 由于不再使用 KeepAlive，我们通过 computed 判断当前组件是否处于激活状态
const isComponentActive = computed(() => {
  return chatStore.activeTabId === props.conversationId
})

// 编辑状态管理
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
const editingImages = ref<string[]>([])  // 编辑时的图片列表（Base64 Data URIs）

// 根据 conversationId 获取当前对话
const currentConversation = computed(() => {
  return chatStore.conversations.find((conv: any) => conv.id === props.conversationId) || null
})

// 格式化显示的模型名称（移除提供商前缀）
const displayModelName = computed(() => {
  const modelId = currentConversation.value?.model
  if (!modelId) return '选择模型'
  
  // 移除提供商前缀（如 openai/, anthropic/, google/ 等）
  const nameWithoutProvider = modelId.replace(/^[^/]+\//, '')
  
  // 移除英文冒号(:)或中文冒号(：)及之前的所有文字
  // 例如："OpenAI: GPT-4" -> "GPT-4"
  //       "gpt-4-turbo" -> "gpt-4-turbo" (无冒号，保持不变)
  return nameWithoutProvider.replace(/^[^:：]+[:：]\s*/, '')
})

// 🔍 智能模型筛选：有图片时提示用户选择支持视觉的模型
const needsVisionModel = computed(() => {
  return pendingAttachments.value.length > 0
})

// 检查当前模型是否支持视觉
const currentModelSupportsVision = computed(() => {
  const modelId = currentConversation.value?.model
  if (!modelId || !needsVisionModel.value) return true  // 无图片时不需要检查
  
  return aiChatService.supportsVision(appStore, modelId)
})

// 视觉模型警告提示
const visionModelWarning = computed(() => {
  if (!needsVisionModel.value) return ''
  if (currentModelSupportsVision.value) return ''
  
  return '⚠️ 当前模型不支持图像，请选择支持视觉的模型（如 GPT-4o、Gemini 1.5+、Claude 3）'
})

// 判断消息是否正在流式接收中
// 用于优化渲染性能：流式中显示纯文本，完成后才进行 Markdown/LaTeX 渲染
const isMessageStreaming = (messageIndex: number) => {
  if (!currentConversation.value) return false
  
  const messages = currentConversation.value.messages
  const generationStatus = currentConversation.value.generationStatus
  
  // 只有最后一条消息且状态为 receiving 时才是流式中
  const isLastMessage = messageIndex === messages.length - 1
  const isReceiving = generationStatus === 'receiving' || generationStatus === 'sending'
  
  return isLastMessage && isReceiving
}

// ========== 焦点管理函数 ==========
// 暴露给父组件调用的聚焦方法
const focusInput = () => {
  console.log('🎯 focusInput 被调用:', props.conversationId)
  
  // 检查文档是否有焦点（窗口是否激活）
  if (!document.hasFocus()) {
    console.warn('⚠️ 窗口未激活，跳过聚焦')
    return
  }
  
  if (!textareaRef.value) {
    console.warn('⚠️ textareaRef 为空，等待下一帧重试')
    requestAnimationFrame(() => {
      if (textareaRef.value) {
        textareaRef.value.focus()
        console.log('✅ 延迟聚焦成功')
      } else {
        console.error('❌ 延迟聚焦失败：textareaRef 仍为空')
      }
    })
    return
  }
  
  // 立即尝试聚焦
  textareaRef.value.focus()
  console.log('✅ 输入框已聚焦:', props.conversationId)
}

// 保留内部使用的焦点方法（用于初始化等场景）
const focusTextarea = () => {
  if (!isComponentActive.value) {
    console.log('⏭️ 跳过聚焦：组件未激活', props.conversationId)
    return
  }
  focusInput()
}

// 暴露方法给父组件
defineExpose({
  focusInput
})

// ========== 图像处理 ==========

/**
 * 处理图片点击：使用系统默认应用打开
 */
const handleImageClick = async (imageUrl: string) => {
  // 优先使用 Electron API（桌面应用）
  if (electronApiBridge.openImage) {
    try {
      const result = await electronApiBridge.openImage(imageUrl)
      if (!result.success) {
        console.error('❌ 使用系统应用打开图片失败:', result.error)
        // 失败时降级到浏览器打开
        window.open(imageUrl, '_blank')
      }
    } catch (error) {
      console.error('❌ 调用 Electron API 失败:', error)
      // 出错时降级到浏览器打开
      window.open(imageUrl, '_blank')
    }
  } else {
    // 如果不在 Electron 环境（如网页版），使用浏览器打开
    window.open(imageUrl, '_blank')
  }
}

/**
 * 下载图片
 */
const handleDownloadImage = async (imageUrl: string, filename: string) => {
  try {
    // 如果是 data URI，直接下载
    if (imageUrl.startsWith('data:')) {
      const link = document.createElement('a')
      link.href = imageUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      console.log('✓ 图片已下载（Data URI）:', filename)
    } else {
      // 如果是 HTTP(S) URL，需要先 fetch 然后下载
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // 释放 blob URL
      window.URL.revokeObjectURL(url)
      console.log('✓ 图片已下载（HTTP URL）:', filename)
    }
  } catch (error) {
    console.error('❌ 下载图片失败:', error)
    alert('下载图片失败，请尝试右键点击图片另存为')
  }
}

/**
 * 处理图片加载错误
 */
const handleImageLoadError = (event: Event) => {
  const img = event.target as HTMLImageElement
  console.error('❌ 图片加载失败:', img.src.substring(0, 100))
  // 可以设置一个默认的错误图片
  // img.src = '/path/to/error-image.png'
}

// ========== 生命周期管理 ==========

// 首次挂载
onMounted(() => {
  console.log('📌 ChatView 挂载:', props.conversationId)
  
  // 恢复草稿
  if (currentConversation.value?.draft) {
    draftInput.value = currentConversation.value.draft
  }
  
  // 如果组件挂载时就是激活状态，执行初始化
  if (isComponentActive.value) {
    // 使用双重 nextTick 确保 DOM 完全就绪
    nextTick(() => {
      nextTick(() => {
        scrollToBottom()
        // 再增加一个延迟，确保所有布局计算完成
        setTimeout(() => {
          focusTextarea()
        }, 100)
      })
    })
  }
})

// 组件卸载（对话被删除）
onUnmounted(() => {
  // ========== 🔒 固化上下文 ==========
  const targetConversationId = props.conversationId
  console.log('�️ ChatView 卸载:', targetConversationId)
  
  // 清理 AbortController
  if (abortController.value) {
    console.log('🛑 卸载时中止正在进行的请求')
    abortController.value.abort()
    abortController.value = null
  }
  
  // 最后一次保存草稿（如果对话还存在）
  if (currentConversation.value && draftInput.value) {
    chatStore.updateConversationDraft({
      conversationId: targetConversationId,
      draftText: draftInput.value
    })
  }
})

// ========== 监听激活状态变化（替代 onActivated/onDeactivated）==========
// 这是核心逻辑：监听组件是否处于激活状态
// 当 isComponentActive 从 false 变为 true 时，相当于 onActivated
// 当 isComponentActive 从 true 变为 false 时，相当于 onDeactivated
watch(isComponentActive, (newVal, oldVal) => {
  const targetConversationId = props.conversationId
  
  if (newVal && !oldVal) {
    // ========== 激活：相当于 onActivated ==========
    console.log('✨ ChatView 激活:', targetConversationId)
    
    // 恢复时重新滚动（不主动聚焦，由父组件控制）
    nextTick(() => {
      scrollToBottom()
    })
  } else if (!newVal && oldVal) {
    // ========== 停用：相当于 onDeactivated ==========
    console.log('💤 ChatView 停用:', targetConversationId)
    
    // 关键：停用时不再中止请求，让流在后台继续
    // 这样用户可以切换标签查看其他对话，而不影响正在生成的内容
    console.log('ℹ️ 标签页切换，但流式请求将在后台继续')
    
    // 保存草稿（双重保险，虽然 watch draftInput 已经在保存）
    if (draftInput.value !== currentConversation.value?.draft) {
      chatStore.updateConversationDraft({
        conversationId: targetConversationId,
        draftText: draftInput.value
      })
    }
  }
}, { immediate: false }) // 不立即执行，避免与 onMounted 重复

// 监听草稿变化并自动保存
watch(draftInput, (newValue) => {
  // 🔒 固化上下文：watch 回调执行时 props 可能已经变化
  const targetConversationId = props.conversationId
  
  chatStore.updateConversationDraft({
    conversationId: targetConversationId,
    draftText: newValue
  })
})

// 公共的发送消息逻辑（可被普通发送、重新生成、编辑后重发复用）
/**
 * 执行发送消息的核心逻辑
 * @param userMessage - 用户消息文本（可选）
 * @param messageParts - 用户消息的 parts 数组（可选，用于多模态消息）
 */
const performSendMessage = async (userMessage?: string, messageParts?: any[]) => {
  // ========== 🔒 固化上下文：在异步任务启动时捕获 conversationId ==========
  // 关键：必须在函数开始时立即捕获 props.conversationId
  // 防止在异步执行过程中（如标签切换）导致 props.conversationId 变化
  const targetConversationId = props.conversationId
  console.log('🔒 固化上下文 - conversationId:', targetConversationId)
  
  // ========== 前置检查（不设置状态） ==========
  if (!currentConversation.value) {
    console.error('找不到对话:', targetConversationId)
    return
  }

  // 【关键】禁止并发：检查生成状态，只有 idle 时才能发送
  if (currentConversation.value.generationStatus !== 'idle') {
    console.warn('⚠️ 对话正在生成中，请等待完成或停止后再试')
    return
  }

  // 检查当前 Provider 的 API Key 是否已配置
  const currentProvider = appStore.activeProvider
  let apiKey = ''
  
  if (currentProvider === 'Gemini') {
    apiKey = appStore.geminiApiKey
  } else if (currentProvider === 'OpenRouter') {
    apiKey = appStore.openRouterApiKey
  }
  
  if (!apiKey) {
    console.error(`API Key 检查失败 - ${currentProvider} API Key 未配置`)
    chatStore.addMessageToConversation(targetConversationId, {
      role: 'model',
      text: `错误：未设置 ${currentProvider} API Key，请先在设置页面配置。`
    })
    return
  }

  // ========== 创建新的中止控制器 ==========
  // 先清理旧的 controller，避免内存泄漏
  if (abortController.value) {
    console.log('⚠️ 检测到旧的 AbortController，先中止并清理')
    abortController.value.abort()
  }
  
  abortController.value = new AbortController()
  console.log('✓ 已创建新的 AbortController')

  // ========== 设置状态为 'sending' 并开始流式请求 ==========
  chatStore.setConversationGenerationStatus(targetConversationId, 'sending')

  // ========== 超时控制变量（在 try 外部声明以便在 catch/finally 中访问） ==========
  let timeoutId: number | null = null
  let hasReceivedData = false

  try {
    const conversationModel = currentConversation.value.model || chatStore.selectedModel

    // ========== 处理用户消息 ==========
    // 如果提供了新的用户消息或消息 parts，添加到对话中
    if (userMessage || messageParts) {
      // 🔍 调试：打印接收到的参数
      console.log('🔍 [DEBUG] performSendMessage 接收到的参数:', {
        userMessage,
        messageParts: messageParts ? JSON.stringify(messageParts, null, 2) : null
      })
      
      if (messageParts && messageParts.length > 0) {
        chatStore.addMessageToConversation(targetConversationId, {
          role: 'user',
          parts: messageParts
        })
      } else if (userMessage) {
        chatStore.addMessageToConversation(targetConversationId, {
          role: 'user',
          text: userMessage
        })
      }
      await nextTick()
      scrollToBottom()
    }

    // ========== 验证对话状态 ==========
    // 确保对话历史中最后一条消息是用户消息
    const currentMessages = currentConversation.value.messages
    if (currentMessages.length === 0 || currentMessages[currentMessages.length - 1].role !== 'user') {
      console.error('❌ 无法发送：对话历史中最后一条消息不是用户消息')
      throw new Error('对话状态异常：最后一条消息不是用户消息')
    }

    // 获取最后一条用户消息
    const lastUserMessage = currentMessages[currentMessages.length - 1]
    const userMessageText = extractTextFromMessage(lastUserMessage)

    console.log('📤 准备发送消息:', {
      conversationId: targetConversationId,
      messageCount: currentMessages.length,
      userMessageText: userMessageText.substring(0, 50) + '...'
    })

    // ========== 添加 AI 占位消息 ==========
    chatStore.addMessageToConversation(targetConversationId, {
      role: 'model',
      text: ''
    })

    await nextTick()
    scrollToBottom()

    // ========== 构建请求历史 ==========
    // 获取完整消息历史，去掉最后一条 AI 占位消息
    const historyForStream = currentConversation.value.messages.slice(0, -1)

    console.log('📜 构建请求历史:', {
      totalMessages: currentConversation.value.messages.length,
      historyLength: historyForStream.length,
      lastHistoryRole: historyForStream[historyForStream.length - 1]?.role
    })

    // ========== 🔧 关键修复：确定是否需要将用户消息作为独立参数传递 ==========
    // 场景1：发送新消息（userMessage 或 messageParts 有值）
    //   - historyForStream 已包含新添加的用户消息
    //   - 但某些 API 需要单独的 userMessage 参数
    //   - 传递 userMessageText
    // 场景2：重新生成回复（userMessage 和 messageParts 都为空）
    //   - historyForStream 已包含现有的用户消息
    //   - 不应该再次添加用户消息
    //   - 传递空字符串，让服务从历史中获取
    const userMessageForApi = (userMessage || messageParts) ? userMessageText : ''

    console.log('📝 用户消息参数:', {
      hasNewMessage: !!(userMessage || messageParts),
      userMessageForApi: userMessageForApi ? userMessageForApi.substring(0, 50) + '...' : '(空 - 从历史获取)'
    })

    // 发起流式请求（传入中止信号）
    // 使用新的 aiChatService 进行流式请求
    const stream = aiChatService.streamChatResponse(
      appStore,
      historyForStream,
      conversationModel,
      userMessageForApi,  // 🔧 使用计算后的值，而非直接的 userMessageText
      abortController.value.signal // 传递中止信号
    )

    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
      throw new Error('流式响应不可用')
    }

    // ========== 设置20秒超时机制 ==========
    const TIMEOUT_MS = 20000 // 20秒超时
    
    const setupTimeout = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      timeoutId = window.setTimeout(() => {
        if (!hasReceivedData) {
          console.warn('⏱️ 请求超时（20秒未收到响应），中止请求')
          abortController.value?.abort()
        }
      }, TIMEOUT_MS)
    }
    
    setupTimeout()

    // ========== 流式读取响应（使用固化的 conversationId） ==========
    let isFirstChunk = true
    for await (const chunk of stream) {
      // 【关键】第一次接收到数据时，切换到 'receiving' 状态
      // 使用固化的 targetConversationId 而非 props.conversationId
      if (isFirstChunk) {
        hasReceivedData = true // 标记已接收到数据
        if (timeoutId) {
          clearTimeout(timeoutId) // 清除超时定时器
          timeoutId = null
        }
        chatStore.setConversationGenerationStatus(targetConversationId, 'receiving')
        console.log('✓ 开始接收流式响应，状态切换为 receiving')
        isFirstChunk = false
      }

      // 处理不同类型的 chunk（文本或图片）
      if (typeof chunk === 'string') {
        // 旧格式：纯文本字符串（向后兼容）
        if (chunk) {
          chatStore.appendTokenToMessage(targetConversationId, chunk)
          await nextTick()
          scrollToBottom()
        }
      } else if (chunk && typeof chunk === 'object') {
        // 新格式：带类型的对象 { type: 'text' | 'image', content: '...' }
        if (chunk.type === 'text' && chunk.content) {
          chatStore.appendTokenToMessage(targetConversationId, chunk.content)
          await nextTick()
          scrollToBottom()
        } else if (chunk.type === 'image' && chunk.content) {
          // 接收到图片，添加到消息的 parts 中
          chatStore.appendImageToMessage(targetConversationId, chunk.content)
          await nextTick()
          scrollToBottom()
        }
      }
    }

    console.log('✓ 流式响应完成')
    
    // 清理超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  } catch (error: any) {
    // 清理超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    
    // ========== 错误处理：区分中止错误和其他错误 ==========
    // 检测中止错误的多种形式：
    // 1. 标准 AbortError
    // 2. Google AI SDK 的流中断错误
    // 3. 超时引起的中止
    const isAbortError = 
      error.name === 'AbortError' || 
      (error.message && error.message.includes('Error reading from the stream')) ||
      (error.message && error.message.includes('aborted'))
    
    const isTimeout = !hasReceivedData && isAbortError
    
    if (isTimeout) {
      console.warn('⏱️ 请求超时：20秒内未收到服务器响应')
      // 🚨 标记对话有错误
      chatStore.setConversationError(targetConversationId, true)
      
      const conversation = currentConversation.value
      if (conversation && conversation.messages.length > 0) {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (lastMessage && lastMessage.role === 'model') {
          chatStore.updateMessage(targetConversationId, lastMessage.id, '⏱️ 请求超时：服务器在20秒内未响应，请检查网络连接或稍后重试。')
        } else {
          chatStore.addMessageToConversation(targetConversationId, {
            role: 'model',
            text: '⏱️ 请求超时：服务器在20秒内未响应，请检查网络连接或稍后重试。'
          })
        }
      } else {
        chatStore.addMessageToConversation(targetConversationId, {
          role: 'model',
          text: '⏱️ 请求超时：服务器在20秒内未响应，请检查网络连接或稍后重试。'
        })
      }
    } else if (isAbortError) {
      console.log('ℹ️ 生成已中止（用户手动停止）')
      // 静默处理中止错误，不显示错误消息
      const conversation = currentConversation.value
      if (conversation && conversation.messages.length > 0) {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        const lastMessageText = extractTextFromMessage(lastMessage)
        if (lastMessage && lastMessage.role === 'model' && !lastMessageText) {
          // 如果最后一条消息是空的 AI 消息，使用 updateMessage 更新为提示
          chatStore.updateMessage(targetConversationId, lastMessage.id, '[已停止生成]')
        }
      }
      // 中止不算错误，清除错误标记
      chatStore.setConversationError(targetConversationId, false)
    } else {
      console.error('❌ 发送消息时出错:', error)
      
      // 🚨 标记对话有错误
      chatStore.setConversationError(targetConversationId, true)
      
      const errorMessage = error instanceof Error ? error.message : '无法连接到 AI 服务，请检查您的 API Key 是否正确。'
      const conversation = currentConversation.value

      // 尝试更新最后一条消息为错误信息（使用固化的 conversationId）
      if (conversation && conversation.messages.length > 0) {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (lastMessage && lastMessage.role === 'model') {
          chatStore.updateMessage(targetConversationId, lastMessage.id, `抱歉，发生了错误：${errorMessage}`)
        } else {
          chatStore.addMessageToConversation(targetConversationId, {
            role: 'model',
            text: `抱歉，发生了错误：${errorMessage}`
          })
        }
      } else {
        chatStore.addMessageToConversation(targetConversationId, {
          role: 'model',
          text: `抱歉，发生了错误：${errorMessage}`
        })
      }
    }
  } finally {
    // ========== 强制清理：使用固化的 conversationId 确保清理正确的对话 ==========
    console.log('🧹 清理：设置 generationStatus = idle for', targetConversationId)
    chatStore.setConversationGenerationStatus(targetConversationId, 'idle')
    
    // 清理 AbortController
    abortController.value = null
    
    await nextTick()
    scrollToBottom()
    
    // 保存对话（即使保存失败也不影响 UI 状态恢复）
    try {
      await chatStore.saveConversations()
      console.log('✓ 对话已保存')
    } catch (saveError) {
      console.error('❌ 保存对话失败:', saveError)
    }
  }
}

// 发送消息（从输入框）
const sendMessage = async () => {
  const trimmedMessage = draftInput.value.trim()
  const hasAttachments = pendingAttachments.value.length > 0

  // 必须有文本或附件
  if (!trimmedMessage && !hasAttachments) {
    return
  }

  // 构建多模态消息的 parts 数组
  const messageParts: any[] = []
  
  // 先添加文本部分（如果有）
  if (trimmedMessage) {
    messageParts.push({
      type: 'text',
      text: trimmedMessage
    })
  }
  
  // 再添加图片部分（如果有）
  for (const dataUri of pendingAttachments.value) {
    messageParts.push({
      type: 'image_url',
      image_url: {
        url: dataUri
      }
    })
  }

  console.log('📤 发送多模态消息:', {
    textLength: trimmedMessage.length,
    imageCount: pendingAttachments.value.length,
    totalParts: messageParts.length
  })
  
  // 🔍 调试：打印完整的 messageParts 结构
  console.log('🔍 [DEBUG] messageParts 详情:', JSON.stringify(messageParts, null, 2))
  
  // 调用发送逻辑（传入 parts 而非纯文本）
  await performSendMessage(trimmedMessage, messageParts)
  
  // 清空输入框和附件
  draftInput.value = ''
  pendingAttachments.value = []
}

// ========== 停止生成 ==========
const stopGeneration = () => {
  if (abortController.value) {
    console.log('🛑 用户请求停止生成')
    abortController.value.abort()
  }
}

const scrollToBottom = () => {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

// ========== 消息操作函数 ==========

// 开始删除消息确认
const startDeleteMessage = (messageId: string) => {
  deletingMessageId.value = messageId
}

// 确认删除消息
const confirmDeleteMessage = (messageId: string) => {
  const targetConversationId = props.conversationId
  chatStore.deleteMessage(targetConversationId, messageId)
  deletingMessageId.value = null
}

// 取消删除消息
const cancelDeleteMessage = () => {
  deletingMessageId.value = null
}

// 重新生成 AI 回复
const handleRetryMessage = async (messageId: string) => {
  // ========== 🔒 固化上下文 ==========
  const targetConversationId = props.conversationId
  
  if (!currentConversation.value) return

  // 截断从该消息开始的所有消息
  chatStore.truncateMessagesFrom(targetConversationId, messageId)
  
  // 获取截断后的历史记录（最后一条应该是用户消息）
  const messages = currentConversation.value.messages
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    console.error('无法重新生成：最后一条消息不是用户消息')
    return
  }
  
  // 🔧 修复：不需要传递 customHistory，performSendMessage 会自动使用当前对话的消息
  await performSendMessage()
}

// 进入编辑模式
const handleEditMessage = (messageId: string, message: any) => {
  editingMessageId.value = messageId
  
  // 提取文本和图片
  if (message.parts && Array.isArray(message.parts)) {
    // 新格式：从 parts 数组中提取
    const textParts = message.parts.filter((p: any) => p.type === 'text')
    const imageParts = message.parts.filter((p: any) => p.type === 'image_url')
    
    editingText.value = textParts.map((p: any) => p.text).join('\n')
    editingImages.value = imageParts.map((p: any) => p.image_url.url)
  } else {
    // 旧格式兼容
    editingText.value = extractTextFromMessage(message)
    editingImages.value = []
  }
}

// 取消编辑
const handleCancelEdit = () => {
  editingMessageId.value = null
  editingText.value = ''
  editingImages.value = []
}

// 移除编辑中的图片
const handleRemoveEditingImage = (index: number) => {
  editingImages.value.splice(index, 1)
}

// 添加图片到编辑中
const handleAddImageToEdit = async () => {
  if (!electronApiBridge?.selectImage || isUsingElectronApiFallback) {
    alert('图片选择功能在当前环境下不可用（需要 Electron 环境）')
    console.warn('handleAddImageToEdit: electronAPI bridge 不可用')
    return
  }
  
  try {
    const imageDataUri = await electronApiBridge.selectImage()
    if (imageDataUri) {
      editingImages.value.push(imageDataUri)
      console.log('✓ 已添加图片到编辑，当前数量:', editingImages.value.length)
    }
  } catch (error) {
    console.error('选择图片失败:', error)
  }
}

// 保存编辑并重新提交
const handleSaveEdit = async (messageId: string) => {
  // ========== 🔒 固化上下文 ==========
  const targetConversationId = props.conversationId
  
  const hasText = editingText.value.trim()
  const hasImages = editingImages.value.length > 0
  
  // 必须有文本或图片
  if (!hasText && !hasImages) {
    handleCancelEdit()
    return
  }

  // 找到该消息的索引
  const messages = currentConversation.value?.messages || []
  const messageIndex = messages.findIndex((msg: any) => msg.id === messageId)
  
  if (messageIndex === -1) {
    console.error('找不到要编辑的消息')
    return
  }

  // 构建新的 parts 数组
  const newParts: any[] = []
  
  // 添加文本部分
  if (hasText) {
    newParts.push({
      type: 'text',
      text: editingText.value.trim()
    })
  }
  
  // 添加图片部分
  for (const imageDataUri of editingImages.value) {
    newParts.push({
      type: 'image_url',
      image_url: {
        url: imageDataUri
      }
    })
  }

  // 更新消息内容为新的 parts 格式
  chatStore.updateMessageParts(targetConversationId, messageId, newParts)
  
  // 截断该消息之后的所有消息
  const nextMessageId = messages[messageIndex + 1]?.id
  if (nextMessageId) {
    chatStore.truncateMessagesFrom(targetConversationId, nextMessageId)
  }

  // 先退出编辑模式，让 UI 立即显示更新后的消息
  handleCancelEdit()
  
  // 等待 DOM 更新
  await nextTick()

  // 🔧 修复：重新发送时不需要传递参数，performSendMessage 会自动使用当前对话的消息
  await performSendMessage()
}

</script>

<template>
  <!-- ChatView 根元素：直接作为 flex 列布局，因为父组件已经用 absolute 定位 -->
  <div class="flex flex-col h-full w-full bg-gray-50" data-test-id="chat-view">
    <!-- 顶部工具栏 - 新的模型选择器布局 -->
    <div class="bg-white border-b border-gray-200 px-4 py-2 flex-shrink-0 w-full">
        <div class="flex items-center gap-4">
          <!-- 左侧：快速收藏模型选择器 -->
          <div class="flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
            <FavoriteModelSelector @open-advanced-picker="openAdvancedModelPicker" />
          </div>

          <!-- 右侧：快速搜索 + 高级模型选择器入口 -->
          <div class="flex items-center gap-2 flex-none shrink-0">
            <!-- 快速搜索按钮 -->
            <QuickModelSearch />
            
            <!-- 高级模型选择器入口 -->
            <button
              @click="openAdvancedModelPicker"
              class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md whitespace-nowrap"
              title="打开高级模型选择器"
            >
              <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span class="font-medium">
                {{ displayModelName }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 高级模型选择器模态框 -->
      <AdvancedModelPickerModal
        :is-open="showAdvancedModelPicker"
        @close="closeAdvancedModelPicker"
        @select="closeAdvancedModelPicker"
      />

      <!-- 消息滚动区：外层控制滚动，内层限制最大宽度 -->
      <div ref="chatContainer" class="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 w-full">
        <div class="space-y-4 max-w-5xl mx-auto">
          <!-- 空态提示 -->
          <div
            v-if="!currentConversation || currentConversation.messages.length === 0"
            class="text-center py-12"
          >
          <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-800 mb-2">开始与 AI 对话</h3>
          <p class="text-gray-600">发送消息开始聊天</p>
        </div>

        <div
          v-for="(message, index) in (currentConversation?.messages || [])"
          :key="message.id || index"
          class="flex group"
          :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        >
            <div class="flex items-end space-x-2 w-full max-w-md lg:max-w-2xl xl:max-w-4xl relative">
              <div
                v-if="message.role === 'model'"
                class="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mb-1"
              >
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
              </div>

              <div class="flex flex-col gap-2 flex-1">
                <!-- 消息内容或编辑框 -->
                <div
                  v-if="editingMessageId === message.id"
                  class="w-full"
                >
                  <!-- 编辑中的图片预览 -->
                  <div v-if="editingImages.length > 0" class="flex flex-wrap gap-2 mb-3">
                    <div
                      v-for="(imageUrl, imgIndex) in editingImages"
                      :key="imgIndex"
                      class="relative group"
                    >
                      <img
                        :src="imageUrl"
                        alt="编辑中的图片"
                        class="w-24 h-24 object-cover rounded border border-gray-300"
                      />
                      <!-- 删除按钮 -->
                      <button
                        @click="handleRemoveEditingImage(imgIndex)"
                        class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="移除图片"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                    
                    <!-- 添加图片按钮 -->
                    <button
                      @click="handleAddImageToEdit"
                      class="w-24 h-24 border-2 border-dashed border-gray-300 hover:border-blue-500 rounded flex items-center justify-center transition-colors"
                      title="添加图片"
                    >
                      <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- 如果没有图片，显示添加图片按钮 -->
                  <div v-else class="mb-2">
                    <button
                      @click="handleAddImageToEdit"
                      class="px-3 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 rounded flex items-center gap-2 transition-colors"
                      title="添加图片"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                      添加图片
                    </button>
                  </div>
                  
                  <!-- 文本编辑框 -->
                  <textarea
                    v-model="editingText"
                    class="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows="3"
                    placeholder="编辑消息文本..."
                    @keydown.enter.ctrl="handleSaveEdit(message.id)"
                    @keydown.esc="handleCancelEdit"
                  ></textarea>
                  
                  <!-- 操作按钮 -->
                  <div class="flex gap-2 mt-2">
                    <button
                      @click="handleSaveEdit(message.id)"
                      class="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                    >
                      保存并重新生成
                    </button>
                    <button
                      @click="handleCancelEdit"
                      class="px-3 py-1 text-sm bg-gray-300 hover:bg-gray-400 text-gray-700 rounded transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
                
                <!-- 正常显示模式 -->
                <div
                  v-else
                  class="rounded-lg px-4 py-2 shadow-sm relative group"
                  :class="message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 border border-gray-200'"
                >
                  <!-- 🔄 多模态内容渲染：循环 message.parts 数组 -->
                  <div 
                    v-if="message.parts && message.parts.length > 0"
                    class="space-y-2"
                  >
                    <template v-for="(part, partIndex) in message.parts" :key="partIndex">
                      <!-- 文本 part：流式传输中显示纯文本，完成后渲染 Markdown -->
                      <div v-if="part.type === 'text'">
                        <!-- 流式传输中：纯文本 -->
                        <p 
                          v-if="isMessageStreaming(index) && partIndex === message.parts.length - 1"
                          class="text-sm whitespace-pre-wrap"
                        >
                          {{ part.text }}
                        </p>
                        
                        <!-- AI 消息完成后：ContentRenderer 渲染 Markdown/LaTeX -->
                        <ContentRenderer 
                          v-else-if="message.role === 'model'"
                          :content="part.text"
                          class="text-sm"
                        />
                        
                        <!-- 用户消息：纯文本 -->
                        <p v-else class="text-sm whitespace-pre-wrap">
                          {{ part.text }}
                        </p>
                      </div>
                      
                      <!-- 图像 part：显示图片 -->
                      <div 
                        v-else-if="part.type === 'image_url'"
                        class="my-2 relative inline-block group"
                      >
                        <img 
                          :src="part.image_url.url"
                          :alt="message.role === 'user' ? '用户上传的图片' : 'AI 生成的图片'"
                          class="max-w-full max-h-96 rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                          @click="handleImageClick(part.image_url.url)"
                          @error="handleImageLoadError"
                        />
                        <!-- 图片操作按钮（悬停显示，浮在图片右上角） -->
                        <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                          <!-- 在新窗口打开 -->
                          <button
                            @click.stop="handleImageClick(part.image_url.url)"
                            class="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-colors"
                            title="在新窗口打开"
                          >
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                          </button>
                          <!-- 下载图片 -->
                          <button
                            @click.stop="handleDownloadImage(part.image_url.url, `image-${partIndex}.jpg`)"
                            class="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-sm transition-colors"
                            title="下载图片"
                          >
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>
                  
                  <!-- 向后兼容：如果没有 parts，使用旧的渲染逻辑 -->
                  <div v-else>
                    <!-- 流式传输中：显示纯文本（性能优化） -->
                    <p 
                      v-if="isMessageStreaming(index)" 
                      class="text-sm whitespace-pre-wrap"
                    >
                      {{ extractTextFromMessage(message) }}
                    </p>
                    
                    <!-- 流式完成或用户消息：使用 ContentRenderer 渲染 Markdown/LaTeX -->
                    <ContentRenderer 
                      v-else-if="!isMessageStreaming(index) && message.role === 'model'"
                      :content="extractTextFromMessage(message)"
                      class="text-sm"
                    />
                    
                    <!-- 用户消息：纯文本显示 -->
                    <p v-else-if="!isMessageStreaming(index)" class="text-sm whitespace-pre-wrap">
                      {{ extractTextFromMessage(message) }}
                    </p>
                  </div>
                  
                  <!-- 操作按钮（正常模式 - 悬停显示） -->
                  <div 
                    v-if="currentConversation?.generationStatus === 'idle' && deletingMessageId !== message.id"
                    class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1"
                  >
                    <!-- 用户消息：编辑 -->
                    <button
                      v-if="message.role === 'user'"
                      @click="handleEditMessage(message.id, message)"
                      class="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="编辑"
                    >
                      <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                      </svg>
                    </button>
                    
                    <!-- AI 消息：重新生成 -->
                    <button
                      v-if="message.role === 'model'"
                      @click="handleRetryMessage(message.id)"
                      class="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="重新生成"
                    >
                      <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    </button>
                    
                    <!-- 删除按钮（所有消息都有） -->
                    <button
                      @click="startDeleteMessage(message.id)"
                      class="p-1.5 hover:bg-red-100 rounded transition-colors"
                      title="删除"
                    >
                      <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>

                  <!-- 删除确认模式（始终显示） -->
                  <div 
                    v-if="deletingMessageId === message.id"
                    class="absolute -top-2 right-2 flex gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1"
                  >
                    <span class="px-2 py-1 text-xs text-gray-700 flex items-center">删除?</span>
                    <!-- 确认删除 -->
                    <button
                      @click="confirmDeleteMessage(message.id)"
                      class="p-1.5 hover:bg-green-100 rounded transition-colors"
                      title="确认删除"
                    >
                      <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                      </svg>
                    </button>
                    <!-- 取消删除 -->
                    <button
                      @click="cancelDeleteMessage"
                      class="p-1.5 hover:bg-red-100 rounded transition-colors"
                      title="取消"
                    >
                      <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-if="message.role === 'user'"
                class="flex-shrink-0 w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center mb-1"
              >
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
            </div>
          </div>
        </div>

        <!-- 加载状态提示 -->
        <div v-if="currentConversation?.generationStatus === 'sending'" class="flex justify-start">
          <div class="flex items-end space-x-2 w-full max-w-md lg:max-w-2xl xl:max-w-4xl">
            <div class="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
            <div class="flex items-center space-x-2">
              <div class="flex space-x-1">
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
                <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
              </div>
              <span class="text-sm text-gray-600">正在发送...</span>
            </div>
          </div>
        </div>
      </div>

        </div>
      </div>

      <!-- 输入区 -->
      <div class="bg-white border-t border-gray-200 p-4">
        <div class="w-full max-w-none">
          <!-- 视觉模型警告 -->
          <div 
            v-if="visionModelWarning"
            class="mb-3 p-3 bg-yellow-50 border border-yellow-300 rounded-lg flex items-start gap-2"
          >
            <svg class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <p class="text-sm text-yellow-800">{{ visionModelWarning }}</p>
          </div>
          
          <!-- 附件预览区域 -->
          <div 
            v-if="pendingAttachments.length > 0"
            class="mb-3 flex flex-wrap gap-2"
          >
            <AttachmentPreview
              v-for="(dataUri, index) in pendingAttachments"
              :key="index"
              :image-data-uri="dataUri"
              :alt-text="`附件 ${index + 1}`"
              @remove="removeAttachment(index)"
            />
          </div>
          
          <div class="flex items-end gap-3">
            <!-- 图片选择按钮 -->
            <button
              @click="handleSelectImage"
              :disabled="currentConversation?.generationStatus !== 'idle'"
              class="flex-none shrink-0 p-3 text-gray-600 hover:text-blue-500 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              title="添加图片"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </button>
            
            <div class="flex-1 min-w-0">
              <textarea
                ref="textareaRef"
                v-model="draftInput"
                @keydown="handleKeyPress"
                placeholder="输入您的消息... (按 Enter 发送，Shift + Enter 换行)"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-colors"
                rows="1"
              ></textarea>
            </div>

            <!-- 动态按钮：根据 generationStatus 显示不同状态 -->
            
            <!-- 状态 1: idle - 显示发送按钮 -->
            <button
              v-if="currentConversation?.generationStatus === 'idle'"
              @click="sendMessage"
              :disabled="!currentConversation || (!draftInput.trim() && pendingAttachments.length === 0) || (needsVisionModel && !currentModelSupportsVision)"
              class="flex-none shrink-0 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center"
              :title="visionModelWarning || '发送消息'"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
              </svg>
            </button>
            
            <!-- 状态 2: sending - 显示加载中按钮（禁用） -->
            <button
              v-else-if="currentConversation?.generationStatus === 'sending'"
              disabled
              class="flex-none shrink-0 bg-gray-400 cursor-not-allowed text-white px-6 py-3 rounded-lg flex items-center justify-center"
              title="正在发送..."
            >
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </button>
            
            <!-- 状态 3: receiving - 显示停止按钮 -->
            <button
              v-else
              @click="stopGeneration"
              class="flex-none shrink-0 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center"
              title="停止生成"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <div class="mt-2 text-xs text-gray-500 text-center">
            <span v-if="!chatStore.apiKey" class="text-orange-500 font-medium">
              ⚠️ 请先在设置中配置 API Key
            </span>
            <span v-else>
              按 Enter 发送消息,Shift + Enter 换行
            </span>
          </div>
        </div>
      </div>
  </div>
</template>
