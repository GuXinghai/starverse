<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

// @ts-ignore - chatStore.js is a JavaScript file
import { useChatStore } from '../stores/chatStore'

// @ts-ignore - geminiService.js is a JavaScript file
import { streamChatWithGemini } from '../services/geminiService'

import ModelSelector from './ModelSelector.vue'

// Props
const props = defineProps<{
  conversationId: string
}>()

const chatStore = useChatStore()
const draftInput = ref('')
const chatContainer = ref<HTMLElement>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)

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

// 根据 conversationId 获取当前对话
const currentConversation = computed(() => {
  return chatStore.conversations.find((conv: any) => conv.id === props.conversationId) || null
})

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
const performSendMessage = async (userMessage?: string, customHistory?: any[]) => {
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

  const apiKey = chatStore.apiKey
  
  if (!apiKey) {
    console.error('API Key 检查失败 - apiKey 为空')
    chatStore.addMessageToConversation(targetConversationId, {
      role: 'model',
      text: '错误：未设置 API Key,请先在设置页面配置您的 Gemini API Key。'
    })
    return
  }

  // ========== 创建新的中止控制器 ==========
  abortController.value = new AbortController()
  console.log('✓ 已创建新的 AbortController')

  // ========== 设置状态为 'sending' 并开始流式请求 ==========
  chatStore.setConversationGenerationStatus(targetConversationId, 'sending')

  try {
    const conversationModel = currentConversation.value.model || chatStore.selectedModel

    // 添加用户消息（如果提供）
    if (userMessage) {
      chatStore.addMessageToConversation(targetConversationId, {
        role: 'user',
        text: userMessage
      })
      await nextTick()
      scrollToBottom()
    }

    // 使用自定义历史记录或当前对话历史（去掉最后一条，因为还没有 AI 回复）
    const historyForStream = customHistory || currentConversation.value.messages.slice(0, -1)

    // 获取用户消息文本（用于传递给 API）
    // 如果提供了 userMessage，使用它；否则从历史记录中获取最后一条用户消息
    let userMessageText = userMessage
    if (!userMessageText && historyForStream.length > 0) {
      const lastMessage = historyForStream[historyForStream.length - 1]
      if (lastMessage.role === 'user') {
        userMessageText = lastMessage.text
      }
    }

    // 添加空的 AI 回复消息（用于流式填充）
    chatStore.addMessageToConversation(targetConversationId, {
      role: 'model',
      text: ''
    })

    await nextTick()
    scrollToBottom()

    // 发起流式请求（传入中止信号）
    const stream = await streamChatWithGemini(
      apiKey,
      historyForStream,
      conversationModel,
      userMessageText,
      abortController.value.signal // 传递中止信号
    )

    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
      throw new Error('流式响应不可用')
    }

    // ========== 流式读取响应（使用固化的 conversationId） ==========
    let isFirstChunk = true
    for await (const chunk of stream) {
      // 【关键】第一次接收到数据时，切换到 'receiving' 状态
      // 使用固化的 targetConversationId 而非 props.conversationId
      if (isFirstChunk) {
        chatStore.setConversationGenerationStatus(targetConversationId, 'receiving')
        console.log('✓ 开始接收流式响应，状态切换为 receiving')
        isFirstChunk = false
      }

      const chunkText = typeof chunk?.text === 'function' ? chunk.text() : ''
      if (chunkText) {
        // 使用固化的 targetConversationId 确保更新正确的对话
        chatStore.appendTokenToMessage(targetConversationId, chunkText)
        await nextTick()
        scrollToBottom()
      }
    }

    console.log('✓ 流式响应完成')
  } catch (error: any) {
    // ========== 错误处理：区分中止错误和其他错误 ==========
    // 检测中止错误的多种形式：
    // 1. 标准 AbortError
    // 2. Google AI SDK 的流中断错误
    const isAbortError = 
      error.name === 'AbortError' || 
      (error.message && error.message.includes('Error reading from the stream')) ||
      (error.message && error.message.includes('aborted'))
    
    if (isAbortError) {
      console.log('ℹ️ 生成已中止（用户手动停止）')
      // 静默处理中止错误，不显示错误消息
      const conversation = currentConversation.value
      if (conversation && conversation.messages.length > 0) {
        const lastMessage = conversation.messages[conversation.messages.length - 1]
        if (lastMessage && lastMessage.role === 'model' && !lastMessage.text) {
          // 如果最后一条消息是空的 AI 消息，添加提示
          lastMessage.text = '[已停止生成]'
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
          lastMessage.text = `抱歉，发生了错误：${errorMessage}`
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

  if (!trimmedMessage) {
    return
  }

  await performSendMessage(trimmedMessage)
  
  // 清空输入框
  draftInput.value = ''
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
  
  // 注意：不传递 userMessage，因为用户消息已经存在
  // 传递完整的历史记录（包括最后的用户消息）
  await performSendMessage(undefined, messages)
}

// 进入编辑模式
const handleEditMessage = (messageId: string, currentText: string) => {
  editingMessageId.value = messageId
  editingText.value = currentText
}

// 取消编辑
const handleCancelEdit = () => {
  editingMessageId.value = null
  editingText.value = ''
}

// 保存编辑并重新提交
const handleSaveEdit = async (messageId: string) => {
  // ========== 🔒 固化上下文 ==========
  const targetConversationId = props.conversationId
  
  if (!editingText.value.trim()) {
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

  // 更新消息内容（使用固化的 conversationId）
  chatStore.updateMessage(targetConversationId, messageId, editingText.value.trim())
  
  // 截断该消息之后的所有消息
  const nextMessageId = messages[messageIndex + 1]?.id
  if (nextMessageId) {
    chatStore.truncateMessagesFrom(targetConversationId, nextMessageId)
  }

  // 先退出编辑模式，让 UI 立即显示更新后的消息
  handleCancelEdit()
  
  // 等待 DOM 更新
  await nextTick()

  // 重新发送（使用更新后的历史记录）
  // 注意：消息已经更新，所以传递完整的历史记录（包括更新后的用户消息）
  // 不传递 userMessage 参数，避免重复添加
  const updatedMessages = currentConversation.value?.messages || []
  await performSendMessage(undefined, updatedMessages)
}

</script>

<template>
  <div class="flex h-full bg-gray-50">
    <div class="flex-1 flex flex-col">
      <div class="bg-white border-b border-gray-200 px-6 py-3">
        <div class="max-w-4xl mx-auto">
          <ModelSelector :conversation-id="props.conversationId" />
        </div>
      </div>

      <div ref="chatContainer" class="flex-1 overflow-y-auto p-6 space-y-4">
        <div class="max-w-4xl mx-auto">
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
            <div class="flex items-end space-x-2 max-w-xs lg:max-w-md xl:max-w-2xl relative">
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
                  <textarea
                    v-model="editingText"
                    class="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows="3"
                    @keydown.enter.ctrl="handleSaveEdit(message.id)"
                    @keydown.esc="handleCancelEdit"
                  ></textarea>
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
                  class="rounded-lg px-4 py-2 shadow-sm relative"
                  :class="message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 border border-gray-200'"
                >
                  <p class="text-sm whitespace-pre-wrap">{{ message.text }}</p>
                  
                  <!-- 操作按钮（正常模式 - 悬停显示） -->
                  <div 
                    v-if="currentConversation?.generationStatus === 'idle' && deletingMessageId !== message.id"
                    class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1"
                  >
                    <!-- 用户消息：编辑 -->
                    <button
                      v-if="message.role === 'user'"
                      @click="handleEditMessage(message.id, message.text)"
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

          <div v-if="currentConversation?.generationStatus === 'sending'" class="flex justify-start">
            <div class="flex items-end space-x-2">
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

      <div class="bg-white border-t border-gray-200 p-4">
        <div class="max-w-4xl mx-auto">
          <div class="flex items-end space-x-3">
            <div class="flex-1">
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
              :disabled="!currentConversation || !draftInput.trim()"
              class="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center"
              title="发送消息"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
              </svg>
            </button>
            
            <!-- 状态 2: sending - 显示加载中按钮（禁用） -->
            <button
              v-else-if="currentConversation?.generationStatus === 'sending'"
              disabled
              class="bg-gray-400 cursor-not-allowed text-white px-6 py-3 rounded-lg flex items-center justify-center"
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
              class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center"
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
  </div>
</template>
