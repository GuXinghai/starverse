/**
 * ChatHeader.vue - 聊天界面头部组件
 * 
 * 职责：
 * - 显示和修改会话状态（active/archived 等）
 * - 显示和管理会话标签（添加/删除）
 * - 提供"保存为模板"的操作入口
 * 
 * Props:
 * - conversation: 当前对话对象（包含 status, tags, title, projectId 等）
 * - canSaveTemplate: 是否可以保存为模板（通常需要对话已分配到项目）
 * - saveTemplateInProgress: 保存模板操作是否正在进行
 * - statusOptions: 可用的状态选项列表
 * - statusLabels: 状态选项的显示标签映射
 * 
 * Events:
 * - update:status: 状态变更时触发
 * - update:tags: 标签变更时触发（添加/删除）
 * - save-template: 点击"保存为模板"按钮时触发
 */
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ConversationStatus } from '../../types/conversation'

// ========== Props 定义 ==========
interface Props {
  // 当前对话对象
  conversation: {
    id: string
    title: string
    status: ConversationStatus
    tags: string[]
    projectId?: string | null
    updatedAt: number
  } | null
  // 是否可以保存为模板
  canSaveTemplate?: boolean
  // 保存模板操作是否正在进行
  saveTemplateInProgress?: boolean
  // 可用的状态选项列表
  statusOptions: ConversationStatus[]
  // 状态选项的显示标签映射
  statusLabels: Record<ConversationStatus, string>
}

const props = withDefaults(defineProps<Props>(), {
  canSaveTemplate: false,
  saveTemplateInProgress: false
})

// ========== Events 定义 ==========
const emit = defineEmits<{
  'update:status': [status: ConversationStatus]
  'add-tag': [tag: string]
  'remove-tag': [tag: string]
  'save-template': []
}>()

// ========== 本地状态 ==========
const tagInput = ref('')

// ========== 计算属性 ==========
const currentStatus = computed(() => props.conversation?.status ?? 'active')
const currentTags = computed(() => props.conversation?.tags ?? [])

// ========== 监听器 ==========
// 当对话切换时，清空标签输入框
watch(
  () => props.conversation?.id,
  () => {
    tagInput.value = ''
  }
)

// ========== 事件处理器 ==========
/**
 * 处理状态下拉框变更
 */
const handleStatusChange = (event: Event) => {
  if (!props.conversation) {
    return
  }
  const target = event.target as HTMLSelectElement | null
  if (!target) {
    return
  }
  emit('update:status', target.value as ConversationStatus)
}

/**
 * 添加标签
 */
const handleAddTag = () => {
  if (!props.conversation) {
    return
  }
  const value = tagInput.value.trim()
  if (!value) {
    return
  }
  emit('add-tag', value)
  tagInput.value = ''
}

/**
 * 处理标签输入框的键盘事件
 */
const handleTagKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter') {
    return
  }
  event.preventDefault()
  handleAddTag()
}

/**
 * 移除标签
 */
const handleRemoveTag = (tag: string) => {
  if (!props.conversation) {
    return
  }
  emit('remove-tag', tag)
}

/**
 * 处理"保存为模板"按钮点击
 */
const handleSaveTemplate = () => {
  emit('save-template')
}
</script>

<template>
  <div
    v-if="conversation"
    class="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-4"
  >
    <!-- 第一行：状态选择器 + 标签管理 -->
    <div class="flex flex-wrap gap-4 items-start">
      <!-- 状态选择器 -->
      <div class="flex flex-col gap-2 min-w-[200px]">
        <label class="text-xs font-semibold text-gray-600">会话状态</label>
        <select
          class="rounded-xl border border-gray-200 bg-gray-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm px-3 py-2"
          :value="currentStatus"
          @change="handleStatusChange"
        >
          <option
            v-for="option in statusOptions"
            :key="option"
            :value="option"
          >
            {{ statusLabels[option] }}
          </option>
        </select>
      </div>

      <!-- 标签管理 -->
      <div class="flex-1 min-w-[260px]">
        <label class="text-xs font-semibold text-gray-600">会话标签</label>
        <!-- 标签列表 -->
        <div class="flex flex-wrap gap-2 mb-2 mt-2">
          <span
            v-for="tag in currentTags"
            :key="tag"
            class="inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium"
          >
            {{ tag }}
            <button
              type="button"
              class="ml-2 text-indigo-500 hover:text-indigo-700"
              @click="handleRemoveTag(tag)"
              aria-label="删除标签"
            >
              ×
            </button>
          </span>
          <span v-if="currentTags.length === 0" class="text-xs text-gray-400">
            暂无标签
          </span>
        </div>
        <!-- 添加标签输入框 -->
        <div class="flex gap-2">
          <input
            v-model="tagInput"
            @keydown="handleTagKeydown"
            type="text"
            placeholder="输入标签后按 Enter"
            class="flex-1 rounded-xl border border-gray-200 bg-gray-50 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 text-sm px-3 py-2"
          />
          <button
            type="button"
            class="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition"
            @click="handleAddTag"
          >
            添加
          </button>
        </div>
      </div>
    </div>

    <!-- 第二行：保存为模板 -->
    <div class="border-t border-gray-100 pt-3 flex flex-wrap items-center justify-between gap-3">
      <span class="text-xs text-gray-500">
        将当前草稿或最后一条用户消息保存为项目模板
      </span>
      <button
        type="button"
        class="px-4 py-2 text-xs font-semibold rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canSaveTemplate || saveTemplateInProgress"
        @click="handleSaveTemplate"
      >
        {{ saveTemplateInProgress ? '保存中...' : '保存为模板' }}
      </button>
    </div>
  </div>
</template>
