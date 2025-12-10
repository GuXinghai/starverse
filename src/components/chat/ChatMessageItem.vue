/**
 * ChatMessageItem.vue - 单条聊天消息组件
 * 
 * 职责：
 * - 渲染单条消息（用户/AI）
 * - 支持内联编辑模式
 * - 渲染消息内容（文本/图片/文件，使用 ContentRenderer）
 * - 显示推理细节（AI 消息）
 * - 显示操作工具栏（编辑/重新生成/删除）
 * - 显示分支版本控制器
 * - 显示 Token 使用量统计
 * 
 * Props:
 * - message: 消息对象
 * - isEditing: 是否处于编辑状态
 * - isStreaming: 是否正在流式输出
 * - isIdle: 对话是否处于空闲状态
 * - editingText, editingImages, editingFiles: 编辑状态数据
 * 
 * Events:
 * - edit: 开始编辑
 * - save-edit: 保存编辑
 * - cancel-edit: 取消编辑
 * - retry: 重新生成
 * - delete: 删除消息
 * - switch-version: 切换分支版本
 * - image-click: 图片点击
 * - download-image: 下载图片
 * - add-image-to-edit, remove-image-from-edit: 编辑模式图片操作
 * - add-file-to-edit, remove-file-from-edit: 编辑模式文件操作
 */
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MessagePart, MessageVersionMetadata } from '../../types/chat'
import ContentRenderer from '../ContentRenderer.vue'
import MessageBranchController from '../MessageBranchController.vue'
import { extractTextFromMessage } from '../../types/chat'
import { useReasoningDisplay } from '../../composables/chat/useReasoningDisplay'

// ========== Types ==========
interface DisplayMessage {
  id: string
  branchId: string
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  parts: MessagePart[]
  timestamp: number
  currentVersionIndex: number
  totalVersions: number
  hasMultipleVersions: boolean
  metadata?: MessageVersionMetadata | undefined
}

interface EditingFile {
  id: string
  name: string
  size: number
}

// ========== Props ==========
interface Props {
  message: DisplayMessage
  isEditing?: boolean
  isStreaming?: boolean
  isGenerating?: boolean
  editingText?: string
  editingImages?: string[]
  editingFiles?: EditingFile[]
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
  isStreaming: false,
  isGenerating: false,
  editingText: '',
  editingImages: () => [],
  editingFiles: () => []
})

// ========== Events ==========
const emit = defineEmits<{
  'edit': [branchId: string, message: DisplayMessage]
  'save-edit': [branchId: string]
  'cancel-edit': []
  'update:editingText': [value: string]
  'retry': [branchId: string]
  'delete': [branchId: string]
  'switch-version': [branchId: string, direction: number]
  'image-click': [url: string]
  'download-image': [url: string]
  'add-image-to-edit': []
  'remove-image-from-edit': [index: number]
  'add-file-to-edit': []
  'remove-file-from-edit': [id: string]
}>()

// ========== Composables ==========
const {
  getReasoningStreamText,
  getReasoningDetailsForDisplay,
  hasReasoningDisplayContent,
  isReasoningEncrypted,
  shouldCollapseReasoningText,
  getReasoningConfigBadges
} = useReasoningDisplay()

// ========== Local State ==========
const isReasoningExpanded = ref(false)

// ========== 计算属性 ==========
const internalEditingText = computed({
  get: () => props.editingText,
  set: (value: string) => emit('update:editingText', value)
})
/**
 * 格式化文件大小
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * 格式化 Token 数量
 */
const formatTokens = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—'
  }
  const isInteger = Math.abs(value - Math.round(value)) < 1e-6
  return isInteger
    ? Math.round(value).toLocaleString('en-US')
    : value.toFixed(2).replace(/\.?0+$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化 Credits
 */
const formatCredits = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '—'
  }
  return value >= 0.01
    ? `$${value.toFixed(2)}`
    : `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
}

/**
 * 计算推理文本（用于判断是否应折叠）
 */
const reasoningText = computed(() => {
  if (!props.message.metadata?.reasoning) {
    console.log('[ChatMessageItem] 🔍 No reasoning metadata for message:', props.message.branchId)
    return ''
  }
  
  const text = getReasoningStreamText(props.message.metadata.reasoning)
  console.log('[ChatMessageItem] 🔍 Reasoning text computed:', {
    branchId: props.message.branchId,
    textLength: text.length,
    textPreview: text.substring(0, 100),
    reasoning: props.message.metadata.reasoning
  })
  
  return text
})

/**
 * ⭐ 检测消息是否被中止
 */
const isAborted = computed(() => {
  return !!(props.message.metadata?.streamAborted || props.message.metadata?.canRetry)
})

/**
 * ⭐ 获取中止阶段描述
 */
const abortPhaseLabel = computed(() => {
  const phase = props.message.metadata?.abortPhase
  if (phase === 'requesting') return '请求已中止'
  if (phase === 'streaming') return '生成已中止'
  if (props.message.metadata?.canRetry) return '请求已中止'
  if (props.message.metadata?.streamAborted) return '生成已中止'
  return '已中止'
})

/**
 * ⭐ 检测是否为空消息（可重试）
 */
const isEmptyRetryableMessage = computed(() => {
  const hasNoContent = extractTextFromMessage(props.message).trim() === ''
  const canRetry = props.message.metadata?.canRetry
  return hasNoContent && canRetry
})

/**
 * 是否应默认折叠推理文本
 */
const shouldDefaultCollapse = computed(() => {
  return shouldCollapseReasoningText(reasoningText.value)
})

/**
 * 推理配置标签
 */
const reasoningBadges = computed(() => {
  if (!props.message.metadata?.reasoning) {
    return []
  }
  return getReasoningConfigBadges(props.message.metadata.reasoning)
})

/**
 * 切换推理展开/折叠
 */
const toggleReasoningExpanded = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value
}

/**
 * 复制推理文本到剪贴板
 */
const copyReasoningToClipboard = async () => {
  if (!reasoningText.value) {
    return
  }
  
  try {
    await navigator.clipboard.writeText(reasoningText.value)
    // TODO: Show success toast notification
    console.log('Reasoning text copied to clipboard')
  } catch (error) {
    console.error('Failed to copy reasoning text:', error)
    // TODO: Show error toast notification
  }
}
</script>

<template>
  <div
    class="flex group"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div class="flex items-end space-x-2 w-full max-w-md lg:max-w-2xl xl:max-w-4xl relative">
      <!-- AI 消息头像 -->
      <div
        v-if="message.role === 'assistant'"
        class="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mb-1"
      >
        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
        </svg>
      </div>

      <div class="flex flex-col gap-2 flex-1">
        <!-- ========== 编辑模式 ========== -->
        <div v-if="isEditing" class="w-full">
          <!-- 编辑中的文件预览 -->
          <div v-if="editingFiles.length > 0" class="flex flex-wrap gap-2 mb-3">
            <div
              v-for="file in editingFiles"
              :key="file.id"
              class="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 bg-gray-50"
            >
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
              </svg>
              <div class="flex flex-col">
                <span class="text-sm font-medium text-gray-800">{{ file.name }}</span>
                <span class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</span>
              </div>
              <button
                @click="emit('remove-file-from-edit', file.id)"
                class="ml-2 text-xs text-red-600 hover:text-red-700"
                title="移除文件"
              >
                移除
              </button>
            </div>
            <button
              @click="emit('add-file-to-edit')"
              class="px-3 py-1.5 text-sm border border-dashed border-gray-300 hover:border-blue-500 rounded flex items-center gap-2 transition-colors"
              title="添加文件"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              添加文件
            </button>
          </div>
          <div v-else class="mb-2">
            <button
              @click="emit('add-file-to-edit')"
              class="px-3 py-1.5 text-sm border border-gray-300 hover:bg-gray-50 rounded flex items-center gap-2 transition-colors"
              title="添加文件"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
              添加文件
            </button>
          </div>

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
              <button
                @click="emit('remove-image-from-edit', imgIndex)"
                class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="移除图片"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <button
              @click="emit('add-image-to-edit')"
              class="w-24 h-24 border-2 border-dashed border-gray-300 hover:border-blue-500 rounded flex items-center justify-center transition-colors"
              title="添加图片"
            >
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
              </svg>
            </button>
          </div>
          <div v-else class="mb-2">
            <button
              @click="emit('add-image-to-edit')"
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
          <slot name="edit-textarea" :branch-id="message.branchId">
            <textarea
              v-model="internalEditingText"
              class="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows="3"
              placeholder="编辑消息文本..."
              @keydown.enter.ctrl="emit('save-edit', message.branchId)"
              @keydown.esc="emit('cancel-edit')"
            ></textarea>
          </slot>

          <!-- 操作按钮 -->
          <div class="flex gap-2 mt-2">
            <button
              @click="emit('save-edit', message.branchId)"
              class="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              保存并重新生成
            </button>
            <button
              @click="emit('cancel-edit')"
              class="px-3 py-1 text-sm bg-gray-300 hover:bg-gray-400 text-gray-700 rounded transition-colors"
            >
              取消
            </button>
          </div>
        </div>

        <!-- ========== 正常显示模式 ========== -->
        <div
          v-else
          class="rounded-lg px-4 py-2 shadow-sm relative group"
          :class="message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 border border-gray-200'"
        >
          <!-- ⭐ 中止状态提示（空消息可重试） -->
          <div
            v-if="isEmptyRetryableMessage"
            class="mb-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700"
          >
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <div class="flex-1">
                <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {{ abortPhaseLabel }}
                </p>
                <p class="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  请求未完成，您可以点击重试按钮重新生成
                </p>
              </div>
              <button
                @click="emit('retry', message.branchId)"
                class="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors flex items-center gap-1.5"
                title="重新生成"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                重试
              </button>
            </div>
          </div>

          <!-- ⭐ 流式中止提示（有内容但被中止） -->
          <div
            v-else-if="message.role === 'assistant' && isAborted && !isEmptyRetryableMessage"
            class="mb-2 px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
          >
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">
                {{ abortPhaseLabel }} · 以下为部分生成的内容
              </span>
              <button
                @click="emit('retry', message.branchId)"
                class="ml-auto text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                title="重新生成"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                重试
              </button>
            </div>
          </div>

          <!-- 推理细节区域 -->
          <div
            v-if="message.role === 'assistant' && hasReasoningDisplayContent(message.metadata?.reasoning)"
            class="mb-3 pb-3 border-b border-indigo-100"
          >
            <div class="bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
              <!-- 标题栏 -->
              <div class="flex items-center justify-between gap-2 px-3 py-2">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M11 2a1 1 0 012 0v1.05a7.002 7.002 0 015.95 5.95H20a1 1 0 110 2h-1.05a7.002 7.002 0 01-5.95 5.95V20a1 1 0 11-2 0v-1.05a7.002 7.002 0 01-5.95-5.95H4a1 1 0 110-2h1.05A7.002 7.002 0 0111 3.05V2z" />
                  </svg>
                  <span class="font-semibold text-indigo-700">推理细节</span>
                </div>
                
                <!-- 配置标签 -->
                <div class="flex items-center gap-1.5">
                  <div
                    v-for="badge in reasoningBadges"
                    :key="badge.label"
                    class="px-2 py-0.5 rounded text-[10px] font-medium"
                    :class="{
                      'bg-blue-100 text-blue-700': badge.color === 'blue',
                      'bg-yellow-100 text-yellow-700': badge.color === 'yellow',
                      'bg-red-100 text-red-700': badge.color === 'red',
                      'bg-purple-100 text-purple-700': badge.color === 'purple',
                      'bg-gray-100 text-gray-600': badge.color === 'gray'
                    }"
                  >
                    {{ badge.value }}
                  </div>
                </div>
              </div>

              <!-- 加密/隐藏推理占位符 -->
              <div
                v-if="isReasoningEncrypted(message.metadata?.reasoning)"
                class="mx-3 mb-3 bg-gray-100 border border-gray-200 rounded-md p-3 text-center"
              >
                <div class="flex items-center justify-center gap-2 text-gray-500">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span class="font-mono text-xs">[REDACTED: 推理过程已加密]</span>
                </div>
                <p class="mt-1 text-[10px] text-gray-400">
                  此消息使用了推理功能，但配置为不返回推理内容
                </p>
              </div>

              <!-- 摘要文本 -->
              <div
                v-else-if="message.metadata?.reasoning?.summary"
                class="mx-3 mb-2 bg-indigo-100 border border-indigo-200 rounded-md p-2"
              >
                <div class="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold mb-1">
                  推理摘要
                </div>
                <div class="text-xs leading-relaxed text-indigo-800">
                  {{ message.metadata.reasoning.summary }}
                </div>
              </div>

              <!-- 累积推理文本 -->
              <div v-else-if="reasoningText" class="mx-3 mb-2">
                <div class="bg-white/70 border border-indigo-100 rounded-md overflow-hidden">
                  <!-- 可折叠的推理文本 -->
                  <div
                    v-if="shouldDefaultCollapse"
                    class="relative"
                  >
                    <div
                      class="text-xs leading-relaxed whitespace-pre-wrap p-2 text-indigo-800 transition-all duration-200"
                      :class="isReasoningExpanded ? '' : 'max-h-32 overflow-hidden'"
                    >
                      {{ reasoningText }}
                    </div>
                    
                    <!-- 渐变遮罩（仅在折叠时显示） -->
                    <div
                      v-if="!isReasoningExpanded"
                      class="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white/90 to-transparent pointer-events-none"
                    ></div>
                    
                    <!-- 展开/折叠按钮 -->
                    <div class="flex items-center justify-center border-t border-indigo-100 bg-white/50">
                      <button
                        @click="toggleReasoningExpanded"
                        class="w-full px-3 py-1.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <svg
                          class="w-3 h-3 transition-transform duration-200"
                          :class="isReasoningExpanded ? 'rotate-180' : ''"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>{{ isReasoningExpanded ? '收起推理过程' : '展开推理过程' }}</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- 短文本直接显示 -->
                  <div v-else class="p-2">
                    <div class="text-xs leading-relaxed whitespace-pre-wrap text-indigo-800">
                      {{ reasoningText }}
                    </div>
                  </div>
                  
                  <!-- 复制按钮 -->
                  <div class="flex items-center justify-end border-t border-indigo-100 bg-white/50 px-2 py-1">
                    <button
                      @click="copyReasoningToClipboard"
                      class="text-[10px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                      title="复制推理文本"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>复制</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 其他推理细节 -->
              <div
                v-if="getReasoningDetailsForDisplay(message.metadata?.reasoning).length > 0"
                class="mx-3 mb-2 space-y-2"
              >
                <div
                  v-for="detail in getReasoningDetailsForDisplay(message.metadata?.reasoning)"
                  :key="detail.key"
                  class="bg-white/70 border border-indigo-100 rounded-md p-2 text-indigo-800"
                >
                  <div class="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold">
                    {{ detail.title }}
                  </div>
                  <div v-if="detail.summary && detail.summary !== detail.title" class="mt-1 text-xs font-medium text-indigo-600">
                    {{ detail.summary }}
                  </div>
                  <div v-if="detail.text" class="mt-1 text-xs leading-relaxed whitespace-pre-wrap">
                    {{ detail.text }}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                <!-- AI 消息完成后：ContentRenderer -->
                <ContentRenderer
                  v-else-if="message.role === 'assistant'"
                  :content="part.text"
                  class="text-sm"
                />
                <!-- 用户消息：纯文本 -->
                <p v-else class="text-sm whitespace-pre-wrap">
                  {{ part.text }}
                </p>
              </div>

              <!-- 图像 part -->
              <div
                v-else-if="part.type === 'image_url'"
                class="my-2 relative inline-block group"
              >
                <img
                  :src="part.image_url.url"
                  :alt="message.role === 'user' ? '用户上传的图片' : 'AI 生成的图片'"
                  class="max-w-full max-h-96 rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                  @click="emit('image-click', part.image_url.url)"
                />
                <!-- 图片操作按钮 -->
                <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                  <button
                    @click.stop="emit('image-click', part.image_url.url)"
                    class="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
                    title="在新窗口打开"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                    </svg>
                  </button>
                  <button
                    @click.stop="emit('download-image', part.image_url.url)"
                    class="p-2 bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
                    title="下载图片"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 文件 part -->
              <div
                v-else-if="part.type === 'file'"
                class="flex items-center gap-3 p-3 rounded-md border"
                :class="message.role === 'user' ? 'border-white/30 bg-white/20' : 'border-gray-200 bg-gray-50'"
              >
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
                  </svg>
                  <div class="flex flex-col">
                    <span
                      class="text-sm font-medium"
                      :class="message.role === 'user' ? 'text-white' : 'text-gray-800'"
                    >
                      {{ part.file?.filename || '附件' }}
                    </span>
                    <span
                      v-if="part.file?.size_bytes"
                      class="text-xs"
                      :class="message.role === 'user' ? 'text-white/80' : 'text-gray-500'"
                    >
                      {{ formatFileSize(part.file.size_bytes) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- 向后兼容：没有 parts 的旧数据 -->
          <div v-else>
            <p v-if="isStreaming" class="text-sm whitespace-pre-wrap">
              {{ extractTextFromMessage(message) }}
            </p>
            <ContentRenderer
              v-else-if="message.role === 'assistant'"
              :content="extractTextFromMessage(message)"
              class="text-sm"
            />
            <p v-else class="text-sm whitespace-pre-wrap">
              {{ extractTextFromMessage(message) }}
            </p>
          </div>

          <!-- 操作按钮（悬停显示） -->
          <div
            v-if="!isGenerating && !isEditing"
            class="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1"
          >
            <!-- 用户消息：编辑 -->
            <button
              v-if="message.role === 'user'"
              @click="emit('edit', message.branchId, message)"
              class="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title="编辑"
            >
              <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>

            <!-- 助手消息：重新生成 -->
            <button
              v-if="message.role === 'assistant'"
              @click="emit('retry', message.branchId)"
              class="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title="重新生成"
            >
              <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>

            <!-- 删除按钮 -->
            <button
              @click="emit('delete', message.branchId)"
              class="p-1.5 hover:bg-red-100 rounded transition-colors"
              title="删除"
            >
              <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Token 使用量统计 -->
        <div
          v-if="message.role === 'assistant' && message.metadata?.usage"
          class="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 ml-1"
        >
          <div class="flex items-center gap-1">
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            <span>Prompt {{ formatTokens(message.metadata.usage.promptTokens) }}</span>
            <span class="text-gray-300">|</span>
            <span>Completion {{ formatTokens(message.metadata.usage.completionTokens) }}</span>
            <span class="text-gray-300">|</span>
            <span>Total {{ formatTokens(message.metadata.usage.totalTokens) }}</span>
          </div>
          <div
            v-if="message.metadata.usage.cost !== undefined"
            class="flex items-center gap-1"
          >
            <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 1.343-3 3 0 1.306.835 2.418 2 2.83V17h2v-3.17A3.001 3.001 0 0015 11c0-1.657-1.343-3-3-3z" />
            </svg>
            <span>Credits {{ formatCredits(message.metadata.usage.cost) }}</span>
          </div>
        </div>

        <!-- 分支版本控制器 -->
        <MessageBranchController
          v-if="message.hasMultipleVersions"
          :current-index="message.currentVersionIndex"
          :total-versions="message.totalVersions"
          @switch="(direction: number) => emit('switch-version', message.branchId, direction)"
          class="mt-2 ml-10"
        />
      </div>

      <!-- 用户消息头像 -->
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
</template>
