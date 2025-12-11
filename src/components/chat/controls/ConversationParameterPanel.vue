/**
 * ConversationParameterPanel.vue - 会话级参数控制面板
 * 
 * 职责：
 * - 展示当前会话的采样参数和推理配置
 * - 用户调节参数时自动保存到会话存储
 * - 参数面板 = 指示器 + 调节器
 * 
 * 特点：
 * - 会话级作用域（仅影响当前对话）
 * - 自动持久化（用户改动立即保存）
 * - 基于模型能力过滤显示
 */
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SamplingParameterSettings, ReasoningPreference } from '../../../types/chat'
import type { ModelGenerationCapability } from '../../../types/generation'

// ========== Props ==========
interface Props {
  /**
   * 当前模型 ID（用于检查模型能力）
   */
  modelId: string | null

  /**
   * 模型能力对象
   */
  modelCapability: ModelGenerationCapability | null

  /**
   * 当前采样参数
   */
  samplingParameters: SamplingParameterSettings | null

  /**
   * 当前推理偏好
   */
  reasoningPreference: ReasoningPreference | null

  /**
   * 是否显示面板
   */
  show: boolean

  /**
   * 是否可用（模型是否支持参数调节）
   */
  isAvailable: boolean
}

const props = defineProps<Props>()

// ========== Emits ==========
const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:samplingParameters': [value: SamplingParameterSettings]
  'update:reasoningPreference': [value: ReasoningPreference]
}>()

// ========== 局部状态：采样参数 ==========
const localTemperature = ref(props.samplingParameters?.temperature ?? 1.0)
const localTopP = ref(props.samplingParameters?.top_p ?? 1.0)
const localTopK = ref(props.samplingParameters?.top_k ?? 0)
const localMaxTokens = ref<number | undefined>(props.samplingParameters?.max_tokens ?? undefined)

// ========== 监听 Props 变化，更新本地状态 ==========
watch(() => props.samplingParameters, (newParams) => {
  if (newParams) {
    localTemperature.value = newParams.temperature ?? 1.0
    localTopP.value = newParams.top_p ?? 1.0
    localTopK.value = newParams.top_k ?? 0
    localMaxTokens.value = newParams.max_tokens ?? undefined
  }
}, { deep: true })

watch(() => props.reasoningPreference, () => {
  // 推理偏好监听（如需要可在此处理）
}, { deep: true })

// ========== 计算属性：模型能力检查 ==========
const supportsTemperature = computed(() => {
  return props.modelCapability?.sampling.temperature ?? true
})

const supportsTopP = computed(() => {
  return props.modelCapability?.sampling.top_p ?? true
})

const supportsTopK = computed(() => {
  return props.modelCapability?.sampling.top_k ?? true
})

const supportsMaxTokens = computed(() => {
  return props.modelCapability?.length?.max_tokens ?? true
})

// ========== 事件处理：采样参数改动自动保存 ==========
function handleTemperatureChange(value: number) {
  localTemperature.value = value
  persistSamplingParameters()
}

function handleTopPChange(value: number) {
  localTopP.value = value
  persistSamplingParameters()
}

function handleTopKChange(value: number) {
  localTopK.value = value
  persistSamplingParameters()
}

function handleMaxTokensChange(value: string | undefined) {
  localMaxTokens.value = value ? parseInt(value) : undefined
  persistSamplingParameters()
}

/**
 * 持久化采样参数到会话存储
 */
function persistSamplingParameters() {
  emit('update:samplingParameters', {
    enabled: true,
    temperature: localTemperature.value,
    top_p: localTopP.value,
    top_k: localTopK.value,
    max_tokens: localMaxTokens.value
  })
}

/**
 * 关闭面板
 */
function closePanel() {
  emit('update:show', false)
}

/**
 * 重置为默认值
 */
function resetToDefaults() {
  localTemperature.value = 1.0
  localTopP.value = 1.0
  localTopK.value = 0
  localMaxTokens.value = undefined
  persistSamplingParameters()
}

// ========== 参数定义已内联到模板中 ==========
</script>

<template>
  <!-- 面板容器：与推理、绘画菜单保持一致的弹出位置 -->
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="show && isAvailable"
      class="parameter-panel-popup"
      data-test-id="conversation-parameter-panel"
    >
      <div class="max-w-5xl mx-auto">
        <!-- 面板标题 -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            生成参数（会话级）
          </h3>
          <div class="flex items-center gap-2">
            <button
              @click="resetToDefaults"
              class="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="重置为默认值"
            >
              重置
            </button>
            <button
              @click="closePanel"
              class="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="关闭面板"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- 参数控制网格 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- 温度参数 -->
          <div v-if="supportsTemperature" class="space-y-2">
            <label class="text-xs font-medium text-gray-700 flex items-center justify-between">
              <span>温度</span>
              <span class="text-blue-500 font-semibold">{{ localTemperature.toFixed(1) }}</span>
            </label>
            <input
              type="range"
              :value="localTemperature"
              @input="(e) => handleTemperatureChange(Number((e.target as HTMLInputElement).value))"
              min="0"
              max="2"
              step="0.1"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <p class="text-xs text-gray-500">0=确定性，2=最大随机</p>
          </div>

          <!-- Top-P 参数 -->
          <div v-if="supportsTopP" class="space-y-2">
            <label class="text-xs font-medium text-gray-700 flex items-center justify-between">
              <span>核采样</span>
              <span class="text-blue-500 font-semibold">{{ localTopP.toFixed(2) }}</span>
            </label>
            <input
              type="range"
              :value="localTopP"
              @input="(e) => handleTopPChange(Number((e.target as HTMLInputElement).value))"
              min="0"
              max="1"
              step="0.05"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <p class="text-xs text-gray-500">累积概率阈值</p>
          </div>

          <!-- Top-K 参数 -->
          <div v-if="supportsTopK" class="space-y-2">
            <label class="text-xs font-medium text-gray-700 flex items-center justify-between">
              <span>Top-K</span>
              <span class="text-blue-500 font-semibold">{{ localTopK }}</span>
            </label>
            <input
              type="range"
              :value="localTopK"
              @input="(e) => handleTopKChange(Number((e.target as HTMLInputElement).value))"
              min="0"
              max="100"
              step="1"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <p class="text-xs text-gray-500">候选词数量</p>
          </div>

          <!-- Max Tokens 参数 -->
          <div v-if="supportsMaxTokens" class="space-y-2">
            <label class="text-xs font-medium text-gray-700">
              <span>最大长度</span>
            </label>
            <input
              type="number"
              :value="localMaxTokens ?? ''"
              @input="(e) => handleMaxTokensChange((e.target as HTMLInputElement).value || undefined)"
              placeholder="未设置"
              class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p class="text-xs text-gray-500">生成的最大token数</p>
          </div>
        </div>

        <!-- 提示信息 -->
        <div v-if="!isAvailable" class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
          当前模型不支持参数调节，仅显示默认配置
        </div>
      </div>
    </div>
  </Transition>
</template>

<!-- 样式：与推理、绘画菜单保持一致的弹出样式 -->
<style scoped>
@reference "../../../style.css";

/* 参数面板弹出容器 - 与 FloatingCapsuleInput 的 expanded-menu 保持一致 */
.parameter-panel-popup {
  /* 定位：相对于父容器（ModernChatInput），在输入框上方弹出 */
  @apply absolute left-0 right-0 bottom-full mb-2;
  @apply bg-white rounded-2xl shadow-xl border border-gray-200;
  @apply z-50;
  /* 内边距 */
  @apply px-4 py-4;
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .parameter-panel-popup {
    @apply bg-gray-800 border-gray-700;
  }
}
</style>
