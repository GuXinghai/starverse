<script setup lang="ts">
import { computed } from 'vue'
import { UI_ICON_SHAPES, type UiIconName, type UiIconShape } from './uiIconShapes'

const props = withDefaults(defineProps<{
  name: UiIconName | (string & {})
  size?: number
  /** Fill the glyph (e.g. a selected favourite star) instead of outlining it. */
  filled?: boolean
}>(), { size: 16, filled: false })

const shapes = computed<readonly UiIconShape[]>(() =>
  (UI_ICON_SHAPES as Record<string, readonly UiIconShape[]>)[props.name] ?? UI_ICON_SHAPES.orbit)
</script>

<template>
  <svg
    class="sv-icon"
    :class="{ 'animate-spin': props.name === 'spinner' }"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-for="(shape, index) in shapes" :key="index">
      <path v-if="shape.t === 'path'" :d="shape.d" />
      <circle v-else-if="shape.t === 'circle'" :cx="shape.cx" :cy="shape.cy" :r="shape.r" :fill="shape.fill ? 'currentColor' : undefined" :stroke="shape.fill ? 'none' : undefined" />
      <rect v-else :x="shape.x" :y="shape.y" :width="shape.w" :height="shape.h" :rx="shape.rx" :fill="shape.fill ? 'currentColor' : undefined" :stroke="shape.fill ? 'none' : undefined" />
    </template>
  </svg>
</template>
