/**
 * ModernChatInput.vue - 现代化聊天输入组件（唯一聊天输入实现）
 * 
 * ========== 组件概述 ==========
 * 整合悬浮胶囊输入栏 + 整合型提示框，提供完整的输入体验。
 * 自 2025-12-06 起，本组件已完全替代 ChatInputArea（已归档）。
 * 
 * ========== 架构设计 ==========
 * 采用 "Smart Container, Dumb Components" 模式：
 * - ModernChatInput (本组件): 智能容器，处理事件路由和状态管理
 * - FloatingCapsuleInput: 纯展示组件，负责输入和附件
 * - IntegratedPromptBox: 纯展示组件，负责功能 Chips 和模型信息
 * 
 * ========== API 兼容性 ==========
 * Props (23 个) 和 Emits (21 个) 完全兼容旧的 ChatInputArea API。
 * 所有父组件无需修改即可使用本组件。
 */
<script setup lang="ts">
import { computed, watch } from 'vue'
import FloatingCapsuleInput from './FloatingCapsuleInput.vue'
import type { SamplingParameterSettings } from '../../../types/chat'
import type { ReasoningPreference } from '../../../types/chat'
import type { ModelGenerationCapability } from '../../../types/generation'

// ========== 监听 props 变化 ==========
function setupPropsWatcher(props: Props) {
  watch(() => ({ 
    sendDelayPending: props.sendDelayPending, 
    isAbortable: props.isAbortable,
    generationStatus: props.generationStatus
  }), (state) => {
    // 🚨 状态互斥检查：sendDelayPending 和生成中状态不能同时为 true
    if (state.sendDelayPending && (state.generationStatus === 'sending' || state.generationStatus === 'receiving')) {
      console.error('[ModernChatInput] 🚨 状态互斥冲突！', {
        sendDelayPending: state.sendDelayPending,
        generationStatus: state.generationStatus,
        note: '延时中和生成中不能同时发生，请检查 isDelayPending 计算逻辑'
      })
    }
    
    console.log('[ModernChatInput] 🔍 Props 变化:', state)
    const buttonType = state.sendDelayPending ? '撤回' : state.isAbortable ? '中止' : '发送'
    console.log(`[ModernChatInput] 🔵 应显示按钮: ${buttonType}`)
  }, { deep: true, immediate: true })
}

// ========== Props 定义 (优化版) ==========
interface Props {
  // 输入内容（必需）
  modelValue: string
  placeholder?: string
  disabled?: boolean
  
  // 生成状态（必需）
  generationStatus?: 'idle' | 'sending' | 'receiving'
  sendDelayPending?: boolean
  isAbortable?: boolean  // 是否可以中止（requesting/streaming 阶段）
  sendButtonTitle?: string
  
  // 附件（必需）
  pendingAttachments?: string[]
  pendingFiles?: Array<{
    name: string
    size: number
    type: string
    pdfEngine?: 'pdf-text' | 'mistral-ocr' | 'native'
  }>
  selectedPdfEngine?: 'pdf-text' | 'mistral-ocr' | 'native'
  attachmentAlert?: string
  
  // 功能状态（必需）
  webSearchEnabled?: boolean
  reasoningEnabled?: boolean
  imageGenerationEnabled?: boolean
  samplingParametersEnabled?: boolean
  showSamplingMenu?: boolean
  
  // 功能可用性（必需）
  isWebSearchAvailable?: boolean
  isReasoningSupported?: boolean
  canShowImageGenerationButton?: boolean
  
  // 推理配置（必需）
  reasoningPreference?: ReasoningPreference
  
  // 采样参数（必需）
  samplingParameters?: SamplingParameterSettings
  
  // 模型能力信息（可选）
  modelCapability?: ModelGenerationCapability | null
  
  // ========== 已移除的 Props（优化）==========
  // ❌ canSend - 改为派生计算，使用 modelValue/pendingAttachments/pendingFiles
  // ❌ webSearchLevelLabel - 在组件内从 webSearchConfig 计算
  // ❌ reasoningEffortLabel - 在组件内从 reasoningPreference 计算
  // ❌ currentAspectRatioLabel - 在组件内计算
  // ❌ activeProvider, currentModelId, currentModelName - 改为直接访问 Store
  // ❌ modelDataMap - 改用 provide/inject 或直接访问 Store
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '输入消息... (Ctrl+Enter 发送)',
  disabled: false,
  generationStatus: 'idle',
  sendDelayPending: false,
  isAbortable: false,
  sendButtonTitle: '发送消息 (Ctrl+Enter)',
  pendingAttachments: () => [],
  pendingFiles: () => [],
  selectedPdfEngine: 'pdf-text',
  attachmentAlert: '',
  webSearchEnabled: false,
  reasoningEnabled: false,
  imageGenerationEnabled: false,
  samplingParametersEnabled: false,
  showSamplingMenu: false,
  isWebSearchAvailable: true,
  isReasoningSupported: true,
  canShowImageGenerationButton: true,
  currentModelName: '未选择模型'
})

// 监听 props 变化
setupPropsWatcher(props)

// ========== Emits 定义 ==========
const emit = defineEmits<{
  // 输入相关
  'update:modelValue': [value: string]
  'send': []
  'stop': []
  'undo-delay': []
  
  // 附件相关
  'clear-attachments': []
  'remove-image': [index: number]
  'remove-file': [index: number]
  'update:file-pdf-engine': [index: number, engine: string]
  'select-image': []
  'select-file': []
  
  // 功能切换
  'update:web-search-enabled': [value: boolean]
  'toggle-reasoning': []
  'toggle-image-generation': []
  'toggle-sampling': []
  'disable-sampling': []
  
  // 配置调整
  'select-web-search-level': [level: string]
  'select-reasoning-effort': [effort: string]
  'update:reasoning-preference': [preference: ReasoningPreference]
  'update:image-generation-aspect-ratio': [ratio: string]
  'cycle-aspect-ratio': []
  'update:sampling-parameters': [params: SamplingParameterSettings]
  'reset-sampling-parameters': []
  
  // 模型选择
  'open-model-picker': []
}>()

// ========== 计算属性 ==========

/**
 * 生成状态派生计算
 */
const generationInProgress = computed(() => 
  props.generationStatus === 'sending' || props.generationStatus === 'receiving'
)

/**
 * 是否可以发送（派生自 modelValue/attachments，不再需要 canSend prop）
 */
const canSend = computed(() => 
  !!props.modelValue?.trim() || 
  (props.pendingAttachments?.length || 0) > 0 || 
  (props.pendingFiles?.length || 0) > 0
)

/**
 * 从 reasoningPreference 提取当前挡位
 */
const currentReasoningEffort = computed(() => 
  props.reasoningPreference?.effort || 'medium'
)

// ========== 事件转发 ==========
const handleUpdateInput = (value: string) => {
  emit('update:modelValue', value)
}

const handleSend = () => {
  emit('send')
}

const handleStop = () => {
  console.log('[ModernChatInput] 🛑 handleStop 被调用', {
    isAbortable: props.isAbortable,
    generationStatus: props.generationStatus
  })
  emit('stop')
}

const handleUndoDelay = () => {
  console.log('[ModernChatInput] ⏪ handleUndoDelay 被调用', {
    sendDelayPending: props.sendDelayPending,
    generationStatus: props.generationStatus,
    isAbortable: props.isAbortable,
    stackTrace: new Error().stack?.split('\n').slice(2, 5).join('\n')
  })
  
  // 🚨 防御性检查：如果不在延时阶段，不应该调用此函数
  if (!props.sendDelayPending) {
    console.error('[ModernChatInput] 🚨 handleUndoDelay 被错误调用：当前不在延时阶段', {
      sendDelayPending: props.sendDelayPending,
      generationStatus: props.generationStatus,
      note: '如果看到此错误，说明 UI 按钮切换未生效或存在事件监听器泄漏'
    })
    return  // 不发送 emit，直接阻断
  }
  
  emit('undo-delay')
}

const handleClearAttachments = () => {
  emit('clear-attachments')
}

const handleRemoveImage = (index: number) => {
  emit('remove-image', index)
}

const handleRemoveFile = (index: number) => {
  emit('remove-file', index)
}

const handleUpdateFilePdfEngine = (index: number, engine: string) => {
  emit('update:file-pdf-engine', index, engine)
}

const handleSelectImage = () => {
  emit('select-image')
}

const handleSelectFile = () => {
  emit('select-file')
}

const handleUpdateWebSearchEnabled = (value: boolean) => {
  emit('update:web-search-enabled', value)
}

const handleToggleReasoning = () => {
  emit('toggle-reasoning')
}

const handleToggleImageGeneration = () => {
  emit('toggle-image-generation')
}

const handleToggleSampling = () => {
  emit('toggle-sampling')
}

const handleSelectWebSearchLevel = (level: string) => {
  emit('select-web-search-level', level)
}

const handleSelectReasoningEffort = (effort: string) => {
  emit('select-reasoning-effort', effort)
}

const handleCycleAspectRatio = () => {
  emit('cycle-aspect-ratio')
}
</script>

<template>
  <div class="modern-chat-input">
    <!-- 悬浮胶囊输入栏（包含输入框和功能按钮） -->
    <FloatingCapsuleInput
      :model-value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :generation-in-progress="generationInProgress"
      :can-send="canSend"
      :send-delay-pending="sendDelayPending"
      :is-abortable="isAbortable"
      :pending-attachments="pendingAttachments"
      :pending-files="pendingFiles"
      :selected-pdf-engine="selectedPdfEngine"
      :attachment-alert="attachmentAlert"
      :send-button-title="sendButtonTitle"
      :web-search-enabled="webSearchEnabled"
      :reasoning-enabled="reasoningEnabled"
      :image-generation-enabled="imageGenerationEnabled"
      :sampling-parameters-enabled="samplingParametersEnabled"
      :is-web-search-available="isWebSearchAvailable"
      :is-reasoning-available="isReasoningSupported"
      :can-show-image-generation-button="canShowImageGenerationButton"
      :reasoning-preference="reasoningPreference"
      @update:model-value="handleUpdateInput"
      @send="handleSend"
      @stop="handleStop"
      @undo-delay="handleUndoDelay"
      @clear-attachments="handleClearAttachments"
      @remove-image="handleRemoveImage"
      @remove-file="handleRemoveFile"
      @update:file-pdf-engine="handleUpdateFilePdfEngine"
      @select-image="handleSelectImage"
      @select-file="handleSelectFile"
      @update:web-search-enabled="handleUpdateWebSearchEnabled"
      @toggle-reasoning="handleToggleReasoning"
      @toggle-image-generation="handleToggleImageGeneration"
      @toggle-sampling="handleToggleSampling"
      @select-web-search-level="handleSelectWebSearchLevel"
      @select-reasoning-effort="handleSelectReasoningEffort"
      @cycle-aspect-ratio="handleCycleAspectRatio"
    />
  </div>
</template>

<style scoped>
/* Tailwind v4: bring the global Tailwind pipeline into this isolated <style> block
   so @apply can resolve utilities when built in Storybook. */
@reference '../../../style.css';

.modern-chat-input {
  @apply w-full py-4 px-4 bg-gradient-to-b from-transparent to-white/50 dark:to-gray-900/50;
}

/* 添加底部渐变遮罩效果 */
.modern-chat-input::before {
  content: '';
  @apply absolute inset-x-0 bottom-0 h-20 pointer-events-none;
  background: linear-gradient(to top, rgba(255, 255, 255, 0.9), transparent);
}

@media (prefers-color-scheme: dark) {
  .modern-chat-input::before {
    background: linear-gradient(to top, rgba(17, 24, 39, 0.9), transparent);
  }
}
</style>
