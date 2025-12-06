<template>
  <BaseButton
    :type="type"
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :block="block"
    :rounded="rounded"
    :class="iconButtonClasses"
    @click="$emit('click', $event)"
  >
    <span v-if="icon && iconPosition === 'left'" class="icon-wrapper" :class="iconSizeClass">
      <slot name="icon">{{ icon }}</slot>
    </span>
    <span v-if="$slots.default" :class="{ 'sr-only': iconOnly }">
      <slot />
    </span>
    <span v-if="icon && iconPosition === 'right'" class="icon-wrapper" :class="iconSizeClass">
      <slot name="icon">{{ icon }}</slot>
    </span>
  </BaseButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseButton, { type BaseButtonProps } from './BaseButton.vue'

export interface IconButtonProps extends BaseButtonProps {
  /** 图标内容 (文本或 emoji),优先使用 icon slot */
  icon?: string
  /** 图标位置 */
  iconPosition?: 'left' | 'right'
  /** 仅显示图标,文本用于无障碍 */
  iconOnly?: boolean
}

const props = withDefaults(defineProps<IconButtonProps>(), {
  iconPosition: 'left',
  iconOnly: false
})

defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const iconButtonClasses = computed(() => {
  return props.iconOnly ? 'icon-only-btn' : ''
})

const iconSizeClass = computed(() => {
  const sizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }
  return sizeMap[props.size || 'md']
})
</script>

<style scoped>
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.icon-only-btn {
  aspect-ratio: 1 / 1;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
