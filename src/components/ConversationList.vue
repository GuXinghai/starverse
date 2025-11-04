<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
// @ts-ignore
import { useChatStore } from '../stores/chatStore'

const chatStore = useChatStore()

// 编辑状态
const editingId = ref<string | null>(null)
const editingTitle = ref('')

// 删除确认状态
const deletingId = ref<string | null>(null)

// 格式化模型名称显示
const formatModelName = (modelName: string) => {
  // 从 "models/gemini-2.0-flash-exp" 提取 "gemini-2.0-flash"
  const match = modelName.match(/gemini-[\d.]+-[\w]+/)
  if (match) {
    return match[0]
  }
  // 如果是完整路径，取最后一部分
  const parts = modelName.split('/')
  return parts[parts.length - 1]
}

// 开始编辑
const startEdit = (conversation: any) => {
  editingId.value = conversation.id
  editingTitle.value = conversation.title
}

// 保存编辑
const saveEdit = (conversationId: string) => {
  if (editingTitle.value.trim()) {
    chatStore.renameConversation(conversationId, editingTitle.value)
  }
  editingId.value = null
  editingTitle.value = ''
}

// 取消编辑
const cancelEdit = () => {
  editingId.value = null
  editingTitle.value = ''
}

// 开始删除确认
const startDelete = (conversationId: string) => {
  deletingId.value = conversationId
}

// 确认删除
const confirmDelete = (conversationId: string) => {
  const success = chatStore.deleteConversation(conversationId)
  if (!success) {
    // 使用 console.error 替代 alert，避免焦点干扰
    console.error('删除失败：该对话可能正在使用中')
    // 可选：添加视觉反馈（例如红色边框闪烁）
  }
  deletingId.value = null
}

// 取消删除
const cancelDelete = () => {
  deletingId.value = null
}

// 键盘快捷键处理
const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl+N 或 Cmd+N 创建新对话
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault()
    const newId = chatStore.createNewConversation()
    chatStore.openConversationInTab(newId)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="flex flex-col h-full bg-gray-100 border-r border-gray-200">
    <!-- 侧边栏头部 -->
    <div class="p-4 border-b border-gray-200 bg-white">
      <button
        @click="() => {
          const newId = chatStore.createNewConversation()
          chatStore.openConversationInTab(newId)
        }"
        class="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        title="Ctrl+N"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        新建对话
      </button>
      <p class="text-xs text-gray-500 text-center mt-2">快捷键: Ctrl+N</p>
    </div>

    <!-- 对话列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <div
        v-for="conversation in chatStore.conversations"
        :key="conversation.id"
        class="mb-2 group"
      >
        <div
          :class="[
            'rounded-lg p-3 cursor-pointer transition-all',
            chatStore.activeTabId === conversation.id
              ? 'bg-blue-500 text-white shadow-md'
              : 'bg-white hover:bg-gray-50 text-gray-700'
          ]"
        >
          <!-- 正常显示模式 -->
          <div v-if="editingId !== conversation.id && deletingId !== conversation.id" class="flex items-center justify-between">
            <div
              @click="chatStore.openConversationInTab(conversation.id)"
              class="flex-1 min-w-0"
            >
              <div class="font-medium flex items-center gap-2">
                <span class="truncate flex-1 min-w-0">{{ conversation.title }}</span>
                
                <!-- 生成状态指示器 -->
                <!-- 发送中：蓝色旋转图标 -->
                <svg
                  v-if="conversation.generationStatus === 'sending'"
                  class="w-4 h-4 flex-shrink-0 animate-spin"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-blue-500'
                  ]"
                  fill="none"
                  viewBox="0 0 24 24"
                  title="正在发送..."
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                
                <!-- 接收中：绿色脉冲圆点 -->
                <svg
                  v-else-if="conversation.generationStatus === 'receiving'"
                  class="w-4 h-4 flex-shrink-0 animate-pulse"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-green-500'
                  ]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  title="正在接收..."
                >
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                
                <!-- 有错误：警告图标 -->
                <svg
                  v-else-if="conversation.hasError"
                  class="w-4 h-4 flex-shrink-0"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-yellow-300'
                      : 'text-yellow-500'
                  ]"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  title="上次生成出错"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                
                <!-- 空闲且成功：绿色勾（仅当有消息时显示） -->
                <svg
                  v-else-if="conversation.generationStatus === 'idle' && conversation.tree?.currentPath?.length > 0 && !conversation.hasError"
                  class="w-4 h-4 flex-shrink-0"
                  :class="[
                    chatStore.activeTabId === conversation.id
                      ? 'text-white'
                      : 'text-green-500'
                  ]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  title="就绪"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div
                :class="[
                  'text-xs mt-1 flex items-center gap-1',
                  chatStore.activeTabId === conversation.id
                    ? 'text-blue-100'
                    : 'text-gray-500'
                ]"
              >
                <span>{{ conversation.tree?.currentPath?.length || 0 }} 条消息</span>
                <span>•</span>
                <span class="truncate max-w-[120px]" :title="conversation.model">
                  {{ formatModelName(conversation.model) }}
                </span>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click.stop="startEdit(conversation)"
                :class="[
                  'p-1.5 rounded hover:bg-opacity-20 hover:bg-gray-500 transition-colors',
                  chatStore.activeTabId === conversation.id ? 'text-white' : 'text-gray-600'
                ]"
                title="重命名"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button
                @click.stop="startDelete(conversation.id)"
                :disabled="conversation.generationStatus !== 'idle'"
                :class="[
                  'p-1.5 rounded hover:bg-opacity-20 transition-colors',
                  conversation.generationStatus !== 'idle'
                    ? 'opacity-50 cursor-not-allowed' 
                    : chatStore.activeTabId === conversation.id 
                      ? 'text-white hover:bg-red-500' 
                      : 'text-red-500 hover:bg-red-500'
                ]"
                :title="conversation.generationStatus !== 'idle' ? '对话生成中，无法删除' : '删除'"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- 删除确认模式 -->
          <div v-else-if="deletingId === conversation.id" class="flex items-center justify-between">
            <div class="flex-1 text-sm font-medium">
              <span :class="chatStore.activeTabId === conversation.id ? 'text-white' : 'text-gray-700'">
                确定删除？
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click.stop="confirmDelete(conversation.id)"
                class="p-1.5 rounded transition-colors"
                :class="[
                  chatStore.activeTabId === conversation.id
                    ? 'text-white hover:bg-green-500 hover:bg-opacity-20'
                    : 'text-green-600 hover:bg-green-100'
                ]"
                title="确认删除"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                </svg>
              </button>
              <button
                @click.stop="cancelDelete"
                class="p-1.5 rounded transition-colors"
                :class="[
                  chatStore.activeTabId === conversation.id
                    ? 'text-white hover:bg-red-500 hover:bg-opacity-20'
                    : 'text-red-600 hover:bg-red-100'
                ]"
                title="取消"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- 编辑模式 -->
          <div v-else class="flex items-center gap-2">
            <input
              v-model="editingTitle"
              @keyup.enter="saveEdit(conversation.id)"
              @keyup.esc="cancelEdit"
              class="flex-1 px-2 py-1 bg-white text-gray-900 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autofocus
            />
            <button
              @click="saveEdit(conversation.id)"
              class="p-1 text-green-600 hover:bg-green-100 rounded"
              title="保存"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <button
              @click="cancelEdit"
              class="p-1 text-gray-600 hover:bg-gray-200 rounded"
              title="取消"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="chatStore.conversations.length === 0" class="text-center text-gray-500 mt-12 px-4">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        <p class="text-sm font-medium mb-2">暂无对话</p>
        <p class="text-xs text-gray-400">点击上方按钮创建新对话</p>
        <p class="text-xs text-gray-400 mt-1">或按 <kbd class="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700 font-mono">Ctrl+N</kbd></p>
      </div>
    </div>
  </div>
</template>
