<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    sidePanel?: 'right' | 'bottom' | 'none'
    sidePanelWidthClass?: string
  }>(),
  {
    sidePanel: 'right',
    sidePanelWidthClass: 'w-80',
  },
)
</script>

<template>
  <div class="flex h-full flex-col bg-gray-50">
    <div v-if="$slots.header" class="border-b border-gray-200 bg-white">
      <slot name="header" />
    </div>

    <div v-if="$slots.status" class="bg-white">
      <slot name="status" />
    </div>

    <div
      class="min-h-0 flex-1"
      :class="props.sidePanel === 'bottom' ? 'flex flex-col' : 'flex'"
    >
      <div class="min-h-0 flex-1">
        <slot name="transcript" />
      </div>

      <div
        v-if="props.sidePanel !== 'none' && $slots.side"
        class="min-h-0 flex-shrink-0 bg-white"
        :class="props.sidePanel === 'right' ? [props.sidePanelWidthClass, 'border-l border-gray-200'] : 'border-t border-gray-200'"
      >
        <slot name="side" />
      </div>
    </div>

    <div v-if="$slots.composer" class="border-t border-gray-200 bg-white">
      <slot name="composer" />
    </div>
  </div>
</template>
