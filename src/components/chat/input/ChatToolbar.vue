/**
 * ChatToolbar.vue - 现代化聊天工具栏 (Plus Menu + Chips 设计)
 * 
 * ========== 设计理念 ==========
 * "Plus Menu + Chips" 交互模型（类似 Perplexity/OpenAI）：
 * - 左侧：Plus按钮 (点击打开功能菜单)
 * - 中间：已启用功能的 Chips（可点击×关闭）
 * - 右侧：预留给父组件（发送按钮等）
 * 
 * ========== 架构原则 ==========
 * Smart Parent, Dumb Child
 * - Props: 接收启用状态的布尔值
 * - Emits: 发送功能切换事件
 * - Pure Presentation: 无业务逻辑
 */
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'

// ========== Props 定义 ==========
interface Props {
  /**
   * 当前对话的生成状态
   * 用于禁用按钮（生成中不能操作）
   */
  generationStatus?: 'idle' | 'sending' | 'receiving'

  /**
   * 功能启用状态
   */
  webSearchEnabled?: boolean
  reasoningEnabled?: boolean
  imageGenerationEnabled?: boolean

  /**
   * 采样参数（自定义参数）
   */
  samplingParametersEnabled?: boolean

  /**
   * Phase 4: 配置标签（用于 Chips 中显示当前配置）
   */
  webSearchLevelLabel?: string
  reasoningEffortLabel?: string
  currentAspectRatioLabel?: string

  /**
   * 功能可用性标志（控制是否在菜单中显示）
   * 必须有默认值 true，否则 v-if 会导致它们消失
   */
  isWebSearchAvailable?: boolean
  isReasoningAvailable?: boolean
  canShowImageGenerationButton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  generationStatus: 'idle',
  webSearchEnabled: false,
  reasoningEnabled: false,
  imageGenerationEnabled: false,
  samplingParametersEnabled: false,
  webSearchLevelLabel: 'quick',
  reasoningEffortLabel: 'medium',
  currentAspectRatioLabel: '1:1',
  // 关键修复点：默认全开
  isWebSearchAvailable: true,
  isReasoningAvailable: true,
  canShowImageGenerationButton: true
})

// ========== Emits 定义 ==========
const emit = defineEmits<{
  'toggle-web-search': []
  'toggle-reasoning': []
  'toggle-image-generation': []
  'toggle-sampling-parameters': []
  'cycle-aspect-ratio': []
  'select-web-search-level': [level: 'quick' | 'normal' | 'deep']
  'select-reasoning-effort': [effort: 'low' | 'medium' | 'high']
  'upload-file': []
}>()

const isIdle = computed(() => props.generationStatus === 'idle')

// ========== 内部状态 ==========
const baseActionButtonClasses =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1'

const showWebSearchLevelMenu = ref(false)
const showReasoningEffortMenu = ref(false)

const webSearchActionRef = ref<HTMLElement | null>(null)
const reasoningActionRef = ref<HTMLElement | null>(null)

const closeAllInlineMenus = () => {
  showWebSearchLevelMenu.value = false
  showReasoningEffortMenu.value = false
}

const toggleWebSearchLevelMenu = () => {
  if (!isIdle.value || !props.isWebSearchAvailable) {
    return
  }
  showReasoningEffortMenu.value = false
  showWebSearchLevelMenu.value = !showWebSearchLevelMenu.value
}

const toggleReasoningEffortMenu = () => {
  if (!isIdle.value || !props.isReasoningAvailable) {
    return
  }
  showWebSearchLevelMenu.value = false
  showReasoningEffortMenu.value = !showReasoningEffortMenu.value
}

const handleDocumentPointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null
  if (!target) {
    return
  }
  if (
    showWebSearchLevelMenu.value &&
    webSearchActionRef.value &&
    !webSearchActionRef.value.contains(target)
  ) {
    showWebSearchLevelMenu.value = false
  }
  if (
    showReasoningEffortMenu.value &&
    reasoningActionRef.value &&
    !reasoningActionRef.value.contains(target)
  ) {
    showReasoningEffortMenu.value = false
  }
}

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeAllInlineMenus()
  }
}

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleGlobalKeyDown)
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleGlobalKeyDown)
  }
})

const WEB_SEARCH_LEVEL_OPTIONS = [
  { value: 'quick', label: '快速' },
  { value: 'normal', label: '普通' },
  { value: 'deep', label: '深入' }
] as const

const REASONING_EFFORT_OPTIONS = [
  { value: 'low', label: '低档' },
  { value: 'medium', label: '中档' },
  { value: 'high', label: '高档' }
] as const

type ActionKey =
  | 'upload-file'
  | 'image-generation'
  | 'reasoning'
  | 'web-search'
  | 'sampling-parameters'

const isActionDisabled = (action: ActionKey) => {
  if (action === 'upload-file') {
    return false
  }
  if (action === 'web-search') {
    return !props.isWebSearchAvailable || !isIdle.value
  }
  if (action === 'reasoning') {
    return !props.isReasoningAvailable || !isIdle.value
  }
  if (action === 'image-generation') {
    return !props.canShowImageGenerationButton || !isIdle.value
  }
  return !isIdle.value
}

const handleActionClick = (action: ActionKey) => {
  if (isActionDisabled(action)) {
    return
  }
  closeAllInlineMenus()
  switch (action) {
    case 'upload-file':
      emit('upload-file')
      break
    case 'image-generation':
      emit('toggle-image-generation')
      break
    case 'reasoning':
      emit('toggle-reasoning')
      break
    case 'web-search':
      emit('toggle-web-search')
      break
    case 'sampling-parameters':
      emit('toggle-sampling-parameters')
      break
  }
}

const handleWebSearchLevelSelect = (level: 'quick' | 'normal' | 'deep') => {
  emit('select-web-search-level', level)
  showWebSearchLevelMenu.value = false
  if (!props.webSearchEnabled && props.isWebSearchAvailable) {
    emit('toggle-web-search')
  }
}

const handleReasoningEffortSelect = (effort: 'low' | 'medium' | 'high') => {
  emit('select-reasoning-effort', effort)
  showReasoningEffortMenu.value = false
  if (!props.reasoningEnabled && props.isReasoningAvailable) {
    emit('toggle-reasoning')
  }
}

// ========== 计算属性 ==========
</script>

<template>
  <div class="flex flex-col gap-2 px-2 py-2 md:flex-row md:items-center">
    <div class="flex flex-1 flex-wrap items-center gap-2">
      <!-- 上传文件 -->
      <div class="relative">
        <button
          type="button"
          :disabled="isActionDisabled('upload-file')"
          @click="handleActionClick('upload-file')"
          :class="[
            baseActionButtonClasses,
            'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span>上传文件</span>
        </button>
      </div>

      <!-- 绘画 / 图像生成功能 -->
      <div
        v-if="canShowImageGenerationButton"
        class="flex items-center gap-1"
      >
        <button
          type="button"
          :disabled="isActionDisabled('image-generation')"
          @click="handleActionClick('image-generation')"
          :class="[
            baseActionButtonClasses,
            imageGenerationEnabled
              ? 'border-green-300 bg-green-50 text-green-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-green-200 hover:bg-green-50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span>绘画</span>
          <span v-if="imageGenerationEnabled && currentAspectRatioLabel" class="text-xs text-green-700">
            ({{ currentAspectRatioLabel }})
          </span>
        </button>
        <button
          v-if="imageGenerationEnabled"
          type="button"
          class="h-8 w-8 rounded-full border border-green-200 text-sm font-semibold text-green-800 transition-colors hover:border-green-300 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!isIdle"
          @click="emit('cycle-aspect-ratio')"
          title="切换宽高比"
          aria-label="切换宽高比"
        >
          ⟳
        </button>
      </div>

      <!-- 推理 -->
      <div
        v-if="isReasoningAvailable"
        class="relative"
        ref="reasoningActionRef"
      >
        <button
          type="button"
          :disabled="isActionDisabled('reasoning')"
          @click="handleActionClick('reasoning')"
          :class="[
            baseActionButtonClasses,
            reasoningEnabled
              ? 'border-purple-300 bg-purple-50 text-purple-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-purple-200 hover:bg-purple-50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        <span v-if="reasoningEnabled && reasoningEffortLabel" class="text-xs text-purple-600">
          {{ reasoningEffortLabel }}
        </span>
        <span v-else>推理</span>
        <span
          class="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
          :class="reasoningEnabled ? 'text-purple-600' : 'text-gray-400'"
            @click.stop="toggleReasoningEffortMenu"
          >
            ▼
          </span>
        </button>

        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="showReasoningEffortMenu"
            class="absolute left-0 bottom-full z-[1000] mb-2 w-44 rounded-xl border border-purple-100 bg-white p-1 shadow-lg"
          >
            <button
              v-for="effort in REASONING_EFFORT_OPTIONS"
              :key="effort.value"
              type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-gray-700 hover:bg-purple-50"
              :class="{ 'bg-purple-50 font-medium text-purple-800': effort.label === reasoningEffortLabel }"
              @click.stop="handleReasoningEffortSelect(effort.value)"
            >
              <span>{{ effort.label }}</span>
              <svg
                v-if="effort.label === reasoningEffortLabel"
                class="h-3.5 w-3.5 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 搜索 -->
      <div
        v-if="isWebSearchAvailable"
        class="relative"
        ref="webSearchActionRef"
      >
        <button
          type="button"
          :disabled="isActionDisabled('web-search')"
          @click="handleActionClick('web-search')"
          :class="[
            baseActionButtonClasses,
            webSearchEnabled
              ? 'border-blue-300 bg-blue-50 text-blue-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        <span v-if="webSearchEnabled && webSearchLevelLabel" class="text-xs text-blue-600">
          {{ webSearchLevelLabel }}
        </span>
        <span v-else>搜索</span>
          <span
            class="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
            :class="webSearchEnabled ? 'text-blue-600' : 'text-gray-400'"
            @click.stop="toggleWebSearchLevelMenu"
          >
            ▼
          </span>
        </button>

        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          leave-active-class="transition duration-100 ease-in"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="showWebSearchLevelMenu"
            class="absolute left-0 bottom-full z-[1000] mb-2 w-44 rounded-xl border border-blue-100 bg-white p-1 shadow-lg"
          >
            <button
              v-for="level in WEB_SEARCH_LEVEL_OPTIONS"
              :key="level.value"
              type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs text-gray-700 hover:bg-blue-50"
              :class="{ 'bg-blue-50 font-medium text-blue-800': level.label === webSearchLevelLabel }"
              @click.stop="handleWebSearchLevelSelect(level.value)"
            >
              <span>{{ level.label }}</span>
              <svg
                v-if="level.label === webSearchLevelLabel"
                class="h-3.5 w-3.5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>

      <!-- 参数 -->
      <div class="relative">
        <button
          type="button"
          :disabled="isActionDisabled('sampling-parameters')"
          @click="handleActionClick('sampling-parameters')"
          :class="[
            baseActionButtonClasses,
            samplingParametersEnabled
              ? 'border-orange-300 bg-orange-50 text-orange-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-orange-200 hover:bg-orange-50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>参数</span>
        </button>
      </div>
    </div>

    <div class="flex-shrink-0">
      <slot name="actions"></slot>
    </div>
  </div>
</template>
