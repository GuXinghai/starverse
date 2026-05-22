<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    floating?: boolean
  }>(),
  {
    floating: false,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="props.floating"
      class="flex h-6 items-center justify-center"
    >
      <button
        type="button"
        class="h-1 w-16 rounded-full bg-gray-200 hover:bg-gray-300"
        aria-label="Close panel"
        data-testid="right-rail-floating-close-handle"
        @click="emit('close')"
      />
    </div>

    <div v-else class="flex items-center justify-end border-b border-gray-200 px-3 py-2">
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
        @click="emit('close')"
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
