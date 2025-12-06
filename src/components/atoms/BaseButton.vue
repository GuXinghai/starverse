<template>
  <button
    :type="type"
    :class="buttonClasses"
    :disabled="disabled || loading"
    :aria-disabled="disabled || loading"
    :aria-busy="loading"
    @click="handleClick"
  >
    <span v-if="loading" class="btn-spinner" aria-hidden="true">
      <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </span>
    <span :class="{ 'opacity-0': loading }">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface BaseButtonProps {
  /** 按钮视觉样式变体 */
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' | 'ghost'
  /** 按钮尺寸 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** HTML button type 属性 */
  type?: 'button' | 'submit' | 'reset'
  /** 禁用状态 */
  disabled?: boolean
  /** 加载状态 */
  loading?: boolean
  /** 块级按钮 (宽度 100%) */
  block?: boolean
  /** 圆角样式 */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

const props = withDefaults(defineProps<BaseButtonProps>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
  rounded: 'md'
})

export interface BaseButtonEmits {
  (e: 'click', event: MouseEvent): void
}

const emit = defineEmits<BaseButtonEmits>()

const handleClick = (event: MouseEvent) => {
  if (!props.disabled && !props.loading) {
    emit('click', event)
  }
}

const buttonClasses = computed(() => {
  const base = [
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-2',
    'font-medium',
    'transition-all',
    'duration-200',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-2',
    'disabled:cursor-not-allowed',
    'disabled:opacity-50'
  ]

  // Variant styles
  const variants = {
    primary: [
      'bg-primary-600',
      'text-white',
      'hover:bg-primary-700',
      'active:bg-primary-800',
      'focus:ring-primary-500'
    ],
    secondary: [
      'bg-secondary-600',
      'text-white',
      'hover:bg-secondary-700',
      'active:bg-secondary-800',
      'focus:ring-secondary-500'
    ],
    success: [
      'bg-success-600',
      'text-white',
      'hover:bg-success-700',
      'active:bg-success-800',
      'focus:ring-success-500'
    ],
    warning: [
      'bg-warning-600',
      'text-white',
      'hover:bg-warning-700',
      'active:bg-warning-800',
      'focus:ring-warning-500'
    ],
    danger: [
      'bg-danger-600',
      'text-white',
      'hover:bg-danger-700',
      'active:bg-danger-800',
      'focus:ring-danger-500'
    ],
    outline: [
      'bg-transparent',
      'border-2',
      'border-primary-600',
      'text-primary-600',
      'hover:bg-primary-50',
      'active:bg-primary-100',
      'focus:ring-primary-500'
    ],
    ghost: [
      'bg-transparent',
      'text-primary-600',
      'hover:bg-primary-50',
      'active:bg-primary-100',
      'focus:ring-primary-500'
    ]
  }

  // Size styles
  const sizes = {
    xs: ['px-2', 'py-1', 'text-xs', 'min-h-6'],
    sm: ['px-3', 'py-1.5', 'text-sm', 'min-h-8'],
    md: ['px-4', 'py-2', 'text-base', 'min-h-10'],
    lg: ['px-6', 'py-3', 'text-lg', 'min-h-12'],
    xl: ['px-8', 'py-4', 'text-xl', 'min-h-14']
  }

  // Rounded styles
  const roundedStyles = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full'
  }

  const blockStyle = props.block ? 'w-full' : ''

  return [
    ...base,
    ...variants[props.variant],
    ...sizes[props.size],
    roundedStyles[props.rounded],
    blockStyle
  ].filter(Boolean).join(' ')
})
</script>

<style scoped>
.btn-spinner {
  display: inline-flex;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
</style>
