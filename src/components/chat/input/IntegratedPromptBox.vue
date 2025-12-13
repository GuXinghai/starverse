/**
 * IntegratedPromptBox.vue - 整合型功能栏
 * 
 * ========== 设计理念 ==========
 * 功能按钮平铺展示，提供直观的操作体验：
 * - 清晰直观 (Clear & Direct) - 所有功能一目了然
 * - 状态明确 (Clear State) - 启用/禁用状态清晰
 * - 发送便捷 (Easy Send) - 发送按钮位于右侧
 * 
 * ========== 布局结构 ==========
 * ┌─────────────────────────────────────────────────────┐
 * │  [上传附件] [Web Search] [Reasoning] [Image] [Custom]    [Send] │
 * └─────────────────────────────────────────────────────┘
 */
<script setup lang="ts">
import { computed } from 'vue'
import type { SamplingParameterSettings } from '../../../types/chat'

// ========== Props 定义 ==========
interface Props {
  // 功能状态
  webSearchEnabled?: boolean
  reasoningEnabled?: boolean
  imageGenerationEnabled?: boolean
  samplingParametersEnabled?: boolean
  
  // 功能标签
  webSearchLevelLabel?: string
  reasoningEffortLabel?: string
  currentAspectRatioLabel?: string
  
  // 功能可用性
  isWebSearchAvailable?: boolean
  isReasoningAvailable?: boolean
  canShowImageGenerationButton?: boolean
  
  // 模型信息
  currentModelName?: string
  currentProviderName?: string
  
  // 采样参数
  samplingParameters?: SamplingParameterSettings
  
  // 生成状态
  generationStatus?: 'idle' | 'sending' | 'receiving'
  canSend?: boolean
  sendDelayPending?: boolean
  isAbortable?: boolean  // 是否可以中止（requesting/streaming 阶段）
}

const props = withDefaults(defineProps<Props>(), {
  webSearchEnabled: false,
  reasoningEnabled: false,
  imageGenerationEnabled: false,
  samplingParametersEnabled: false,
  webSearchLevelLabel: 'quick',
  reasoningEffortLabel: 'medium',
  currentAspectRatioLabel: '1:1',
  isWebSearchAvailable: true,
  isReasoningAvailable: true,
  canShowImageGenerationButton: true,
  currentModelName: '未选择模型',
  currentProviderName: 'OpenRouter',
  generationStatus: 'idle',
  canSend: false,
  sendDelayPending: false,
  isAbortable: false
})

// ========== Emits 定义 ==========
const emit = defineEmits<{
  // 功能切换
  'update:web-search-enabled': [value: boolean]
  'toggle-reasoning': []
  'toggle-image-generation': []
  'toggle-sampling': []
  
  // 配置调整
  'select-web-search-level': [level: string]
  'select-reasoning-effort': [effort: string]
  'update:image-generation-aspect-ratio': [ratio: string]
  'update:sampling-parameters': [params: SamplingParameterSettings]
  
  // 模型选择
  'open-model-picker': []
  
  // 发送控制
  'send': []
  'stop': []
  'undo-delay': []
}>()

// ========== 计算属性 ==========
const isGenerating = computed(() => props.generationStatus !== 'idle')

// 功能按钮数据结构
interface FeatureButton {
  id: string
  label: string
  icon: string
  enabled: boolean
  available: boolean
  color: string
}

const featureButtons = computed<FeatureButton[]>(() => [
  {
    id: 'web-search',
    label: 'Web Search',
    icon: 'search',
    enabled: props.webSearchEnabled,
    available: props.isWebSearchAvailable,
    color: 'blue'
  },
  {
    id: 'reasoning',
    label: 'Reasoning',
    icon: 'brain',
    enabled: props.reasoningEnabled,
    available: props.isReasoningAvailable,
    color: 'purple'
  },
  {
    id: 'image-generation',
    label: 'Image',
    icon: 'image',
    enabled: props.imageGenerationEnabled,
    available: props.canShowImageGenerationButton,
    color: 'pink'
  },
  {
    id: 'sampling',
    label: 'Custom',
    icon: 'sliders',
    enabled: props.samplingParametersEnabled,
    available: true,
    color: 'amber'
  }
])

// ========== 事件处理 ==========
const handleToggleFeature = (featureId: string) => {
  switch (featureId) {
    case 'web-search':
      emit('update:web-search-enabled', !props.webSearchEnabled)
      break
    case 'reasoning':
      emit('toggle-reasoning')
      break
    case 'image-generation':
      emit('toggle-image-generation')
      break
    case 'sampling':
      emit('toggle-sampling')
      break
  }
}

// 图标 SVG 路径
const getIconPath = (icon: string): string => {
  const icons: Record<string, string> = {
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    brain: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    image: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    sliders: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    paperclip: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13'
  }
  const iconPath = icons[icon] ?? icons.sliders
  return iconPath
}

// 颜色映射
const getButtonColorClasses = (color: string, enabled: boolean) => {
  const colorMap: Record<string, { base: string; enabled: string }> = {
    blue: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      enabled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
    },
    purple: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20',
      enabled: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'
    },
    pink: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-900/20',
      enabled: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700'
    },
    amber: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20',
      enabled: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
    }
  }
  const colors = colorMap[color] ?? colorMap.blue
  return enabled ? colors.enabled : colors.base
}


</script>

<template>
  <div class="integrated-prompt-box">
    <!-- 功能按钮栏 -->
    <div class="feature-bar">
      <!-- 左侧功能按钮 -->
      <div class="feature-buttons">
        <!-- 上传附件按钮 (始终显示，不可切换) -->
        <button
          type="button"
          class="feature-button"
          :class="getButtonColorClasses('gray', false)"
          :disabled="isGenerating"
          title="上传附件"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('paperclip')" />
          </svg>
          <span class="button-label">上传附件</span>
        </button>

        <!-- 功能按钮 -->
        <button
          v-for="button in featureButtons"
          :key="button.id"
          v-show="button.available"
          type="button"
          class="feature-button"
          :class="[
            getButtonColorClasses(button.color, button.enabled),
            button.enabled && 'feature-button-active'
          ]"
          :disabled="isGenerating"
          :title="button.label"
          @click="handleToggleFeature(button.id)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath(button.icon)" />
          </svg>
          <span class="button-label">{{ button.label }}</span>
        </button>
      </div>

      <!-- 右侧发送按钮 -->
      <div class="send-button-wrapper">
        <!-- 撤回按钮 -->
        <button
          v-if="sendDelayPending"
          type="button"
          class="send-button undo-button"
          @click="emit('undo-delay')"
          title="撤回"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span class="send-button-label">撤回</span>
        </button>

        <!-- 中止按钮 (requesting/streaming 阶段) -->
        <button
          v-else-if="isAbortable"
          type="button"
          class="send-button stop-button"
          @click="emit('stop')"
          title="中止"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          <span class="send-button-label">停止</span>
        </button>

        <!-- 发送按钮 -->
        <button
          v-else
          type="button"
          class="send-button"
          :class="{ 'disabled': !canSend || sendDelayPending }"
          :disabled="!canSend || sendDelayPending"
          @click="emit('send')"
          title="发送消息"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <span class="send-button-label">Send</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "../../../style.css";

/* ========== 容器样式 ========== */
.integrated-prompt-box {
  @apply w-full px-4 py-3;
}

/* ========== 功能栏 ========== */
.feature-bar {
  @apply flex items-center justify-between gap-4;
}

.feature-buttons {
  @apply flex items-center gap-2 flex-1;
}

/* ========== 功能按钮样式 ========== */
.feature-button {
  @apply flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer;
}

.feature-button-active {
  @apply shadow-sm;
}

.button-label {
  @apply text-sm font-medium whitespace-nowrap;
}

/* ========== 发送按钮区域 ========== */
.send-button-wrapper {
  @apply flex-shrink-0;
}

.send-button {
  @apply flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium transition-all duration-200 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none;
}

.send-button.undo-button {
  @apply from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700;
}

.send-button.stop-button {
  @apply from-red-500 to-red-600 hover:from-red-600 hover:to-red-700;
}

.send-button-label {
  @apply text-sm font-semibold;
}

/* ========== 响应式调整 ========== */
@media (max-width: 640px) {
  .button-label,
  .send-button-label {
    @apply hidden;
  }
  
  .feature-button,
  .send-button {
    @apply px-3;
  }
}
</style>
