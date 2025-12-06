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
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import ReasoningControls from '../controls/ReasoningControls.vue'
import { useSamplingParameters } from '../../../composables/useSamplingParameters'
import type { ReasoningPreference } from '../../../types/chat'
import type { SamplingParameterSettings } from '../../../types/chat'
import type { ModelGenerationCapability } from '../../../types/generation'

const isDev = import.meta.env.DEV

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
  samplingParameters?: SamplingParameterSettings
  showSamplingMenu?: boolean

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

  /**
   * 推理配置（传递给 ReasoningControls）
   */
  reasoningPreference?: ReasoningPreference
  activeProvider?: string  // AIProvider: 'Gemini' | 'OpenRouter' | 'gemini' | 'openrouter' (兼容大小写)
  currentModelId?: string
  modelDataMap?: Map<string, any>
  modelCapability?: ModelGenerationCapability | null
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
  canShowImageGenerationButton: true,
  activeProvider: 'openrouter',
  currentModelId: undefined,
  modelDataMap: () => new Map(),
  modelCapability: null
})

// 🐛 调试日志：监控关键 props 变化
if (isDev) {
  watch(() => ({
    isWebSearchAvailable: props.isWebSearchAvailable,
    isReasoningAvailable: props.isReasoningAvailable,
    canShowImageGenerationButton: props.canShowImageGenerationButton
  }), (values) => {
    console.log('[ChatToolbar] 可用性 Props 变化:', values)
    console.log('[ChatToolbar] DOM 渲染状态:', {
      'Web搜索可见': !!props.isWebSearchAvailable,
      '推理可见': !!props.isReasoningAvailable,
      '图像生成可见': !!props.canShowImageGenerationButton
    })
  }, { immediate: true, deep: true })

  watch(() => props.currentModelId, (newValue, oldValue) => {
    console.log('[ChatToolbar] currentModelId 变化:', {
      from: oldValue,
      to: newValue,
      canShowImageGenerationButton: props.canShowImageGenerationButton
    })
  })
}

// ========== Emits 定义 ==========
type ChatToolbarEmits = {
  (event: 'toggle-web-search'): void;
  (event: 'disable-web-search'): void;
  (event: 'toggle-reasoning'): void;
  (event: 'toggle-image-generation'): void;
  (event: 'toggle-sampling-parameters'): void;
  (event: 'disable-sampling-parameters'): void;
  (
    event: 'update:sampling-parameters',
    value: Partial<SamplingParameterSettings>
  ): void;
  (event: 'reset-sampling-parameters'): void;
  (event: 'cycle-aspect-ratio'): void;
  (
    event: 'select-web-search-level',
    level: 'quick' | 'normal' | 'deep'
  ): void;
  (
    event: 'select-reasoning-effort',
    effort: 'minimal' | 'low' | 'medium' | 'high'
  ): void;
  (
    event: 'update:reasoning-preference',
    value: Partial<ReasoningPreference>
  ): void;
  (event: 'upload-file'): void;
  (event: 'upload-image'): void;
}

const emit = defineEmits<ChatToolbarEmits>()

const isIdle = computed(() => props.generationStatus === 'idle')

// ========== 内部状态 ==========
const baseActionButtonClasses =
  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1'

const showWebSearchLevelMenu = ref(false)
const showReasoningMenu = ref(false)
const showSamplingMenuInternal = ref(false)

const webSearchActionRef = ref<HTMLElement | null>(null)
const reasoningControlsRef = ref<InstanceType<typeof ReasoningControls> | null>(null)
const parameterControlRef = ref<HTMLElement | null>(null)

// 🐛 调试日志：组件初始化
if (isDev) {
  console.log('[ChatToolbar] 组件挂载 - Initial Props:', {
    isWebSearchAvailable: props.isWebSearchAvailable,
    isReasoningAvailable: props.isReasoningAvailable,
    canShowImageGenerationButton: props.canShowImageGenerationButton,
    reasoningEnabled: props.reasoningEnabled,
    activeProvider: props.activeProvider,
    currentModelId: props.currentModelId,
    modelDataMapSize: props.modelDataMap?.size || 0,
    reasoningPreference: props.reasoningPreference
  })
  
  // 监控 currentModelId 变化
  watch(
    () => props.currentModelId,
    (newModelId, oldModelId) => {
      console.log('[ChatToolbar] 🔄 Model ID changed:', {
        from: oldModelId,
        to: newModelId,
        isReasoningAvailable: props.isReasoningAvailable
      })
    }
  )
  
  // 监控 isReasoningAvailable 变化
  watch(
    () => props.isReasoningAvailable,
    (newValue, oldValue) => {
      console.log('[ChatToolbar] 🔄 isReasoningAvailable changed:', {
        from: oldValue,
        to: newValue,
        currentModelId: props.currentModelId
      })
    }
  )

  // 当关闭搜索时，自动关闭挡位设置菜单（参考参数功能的实现）
  watch(
    () => props.webSearchEnabled,
    (newValue, oldValue) => {
      if (oldValue === true && newValue === false) {
        // 关闭搜索后，关闭推理菜单
        showReasoningMenu.value = false
      }
    }
  )
}

// 调试：监控 showSamplingMenu 变化
watch(() => props.showSamplingMenu, (newVal, oldVal) => {
  console.log('[ChatToolbar] showSamplingMenu prop 变化:', {
    from: oldVal,
    to: newVal,
    showSamplingMenuInternal: showSamplingMenuInternal.value,
    combined: newVal || showSamplingMenuInternal.value
  })
}, { immediate: true })

const closeAllInlineMenus = () => {
  showWebSearchLevelMenu.value = false
  showReasoningMenu.value = false
}

const toggleWebSearchLevelMenu = () => {
  if (!isIdle.value || !props.isWebSearchAvailable) {
    return
  }
  showReasoningMenu.value = false
  showWebSearchLevelMenu.value = !showWebSearchLevelMenu.value
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
    showReasoningMenu.value &&
    reasoningControlsRef.value?.$el &&
    !reasoningControlsRef.value.$el.contains(target)
  ) {
    showReasoningMenu.value = false
  }
  if (
    props.showSamplingMenu &&
    parameterControlRef.value &&
    !parameterControlRef.value.contains(target)
  ) {
    // 验证后再关闭
    if (isSamplingEnabled.value) {
      const errors = validateAllParameters()
      if (errors.length > 0) {
        return // 验证失败，不关闭
      }
    }
    // 发送事件通知父组件关闭菜单
    emit('toggle-sampling-parameters')
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

type ActionKey =
  | 'upload-file'
  | 'upload-image'
  | 'image-generation'
  | 'reasoning'
  | 'web-search'

const isActionDisabled = (action: ActionKey) => {
  if (action === 'upload-file' || action === 'upload-image') {
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
  console.log('[ChatToolbar] handleActionClick:', {
    action,
    isDisabled: isActionDisabled(action),
    samplingParametersEnabled: props.samplingParametersEnabled,
    activeProvider: props.activeProvider
  })
  
  if (isActionDisabled(action)) {
    console.log('[ChatToolbar] 操作被禁用，返回')
    return
  }

  // 特殊处理 web-search 的菜单逻辑
  if (action === 'web-search') {
    // 关闭其他菜单
    showReasoningMenu.value = false
    
    if (!props.webSearchEnabled) {
      // 未启用 -> 启用并打开菜单
      emit('toggle-web-search')
      showWebSearchLevelMenu.value = true
    } else {
      // 已启用 -> 切换菜单显示
      showWebSearchLevelMenu.value = !showWebSearchLevelMenu.value
    }
    return
  }

  closeAllInlineMenus()
  switch (action) {
    case 'upload-file':
      emit('upload-file')
      break
    case 'upload-image':
      emit('upload-image')
      break
    case 'image-generation':
      emit('toggle-image-generation')
      break
    case 'reasoning':
      emit('toggle-reasoning')
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

const handleReasoningPreferenceUpdate = (updates: Partial<ReasoningPreference>) => {
  emit('update:reasoning-preference', updates)
}

const handleReasoningToggle = () => {
  // 关闭其他行为菜单，保持界面干净
  closeAllInlineMenus()
  emit('toggle-reasoning')
}

const handleSamplingMenuVisibility = (show: boolean) => {
  showSamplingMenuInternal.value = show
}

const handleReasoningMenuVisibility = (value: boolean) => {
  if (value) {
    // 打开推理基础设置时，收起其他内联菜单
    showWebSearchLevelMenu.value = false
    showReasoningMenu.value = true
  } else {
    closeAllInlineMenus()
  }
}

// ========== 采样参数管理 ==========
const samplingManager = useSamplingParameters({
  samplingParameters: computed(() => props.samplingParameters),
  isActive: computed(() => isIdle.value),
  activeProvider: computed(() => props.activeProvider || 'openrouter'),
  onUpdateParameters: (updates: Partial<SamplingParameterSettings>) => {
    emit('update:sampling-parameters', updates)
  }
})

const {
  SAMPLING_SLIDER_CONTROLS,
  SAMPLING_INTEGER_CONTROLS,
  isSamplingEnabled,
  isSamplingControlAvailable,
  samplingButtonTitle,
  getParameterMode,
  getManualValue,
  toggleParameterMode,
  fillDefaultValue,
  getSliderValue,
  handleSamplingSliderInput,
  handleManualInput,
  formatSamplingValue,
  validateParameter,
  validateAllParameters,
  hasParameterError,
  toggleSamplingParametersEnabled,
  resetSamplingParameters
} = samplingManager

// 调试：监控采样参数状态
if (isDev) {
  watch(
    () => [isSamplingEnabled.value, isSamplingControlAvailable.value, props.showSamplingMenu],
    ([enabled, available, menuVisible]) => {
      console.log('[ChatToolbar] 采样参数状态变化:', {
        isSamplingEnabled: enabled,
        isSamplingControlAvailable: available,
        showSamplingMenu: menuVisible,
        activeProvider: props.activeProvider,
        samplingParameters: props.samplingParameters
      })
    },
    { immediate: true }
  )
}

/**
 * 处理参数按钮点击
 * 
 * 修正后的逻辑（哑组件原则）：
 * - 仅发送事件给父组件
 * - 不自行管理状态（由父组件 ChatView 统一管理）
 */
const handleParameterButtonClick = (event: MouseEvent) => {
  event.stopPropagation()
  
  console.log('[ChatToolbar] handleParameterButtonClick 触发:', {
    isSamplingControlAvailable: isSamplingControlAvailable.value,
    isSamplingEnabled: isSamplingEnabled.value,
    showSamplingMenu: props.showSamplingMenu,
    activeProvider: props.activeProvider
  })
  
  if (!isSamplingControlAvailable.value) {
    console.warn('[ChatToolbar] 采样参数不可用，中止操作')
    return
  }
  
  // 仅发送事件，让父组件处理状态逻辑
  console.log('[ChatToolbar] 发送 toggle-sampling-parameters 事件')
  emit('toggle-sampling-parameters')
}

/**
 * 处理重置参数
 */
const handleResetParameters = () => {
  resetSamplingParameters()
  emit('reset-sampling-parameters')
}

// ========== 计算属性 ==========
</script>

<template>
  <div class="flex flex-col gap-2 px-2 py-2 md:flex-row md:items-center">
    <div class="flex flex-1 flex-wrap items-center gap-2">
      <!-- 上传图片 -->
      <div class="relative">
        <button
          type="button"
          :disabled="isActionDisabled('upload-image')"
          @click="handleActionClick('upload-image')"
          :class="[
            baseActionButtonClasses,
            'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
          ]"
          title="添加图片 (Ctrl+Shift+I)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>上传图片</span>
        </button>
      </div>

      <!-- 上传文件 -->
      <div class="relative">
        <button
          type="button"
          :disabled="isActionDisabled('upload-file')"
          @click="handleActionClick('upload-file')"
          :class="[
            baseActionButtonClasses,
            'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
          ]"
          title="添加文件 (Ctrl+Shift+F)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10.5 18a4 4 0 11-5.66-5.66L13 4.17" />
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
              ? 'border-green-300 bg-green-50 text-green-900 hover:bg-green-100 hover:border-green-400'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
          </svg>
          <span>绘画</span>
          <span v-if="imageGenerationEnabled && currentAspectRatioLabel" class="text-sm text-green-700">
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

      <!-- 推理 - 使用独立组件 -->
      <ReasoningControls
        v-if="isReasoningAvailable && reasoningPreference"
        ref="reasoningControlsRef"
        :reasoning-preference="reasoningPreference"
        :is-active="isIdle"
        :active-provider="activeProvider || 'openrouter'"
        :current-model-id="currentModelId"
        :model-data-map="modelDataMap"
        :model-capability="modelCapability"
        :show="showReasoningMenu"
        @update:show="handleReasoningMenuVisibility"
        @update:reasoning-preference="handleReasoningPreferenceUpdate"
        @toggle-enabled="handleReasoningToggle"
      />

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
              ? 'border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 hover:border-blue-400'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        <span v-if="webSearchEnabled && webSearchLevelLabel" class="text-sm text-blue-600">
          {{ webSearchLevelLabel }}
        </span>
        <span v-else>搜索</span>
          <!-- 关闭按钮（启用时显示） -->
          <div
            v-if="webSearchEnabled"
            class="ml-1 flex items-center justify-center w-5 h-5 rounded-full bg-blue-200/50 hover:bg-blue-200 text-blue-700 transition-colors cursor-pointer"
            @click.stop="emit('disable-web-search')"
            title="禁用搜索"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
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
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
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
      <div
        v-if="activeProvider && activeProvider.toLowerCase() === 'openrouter'"
        class="relative"
        ref="parameterControlRef"
      >
        <button
          type="button"
          :disabled="!isSamplingControlAvailable"
          @click="handleParameterButtonClick"
          :title="samplingButtonTitle"
          :class="[
            baseActionButtonClasses,
            isSamplingEnabled
              ? 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100 hover:border-orange-400'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-100'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>参数</span>
          <!-- 关闭按钮（启用时显示） -->
          <div
            v-if="isSamplingEnabled"
            class="ml-1 flex items-center justify-center w-5 h-5 rounded-full bg-orange-200/50 hover:bg-orange-200 text-orange-700 transition-colors cursor-pointer"
            @click.stop="emit('disable-sampling-parameters')"
            title="禁用参数功能"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </button>

        <!-- 参数菜单 -->
        <div
          v-if="showSamplingMenu"
          class="absolute bottom-full mb-2 right-0 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-30 max-h-[32rem] overflow-y-auto"
          @click.stop
        >
          <div class="flex items-center justify-between px-3 pb-2 text-xs text-gray-500 border-b border-gray-100">
            <span class="font-medium">采样参数</span>
            <button
              class="text-blue-600 hover:text-blue-700 disabled:text-gray-400 transition-colors"
              :disabled="!isSamplingEnabled"
              @click="handleResetParameters"
              title="仅重置滑块模式的参数"
            >
              重置滑块
            </button>
          </div>
          <div class="px-3 pt-2 pb-2 space-y-3">
            <!-- 滑块参数 -->
            <div
              v-for="control in SAMPLING_SLIDER_CONTROLS"
              :key="control.key"
              class="flex flex-col gap-1.5"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="text-gray-600 font-medium">{{ control.label }}</span>
                <div class="flex items-center gap-1.5">
                  <!-- 模式切换按钮 -->
                  <button
                    @click="toggleParameterMode(control.key)"
                    :disabled="!isSamplingEnabled"
                    class="text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40"
                    :class="getParameterMode(control.key) === 'SLIDER' 
                      ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100' 
                      : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'"
                    :title="getParameterMode(control.key) === 'SLIDER' ? '切换到输入模式' : '切换到滑块模式'"
                  >
                    {{ getParameterMode(control.key) === 'SLIDER' ? '滑块' : '输入' }}
                  </button>
                  
                  <!-- 显示值 -->
                  <span class="text-gray-800 font-mono text-xs min-w-[3rem] text-right">
                    {{ formatSamplingValue(control.key) }}
                  </span>
                </div>
              </div>
              
              <!-- SLIDER 模式 -->
              <div 
                v-if="getParameterMode(control.key) === 'SLIDER'" 
                class="space-y-1"
                @mousedown.stop
                @touchstart.stop
              >
                <input
                  type="range"
                  :min="control.min"
                  :max="control.max"
                  :step="control.step"
                  :value="getSliderValue(control.key)"
                  @input="handleSamplingSliderInput(control.key, $event)"
                  :disabled="!isSamplingEnabled"
                  class="w-full accent-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
              
              <!-- INPUT 模式 -->
              <div v-else class="flex gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  :value="getManualValue(control.key) ?? ''"
                  @input="handleManualInput(control.key, $event)"
                  @blur="validateParameter(control.key)"
                  :disabled="!isSamplingEnabled"
                  :placeholder="`默认: ${control.defaultValue}`"
                  class="flex-1 border rounded px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all disabled:opacity-40"
                  :class="hasParameterError(control.key) ? 'border-red-400 animate-pulse' : 'border-gray-300'"
                />
                <button
                  @click="fillDefaultValue(control.key)"
                  :disabled="!isSamplingEnabled"
                  class="px-2 py-1 text-[10px] bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-colors disabled:opacity-40"
                  title="填入默认值"
                >
                  默认
                </button>
              </div>
              
              <p class="text-[10px] text-gray-400 leading-tight">{{ control.description }}</p>
            </div>
            
            <!-- 分隔线 -->
            <div class="border-t border-gray-100 pt-2"></div>
            
            <!-- 整数参数 -->
            <div class="grid grid-cols-1 gap-3">
              <div
                v-for="control in SAMPLING_INTEGER_CONTROLS"
                :key="control.key"
                class="flex flex-col gap-1.5"
              >
                <div class="flex items-center justify-between text-xs">
                  <span class="text-gray-600 font-medium">{{ control.label }}</span>
                  <button
                    @click="toggleParameterMode(control.key)"
                    :disabled="!isSamplingEnabled"
                    class="text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40"
                    :class="getParameterMode(control.key) === 'SLIDER' 
                      ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100' 
                      : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'"
                  >
                    {{ getParameterMode(control.key) === 'SLIDER' ? '默认' : '自定义' }}
                  </button>
                </div>
                
                <div v-if="getParameterMode(control.key) === 'INPUT'" class="flex gap-1.5">
                  <input
                    type="number"
                    :step="control.key === 'seed' ? '1' : '1'"
                    :value="getManualValue(control.key) ?? ''"
                    @input="handleManualInput(control.key, $event)"
                    @blur="validateParameter(control.key)"
                    :disabled="!isSamplingEnabled"
                    :placeholder="control.placeholder"
                    :min="control.min"
                    class="flex-1 border rounded px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all disabled:opacity-40"
                    :class="hasParameterError(control.key) ? 'border-red-400 animate-pulse' : 'border-gray-300'"
                  />
                  <button
                    v-if="control.defaultValue !== null"
                    @click="fillDefaultValue(control.key)"
                    :disabled="!isSamplingEnabled"
                    class="px-2 py-1 text-[10px] bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-colors disabled:opacity-40"
                    title="填入默认值"
                  >
                    默认
                  </button>
                </div>
                <div v-else class="text-xs text-gray-500 italic">
                  使用模型默认值
                </div>
                
                <p class="text-[10px] text-gray-400 leading-tight">{{ control.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-shrink-0">
      <slot name="actions"></slot>
    </div>
  </div>
</template>
