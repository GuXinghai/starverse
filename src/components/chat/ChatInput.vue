<!--
  ChatInput.vue - 聊天输入组件
  
  职责：
  - 多行文本输入
  - 附件管理（图片、文件）
  - 发送按钮和状态控制
  - 输入验证
-->
<template>
  <div class="bg-white border-t border-gray-200 p-4">
    <div class="flex flex-col xl:flex-row gap-4">
      <div class="flex-1 w-full max-w-none">
        <!-- 附件预览区域 -->
        <div v-if="hasAttachments" class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-gray-600">
              已选择 {{ totalAttachments }} 个附件
            </span>
            <button
              @click="$emit('clear-attachments')"
              class="text-xs text-red-600 hover:text-red-700"
            >
              清空
            </button>
          </div>
          
          <!-- 图片预览 -->
          <div v-if="images.length > 0" class="flex gap-2 overflow-x-auto pb-2">
            <AttachmentPreview
              v-for="(dataUri, index) in images"
              :key="index"
              :image-data-uri="dataUri"
              :alt-text="`图片 ${index + 1}`"
              @remove="$emit('remove-image', index)"
              class="flex-shrink-0"
            />
          </div>

          <!-- 文件预览 -->
          <div v-if="files.length > 0" class="flex flex-col gap-2 mt-2">
            <div
              v-for="file in files"
              :key="file.id"
              class="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 bg-gray-50"
            >
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
              </svg>
              <div class="flex flex-col flex-1">
                <span class="text-sm font-medium text-gray-800">{{ file.name }}</span>
                <span class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</span>
              </div>
              <button
                @click="$emit('remove-file', file.id)"
                class="text-xs text-red-600 hover:text-red-700"
              >
                移除
              </button>
            </div>
          </div>
        </div>

        <!-- 输入框和工具栏 -->
        <div class="flex items-end gap-2 flex-wrap">
          <!-- 附件工具组 -->
          <div class="flex items-end gap-2">
            <!-- 文件选择按钮 -->
            <button
              @click="$emit('select-file')"
              :disabled="disabled"
              class="flex-none shrink-0 p-3 text-gray-600 hover:text-blue-500 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              title="添加文件 (Ctrl+Shift+F)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
              </svg>
            </button>

            <!-- 图片选择按钮 -->
            <button
              @click="$emit('select-image')"
              :disabled="disabled"
              class="flex-none shrink-0 p-3 text-gray-600 hover:text-blue-500 hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
              title="添加图片 (Ctrl+Shift+I)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <!-- 多行输入框 -->
          <textarea
            v-model="localInput"
            :disabled="disabled"
            :placeholder="placeholder"
            class="flex-1 min-w-0 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            :rows="rows"
            @keydown.ctrl.enter="handleSend"
            @keydown.meta.enter="handleSend"
          />

          <!-- 发送按钮 -->
          <button
            @click="handleSend"
            :disabled="!canSend"
            class="flex-none shrink-0 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center"
            :title="sendButtonTitle"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>

          <!-- 取消按钮（生成中显示） -->
          <button
            v-if="isGenerating"
            @click="$emit('cancel')"
            class="flex-none shrink-0 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg transition-colors"
            title="停止生成"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AttachmentPreview from './AttachmentPreview.vue'

export interface ChatInputFile {
  id: string
  name: string
  dataUrl: string
  size: number
  mimeType?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    images?: string[]
    files?: ChatInputFile[]
    disabled?: boolean
    isGenerating?: boolean
    placeholder?: string
    rows?: number
    requiresVisionModel?: boolean
    visionModelWarning?: string
  }>(),
  {
    images: () => [],
    files: () => [],
    disabled: false,
    isGenerating: false,
    placeholder: '输入消息...',
    rows: 4,
    requiresVisionModel: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'send': []
  'cancel': []
  'select-image': []
  'select-file': []
  'remove-image': [index: number]
  'remove-file': [fileId: string]
  'clear-attachments': []
}>()

// 本地输入值（双向绑定）
const localInput = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 计算属性
const hasAttachments = computed(() => props.images.length > 0 || props.files.length > 0)
const totalAttachments = computed(() => props.images.length + props.files.length)

const canSend = computed(() => {
  if (props.disabled) return false
  if (props.isGenerating) return false
  if (props.requiresVisionModel) return false
  
  const hasText = localInput.value.trim().length > 0
  const hasMedia = hasAttachments.value
  
  return hasText || hasMedia
})

const sendButtonTitle = computed(() => {
  if (props.visionModelWarning) return props.visionModelWarning
  if (props.disabled) return '请先选择模型'
  if (props.isGenerating) return '生成中...'
  if (!canSend.value) return '请输入消息或添加附件'
  return '发送消息 (Ctrl+Enter)'
})

// 方法
function handleSend() {
  if (canSend.value) {
    emit('send')
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
</script>
