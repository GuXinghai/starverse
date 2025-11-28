<!--
  MessageItem.vue - 单个消息项组件
  
  职责：
  - 渲染单条消息（用户或AI）
  - 显示消息内容（文本、图片、文件）
  - 分支版本控制
  - 消息操作按钮（编辑、删除、重新生成）
-->
<template>
  <div
    class="flex gap-3"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <!-- AI 消息 - 头像在左 -->
    <div
      v-if="message.role !== 'user'"
      class="flex-none w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium"
    >
      AI
    </div>

    <!-- 消息内容区 -->
    <div
      class="flex flex-col max-w-[80%]"
      :class="message.role === 'user' ? 'items-end' : 'items-start'"
    >
      <!-- 消息气泡 -->
      <div
        class="rounded-2xl px-4 py-3 shadow-sm"
        :class="[
          message.role === 'user'
            ? 'bg-blue-500 text-white'
            : 'bg-white border border-gray-200'
        ]"
      >
        <!-- 多模态内容渲染 -->
        <div v-if="message.parts && message.parts.length > 0" class="space-y-2">
          <template v-for="(part, partIndex) in message.parts" :key="part.id ?? partIndex">
            <!-- 文本 part -->
            <div v-if="part.type === 'text'">
              <!-- 流式传输中：纯文本 -->
              <p
                v-if="isStreaming && partIndex === message.parts.length - 1"
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

            <!-- 图片 part -->
            <div
              v-else-if="part.type === 'image_url'"
              class="my-2"
            >
              <img
                :src="part.image_url.url"
                alt="消息图片"
                class="max-w-sm rounded-lg border border-gray-200"
                loading="lazy"
              />
            </div>

            <!-- 文件 part -->
            <div
              v-else-if="part.type === 'file' && part.file"
              class="my-2"
            >
              <div
                class="flex items-center gap-2 px-3 py-2 rounded border"
                :class="message.role === 'user' ? 'border-white/30 bg-white/10' : 'border-gray-200 bg-gray-50'"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
                </svg>
                <div class="flex flex-col flex-1">
                  <span
                    class="text-sm font-medium"
                    :class="message.role === 'user' ? 'text-white' : 'text-gray-800'"
                  >
                    {{ part.file.filename || '附件' }}
                  </span>
                  <span
                    v-if="part.file.size_bytes"
                    class="text-xs"
                    :class="message.role === 'user' ? 'text-white/80' : 'text-gray-500'"
                  >
                    {{ formatFileSize(part.file.size_bytes) }}
                  </span>
                </div>
                <a
                  v-if="part.file.file_data"
                  :href="part.file.file_data"
                  :download="part.file.filename || 'attachment'"
                  target="_blank"
                  rel="noreferrer"
                  class="text-xs font-medium"
                  :class="message.role === 'user' ? 'text-white hover:text-blue-100' : 'text-blue-600 hover:text-blue-700'"
                >
                  打开
                </a>
              </div>
            </div>
          </template>
        </div>

        <!-- 向后兼容：旧格式消息 -->
        <div v-else>
          <p class="text-sm whitespace-pre-wrap">
            {{ extractMessageText(message) }}
          </p>
        </div>
      </div>

      <!-- 操作按钮栏 -->
      <div
        v-if="showActions"
        class="flex items-center gap-2 mt-2 px-2"
      >
        <!-- 分支版本控制 -->
        <MessageBranchController
          v-if="hasBranchVersions"
          :branch-id="message.branchId"
          :conversation-id="conversationId"
          @switch-version="$emit('switch-version', $event)"
        />

        <!-- 编辑按钮（仅用户消息） -->
        <button
          v-if="message.role === 'user'"
          @click="$emit('edit')"
          class="text-xs text-gray-500 hover:text-blue-600 transition-colors"
          title="编辑消息"
        >
          编辑
        </button>

        <!-- 重新生成按钮（仅AI消息） -->
        <button
          v-if="message.role === 'model'"
          @click="$emit('regenerate')"
          class="text-xs text-gray-500 hover:text-blue-600 transition-colors"
          title="重新生成"
        >
          重新生成
        </button>

        <!-- 删除按钮 -->
        <button
          @click="$emit('delete')"
          class="text-xs text-gray-500 hover:text-red-600 transition-colors"
          title="删除消息"
        >
          删除
        </button>

        <!-- 复制按钮 -->
        <button
          @click="handleCopy"
          class="text-xs text-gray-500 hover:text-green-600 transition-colors"
          :title="copyButtonText"
        >
          {{ copyButtonText }}
        </button>
      </div>
    </div>

    <!-- 用户消息 - 头像在右 -->
    <div
      v-if="message.role === 'user'"
      class="flex-none w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-sm font-medium"
    >
      U
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ContentRenderer from '../ContentRenderer.vue'
import MessageBranchController from '../MessageBranchController.vue'

export interface MessageItemData {
  branchId: string
  role: 'user' | 'model'
  parts?: any[]
  text?: string
  content?: string
}

const props = withDefaults(
  defineProps<{
    message: MessageItemData
    conversationId: string
    isStreaming?: boolean
    showActions?: boolean
    hasBranchVersions?: boolean
  }>(),
  {
    isStreaming: false,
    showActions: true,
    hasBranchVersions: false
  }
)

const emit = defineEmits<{
  'edit': []
  'delete': []
  'regenerate': []
  'switch-version': [direction: number]
}>()

const copyButtonText = ref('复制')

// 提取消息文本（兼容旧格式）
function extractMessageText(message: MessageItemData): string {
  if (message.parts) {
    return message.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('\n')
  }
  return message.text || message.content || ''
}

// 复制消息文本
async function handleCopy() {
  const text = extractMessageText(props.message)
  try {
    await navigator.clipboard.writeText(text)
    copyButtonText.value = '已复制'
    setTimeout(() => {
      copyButtonText.value = '复制'
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
</script>
