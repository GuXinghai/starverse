<!--
  MessageList.vue - 消息列表组件
  
  职责：
  - 渲染消息列表
  - 滚动控制
  - 加载状态显示
-->
<template>
  <div ref="containerRef" class="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 w-full">
    <div class="space-y-4 max-w-5xl mx-auto">
      <!-- 消息列表 -->
      <MessageItem
        v-for="message in messages"
        :key="message.branchId"
        :message="message"
        :conversation-id="conversationId"
        :is-streaming="streamingBranchId === message.branchId"
        :has-branch-versions="getBranchVersionCount(message.branchId) > 1"
        @edit="$emit('edit-message', message.branchId)"
        @delete="$emit('delete-message', message.branchId)"
        @regenerate="$emit('regenerate-message', message.branchId)"
        @switch-version="$emit('switch-version', message.branchId, $event)"
      />

      <!-- 加载提示 -->
      <div v-if="isLoading" class="flex justify-start">
        <div class="bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
          <div class="flex items-center space-x-2">
            <div class="flex space-x-1">
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s;"></div>
              <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s;"></div>
            </div>
            <span class="text-sm text-gray-600">{{ loadingText }}</span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="messages.length === 0 && !isLoading" class="flex flex-col items-center justify-center py-12 text-gray-400">
        <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-lg font-medium">开始新对话</p>
        <p class="text-sm mt-1">输入消息开始聊天</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import MessageItem from './MessageItem.vue'
import type { MessageItemData } from './MessageItem.vue'

const props = withDefaults(
  defineProps<{
    messages: MessageItemData[]
    conversationId: string
    streamingBranchId?: string | null
    isLoading?: boolean
    loadingText?: string
    branchVersionCounts?: Map<string, number>
  }>(),
  {
    streamingBranchId: null,
    isLoading: false,
    loadingText: '正在思考...',
    branchVersionCounts: () => new Map()
  }
)

const containerRef = ref<HTMLElement | null>(null)

// 获取分支版本数量
function getBranchVersionCount(branchId: string): number {
  return props.branchVersionCounts.get(branchId) || 1
}

// 滚动到底部
function scrollToBottom(smooth = true) {
  if (!containerRef.value) return

  containerRef.value.scrollTo({
    top: containerRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })
}

// 检查是否在底部
function isAtBottom(): boolean {
  if (!containerRef.value) return false

  const { scrollTop, scrollHeight, clientHeight } = containerRef.value
  const threshold = 100
  
  return scrollHeight - scrollTop - clientHeight <= threshold
}

// 监听消息变化，自动滚动
watch(
  () => props.messages.length,
  () => {
    // 延迟滚动，确保 DOM 已更新
    setTimeout(() => {
      if (isAtBottom() || props.isLoading) {
        scrollToBottom()
      }
    }, 0)
  }
)

// 监听流式状态，自动滚动
watch(
  () => props.streamingBranchId,
  (newVal) => {
    if (newVal) {
      // 流式开始时滚动到底部
      scrollToBottom()
    }
  }
)

// 暴露方法给父组件
defineExpose({
  scrollToBottom,
  isAtBottom,
  containerRef
})
</script>
