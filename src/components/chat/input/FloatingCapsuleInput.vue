/**
 * FloatingCapsuleInput.vue - 悬浮胶囊输入栏
 * 
 * ========== 设计理念 ==========
 * 现代化输入体验，参考 Perplexity、Claude、ChatGPT 最佳实践：
 * - 胶囊形状 (Rounded Capsule) - 柔和的大圆角
 * - 悬浮效果 (Floating) - 阴影 + 边框增强层次感
 * - 自适应高度 (Auto-resize) - 内容自动扩展，支持多行
 * - 渐变焦点 (Focus State) - 聚焦时高亮边框和阴影
 * 
 * ========== 核心功能 ==========
 * 1. 自动扩展 textarea (1-10 行)
 * 2. 附件预览 (图片 + 文件)
 * 3. 快捷键支持 (Ctrl/Cmd + Enter 发送)
 * 4. 发送按钮智能禁用
 * 5. 停止生成按钮
 * 
 * ========== 交互细节 ==========
 * - 空内容时显示 placeholder 动画
 * - 输入时自动调整高度 (max-height: 400px)
 * - 附件区域折叠/展开动画
 * - 发送按钮渐变色 + 悬停效果
 */
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import AttachmentPreview from '../../AttachmentPreview.vue'

// ========== Props 定义 ==========
interface Props {
  modelValue: string
  placeholder?: string
  disabled?: boolean
  generationInProgress?: boolean
  canSend?: boolean
  sendDelayPending?: boolean
  isAbortable?: boolean  // 是否可以中止（requesting/streaming 阶段）
  
  // 附件相关
  pendingAttachments?: string[]
  pendingFiles?: Array<{
    name: string
    size: number
    type: string
    pdfEngine?: 'pdf-text' | 'mistral-ocr' | 'native'
  }>
  selectedPdfEngine?: 'pdf-text' | 'mistral-ocr' | 'native'
  
  // 状态
  attachmentAlert?: string
  sendButtonTitle?: string
  
  // 功能状态
  webSearchEnabled?: boolean
  reasoningEnabled?: boolean
  imageGenerationEnabled?: boolean
  samplingParametersEnabled?: boolean
  
  // 功能可用性
  isWebSearchAvailable?: boolean
  isReasoningAvailable?: boolean
  canShowImageGenerationButton?: boolean
  
  // 配置信息（用于展开菜单）
  webSearchLevel?: 'quick' | 'normal' | 'deep'
  reasoningPreference?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high'
    visibility?: 'visible' | 'hidden' | 'off'
  }
  imageGenerationAspectRatio?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '输入消息... (Ctrl+Enter 发送)',
  disabled: false,
  generationInProgress: false,
  canSend: false,
  sendDelayPending: false,
  isAbortable: false,
  pendingAttachments: () => [],
  pendingFiles: () => [],
  selectedPdfEngine: 'pdf-text',
  attachmentAlert: '',
  sendButtonTitle: '',
  webSearchEnabled: false,
  reasoningEnabled: false,
  imageGenerationEnabled: false,
  samplingParametersEnabled: false,
  isWebSearchAvailable: true,
  isReasoningAvailable: true,
  canShowImageGenerationButton: true,
  webSearchLevel: 'quick',
  reasoningPreference: () => ({ effort: 'medium', visibility: 'visible' }),
  imageGenerationAspectRatio: '1:1'
})

// ========== Emits 定义 ==========
const emit = defineEmits([
  'update:modelValue',
  'send',
  'stop',
  'undo-delay',
  'clear-attachments',
  'remove-image',
  'remove-file',
  'update:file-pdf-engine',
  'select-image',
  'select-file',
  'update:web-search-enabled',
  'toggle-reasoning',
  'toggle-image-generation',
  'toggle-sampling',
  'toggle-parameters',  // 新增：控制参数面板展开/折叠
  'select-web-search-level',
  'select-reasoning-effort',
  'cycle-aspect-ratio'
])

// ========== 监听按钮状态 ==========
watch(() => ({ 
  sendDelayPending: props.sendDelayPending, 
  isAbortable: props.isAbortable,
  canSend: props.canSend
}), (state) => {
  console.log('[FloatingCapsuleInput] 🔍 按钮状态:', state)
  const buttonType = state.sendDelayPending ? '撤回' : state.isAbortable ? '中止/停止' : '发送'
  console.log(`[FloatingCapsuleInput] 🟢 应显示按钮: ${buttonType}`)
}, { deep: true, immediate: true })

// ========== 响应式状态 ==========
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const capsuleRef = ref<HTMLDivElement | null>(null)
const isFocused = ref(false)
const isHovered = ref(false)
const mouseX = ref(0)
const hoveredFeatureId = ref<string | null>(null)
const expandedFeatureId = ref<string | null>(null)

// 本地输入绑定
const localInput = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 附件计算
const hasImages = computed(() => props.pendingAttachments.length > 0)
const hasFiles = computed(() => props.pendingFiles.length > 0)
const totalAttachments = computed(() => props.pendingAttachments.length + props.pendingFiles.length)
const showAttachmentArea = computed(() => hasImages.value || hasFiles.value)

// ========== 自动调整高度 ==========
const autoResize = () => {
  if (!textareaRef.value) return
  
  // 重置高度以获取正确的 scrollHeight
  textareaRef.value.style.height = 'auto'
  
  // 设置新高度，限制在 40px - 400px 之间
  const newHeight = Math.min(Math.max(textareaRef.value.scrollHeight, 40), 400)
  textareaRef.value.style.height = `${newHeight}px`
}

// 监听输入变化，自动调整高度
watch(() => props.modelValue, () => {
  nextTick(autoResize)
})

// ========== 事件处理 ==========
const handleSend = () => {
  if (!props.canSend || props.sendDelayPending) return
  emit('send')
}

const handleUndoDelay = () => {
  console.log('[FloatingCapsuleInput] ⏪ handleUndoDelay 被调用', {
    sendDelayPending: props.sendDelayPending,
    isAbortable: props.isAbortable,
    generationInProgress: props.generationInProgress
  })
  
  // 🚨 防御性检查：仅在 sendDelayPending === true 时才发送
  if (!props.sendDelayPending) {
    console.error('[FloatingCapsuleInput] 🚨 handleUndoDelay 被错误调用：prop 显示不在延时阶段', {
      sendDelayPending: props.sendDelayPending,
      note: 'v-if 判断失效或存在其他事件监听器'
    })
    return
  }
  
  emit('undo-delay')
}

const handleStopGeneration = () => {
  console.log('[FloatingCapsuleInput] 🛑 handleStopGeneration 被调用', {
    isAbortable: props.isAbortable,
    sendDelayPending: props.sendDelayPending
  })
  
  // 🚨 防御性检查：仅在 isAbortable === true 时才发送
  if (!props.isAbortable) {
    console.error('[FloatingCapsuleInput] 🚨 handleStopGeneration 被错误调用：prop 显示不可中止', {
      isAbortable: props.isAbortable,
      note: 'v-else-if 判断失效或存在其他事件监听器'
    })
    return
  }
  
  emit('stop')
}

const handleFocus = () => {
  isFocused.value = true
}

const handleBlur = () => {
  isFocused.value = false
}

const handleMouseEnter = () => {
  isHovered.value = true
}

const handleMouseLeave = () => {
  isHovered.value = false
}

const handleMouseMove = (event: MouseEvent) => {
  if (!capsuleRef.value) return
  const rect = capsuleRef.value.getBoundingClientRect()
  mouseX.value = event.clientX - rect.left
}

// 计算分割线颜色（整条线的渐变效果）
const getDividerStyle = (): string => {
  if (!isHovered.value) {
    return 'background-color: transparent;' // 不在胶囊内，完全透明
  }
  
  if (!capsuleRef.value) return 'background-color: transparent;'
  
  const width = capsuleRef.value.offsetWidth
  const mousePos = mouseX.value
  const maxDistance = 200 // 超过这个距离就完全透明
  
  // 使用主题色：蓝色 (rgb(59, 130, 246) = blue-500)
  const baseColor = '59, 130, 246'
  
  // 创建渐变：鼠标位置最深，向两边渐变到透明
  const gradientStops: string[] = []
  const steps = 20 // 渐变步数
  
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width
    const distance = Math.abs(x - mousePos)
    
    let opacity = 0
    if (distance < maxDistance) {
      opacity = (1 - distance / maxDistance) * 0.6
    }
    
    const percentage = (i / steps) * 100
    gradientStops.push(`rgba(${baseColor}, ${opacity}) ${percentage}%`)
  }
  
  return `background: linear-gradient(to right, ${gradientStops.join(', ')});`
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ========== 组件挂载 ==========
watch(() => textareaRef.value, () => {
  if (textareaRef.value) {
    autoResize()
  }
})

// 分割线样式（响应式）
const dividerStyle = computed(() => getDividerStyle())

// ========== 功能按钮数据 ==========
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
    label: '搜索',
    icon: 'search',
    enabled: props.webSearchEnabled,
    available: props.isWebSearchAvailable,
    color: 'blue'
  },
  {
    id: 'reasoning',
    label: '推理',
    icon: 'brain',
    enabled: props.reasoningEnabled,
    available: props.isReasoningAvailable,
    color: 'purple'
  },
  {
    id: 'image',
    label: '绘画',
    icon: 'image',
    enabled: props.imageGenerationEnabled,
    available: props.canShowImageGenerationButton,
    color: 'pink'
  },
  {
    id: 'custom',
    label: '参数',
    icon: 'sliders',
    enabled: props.samplingParametersEnabled,
    available: true,
    color: 'amber'
  }
])

const handleToggleFeature = (featureId: string) => {
  // 如果功能已启用，点击按钮主体应该展开/折叠配置菜单
  const isEnabled = 
    (featureId === 'web-search' && props.webSearchEnabled) ||
    (featureId === 'reasoning' && props.reasoningEnabled) ||
    (featureId === 'image' && props.imageGenerationEnabled) ||
    (featureId === 'custom' && props.samplingParametersEnabled)
  
  if (isEnabled) {
    // 已启用：切换菜单展开/折叠
    const newValue = expandedFeatureId.value === featureId ? null : featureId
    console.log('[FloatingCapsuleInput] 切换菜单:', { featureId, from: expandedFeatureId.value, to: newValue })
    expandedFeatureId.value = newValue
  } else {
    // 未启用：启用功能
    switch (featureId) {
      case 'web-search':
        emit('update:web-search-enabled', true)
        break
      case 'reasoning':
        emit('toggle-reasoning')
        break
      case 'image':
        emit('toggle-image-generation')
        break
      case 'custom':
        // 参数面板改为直接触发 toggle-parameters（不再依赖采样参数开关）
        emit('toggle-parameters')
        break
    }
  }
}

const handleDisableFeature = (featureId: string, event: Event) => {
  event.stopPropagation() // 阻止冒泡到按钮的 click 事件
  console.log('[FloatingCapsuleInput] 禁用功能:', featureId)
  
  // 关闭菜单
  expandedFeatureId.value = null
  
  // 禁用功能
  switch (featureId) {
    case 'web-search':
      emit('update:web-search-enabled', false)
      break
    case 'reasoning':
      emit('toggle-reasoning')
      break
    case 'image':
      emit('toggle-image-generation')
      break
    case 'custom':
      emit('toggle-sampling')
      break
  }
}

const handleFeatureMouseEnter = (featureId: string) => {
  hoveredFeatureId.value = featureId
}

const handleFeatureMouseLeave = () => {
  hoveredFeatureId.value = null
}

const isExpanded = (featureId: string): boolean => {
  return expandedFeatureId.value === featureId
}

// ========== 配置选项数据 ==========
const webSearchLevels = [
  { value: 'quick' as const, label: '快速', description: '基础搜索' },
  { value: 'normal' as const, label: '普通', description: '标准搜索' },
  { value: 'deep' as const, label: '深入', description: '全面搜索' }
]

const reasoningEfforts = [
  { value: 'minimal' as const, label: '极简', description: '最快速度' },
  { value: 'low' as const, label: '低', description: '较快' },
  { value: 'medium' as const, label: '中', description: '平衡' },
  { value: 'high' as const, label: '高', description: '最深入' }
]

const aspectRatios = [
  { value: '1:1', label: '方形 1:1' },
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '4:3', label: '标准 4:3' }
]

// 配置选项处理函数
const handleSelectWebSearchLevel = (level: 'quick' | 'normal' | 'deep') => {
  console.log('[FloatingCapsuleInput] 选择搜索级别:', level)
  emit('select-web-search-level', level)
  expandedFeatureId.value = null // 选择后关闭菜单
}

const handleSelectReasoningEffort = (effort: 'minimal' | 'low' | 'medium' | 'high') => {
  console.log('[FloatingCapsuleInput] 选择推理挡位:', effort)
  emit('select-reasoning-effort', effort)
  expandedFeatureId.value = null // 选择后关闭菜单
}

const handleCycleAspectRatio = () => {
  console.log('[FloatingCapsuleInput] 切换宽高比')
  emit('cycle-aspect-ratio')
}

const getIconPath = (icon: string): string => {
  const icons: Record<string, string> = {
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    brain: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    image: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    sliders: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    paperclip: 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13',
    close: 'M6 18L18 6M6 6l12 12', // X 图标
    chevronDown: 'M19 9l-7 7-7-7' // 下箭头
  }
  return icons[icon] || icons.sliders
}

// 判断是否显示关闭图标
const shouldShowCloseIcon = (featureId: string, enabled: boolean): boolean => {
  return enabled && hoveredFeatureId.value === featureId
}

const getButtonColorClasses = (color: string, enabled: boolean) => {
  const colorMap: Record<string, { base: string; enabled: string }> = {
    blue: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      enabled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    },
    purple: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20',
      enabled: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
    },
    pink: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-pink-900/20',
      enabled: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300'
    },
    amber: {
      base: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20',
      enabled: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    }
  }
  const colors = colorMap[color] || colorMap.blue
  return enabled ? colors.enabled : colors.base
}
</script>

<template>
  <div class="floating-capsule-input-container">
    <!-- 主输入胶囊 -->
    <div
      ref="capsuleRef"
      class="floating-capsule"
      :class="{
        'focused': isFocused,
        'has-attachments': showAttachmentArea,
        'generating': generationInProgress
      }"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @mousemove="handleMouseMove"
    >
      <!-- 附件预览区域 -->
      <Transition name="slide-fade">
        <div v-if="showAttachmentArea" class="attachment-area">
          <div class="attachment-header">
            <span class="attachment-count">{{ totalAttachments }} 个附件</span>
            <button
              type="button"
              class="clear-btn"
              @click="emit('clear-attachments')"
            >
              清空
            </button>
          </div>

          <!-- 图片预览网格 -->
          <div v-if="hasImages" class="image-grid">
            <AttachmentPreview
              v-for="(image, index) in pendingAttachments"
              :key="image + index"
              :image-data-uri="image"
              :alt-text="`图片 ${index + 1}`"
              @remove="() => emit('remove-image', index)"
            />
          </div>

          <!-- 文件列表 -->
          <div v-if="hasFiles" class="file-list">
            <div
              v-for="(file, index) in pendingFiles"
              :key="file.name + index"
              class="file-item"
            >
              <div class="file-icon">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div class="file-info">
                <p class="file-name">{{ file.name }}</p>
                <p class="file-meta">
                  <span>{{ formatFileSize(file.size) }}</span>
                  <span v-if="file.type">• {{ file.type.split('/')[1] }}</span>
                </p>
              </div>
              <select
                v-if="file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')"
                class="pdf-engine-select"
                :value="file.pdfEngine || selectedPdfEngine"
                @change="(e) => emit('update:file-pdf-engine', index, (e.target as HTMLSelectElement).value)"
              >
                <option value="pdf-text">PDF Text</option>
                <option value="mistral-ocr">Mistral OCR</option>
                <option value="native">Native</option>
              </select>
              <button
                type="button"
                class="remove-file-btn"
                @click="() => emit('remove-file', index)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 输入区域 -->
      <div class="input-wrapper">
        <!-- 输入框 -->
        <textarea
          ref="textareaRef"
          v-model="localInput"
          :placeholder="placeholder"
          :disabled="disabled || generationInProgress"
          class="capsule-textarea"
          @keydown.ctrl.enter.prevent="handleSend"
          @keydown.meta.enter.prevent="handleSend"
          @focus="handleFocus"
          @blur="handleBlur"
        />
      </div>

      <!-- 分隔线（动态渐变） -->
      <div 
        class="divider" 
        :style="dividerStyle"
      />

      <!-- 功能按钮栏 -->
      <div class="feature-bar">
        <!-- 左侧功能按钮 -->
        <div class="feature-buttons">
          <!-- 上传附件按钮 -->
          <button
            type="button"
            class="feature-button"
            :class="getButtonColorClasses('gray', false)"
            :disabled="disabled || generationInProgress"
            @click="emit('select-file')"
            title="上传附件"
          >
            <div class="icon-container">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('paperclip')" />
              </svg>
            </div>
            <span class="button-label">附件</span>
          </button>

          <!-- 功能按钮 -->
          <button
            v-for="button in featureButtons"
            :key="button.id"
            v-show="button.available"
            type="button"
            class="feature-button"
            :class="getButtonColorClasses(button.color, button.enabled)"
            :disabled="disabled || generationInProgress"
            :title="button.label"
            @click="handleToggleFeature(button.id)"
            @mouseenter="handleFeatureMouseEnter(button.id)"
            @mouseleave="handleFeatureMouseLeave"
          >
            <!-- 图标容器（带圆圈背景） -->
            <div 
              class="icon-container" 
              :class="{ 'has-close': shouldShowCloseIcon(button.id, button.enabled) }"
              @click="shouldShowCloseIcon(button.id, button.enabled) ? handleDisableFeature(button.id, $event) : undefined"
            >
              <!-- 原始图标 -->
              <svg 
                v-show="!shouldShowCloseIcon(button.id, button.enabled)" 
                class="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath(button.icon)" />
              </svg>
              <!-- 关闭图标（X） -->
              <svg 
                v-show="shouldShowCloseIcon(button.id, button.enabled)" 
                class="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('close')" />
              </svg>
            </div>
            <span class="button-label">{{ button.label }}</span>
            
            <!-- 展开/折叠状态指示器（不可点击） -->
            <div
              v-if="button.enabled"
              class="expand-indicator"
              :class="{ 'expanded': isExpanded(button.id) }"
              title="配置选项"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('chevronDown')" />
              </svg>
            </div>
          </button>
        </div>

        <!-- 右侧发送按钮 -->
        <div class="send-button-wrapper">
          <!-- 撤回按钮 -->
          <button
            v-if="sendDelayPending"
            type="button"
            class="send-button undo-button"
            @click="handleUndoDelay"
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
            @click="handleStopGeneration"
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
            @click="handleSend"
            :title="sendButtonTitle || '发送消息'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span class="send-button-label">发送</span>
          </button>
        </div>
      </div>

      <!-- 展开菜单 -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div 
          v-if="expandedFeatureId" 
          class="expanded-menu"
          @click.stop
        >
          <!-- Web 搜索级别菜单 -->
          <div v-if="expandedFeatureId === 'web-search'" class="menu-content">
            <div class="menu-header">
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('search')" />
              </svg>
              <span class="menu-title">搜索级别</span>
            </div>
            <div class="menu-options">
              <button
                v-for="level in webSearchLevels"
                :key="level.value"
                type="button"
                class="menu-option-btn"
                :class="{ 'active': webSearchLevel === level.value }"
                @click="handleSelectWebSearchLevel(level.value)"
              >
                <div class="option-content">
                  <span class="option-label">{{ level.label }}</span>
                  <span class="option-description">{{ level.description }}</span>
                </div>
                <svg 
                  v-if="webSearchLevel === level.value"
                  class="w-4 h-4 text-blue-600" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 推理挡位菜单 -->
          <div v-if="expandedFeatureId === 'reasoning'" class="menu-content">
            <div class="menu-header">
              <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('brain')" />
              </svg>
              <span class="menu-title">推理挡位</span>
            </div>
            <div class="menu-options">
              <button
                v-for="effort in reasoningEfforts"
                :key="effort.value"
                type="button"
                class="menu-option-btn"
                :class="{ 'active': reasoningPreference?.effort === effort.value }"
                @click="handleSelectReasoningEffort(effort.value)"
              >
                <div class="option-content">
                  <span class="option-label">{{ effort.label }}</span>
                  <span class="option-description">{{ effort.description }}</span>
                </div>
                <svg 
                  v-if="reasoningPreference?.effort === effort.value"
                  class="w-4 h-4 text-purple-600" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 图像生成宽高比菜单 -->
          <div v-if="expandedFeatureId === 'image'" class="menu-content">
            <div class="menu-header">
              <svg class="w-4 h-4 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('image')" />
              </svg>
              <span class="menu-title">图像比例</span>
            </div>
            <div class="menu-options-grid">
              <button
                v-for="ratio in aspectRatios"
                :key="ratio.value"
                type="button"
                class="menu-option-btn-grid"
                :class="{ 'active': imageGenerationAspectRatio === ratio.value }"
                @click="handleCycleAspectRatio"
              >
                <span class="option-label-center">{{ ratio.label }}</span>
                <svg 
                  v-if="imageGenerationAspectRatio === ratio.value"
                  class="w-3 h-3 text-pink-600 absolute top-1 right-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 参数配置提示 -->
          <div v-if="expandedFeatureId === 'custom'" class="menu-content">
            <div class="menu-header">
              <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getIconPath('sliders')" />
              </svg>
              <span class="menu-title">采样参数</span>
            </div>
            <div class="menu-info">
              <p class="text-sm text-gray-600">参数配置在输入框上方的独立面板中调整</p>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 警告提示 -->
      <Transition name="slide-fade">
        <div v-if="attachmentAlert" class="alert-banner">
          <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{{ attachmentAlert }}</span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
@reference "../../../style.css";

/* ========== 容器样式 ========== */
.floating-capsule-input-container {
  @apply w-full max-w-4xl mx-auto px-4;
}

/* ========== 主胶囊样式 ========== */
.floating-capsule {
  @apply relative bg-white rounded-3xl shadow-lg border border-gray-200 transition-all duration-300;
}

.floating-capsule.focused {
  @apply shadow-xl border-blue-500/50 ring-4 ring-blue-500/10;
}

.floating-capsule.generating {
  @apply border-purple-500/50 ring-4 ring-purple-500/10;
}

/* ========== 附件区域 ========== */
.attachment-area {
  @apply px-4 pt-4 pb-2 border-b border-gray-100 space-y-3;
}

.attachment-header {
  @apply flex items-center justify-between;
}

.attachment-count {
  @apply text-xs font-medium text-gray-600;
}

.clear-btn {
  @apply text-xs text-red-500 hover:text-red-600 font-medium transition-colors;
}

.image-grid {
  @apply flex gap-2 overflow-x-auto pb-2;
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
}

.image-grid::-webkit-scrollbar {
  height: 6px;
}

.image-grid::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}

.file-list {
  @apply space-y-2;
}

.file-item {
  @apply flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50/50 transition-colors hover:bg-gray-100/50;
}

.file-icon {
  @apply flex-shrink-0 text-gray-500;
}

.file-info {
  @apply flex-1 min-w-0;
}

.file-name {
  @apply text-sm font-medium text-gray-800 truncate;
}

.file-meta {
  @apply text-xs text-gray-500 space-x-1;
}

.pdf-engine-select {
  @apply text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all;
}

.remove-file-btn {
  @apply flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors;
}

/* ========== 输入区域 ========== */
.input-wrapper {
  @apply flex items-end gap-2 p-3;
}

.left-actions {
  @apply flex items-center gap-1;
}

.capsule-textarea {
  @apply flex-1 min-w-0 px-4 py-2 bg-transparent border-none resize-none focus:outline-none text-gray-900 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed;
  min-height: 40px;
  max-height: 400px;
  line-height: 1.5;
  font-size: 15px;
}

/* ========== 分隔线 ========== */
.divider {
  @apply w-full h-px transition-colors duration-200;
  /* 颜色通过内联样式动态设置 */
}

/* ========== 功能按钮栏 ========== */
.feature-bar {
  @apply flex items-center justify-between gap-3 px-4 py-3;
}

.feature-buttons {
  @apply flex items-center gap-2 flex-1 flex-wrap;
}

.feature-button {
  @apply flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium;
}

.button-label {
  @apply whitespace-nowrap;
}

/* 图标容器 - 圆圈背景 */
.icon-container {
  @apply relative flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200;
}

.feature-button:hover .icon-container.has-close {
  @apply bg-white/50 dark:bg-gray-900/50;
}

/* 展开/折叠状态指示器（不可点击，纯视觉指示） */
.expand-indicator {
  @apply ml-1 p-0.5 transition-all duration-300 pointer-events-none;
}

.expand-indicator svg {
  @apply transition-transform duration-300;
}

/* 展开状态：箭头向上旋转 180 度 */
.expand-indicator.expanded svg {
  transform: rotate(180deg);
}

/* ========== 发送按钮区域 ========== */
.send-button-wrapper {
  @apply flex-shrink-0;
}

.send-button {
  @apply flex items-center gap-2 px-5 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium transition-all duration-200 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none;
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
@media (max-width: 768px) {
  .button-label,
  .send-button-label {
    @apply hidden;
  }
  
  .feature-button {
    @apply px-2;
  }
  
  .send-button {
    @apply px-3;
  }
}

/* ========== 警告横幅 ========== */
.alert-banner {
  @apply flex items-center gap-2 px-4 py-2 border-t border-amber-200 bg-amber-50/50 text-xs text-amber-700 rounded-b-3xl;
}

/* ========== 过渡动画 ========== */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* ========== 展开菜单样式 ========== */
.expanded-menu {
  @apply absolute left-4 right-4 bottom-full mb-2;
  @apply bg-white rounded-2xl shadow-xl border border-gray-200;
  @apply z-50;
  max-width: 400px;
}

.menu-content {
  @apply p-4 space-y-3;
}

.menu-header {
  @apply flex items-center gap-2 pb-2 border-b border-gray-100;
}

.menu-title {
  @apply text-sm font-semibold text-gray-800;
}

.menu-options {
  @apply space-y-1.5;
}

.menu-option-btn {
  @apply w-full flex items-center justify-between gap-3;
  @apply px-3 py-2.5 rounded-xl;
  @apply text-left transition-all duration-200;
  @apply border border-transparent;
  @apply hover:bg-gray-50 hover:border-gray-200;
}

.menu-option-btn.active {
  @apply bg-blue-50/50 border-blue-200 ring-2 ring-blue-100;
}

.menu-option-btn.active .option-label {
  @apply text-blue-700 font-semibold;
}

.option-content {
  @apply flex flex-col gap-0.5;
}

.option-label {
  @apply text-sm font-medium text-gray-800;
}

.option-description {
  @apply text-xs text-gray-500;
}

.menu-options-grid {
  @apply grid grid-cols-2 gap-2;
}

.menu-option-btn-grid {
  @apply relative px-3 py-2.5 rounded-xl;
  @apply text-center transition-all duration-200;
  @apply border border-gray-200;
  @apply hover:bg-gray-50 hover:border-gray-300;
}

.menu-option-btn-grid.active {
  @apply bg-pink-50/50 border-pink-200 ring-2 ring-pink-100;
}

.option-label-center {
  @apply text-sm font-medium text-gray-800;
}

.menu-info {
  @apply px-3 py-2 bg-gray-50 rounded-lg;
}

/* ========== 暗色模式支持 ========== */
@media (prefers-color-scheme: dark) {
  .floating-capsule {
    @apply bg-gray-800 border-gray-700;
  }
  
  .floating-capsule.focused {
    @apply border-blue-500/50;
  }
  
  .attachment-area {
    @apply border-gray-700;
  }
  
  .file-item {
    @apply bg-gray-700/50 border-gray-600;
  }
  
  .capsule-textarea {
    @apply text-white placeholder-gray-500;
  }
}
</style>
