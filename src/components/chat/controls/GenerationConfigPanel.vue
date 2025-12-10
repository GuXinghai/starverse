/**
 * GenerationConfigPanel.vue - 统一生成配置面板
 * 
 * 职责：
 * - 提供 Basic/Advanced 模式切换
 * - Basic 模式：预设选择器（Precise/Balanced/Creative/Code）
 * - Advanced 模式：完整参数控制 + Dry-run 检查器
 * - 集成 ReasoningControls 和 SamplingControls
 * 
 * Phase 3 Integration:
 * - 统一所有生成配置到一个面板
 * - 基于模型能力动态显示/禁用参数
 * - 提供参数预览和验证
 */
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGenerationConfigAdapter, type BasicPreset, type ConfigurationMode } from '../../../composables/useGenerationConfigAdapter'
import type { ModelGenerationCapability } from '../../../types/generation'
import type { ReasoningPreference, SamplingParameterSettings } from '../../../types/chat'

// ========== Props ==========
interface Props {
  /**
   * 当前模型 ID
   */
  modelId: string | null

  /**
   * 模型能力对象
   */
  modelCapability: ModelGenerationCapability | null

  /**
   * 推理偏好
   */
  reasoningPreference: ReasoningPreference

  /**
   * 采样参数
   */
  samplingParameters?: SamplingParameterSettings

  /**
   * 是否显示面板
   */
  show: boolean
}

const props = defineProps<Props>()

// ========== Emits ==========
const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:reasoningPreference': [value: Partial<ReasoningPreference>]
  'update:samplingParameters': [value: Partial<SamplingParameterSettings>]
}>()

// ========== 本地状态 ==========
const configMode = ref<ConfigurationMode>('basic')
const selectedPreset = ref<BasicPreset>('balanced')
const showDryRun = ref(false)

// ========== Composable 初始化 ==========
const reasoningPrefRef = computed({
  get: () => props.reasoningPreference,
  set: (val) => emit('update:reasoningPreference', val)
})

const samplingParamsRef = computed({
  get: () => props.samplingParameters,
  set: (val) => emit('update:samplingParameters', val || {})
})

const {
  unifiedConfig,
  supportedSamplingParams,
  reasoningCapability,
  currentPreset,
  applyBasicPreset,
  getPresetInfo,
  performDryRun,
  shouldShowParameter,
  isParameterEnabled
} = useGenerationConfigAdapter({
  modelId: computed(() => props.modelId),
  modelCapability: computed(() => props.modelCapability),
  reasoningPreference: reasoningPrefRef,
  samplingParameters: samplingParamsRef,
  configMode
})

// ========== 计算属性 ==========
const presetOptions: Array<{ value: BasicPreset; label: string; icon: string }> = [
  { value: 'precise', label: '精确', icon: '🎯' },
  { value: 'balanced', label: '平衡', icon: '⚖️' },
  { value: 'creative', label: '创意', icon: '🎨' },
  { value: 'code', label: '代码', icon: '💻' }
]

const dryRunResult = computed(() => {
  return performDryRun()
})

const hasWarnings = computed(() => {
  return dryRunResult.value.warnings.length > 0 || dryRunResult.value.willClip.length > 0
})

// ========== 监听预设变化 ==========
watch(currentPreset, (preset) => {
  if (preset && configMode.value === 'basic') {
    selectedPreset.value = preset
  }
})

// ========== 事件处理 ==========
function handlePresetSelect(preset: BasicPreset) {
  selectedPreset.value = preset
  applyBasicPreset(preset)
}

function toggleMode() {
  configMode.value = configMode.value === 'basic' ? 'advanced' : 'basic'
}

function closePanel() {
  emit('update:show', false)
}

// ========== 采样参数控制（Advanced 模式）==========
function updateSamplingParam(key: string, value: number | null) {
  if (!samplingParamsRef.value) return
  
  const updates = { ...samplingParamsRef.value, [key]: value }
  emit('update:samplingParameters', updates)
}

const samplingParamDefs = [
  { key: 'temperature', label: '温度 (Temperature)', min: 0, max: 2, step: 0.1, default: 1.0 },
  { key: 'top_p', label: '核采样 (Top-P)', min: 0, max: 1, step: 0.05, default: 1.0 },
  { key: 'top_k', label: 'Top-K', min: 0, max: 100, step: 1, default: 0 },
  { key: 'min_p', label: '最小概率 (Min-P)', min: 0, max: 1, step: 0.05, default: 0 },
  { key: 'top_a', label: 'Top-A', min: 0, max: 1, step: 0.05, default: 0 },
  { key: 'frequency_penalty', label: '频率惩罚', min: -2, max: 2, step: 0.1, default: 0 },
  { key: 'presence_penalty', label: '存在惩罚', min: -2, max: 2, step: 0.1, default: 0 },
  { key: 'repetition_penalty', label: '重复惩罚', min: 0, max: 2, step: 0.1, default: 1.0 }
]
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="closePanel">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <div>
                <h2 class="text-xl font-bold text-gray-900">生成配置</h2>
                <p class="text-sm text-gray-500">{{ modelId || '未选择模型' }}</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <!-- Mode Toggle -->
              <button
                @click="toggleMode"
                class="px-3 py-1.5 rounded-md border text-sm font-medium transition-colors"
                :class="configMode === 'basic' 
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                  : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'"
              >
                {{ configMode === 'basic' ? '基础模式' : '高级模式' }}
              </button>
              
              <!-- Close Button -->
              <button
                @click="closePanel"
                class="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-6">
            <!-- Basic Mode: Presets -->
            <div v-if="configMode === 'basic'" class="space-y-4">
              <div>
                <h3 class="text-sm font-semibold text-gray-700 mb-3">选择预设配置</h3>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="preset in presetOptions"
                    :key="preset.value"
                    @click="handlePresetSelect(preset.value)"
                    class="p-4 rounded-lg border-2 text-left transition-all"
                    :class="selectedPreset === preset.value
                      ? 'border-indigo-500 bg-indigo-50 shadow-md'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'"
                  >
                    <div class="flex items-center gap-3 mb-2">
                      <span class="text-2xl">{{ preset.icon }}</span>
                      <span class="font-semibold text-gray-900">{{ preset.label }}</span>
                    </div>
                    <p class="text-xs text-gray-600">
                      {{ getPresetInfo(preset.value).description }}
                    </p>
                    <div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                      <div>温度: {{ getPresetInfo(preset.value).temperature }}</div>
                      <div>Top-P: {{ getPresetInfo(preset.value).top_p }}</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Current Config Summary -->
              <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 class="text-sm font-medium text-gray-700 mb-2">当前配置</h4>
                <div class="space-y-1 text-sm text-gray-600">
                  <div>温度: {{ unifiedConfig.sampling?.temperature || '默认' }}</div>
                  <div>Top-P: {{ unifiedConfig.sampling?.top_p || '默认' }}</div>
                </div>
              </div>
            </div>

            <!-- Advanced Mode: Full Parameters -->
            <div v-else class="space-y-6">
              <!-- Sampling Parameters -->
              <div>
                <h3 class="text-sm font-semibold text-gray-700 mb-3">采样参数</h3>
                <div class="space-y-3">
                  <div
                    v-for="param in samplingParamDefs"
                    :key="param.key"
                    v-show="shouldShowParameter(param.key)"
                    class="space-y-1"
                  >
                    <div class="flex items-center justify-between">
                      <label class="text-sm text-gray-700">
                        {{ param.label }}
                        <span v-if="!isParameterEnabled(param.key)" class="text-xs text-amber-600 ml-1">
                          (不支持)
                        </span>
                      </label>
                      <span class="text-sm font-mono text-gray-900">
                        {{ (samplingParameters as any)?.[param.key] ?? param.default }}
                      </span>
                    </div>
                    <input
                      type="range"
                      :min="param.min"
                      :max="param.max"
                      :step="param.step"
                      :value="(samplingParameters as any)?.[param.key] ?? param.default"
                      @input="updateSamplingParam(param.key, Number(($event.target as HTMLInputElement).value))"
                      :disabled="!isParameterEnabled(param.key)"
                      class="w-full accent-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <!-- Reasoning Configuration (placeholder) -->
              <div v-if="reasoningCapability?.supportsReasoning">
                <h3 class="text-sm font-semibold text-gray-700 mb-3">推理配置</h3>
                <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p class="text-sm text-blue-800">
                    推理控制将在此处显示。请使用现有的 ReasoningControls 组件。
                  </p>
                </div>
              </div>
            </div>

            <!-- Dry-run Inspector -->
            <div v-if="configMode === 'advanced'">
              <button
                @click="showDryRun = !showDryRun"
                class="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{{ showDryRun ? '隐藏' : '查看' }}参数预览</span>
                <span v-if="hasWarnings" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                  {{ dryRunResult.warnings.length + dryRunResult.willClip.length }} 个警告
                </span>
              </button>

              <div v-if="showDryRun" class="mt-3 space-y-3">
                <!-- Will Send -->
                <div class="bg-green-50 rounded-lg p-3 border border-green-200">
                  <h4 class="text-sm font-semibold text-green-900 mb-2">✓ 将会发送的参数</h4>
                  <pre class="text-xs text-green-800 font-mono overflow-x-auto">{{ JSON.stringify(dryRunResult.willSend, null, 2) }}</pre>
                </div>

                <!-- Will Ignore -->
                <div v-if="Object.keys(dryRunResult.willIgnore).length > 0" class="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <h4 class="text-sm font-semibold text-amber-900 mb-2">⚠ 将被忽略的参数</h4>
                  <pre class="text-xs text-amber-800 font-mono overflow-x-auto">{{ JSON.stringify(dryRunResult.willIgnore, null, 2) }}</pre>
                </div>

                <!-- Will Clip -->
                <div v-if="dryRunResult.willClip.length > 0" class="bg-orange-50 rounded-lg p-3 border border-orange-200">
                  <h4 class="text-sm font-semibold text-orange-900 mb-2">✂️ 将被裁剪的参数</h4>
                  <div class="space-y-1">
                    <div v-for="clip in dryRunResult.willClip" :key="clip.param" class="text-xs text-orange-800">
                      <strong>{{ clip.param }}:</strong> {{ clip.original }} → {{ clip.clipped }} ({{ clip.reason }})
                    </div>
                  </div>
                </div>

                <!-- Warnings -->
                <div v-if="dryRunResult.warnings.length > 0" class="bg-red-50 rounded-lg p-3 border border-red-200">
                  <h4 class="text-sm font-semibold text-red-900 mb-2">⚠️ 警告信息</h4>
                  <ul class="space-y-1">
                    <li v-for="(warning, idx) in dryRunResult.warnings" :key="idx" class="text-xs text-red-800">
                      • {{ warning }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div class="text-sm text-gray-600">
              <span v-if="modelCapability">
                {{ Array.from(supportedSamplingParams).length }} 个支持的参数
              </span>
              <span v-else class="text-amber-600">
                模型能力信息不可用
              </span>
            </div>
            <button
              @click="closePanel"
              class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.3s ease;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.9);
}
</style>
