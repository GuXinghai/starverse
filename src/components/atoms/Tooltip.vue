/**
 * Tooltip.vue - 自定义工具提示组件
 * 
 * 功能：
 * - 鼠标悬停显示提示内容
 * - 支持多行文本
 * - 自动位置调整（上下左右）
 * - 延迟显示/隐藏
 * - 轻量级实现，无需第三方库
 */
<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface Props {
  /** 提示文本内容 */
  content: string
  /** 提示位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** 显示延迟（毫秒） */
  delay?: number
  /** 是否禁用 */
  disabled?: boolean
  /** 最大宽度 */
  maxWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  placement: 'top',
  delay: 200,
  disabled: false,
  maxWidth: '320px'
})

// ========== State ==========
const show = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
let timeoutId: ReturnType<typeof setTimeout> | null = null

// ========== Computed ==========
const tooltipStyle = computed(() => ({
  maxWidth: props.maxWidth
}))

// ========== Methods ==========
const handleMouseEnter = () => {
  if (props.disabled) return
  
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  
  timeoutId = setTimeout(() => {
    show.value = true
  }, props.delay)
}

const handleMouseLeave = () => {
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
  
  show.value = false
}

// 清理
onUnmounted(() => {
  if (timeoutId) {
    clearTimeout(timeoutId)
  }
})
</script>

<template>
  <div
    ref="triggerRef"
    class="relative inline-block"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 触发元素 -->
    <slot />
    
    <!-- Tooltip 内容 -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show && !disabled"
        ref="tooltipRef"
        class="absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg whitespace-pre-line pointer-events-none"
        :style="tooltipStyle"
        :class="{
          'bottom-full left-1/2 -translate-x-1/2 mb-2': placement === 'top',
          'top-full left-1/2 -translate-x-1/2 mt-2': placement === 'bottom',
          'right-full top-1/2 -translate-y-1/2 mr-2': placement === 'left',
          'left-full top-1/2 -translate-y-1/2 ml-2': placement === 'right'
        }"
      >
        {{ content }}
        
        <!-- 箭头 -->
        <div
          class="absolute w-2 h-2 bg-gray-900 transform rotate-45"
          :class="{
            'bottom-[-4px] left-1/2 -translate-x-1/2': placement === 'top',
            'top-[-4px] left-1/2 -translate-x-1/2': placement === 'bottom',
            'right-[-4px] top-1/2 -translate-y-1/2': placement === 'left',
            'left-[-4px] top-1/2 -translate-y-1/2': placement === 'right'
          }"
        />
      </div>
    </Transition>
  </div>
</template>
